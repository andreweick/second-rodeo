# Proposal: Bulk Quotes Ingestion

## Why

Enable bulk ingestion of 32 quote records from pre-processed JSON files in `r2-staging/quotes/` into the Second Rodeo archive. The quotes table currently stores 2 fields (text, date) that can be removed to follow the hot/cold storage architecture more strictly, reducing D1 storage by ~3.5KB (~78% reduction).

This completes the quotes ingestion flow by adding the missing bulk trigger endpoint while optimizing for minimal D1 footprint, following the proven shakespeare ingestion pattern.

## What Changes

- **BREAKING**: Update quotes table schema to remove 2 fields (text, date)
- Add HTTP endpoint `POST /quotes/ingest` to trigger bulk ingestion from R2
- List all objects with R2 prefix `quotes/` and queue them for processing
- Update quotes validator to exclude removed fields from D1 insert
- Generate Drizzle migration for schema changes
- Support idempotent re-ingestion via existing UNIQUE constraint on `slug` field

## Impact

**Affected specs:**
- New capability: `quotes-ingestion` (bulk data import from R2 to D1)

**Affected code:**
- `apps/api/src/db/schema.ts` - Remove 2 fields from quotes table
- `apps/api/src/services/json-processor.ts` - Update validateAndMapQuote to exclude removed fields
- `apps/api/src/handlers/http.ts` - Add `/quotes/ingest` endpoint
- `apps/api/migrations/` - New migration file for schema changes

**Storage architecture:**
- D1: ~1KB for 32 quote records (metadata only: id, author, dateAdded, year, month, slug, publish, r2Key)
- R2: ~15KB for full JSON files with quote text
- Pattern: Query D1 for filtering/navigation, fetch from R2 for text display
- Savings: 78% reduction in D1 storage (from ~4.5KB to ~1KB)

**User workflow:**
1. Upload files to R2 via rclone: `rclone copy r2-staging/quotes/ r2:sr-json/quotes/`
2. Apply schema migration (removes 2 columns)
3. Call authenticated endpoint: `POST /quotes/ingest`
4. Endpoint lists R2 objects and queues 32 messages
5. Queue processes files using updated validator, inserts minimal metadata to D1
6. Query D1 for filtering (by author/date), fetch full JSON from R2 for display

**Breaking changes:**
- **BREAKING**: Quotes table removes `text` and `date` fields
- List views must use author or fetch from R2 for text
- Existing quotes table will be migrated (columns dropped, no data loss in R2)
