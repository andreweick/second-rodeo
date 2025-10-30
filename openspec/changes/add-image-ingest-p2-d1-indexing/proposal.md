# Proposal: Image Ingest Phase 2 - D1 Indexing

## Why

Phase 1 established the upload pipeline with R2 storage. Phase 2 adds queryability by implementing D1 database indexing with async queue processing. This enables fast queries by date, camera, location, and source without scanning R2, and makes the deduplication endpoint functional.

Key goals:
- Enable fast queries on photo metadata (date ranges, camera models, locations)
- Make deduplication endpoint functional (saves bandwidth during migration)
- Keep upload response fast with async indexing via queues
- Treat D1 as rebuildable cache (R2 JSON is source of truth)

## What Changes

### New Capabilities
- **D1 Schema**: Lightweight photos table with queryable fields (Drizzle ORM)
- **Async Indexing**: Queue-based consumer that reads R2 JSON and upserts to D1
- **Functional Deduplication**: HEAD endpoint now queries D1 for existing images
- **Basic Queries**: Query by date range, camera make/model, GPS location, source

### Modified Components
- `HEAD /api/photos/check/:sha256` - Replace stub with D1 lookup
- `apps/api/src/services/image-upload.ts` - Add queue message send after R2 writes

### New Components
- `apps/api/src/db/schema.ts` - Add photos table (Drizzle)
- `apps/api/src/services/photo-indexer.ts` - D1 indexing service
- `apps/api/src/handlers/queue.ts` - Add photo indexing consumer
- Drizzle migrations for photos table

### Dependencies
- Use existing: Drizzle ORM, Cloudflare Queues, Cloudflare D1

## Impact

### Affected Specs
- **MODIFIED**: `image-ingest` capability (Phase 2 requirements)

### Affected Code
- `apps/api/src/db/schema.ts` - Add photos table
- `apps/api/src/handlers/http.ts` - Update deduplication endpoint with D1 query
- `apps/api/src/services/image-upload.ts` - Add queue message send
- `apps/api/src/handlers/queue.ts` - Add photo indexing consumer
- `apps/api/wrangler.jsonc` - Add queue binding if needed

### Non-Breaking
This phase extends Phase 1 without breaking changes. The deduplication endpoint becomes fully functional.

### Future Phases
This proposal is part 2 of 4:
- **Phase 1** (complete): Upload core with hashing, SID, R2 storage
- **Phase 2** (this): D1 async indexing for queries
- **Phase 3**: Full-text search with FTS5
- **Phase 4**: OpenAPI documentation

Phase 3 will add FTS5 virtual table on top of the D1 schema established here.
