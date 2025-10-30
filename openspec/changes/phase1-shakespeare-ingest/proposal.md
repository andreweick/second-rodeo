# Proposal: Ingest Shakespeare JSON Corpus

## Why

Enable bulk ingestion of Shakespeare's complete works (35,629 paragraphs across 43 plays/poems) from pre-processed JSON files into the Second Rodeo archive. The data has been converted from SQLite to individual JSON files optimized for R2 storage and is ready in `wip/shakespeare2/r2-staging/`.

This provides a rich literary corpus for future search, display, and analysis features while following the project's hot/cold storage architecture pattern.

## What Changes

- Update `shakespeare` database table schema to store minimal metadata only (remove redundant text-heavy fields)
- Add new `shakespeare_works` table for work-level metadata (43 works with titles, genres, statistics)
- Create HTTP endpoint `POST /shakespeare/ingest` to trigger bulk ingestion from R2
- Extend queue processor to handle `shakespeare` category (fix existing typo: `shakespert` → `shakespeare`)
- Support validation and insertion of both paragraph data and works manifest
- Generate Drizzle migration for schema changes

## Impact

**Affected specs:**
- New capability: `shakespeare-ingestion` (bulk data import from R2 to D1)

**Affected code:**
- `apps/api/src/db/schema.ts` - Update shakespeare table, add shakespeare_works table
- `apps/api/src/services/json-processor.ts` - Add shakespeare validation for minimal metadata
- `apps/api/src/handlers/http.ts` - Add /shakespeare/ingest endpoint
- `apps/api/drizzle/migrations/` - New migration file

**Storage architecture:**
- D1: ~500KB for 35,629 paragraph records + 43 work records (metadata only)
- R2: ~30MB for full JSON files with text, phonetic, and stem versions
- Pattern: Query D1 for metadata/filtering → fetch from R2 for text display

**User workflow:**
1. Upload files to R2 via rclone: `shakespeare/paragraphs/*.json` + `shakespeare/manifest.jsonl`
2. Call authenticated endpoint: `POST /shakespeare/ingest`
3. Endpoint lists R2 objects and queues 35,629 messages
4. Queue processes files: validates, inserts to D1
5. Query D1 for filtering (by work, act, scene), fetch full text from R2 for display

**Non-breaking changes:**
- Existing shakespeare table will be migrated (no data loss, just schema refinement)
- No impact on other content types or ingestion flows
