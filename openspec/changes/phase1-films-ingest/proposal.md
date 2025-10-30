# Proposal: Bulk Films Ingestion

## Why

Enable bulk ingestion of 2,659 film viewing records from pre-processed JSON files in `r2-staging/films/` into the Second Rodeo archive. The films table currently stores 4 redundant fields (title, date, posterUrl, letterboxdUri) that can be removed to follow the hot/cold storage architecture more strictly, reducing D1 storage by ~440KB (~83% reduction).

This completes the films ingestion flow by adding the missing bulk trigger endpoint while optimizing for minimal D1 footprint, following the proven shakespeare ingestion pattern.

## What Changes

- **BREAKING**: Update films table schema to remove 4 fields (title, date, posterUrl, letterboxdUri)
- Add HTTP endpoint `POST /films/ingest` to trigger bulk ingestion from R2
- List all objects with R2 prefix `films/` and queue them for processing
- Update films validator to exclude removed fields from D1 insert
- Generate Drizzle migration for schema changes
- Support idempotent re-ingestion via existing UNIQUE constraint on `slug` field

## Impact

**Affected specs:**
- New capability: `films-ingestion` (bulk data import from R2 to D1)

**Affected code:**
- `apps/api/src/db/schema.ts` - Remove 4 fields from films table
- `apps/api/src/services/json-processor.ts` - Update validateAndMapFilm to exclude removed fields
- `apps/api/src/handlers/http.ts` - Add `/films/ingest` endpoint
- `apps/api/migrations/` - New migration file for schema changes

**Storage architecture:**
- D1: ~90KB for 2,659 film records (metadata only: id, year, yearWatched, dateWatched, month, slug, rewatch, rewatchCount, publish, tmdbId, letterboxdId, r2Key)
- R2: ~1.2MB for full JSON files with title, poster URL, etc.
- Pattern: Query D1 for filtering/navigation, fetch from R2 for title and full content display
- Savings: 83% reduction in D1 storage (from ~530KB to ~90KB)

**User workflow:**
1. Upload files to R2 via rclone: `rclone copy r2-staging/films/ r2:sr-json/films/`
2. Apply schema migration (removes 4 columns)
3. Call authenticated endpoint: `POST /films/ingest`
4. Endpoint lists R2 objects and queues 2,659 messages
5. Queue processes files using updated validator, inserts minimal metadata to D1
6. Query D1 for filtering (by dateWatched/year/month), fetch full JSON from R2 for display

**Breaking changes:**
- **BREAKING**: Films table removes `title`, `date`, `posterUrl`, `letterboxdUri` fields
- List views must use slug or fetch from R2 for title
- Poster URLs derivable from TMDB: `https://image.tmdb.org/t/p/w500/{tmdb_poster_path}` (fetch from R2)
- Letterboxd URIs derivable from ID: `https://boxd.it/{letterboxdId}`
- Existing films table will be migrated (columns dropped, no data loss in R2)
