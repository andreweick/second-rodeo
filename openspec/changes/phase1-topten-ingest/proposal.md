# Proposal: Ingest Top Ten Lists

## Why

Enable bulk ingestion of 1,199 top ten lists from pre-processed JSON files in R2 into the Second Rodeo archive. The data has been converted to individual JSON files optimized for R2 storage and is ready at `wip/topten/r2-staging/lists/`.

This provides a rich archive of top ten lists spanning 1986-2017 for future search, display, and analysis features while following the project's hot/cold storage architecture pattern.

## What Changes

- **BREAKING**: Simplify `topten` database table schema to store only minimal metadata (remove timestamp, year, month, slug, itemCount, sourceUrl fields)
- Create HTTP endpoint `POST /topten/ingest` to trigger bulk ingestion from R2
- Extend queue processor to handle `topten` category with validation and insertion
- Support idempotent re-ingestion without data corruption or duplicates
- Follow hot/cold storage pattern: D1 for filtering, R2 for full content

## Impact

**Affected specs:**
- New capability: `topten-ingestion` (bulk data import from R2 to D1)

**Affected code:**
- `apps/api/src/db/schema.ts` - Simplify topten table schema (BREAKING)
- `apps/api/src/services/json-processor.ts` - Add topten validation for minimal metadata
- `apps/api/src/handlers/http.ts` - Add /topten/ingest endpoint
- `apps/api/drizzle/migrations/` - New migration file

**Storage architecture:**
- D1: ~60KB for 1,199 records (minimal metadata only)
- R2: ~2.7MB for full JSON files with items arrays and metadata
- Pattern: Query D1 for filtering/navigation, fetch from R2 for full list display

**User workflow:**
1. Upload files to R2 via rclone: `sr-json/topten/*.json`
2. Call authenticated endpoint: `POST /topten/ingest`
3. Endpoint lists R2 objects and queues 1,199 messages
4. Queue processes files, validates, and inserts minimal metadata to D1
5. Query D1 for IDs and titles, fetch full content from R2 on-demand

**Breaking changes:**
- Existing topten table schema simplified (removes 6 fields)
- Any existing code querying removed fields must be updated to fetch from R2
- Year/month filtering now requires SQLite date functions instead of direct column queries

**Future work (out of scope for this change):**
- Semantic search using Cloudflare Vectorize will be added in a follow-up change
- Embeddings will be generated from title + concatenated items via separate batch process
- This ingestion creates the data foundation for semantic search capabilities
