# Proposal: Bulk D1 Ingestion from R2

## Why

Enable bulk ingestion of wrapped JSON content from R2 storage into D1 database tables for six content types: chatter, checkins, films, quotes, shakespeare, and topten. The current system has R2 storage and queue processing infrastructure, but lacks the trigger endpoints and optimized validators for schema-aligned D1 ingestion.

This consolidates six separate phase1-*-ingest proposals into a unified implementation following a consistent hot/cold storage architecture pattern: D1 stores minimal queryable metadata, R2 stores complete content.

## What Changes

- Add simplified HTTP ingestion API: `POST /ingest/all` for bulk ingestion and `POST /ingest/{objectKey}` for single-file ingestion
- Use pagination with `sendBatch()` to handle 100K+ files within Worker timeout limits
- Update validators to handle wrapped JSON format (`{type, id, data}`)
- Extract required fields from `data` object per content type
- Consumer routes messages by type field (no pre-filtering in producer)
- **BREAKING**: Update D1 table schemas to remove redundant fields (per type-specific requirements)
- Generate Drizzle migrations for schema changes
- Support idempotent re-ingestion via UNIQUE constraints on slug/id fields
- Preserve exact field mappings from existing phase1-*-ingest validators
- Keep `/upload` endpoint focused on R2 storage only (no auto-queuing)

## Impact

**Affected specs:**
- New capabilities: `chatter-ingestion`, `checkins-ingestion`, `films-ingestion`, `quotes-ingestion`, `shakespeare-ingestion`, `topten-ingestion`

**Affected code:**
- `apps/api/src/db/schema.ts` - Schema changes for all 6 content types
- `apps/api/src/services/json-processor.ts` - Update validators for wrapped JSON format
- `apps/api/src/handlers/http.ts` - Add 6 ingestion endpoints
- `apps/api/drizzle/migrations/` - New migrations for schema changes

**Storage architecture (hot/cold):**
- **D1 (hot):** Minimal queryable metadata only (id, timestamps, foreign keys, boolean flags)
- **R2 (cold):** Complete wrapped JSON (`{type, id, data: {...}}`)
- **Pattern:** Query D1 for filtering/sorting → Fetch from R2 for full content display

**Content type summaries:**

| Type | Records | D1 Fields Removed | D1 Size Reduction | Key Query Fields |
|------|---------|-------------------|-------------------|------------------|
| chatter | 8,006 | title, date | 75% (~480KB saved) | datePosted, year, month, slug, publish |
| checkins | 2,607 | 11 fields (venueName, address, date, time) | 73% (~530KB saved) | venueId, lat, long, datetime, year, month |
| films | 2,659 | title, date, posterUrl, letterboxdUri | 83% (~440KB saved) | yearWatched, dateWatched, month, rewatch, tmdbId |
| quotes | 32 | text, date | 78% (~3.5KB saved) | author, dateAdded, year, month |
| shakespeare | 35,629 | text, phonetic, stem, work/character names | Significant | work_id, act, scene, character_id, word_count |
| topten | 1,199 | items, timestamp, year, month, slug, etc. | Minimal D1 schema | show, date, title |

**User workflow:**
1. Files uploaded to R2 via `/upload` endpoint (wrapped format)
2. Apply schema migrations: `just migrate-local` then production
3. Trigger ingestion:
   - **Bulk:** `POST /ingest/all` lists all R2 objects with pagination, queues all (50K+ files supported)
   - **Single:** `POST /ingest/{objectKey}` queues specific file for processing
4. Queue processes files, consumer routes by type field, validates, inserts to D1
5. Query D1 for filtering, fetch R2 for full content

**Ingestion patterns:**
- Initial bulk ingestion: `POST /ingest/all` (processes all 50K+ files, ~7-15 seconds)
- Re-process single file: `POST /ingest/sha256_abc123.json`
- Upload stays storage-only: `/upload` does not auto-queue
- Consumer handles all 6 types, routing via type field validation

**Breaking changes:**
- **BREAKING**: All 6 table schemas simplified (fields removed from D1)
- Wrapped JSON format required in R2 (migration handled separately)
- Validators expect `{type, id, data}` structure
- Query patterns shift from D1 fields to R2 fetches for removed fields
- Simplified API: single bulk endpoint instead of per-type endpoints

**Note on file migration:**
- Existing flat JSON files in R2 will be wrapped via separate manual migration
- This proposal assumes wrapped format is already in place
- Validators will fail on flat JSON (migration must happen first)
