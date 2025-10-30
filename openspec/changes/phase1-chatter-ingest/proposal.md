# Proposal: Bulk Chatter Ingestion with Schema Optimization

## Why

Enable bulk ingestion of 8,006 chatter posts from pre-processed JSON files in `r2-staging/chatter/` into the Second Rodeo archive. The chatter table currently stores some redundant fields (title, date) that can be removed to follow the hot/cold storage architecture more strictly, reducing D1 storage by ~480KB (~75% reduction).

This completes the chatter ingestion flow by adding the missing bulk trigger endpoint while optimizing for minimal D1 footprint, following the proven shakespeare ingestion pattern.

## What Changes

- **BREAKING**: Update chatter table schema to remove `title` and `date` fields (keep only queryable metadata)
- Add HTTP endpoint `POST /chatter/ingest` to trigger bulk ingestion from R2
- List all objects with R2 prefix `chatter/` and queue them for processing
- Update chatter validator to exclude removed fields from D1 insert
- Generate Drizzle migration for schema changes
- Support idempotent re-ingestion via existing UNIQUE constraint on `slug` field

## Impact

**Affected specs:**
- New capability: `chatter-ingestion` (bulk data import from R2 to D1)

**Affected code:**
- `apps/api/src/db/schema.ts` - Remove title and date fields from chatter table
- `apps/api/src/services/json-processor.ts` - Update validateAndMapChatter to exclude removed fields
- `apps/api/src/handlers/http.ts` - Add `/chatter/ingest` endpoint
- `apps/api/migrations/` - New migration file for schema changes

**Storage architecture:**
- D1: ~160KB for 8,006 chatter records (metadata only: id, datePosted, year, month, slug, publish, r2Key)
- R2: ~3MB for full JSON files with title, content, date, tags, images array
- Pattern: Query D1 for filtering/navigation, fetch from R2 for title and full content display
- Savings: 75% reduction in D1 storage (from ~640KB to ~160KB)

**User workflow:**
1. Upload files to R2 via rclone: `rclone copy r2-staging/chatter/ r2:sr-json/chatter/`
2. Apply schema migration (removes title, date columns)
3. Call authenticated endpoint: `POST /chatter/ingest`
4. Endpoint lists R2 objects and queues 8,006 messages
5. Queue processes files using updated validator, inserts minimal metadata to D1
6. Query D1 for filtering (by datePosted/year/month), fetch full JSON from R2 for display

**Breaking changes:**
- **BREAKING**: Chatter table removes `title` and `date` fields - list views must use slug or fetch from R2
- Existing chatter table will be migrated (columns dropped, no data loss in R2)
