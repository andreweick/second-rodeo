# Design: Bulk D1 Ingestion from R2

## Context

The Second Rodeo archive contains 50k+ JSON content files across six content types stored in R2. Each content type needs to be indexed in D1 for fast filtering and querying, while keeping full content in R2 to minimize D1 storage costs.

Existing infrastructure:
- R2 storage with wrapped JSON format (`{type, id, data}`)
- Cloudflare Queues for async processing
- D1 database with tables for each content type
- Queue processor skeleton in `json-processor.ts`

Six phase1-*-ingest proposals were created separately but follow identical patterns. This design consolidates them into one unified implementation.

## Goals / Non-Goals

**Goals:**
- Ingest 50k+ records across 6 content types into D1
- Minimize D1 storage (target: <2MB total for all types)
- Enable fast filtering by queryable metadata (dates, IDs, flags)
- Support wrapped JSON format from upload API
- Follow hot/cold storage architecture consistently
- Preserve exact field mappings from phase1-* validator work
- Idempotent re-ingestion without duplicates

**Non-Goals:**
- Full-text search (deferred to future vectorize proposals)
- Query/display API endpoints (separate proposal)
- File migration tooling (handled manually)
- Batch progress tracking (simple queue-all pattern)
- Client-side validation (server-side only)

## Decisions

### Decision 1: Unified Proposal, Separate Capability Specs

**Choice:** One proposal with six capability spec files

**Rationale:**
- Implementation pattern is identical across all types
- Single task list easier to track
- Validator updates happen in same code module
- Per-type capability specs preserve field-level details
- Clear separation of concerns (generic pattern vs type-specific schema)

**Alternatives considered:**
- Six separate proposals: Duplicates effort, harder to maintain consistency
- One generic spec: Loses type-specific field mappings and requirements

### Decision 2: Wrapped JSON Format

**Choice:** Validators expect `{type, id, data}` structure, extract `data` object

**Implementation:**
```typescript
function validateAndMapChatter(envelope: unknown, objectKey: string): NewChatter {
  if (typeof envelope !== 'object' || envelope === null) {
    throw new Error('Envelope must be an object');
  }

  const { type, id, data } = envelope as {type: string, id: string, data: unknown};

  if (type !== 'chatter') {
    throw new Error(`Expected type 'chatter', got '${type}'`);
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('Data must be an object');
  }

  const obj = data as Record<string, unknown>;

  // Validate required fields in data object
  if (typeof obj.title !== 'string') throw new Error('Missing or invalid field: title');
  // ... rest of validation

  return {
    id,  // Use envelope id, not data.id
    datePosted: new Date(obj.date_posted),
    year: obj.year,
    month: obj.month,
    slug: obj.slug,
    publish: typeof obj.publish === 'boolean' ? obj.publish : true,
    r2Key: objectKey,
  };
}
```

**Rationale:**
- Consistent with upload API format
- `id` computed by server, reliable
- `type` enables routing validation
- `data` is untouched content payload
- Clean separation of envelope vs content

**Alternatives considered:**
- Flat JSON: Requires migration anyway, less future-proof
- Dual-format support: Complex, error-prone

### Decision 3: Hot/Cold Storage Schema Optimization

**Choice:** Remove all display-only and derivable fields from D1

**Per-type decisions:**

**Chatter (8,006 records):**
- Keep: id, datePosted, year, month, slug, publish, r2Key
- Remove: title, date (75% reduction)
- Rationale: slug sufficient for URLs, title fetched for display

**Checkins (2,607 records):**
- Keep: id, venueId, latitude, longitude, datetime, year, month, slug, publish, r2Key
- Remove: venueName, foursquareUrl, address (8 fields), date, time (73% reduction)
- Rationale: Geospatial queries use lat/long, venue name fetched from R2

**Films (2,659 records):**
- Keep: id, year, yearWatched, dateWatched, month, slug, rewatch, rewatchCount, publish, tmdbId, letterboxdId, r2Key
- Remove: title, date, posterUrl, letterboxdUri (83% reduction)
- Rationale: URLs derivable from IDs, title fetched for display

**Quotes (32 records):**
- Keep: id, author, dateAdded, year, month, slug, publish, r2Key
- Remove: text, date (78% reduction)
- Rationale: author enables filtering, text fetched for display

**Shakespeare (35,629 paragraphs):**
- Keep: id, work_id, act, scene, paragraph_num, character_id, is_stage_direction, word_count, timestamp, r2_key
- Remove: text, text_phonetic, text_stem, work_title, genre_code, genre_name, character_name
- Rationale: Structural metadata enables navigation, text fetched for display

**Topten (1,199 lists):**
- Keep: id, show, date, title, r2Key
- Remove: items, timestamp, year, month, slug, item_count, source_url, data_quality
- Rationale: Minimal D1 schema, year/month derivable via SQLite date functions

**Alternatives considered:**
- Keep titles in D1: Simpler but wastes ~1MB across all types
- More aggressive removal: Would require R2 fetches for basic listing

### Decision 4: Per-Type Ingestion Endpoints

**Choice:** `POST /chatter/ingest`, `POST /checkins/ingest`, etc.

**Implementation:**
```typescript
// /chatter/ingest
const objects = await bucket.list({ prefix: 'chatter/' });
for (const obj of objects.objects) {
  await queue.send({ objectKey: obj.key });
}
return { queued: objects.objects.length };
```

**Rationale:**
- RESTful pattern (type in URL)
- Clear authentication per type
- Simple R2 prefix filtering
- Idempotent (can re-run safely)

**Alternatives considered:**
- Generic /ingest?type=chatter: Less RESTful, type validation needed
- Batch with progress tracking: Complex, unnecessary for one-time ops

### Decision 5: Preserve Phase1-* Field Mappings

**Choice:** Copy exact validators from phase1-* proposals, only modify for wrapped format

**Process:**
1. Extract validator from phase1-chatter-ingest/specs/chatter-ingestion/spec.md
2. Update to unwrap `data` object
3. Use envelope `id` instead of `data.id`
4. Preserve all field validations, snake_case to camelCase mappings
5. Preserve all type coercions and defaults

**Rationale:**
- User spent significant time getting validators right
- Field-level requirements documented in capability specs
- No risk of introducing regressions
- Easy to verify against existing specs

**Alternatives considered:**
- Redesign validators: Wasteful, error-prone
- Generic validator: Loses type-specific field handling

### Decision 6: Idempotent Ingestion via UNIQUE Constraints

**Choice:** Rely on existing UNIQUE constraints on slug/id fields, log duplicates

**Implementation:**
```typescript
try {
  await orm.insert(chatter).values(validatedChatter);
  inserted = true;
} catch (error) {
  if (error.message.includes('UNIQUE constraint failed')) {
    console.log(`Duplicate chatter: ${validatedChatter.slug}`);
    inserted = false;  // Not an error, just a duplicate
  } else {
    throw error;
  }
}
```

**Rationale:**
- SQLite UNIQUE constraint prevents duplicates at DB level
- Idempotent - can call /ingest multiple times safely
- No complex upsert logic needed
- Deterministic IDs ensure same data = same ID

**Alternatives considered:**
- INSERT OR REPLACE: Could overwrite updated records
- Check before insert: Race conditions, slower

## Risks / Trade-offs

### Risk: Large Queue Backlog

- **Impact:** 50k+ messages takes time to process (est. 15-30 minutes)
- **Mitigation:** Cloudflare Queues designed for this scale, batching automatic
- **Monitoring:** Log progress, use D1 record counts to track completion

### Risk: R2 Fetch Latency for Display

- **Impact:** ~20ms per R2 fetch when displaying full content
- **Mitigation:** Acceptable for detail views, list views use D1 only
- **Future:** Add edge caching for frequently accessed content

### Risk: Breaking Schema Changes

- **Impact:** Existing queries using removed fields will break
- **Mitigation:** No production frontend yet, low risk
- **Migration:** Update any existing queries to fetch from R2 or use remaining fields

### Risk: Wrapped JSON Migration Complexity

- **Impact:** 50k+ files need to be wrapped before ingestion works
- **Mitigation:** Migration handled separately (out of scope)
- **Validation:** Validators will fail clearly on flat JSON

### Trade-off: Per-Type Endpoints vs Generic

- **Impact:** More endpoints to document and maintain
- **Mitigation:** Pattern is identical, code can be DRYed up
- **Benefit:** Clear authentication boundaries, simpler R2 prefix logic

## Migration Plan

**Phase 1: Schema Changes**
```bash
# Update schema.ts for all 6 tables
just migrate        # Generate migrations
just migrate-local  # Apply locally
# Test with sample data
```

**Phase 2: Update Validators**
```bash
# Modify validateAndMap* functions for wrapped JSON
# Add topten validator (new)
# Update processJsonFromR2 routing
just test           # Verify all tests pass
```

**Phase 3: Add Ingestion Endpoints**
```bash
# Add 6 POST /{type}/ingest endpoints
# Implement AUTH_TOKEN checks
# Implement R2 listing + queueing
just test           # Integration tests
```

**Phase 4: Local Testing**
```bash
# Upload sample wrapped JSON to local R2
wrangler dev
curl -X POST http://localhost:8787/chatter/ingest -H "Authorization: Bearer $TOKEN"
# Verify queue processing, D1 inserts
```

**Phase 5: Production Deployment**
```bash
wrangler deploy
wrangler d1 migrations apply app_db  # Production
# Call /ingest endpoints for all 6 types
# Monitor queue processing
# Verify D1 record counts
```

**Phase 6: Verification**
```bash
# Check final counts
wrangler d1 execute app_db --command "SELECT COUNT(*) FROM chatter"
# Expected: 8,006 (chatter), 2,607 (checkins), etc.

# Verify schema (no removed columns)
wrangler d1 execute app_db --command "PRAGMA table_info(chatter)"

# Test R2 fetch
curl https://api.your-domain.com/chatter/{slug}
```

**Rollback Plan:**
- Drizzle down() migrations restore columns
- Re-run ingestion with old validators
- Revert to flat JSON format
- Re-deploy previous worker version

## Open Questions

None - design is complete and ready for implementation.
