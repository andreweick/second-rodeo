# Design: Image Ingest JavaScript MVP

## Context

This is the first implementation of photo ingestion for the Second Rodeo digital archive. The system must handle both ongoing PWA uploads and batch migration of ~50k legacy images. The design prioritizes simplicity for the MVP while establishing patterns that support future enhancements (C2PA, perceptual hashing, containers).

Key constraints:
- JavaScript/TypeScript only (Cloudflare Workers)
- Cloudflare Workers CPU time limits
- Need to support 50k image migration without excessive costs
- Full metadata fidelity for long-term archival

## Goals / Non-Goals

### Goals
- Production-ready image ingestion with EXIF metadata extraction
- Efficient deduplication to save bandwidth during migration
- Searchable metadata (date, location, camera, text content)
- Simple, maintainable architecture using existing patterns
- Foundation for future C2PA and perceptual hashing features

### Non-Goals
- Perceptual hashing (pHash64) - Deferred to container implementation
- C2PA content authenticity extraction - Deferred to future phase
- Vector embeddings / AI search - Deferred to Vectorize integration
- Image resizing / optimization - Cloudflare Images handles this separately
- Real-time collaborative editing - Single-user archive for MVP

## Decisions

### 1. Stable ID (SID) Generation

**Decision:** Use `uuidv5(namespace, sha256 + dateTimeOriginal + make + model)`

**Rationale:**
- Deterministic: Same image always produces same SID (enables deduplication)
- Stable across minor edits: EXIF-based components remain constant
- Foundation for future upgrade: Can recalculate with pHash when containers are added
- UUIDv5 provides collision resistance with namespace isolation

**Alternatives Considered:**
- **Random UUID:** Not deterministic, can't detect duplicates
- **SHA256 only:** Changes on any pixel modification (too sensitive)
- **pHash64 + EXIF:** Requires native libraries, deferred to container phase
- **Filename-based:** Unreliable, files get renamed

**Fallback Strategy:**
If EXIF fields missing:
```
dateTimeOriginal → uploadDate
make → "unknown"
model → "unknown"
```
SID still deterministic based on content hash + upload timestamp.

### 2. Parallel R2 Bucket Architecture

**Decision:** Two buckets with identical key structures

```
sr-artifact/photos/<sid>.jpg    # Image blob
sr-json/photos/<sid>.json       # Metadata
```

**Rationale:**
- **Separation of Concerns:** Blobs vs structured data have different access patterns
- **IAM Control:** Can grant different permissions to artifact vs metadata buckets
- **Cost Optimization:** Different lifecycle policies (compress old metadata, keep artifacts)
- **Mental Model:** Simple parallel structure, easy to reason about
- **Web App Pattern:** Query D1 for lists, fetch JSON from R2 for details, display images from sr-artifact

**Alternatives Considered:**
- **Single bucket with prefixes:** Harder to apply different IAM/lifecycle policies
- **Metadata as object tags:** Limited size, not suitable for full EXIF data
- **Metadata in D1 only:** Too large for D1, loses full-fidelity archive

### 3. Client-Side Hash Computation

**Decision:** Optional client hashes with mandatory server validation

**Protocol:**
```http
POST /images
X-Client-SHA256: abc123...  (optional)
X-Client-BLAKE3: def456...  (optional)
```

Server always computes hashes and validates against client-provided values.

**Rationale:**
- **Bandwidth Savings:** Client can call `HEAD /api/photos/check/:sha256` before uploading 4MB file
- **Worker CPU Offload:** Client devices often more powerful, saves Worker execution time
- **Security:** Server validation prevents malicious/corrupt uploads
- **Progressive Enhancement:** Works without client hashes (server computes), faster with them

**Flow:**
1. Client computes SHA256 (if capable)
2. Client calls `HEAD /api/photos/check/:sha256` → skip if 200 OK
3. Client uploads with `X-Client-SHA256` header
4. Server validates against its own computation
5. If mismatch → reject (corruption/tampering)
6. If valid or missing → use server hash

### 4. Dual Hashing: BLAKE3 + SHA256

**Decision:** Compute both BLAKE3 and SHA256 for each image

**Rationale:**
- **SHA256:** Industry standard, widest compatibility, used for SID generation
- **BLAKE3:** Faster, more secure, future-proofing (cryptographic community trend)
- **Minimal Cost:** Both hashes computed in single file read pass
- **Flexibility:** Can migrate to BLAKE3-primary later without losing SHA256 compatibility

**Storage:**
- SHA256 → Used for deduplication endpoint, SID generation
- BLAKE3 → Stored in R2 headers, available for future use
- Both → Stored in metadata JSON and x-amz headers

### 5. Metadata Storage: Simple Overwrite Pattern

**Decision:** One JSON file per image, overwrite on updates (no event sourcing)

**Rationale:**
- **Simplicity:** Easy to implement, debug, and reason about
- **Web App Pattern:** Direct R2 GET for photo details (fast, simple)
- **Update Pattern:** When C2PA added later, just overwrite JSON with merged data
- **Cost Effective:** One object per image, no shard management
- **D1 Rebuild:** Can always rebuild D1 index by scanning R2 JSON files

**Alternatives Considered:**
- **Event-sourced JSONL per image:** Complex, many tiny files for 50k images
- **Sharded JSONL:** Over-engineered for MVP, deferred to container phase
- **Metadata in D1 only:** Loses full fidelity, can't rebuild

**JSON Structure:**
```json
{
  "sid": "sid_abc123",
  "sha256": "def456...",
  "blake3": "xyz789...",
  "file": { /* size, mime, dimensions */ },
  "exif": { /* camera, settings, GPS */ },
  "iptc": { /* title, caption, keywords */ },
  "uploadedAt": "2025-10-28T12:00:00Z",
  "source": "pwa" | "migration"
}
```

Future C2PA update:
```json
{
  /* existing fields */
  "c2pa": { /* manifest, assertions, trust */ }
}
```

### 6. R2 Custom Metadata Headers

**Decision:** Store key metadata in x-amz custom headers on blob objects

```
x-amz-sha256: <hex>           # Content hash
x-amz-blake3: <hex>           # Alternative hash
x-amz-stable-id: <sid>        # Asset ID
x-amz-uploaddate: <ISO8601>   # When uploaded
x-amz-createdate: <ISO8601>   # From EXIF DateTimeOriginal (if present)
x-amz-source: pwa|migration   # Origin
```

**Rationale:**
- **Fast Metadata Access:** No separate JSON fetch needed for basic info
- **R2 List Operations:** Headers returned with list results
- **Deduplication:** Can check existing SID/hash without downloading blob
- **Migration:** Preserve both upload date and original capture date

**No R2 Object Tags:**
Tags are redundant with headers + D1 + JSON. Skip for MVP to reduce complexity.

### 7. D1 Schema: Lightweight Index + FTS5

**Decision:** Two tables via Drizzle ORM

**Main Table (Queryable Fields):**
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
  hasC2pa: integer('has_c2pa', { mode: 'boolean' }).default(false),
  r2Key: text('r2_key').notNull(),
  source: text('source').notNull(), // 'pwa' | 'migration'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});
```

**FTS5 Virtual Table (Full-Text Search):**
```typescript
// Note: Drizzle doesn't natively support FTS5, use raw SQL or future extension
CREATE VIRTUAL TABLE photos_fts USING fts5(
  sid UNINDEXED,      -- Join key only
  title,              -- IPTC objectName
  caption,            -- IPTC caption
  keywords,           -- IPTC keywords (space-separated)
  creator,            -- IPTC creator
  city,               -- IPTC city
  country,            -- IPTC country
  camera_make,        -- EXIF make
  camera_model,       -- EXIF model
  tokenize='porter'   -- English stemming
);
```

**Indexes:**
```sql
CREATE INDEX idx_photos_taken_at ON photos(taken_at);
CREATE INDEX idx_photos_camera ON photos(camera_make, camera_model);
CREATE INDEX idx_photos_location ON photos(gps_lat, gps_lon) WHERE gps_lat IS NOT NULL;
CREATE INDEX idx_photos_source ON photos(source);
```

**Rationale:**
- **Lightweight:** Only queryable fields in main table (~30 columns vs 200+ EXIF fields)
- **FTS5 Performance:** SQLite's built-in full-text search, fast and battle-tested
- **Full Fidelity in R2:** Complete metadata always available in JSON
- **Rebuildable:** D1 can be reconstructed from R2 JSON files
- **Search Queries:**
  ```sql
  -- Text search
  SELECT p.* FROM photos p
  JOIN photos_fts fts ON p.sid = fts.sid
  WHERE photos_fts MATCH 'sunset beach'
  ORDER BY rank;

  -- Date range
  SELECT * FROM photos
  WHERE taken_at BETWEEN ? AND ?
  ORDER BY taken_at DESC;

  -- Location proximity (simple bounding box)
  SELECT * FROM photos
  WHERE gps_lat BETWEEN ? AND ?
    AND gps_lon BETWEEN ? AND ?;
  ```

### 8. Queue-Based Async Indexing

**Decision:** Write to R2 synchronously, index to D1 asynchronously via queue

**Flow:**
```
POST /images
  ↓
[Extract EXIF, compute hashes, generate SID]
  ↓
[Write blob to sr-artifact] ← Synchronous
  ↓
[Write JSON to sr-json] ← Synchronous
  ↓
[Send queue message: {sid, r2Key}] ← Fire and forget
  ↓
[Return 201 Created to client]

Queue Consumer (async):
  ↓
[Read JSON from sr-json]
  ↓
[Upsert photos table]
  ↓
[Upsert photos_fts table]
```

**Rationale:**
- **Fast Response:** Client doesn't wait for D1 writes
- **Worker Time Limits:** Stay under CPU limits by offloading D1 work
- **Retry Logic:** Queue provides automatic retries on failure
- **Consistency Pattern:** Same pattern used for other content types (chatter, films, etc.)
- **Idempotent:** Queue consumer uses INSERT OR REPLACE (safe to replay)

**Upsert Pattern:**
```sql
INSERT INTO photos (sid, sha256, ...)
VALUES (?, ?, ...)
ON CONFLICT(sid) DO UPDATE SET
  sha256 = excluded.sha256,
  updated_at = unixepoch()
WHERE excluded.sha256 != photos.sha256; -- Only update if hash changed
```

## Risks / Trade-offs

### Risk: SID Collisions Without pHash
**Impact:** Two different images could get same SID if EXIF matches and content hash collides

**Mitigation:**
- SHA256 collision probability: 2^-256 (astronomically low)
- UUIDv5 namespace isolation
- Server validates SHA256 on upload
- Future: Containers will recalculate SIDs with pHash64

**Likelihood:** Negligible

### Risk: Workers CPU Time Limits
**Impact:** Large images or batch uploads could hit 50ms CPU limit

**Mitigation:**
- Client-side hashing offloads computation
- Async D1 indexing via queue
- EXIF extraction with `exifr` is fast (<10ms typical)
- BLAKE3 faster than SHA256
- Monitor with Cloudflare Analytics

**Likelihood:** Low for typical 4-8MB JPEGs

### Risk: D1 Storage Limits
**Impact:** 50k images × ~500 bytes per row = 25MB (well under D1 limits)

**Mitigation:**
- D1 limits: 10GB per database (plenty of headroom)
- Lightweight schema (only queryable fields)
- FTS5 index optimized for text fields only

**Likelihood:** Not a concern for MVP

### Trade-off: No Event Sourcing
**Impact:** Can't replay history or see metadata changes over time

**Mitigation:**
- R2 JSON is versioned (can enable versioning later)
- For MVP, latest state is sufficient
- Future: Can add event sourcing when migrating to containers

**Accepted:** MVP simplicity is higher priority

### Trade-off: JavaScript-Only Hashing
**Impact:** Slower than native BLAKE3/SHA256, no pHash64

**Mitigation:**
- Client-side hashing reduces server load
- Workers subrequests can offload heavy work if needed
- Future: Containers provide native performance

**Accepted:** MVP constraint, future path is clear

## Migration Plan

### Phase 1: MVP Implementation (This Proposal)
1. Implement dual hashing with client optimization
2. Create D1 schema with FTS5
3. Build queue-based indexing
4. Replace mock upload endpoint
5. Test with small batch (100 images)

### Phase 2: Migration Execution
1. Trickle 50k legacy images through `/images` endpoint (1-4 parallel)
2. Monitor Worker CPU usage, adjust batch size
3. Validate D1 consistency with R2 JSON
4. Enable PWA uploads once migration completes

### Phase 3: Future Enhancements (Post-MVP)
1. **Containers:** Migrate to Go-based `ingest-hasher` container
2. **pHash64:** Recalculate SIDs with perceptual hashing
3. **C2PA:** Add content authenticity extraction (inline + queue)
4. **Vectorize:** Add AI embeddings for visual search
5. **Event Sourcing:** Add JSONL sharding if needed

### Rollback Plan
If MVP has critical issues:
1. Revert to mock endpoint (no uploads processed)
2. D1 tables can be dropped (rebuilt from R2)
3. R2 objects remain (immutable, safe)
4. No data loss: everything in R2

## Open Questions

1. **BLAKE3 Library:** Which npm package? `@noble/hashes/blake3` is well-maintained, TypeScript-native, and tree-shakeable. Recommend this unless concerns arise.

2. **FTS5 with Drizzle:** Drizzle doesn't have native FTS5 support. Options:
   - Use raw SQL for FTS5 table creation
   - Wait for Drizzle FTS5 support
   - Use separate migration script for FTS5

   **Recommendation:** Raw SQL in migration, Drizzle for main table.

3. **Queue Naming:** Use existing queue or create dedicated `image-indexing` queue?
   **Recommendation:** Dedicated queue for isolation and monitoring.

4. **Namespace UUID for SID:** Generate once and document in code, or derive from user/project context?
   **Recommendation:** Hardcoded constant for MVP (single-user system).

5. **EXIF Date Parsing:** Handle timezone-less EXIF dates (common issue)?
   **Recommendation:** Store as-is, interpret as local time for display.
