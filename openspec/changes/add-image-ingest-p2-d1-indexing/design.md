# Design: Image Ingest Phase 2 - D1 Indexing

## Context

Phase 1 established the upload pipeline with R2 storage. Phase 2 adds queryability through D1 database indexing. The system needs to support fast queries over 50k images without scanning R2, while keeping upload responses fast by using async queue processing.

Key constraints:
- D1 storage limits (10GB per database - plenty for MVP)
- Workers CPU time limits (async indexing avoids bottleneck)
- Must be rebuildable (R2 JSON is source of truth)
- Idempotent processing (queue retries)

## Goals / Non-Goals

### Goals
- Fast queries on photo metadata (date, camera, location, source)
- Functional deduplication endpoint (saves bandwidth)
- Async indexing to keep upload fast
- Rebuildable D1 index from R2 JSON
- Support 50k+ images with good performance

### Non-Goals (Deferred to Phase 3)
- Full-text search with FTS5
- Complex query APIs (just basic filters for now)

## Decisions

### 1. Lightweight D1 Schema

**Decision:** Store only queryable fields in D1, not full EXIF data

**Schema:**
```typescript
export const photos = sqliteTable('photos', {
  sid: text('sid').primaryKey(),
  sha256: text('sha256').notNull().unique(),
  blake3: text('blake3').notNull(),
  takenAt: integer('taken_at', { mode: 'timestamp' }),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull(),
  cameraMake: text('camera_make'),
  cameraModel: text('camera_model'),
  lensModel: text('lens_model'),
  gpsLat: real('gps_lat'),
  gpsLon: real('gps_lon'),
  width: integer('width'),
  height: integer('height'),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  r2Key: text('r2_key').notNull(),
  source: text('source').notNull(), // 'pwa' | 'migration'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});
```

**Rationale:**
- **Lightweight:** ~15 queryable fields vs 200+ EXIF fields
- **Fast Queries:** Indexes on common filters (date, camera, location)
- **Full Fidelity in R2:** Complete metadata always in JSON
- **Rebuildable:** Can reconstruct D1 from R2 JSON files
- **Storage Efficient:** 50k photos × ~500 bytes = 25MB (well under D1 limits)

**Excluded Fields:**
- IPTC text (title, caption, keywords) - Phase 3 adds FTS5 for these
- Detailed EXIF (aperture, ISO, focal length) - available in R2 JSON
- C2PA data - future extension

**Indexes:**
```sql
CREATE INDEX idx_photos_taken_at ON photos(taken_at);
CREATE INDEX idx_photos_camera ON photos(camera_make, camera_model);
CREATE INDEX idx_photos_location ON photos(gps_lat, gps_lon) WHERE gps_lat IS NOT NULL;
CREATE INDEX idx_photos_source ON photos(source);
```

### 2. Queue-Based Async Indexing

**Decision:** Write to R2 synchronously, index to D1 asynchronously via queue

**Flow:**
```
POST /images
  ↓
[Extract EXIF, compute hashes, generate SID] (Phase 1)
  ↓
[Write blob to sr-artifact] ← Synchronous
  ↓
[Write JSON to sr-json] ← Synchronous
  ↓
[Send queue message: {type: 'photo', sid, r2Key}] ← Fire and forget
  ↓
[Return 201 Created to client]

Queue Consumer (async):
  ↓
[Read JSON from sr-json using r2Key]
  ↓
[Parse JSON and extract D1 fields]
  ↓
[Upsert photos table with ON CONFLICT(sid) DO UPDATE]
```

**Rationale:**
- **Fast Response:** Client doesn't wait for D1 writes
- **Worker Time Limits:** Stay under CPU limits by offloading D1 work
- **Retry Logic:** Queue provides automatic retries on failure
- **Consistency Pattern:** Same pattern used for other content types (chatter, films, etc.)
- **Idempotent:** Upserts are safe to replay

**Queue Message Format:**
```json
{
  "type": "photo",
  "sid": "sid_abc123",
  "r2Key": "photos/sid_abc123.json"
}
```

**Error Handling:**
- Upload succeeds even if queue send fails (logged, but not critical)
- Queue consumer retries on D1 failures
- D1 can always be rebuilt from R2 if needed

### 3. Upsert Pattern for Idempotency

**Decision:** Use INSERT OR REPLACE pattern for idempotent upserts

**SQL Pattern:**
```sql
INSERT INTO photos (sid, sha256, blake3, ...)
VALUES (?, ?, ?, ...)
ON CONFLICT(sid) DO UPDATE SET
  sha256 = excluded.sha256,
  blake3 = excluded.blake3,
  taken_at = excluded.taken_at,
  -- ... all fields
  updated_at = unixepoch()
WHERE excluded.sha256 != photos.sha256 OR excluded.updated_at > photos.updated_at;
```

**Rationale:**
- **Idempotent:** Can process same message multiple times safely
- **Queue Retries:** Handles automatic queue retries without duplicates
- **Metadata Updates:** If R2 JSON is updated (e.g., adding C2PA later), D1 gets updated too
- **Conditional Update:** Only updates if data changed (saves writes)

**Drizzle Implementation:**
```typescript
await db.insert(photos)
  .values(photoData)
  .onConflictDoUpdate({
    target: photos.sid,
    set: photoData
  });
```

### 4. Deduplication Endpoint Implementation

**Decision:** Phase 2 replaces stub with D1 lookup

**Phase 1 Behavior (Stub):**
```typescript
// HEAD /api/photos/check/:sha256
return new Response(null, { status: 404 }); // Always 404
```

**Phase 2 Behavior (D1 Lookup):**
```typescript
// HEAD /api/photos/check/:sha256
const photo = await db.select().from(photos).where(eq(photos.sha256, sha256)).limit(1);

if (photo.length > 0) {
  return new Response(null, {
    status: 200,
    headers: { 'X-Stable-ID': photo[0].sid }
  });
} else {
  return new Response(null, { status: 404 });
}
```

**Rationale:**
- **Bandwidth Savings:** Client skips upload if image exists
- **Migration Efficiency:** Essential for 50k image migration
- **Simple API:** HEAD request, no body needed
- **Fast:** D1 query on sha256 (unique index)

**Client Flow:**
1. Client computes SHA256 locally
2. Client calls `HEAD /api/photos/check/:sha256`
3. If 200 OK: Skip upload, use SID from header
4. If 404: Proceed with upload

### 5. Basic Query Functions

**Decision:** Implement basic query functions for common use cases

**Query Types:**
```typescript
// Date range
queryPhotosByDateRange(startDate: Date, endDate: Date)
// SELECT * FROM photos WHERE taken_at BETWEEN ? AND ? ORDER BY taken_at DESC

// Camera
queryPhotosByCamera(make: string, model?: string)
// SELECT * FROM photos WHERE camera_make = ? AND camera_model = ? ORDER BY taken_at DESC

// Location (bounding box)
queryPhotosByLocation(lat: number, lon: number, radiusKm: number)
// SELECT * FROM photos WHERE gps_lat BETWEEN ? AND ? AND gps_lon BETWEEN ? AND ?

// Source
queryPhotosBySource(source: 'pwa' | 'migration')
// SELECT * FROM photos WHERE source = ? ORDER BY uploaded_at DESC
```

**Rationale:**
- **Common Use Cases:** Date, camera, location, source are most useful filters
- **Index Support:** All queries use indexes for performance
- **Simple API:** Basic filters, not complex query language
- **Foundation:** Phase 3 adds FTS5 for text search on top

**Pagination:**
Add `LIMIT` and `OFFSET` for pagination:
```typescript
queryPhotos({ limit: 50, offset: 0, ...filters })
```

### 6. D1 as Rebuildable Cache

**Decision:** Treat D1 as rebuildable cache, R2 JSON as source of truth

**Implications:**
- **Disaster Recovery:** If D1 lost, rebuild from R2 JSON
- **Consistency:** On conflict, R2 JSON is authoritative
- **Rebuild Script:** Create tool to scan sr-json bucket and reindex all photos

**Rebuild Algorithm:**
```
1. List all JSON files in sr-json/photos/
2. For each JSON file:
   a. Read JSON
   b. Extract D1 fields
   c. Upsert to photos table
3. Verify count matches
```

**Rebuild Script:**
```typescript
// apps/api/src/scripts/rebuild-photos-d1.ts
async function rebuildPhotosD1(env: Env) {
  const bucket = env.SR_JSON;
  const list = await bucket.list({ prefix: 'photos/' });

  for (const item of list.objects) {
    const json = await bucket.get(item.key);
    const data = await json.json();
    await indexPhotoToD1(data.sid, item.key, env);
  }
}
```

### 7. Error Handling and Monitoring

**Decision:** Log errors but don't fail uploads on queue/D1 issues

**Upload Service:**
```typescript
try {
  await env.QUEUE.send({ type: 'photo', sid, r2Key });
} catch (err) {
  console.error('Queue send failed:', err);
  // Don't fail upload - indexing can be retried/rebuilt
}
```

**Queue Consumer:**
```typescript
try {
  await indexPhotoToD1(message.sid, message.r2Key, env);
} catch (err) {
  console.error('D1 indexing failed:', err);
  throw err; // Retry via queue
}
```

**Monitoring:**
- Queue depth (Cloudflare dashboard)
- Indexing errors (Worker logs)
- Deduplication hit rate (custom metrics)
- D1 query performance (timing logs)

## Risks / Trade-offs

### Risk: Queue Processing Delays
**Impact:** Photos uploaded but not immediately queryable

**Mitigation:**
- Queues typically process in seconds
- Client can poll deduplication endpoint to verify indexing
- R2 JSON is always authoritative (can fetch directly by SID)
- Monitor queue depth

**Likelihood:** Low, acceptable for async pattern

### Risk: D1 Storage Growth
**Impact:** 50k photos could use significant D1 storage

**Mitigation:**
- Lightweight schema (~500 bytes per photo)
- 50k × 500 bytes = 25MB (well under 10GB limit)
- Headroom for 1M+ photos if needed
- Can archive old photos later if needed

**Likelihood:** Not a concern for MVP

### Trade-off: Eventual Consistency
**Impact:** Uploaded photos not immediately in D1 queries

**Mitigation:**
- Acceptable for archive use case (not real-time)
- Client can fetch R2 JSON directly by SID if needed
- Deduplication endpoint checks D1 (may miss very recent uploads)

**Accepted:** Async pattern is worth the trade-off

## Migration Plan

### Phase 2 Implementation (This Proposal)
1. Add D1 schema and migrations
2. Implement photo indexer service
3. Add queue consumer
4. Update deduplication endpoint with D1 lookup
5. Add basic query functions
6. Test with incremental uploads

### Handoff to Phase 3
- D1 schema established
- Query patterns proven
- Phase 3 adds FTS5 virtual table for text search

### Rollback Plan
If Phase 2 has critical issues:
1. Disable queue consumer (stop indexing)
2. Revert deduplication endpoint to stub (404 always)
3. Phase 1 still works (R2 uploads continue)
4. D1 tables can be dropped and rebuilt

## Open Questions

1. **Queue Configuration:** Use existing queue or create dedicated `photo-indexing` queue?
   **Recommendation:** Dedicated queue for isolation and monitoring.

2. **Query API Endpoints:** Should Phase 2 add GET /api/photos endpoints, or defer to web app?
   **Recommendation:** Defer to web app Phase 3+ (focus on indexing now).

3. **Rebuild Frequency:** How often to run rebuild script?
   **Recommendation:** Manual on-demand, not scheduled (D1 should stay consistent).
