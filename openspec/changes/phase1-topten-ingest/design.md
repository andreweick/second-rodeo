# Design: Top Ten Lists Ingestion

## Context

The Second Rodeo archive follows a hot/cold storage architecture where Cloudflare D1 stores minimal, indexed metadata for fast filtering, and Cloudflare R2 stores complete content as immutable JSON files. This design applies that pattern to 1,199 top ten lists spanning 1986-2017.

The source data has been preprocessed into individual JSON files with deterministic SHA256-based IDs, ready for upload to R2 at `sr-json/topten/`.

## Goals / Non-Goals

**Goals:**
- Ingest 1,199 top ten lists into D1 with minimal storage footprint
- Enable fast filtering by date, show, and title without R2 fetches
- Support idempotent re-ingestion (safe to run multiple times)
- Follow established hot/cold storage pattern from Shakespeare ingestion
- Provide comprehensive test coverage

**Non-Goals:**
- Full-text search on list items (items stay in R2)
- Manifest file on R2 (ingestion lists objects directly)
- Year/month denormalization (use SQLite date functions instead)
- Data quality tracking in D1 (stays in R2 JSON)

## Decisions

### Decision: Minimal D1 Schema

**Fields stored in D1:**
- `id` (text, primary key) - SHA256-based identifier from preprocessing
- `show` (text) - Show name for filtering
- `date` (text, YYYY-MM-DD) - Air date for sorting and range queries
- `title` (text) - List title for display in list views
- `r2Key` (text) - R2 object key to fetch full content
- `createdAt` (timestamp) - Auto-managed by Drizzle
- `updatedAt` (timestamp) - Auto-managed by Drizzle

**Fields stored ONLY in R2:**
- `items[]` - Array of 10 list items (the actual content)
- `timestamp` - ISO 8601 timestamp (redundant with date)
- `year` - Numeric year (derivable from date)
- `month` - YYYY-MM format (derivable from date)
- `slug` - URL-friendly slug (not needed for queries)
- `item_count` - Count of items (always 10)
- `source_url` - Original source URL
- `data_quality{}` - Quality flags (has_truncated, missing_quotes, wrong_count)

**Rationale:**
- D1 has size limits; storing minimal fields maximizes capacity
- Items array is ~2KB per record (2.4MB total) - too large for D1
- Year/month can be extracted with SQLite: `strftime('%Y', date)`, `strftime('%Y-%m', date)`
- Title enables list display without R2 fetch (UX improvement)
- Show enables filtering without R2 fetch

**Alternatives considered:**
- Store items in D1: Rejected due to size (would use ~2.4MB of D1 quota)
- Store year/month as indexed columns: Rejected for simplicity (SQLite date functions are fast enough)
- Remove title from D1: Rejected (would require R2 fetch for every list view)

### Decision: No Manifest File on R2

The ingestion endpoint will list R2 objects directly using the `sr-json/topten/` prefix rather than reading a manifest file.

**Rationale:**
- Simpler: No need to maintain manifest in sync with files
- Cloudflare R2 list operations are fast and cheap
- Manifest adds complexity without significant benefit for 1,199 files
- Matches pattern of listing for idempotent re-ingestion

**Trade-offs:**
- List operation required on each ingestion (acceptable for 1,199 files)
- Cannot pre-filter files without listing (not needed for this dataset)

### Decision: Flat R2 Structure

Files stored as `sr-json/topten/sha256_{hash}.json` with no subdirectories.

**Rationale:**
- Deterministic path from ID: `id.replace(':', '_') + '.json'`
- No need to parse date for path construction
- Simpler listing and queuing logic
- 1,199 files is small enough for flat structure

### Decision: Idempotent Ingestion via UNIQUE Constraint

Queue processing uses INSERT with SQLite UNIQUE constraint on `id` to prevent duplicates.

**Flow:**
1. POST /topten/ingest lists all R2 objects and queues messages
2. Queue worker attempts INSERT for each message
3. If id already exists, UNIQUE constraint prevents duplicate
4. Worker logs duplicate and continues (not an error)

**Rationale:**
- Safe to re-run ingestion without data corruption
- No need for SELECT-before-INSERT logic
- Simpler than UPSERT for append-only data
- Matches Shakespeare ingestion pattern

**Trade-offs:**
- Duplicate attempts logged as errors (informational)
- Cannot update existing records (use DELETE + re-ingest if needed)

## Risks / Trade-offs

### Risk: Breaking Schema Change

**Risk:** Removing 6 fields from topten table breaks any existing code that queries those fields.

**Mitigation:**
- This is a new capability; no existing code depends on topten data
- Migration is reversible if needed
- Document year/month filtering using SQLite date functions

### Risk: SQLite Date Function Performance

**Risk:** Filtering by year/month using `strftime()` may be slower than indexed columns.

**Mitigation:**
- 1,199 records is small; performance impact negligible
- Can add indexes on date if needed: `CREATE INDEX idx_topten_date ON topten(date)`
- Range queries are efficient: `WHERE date >= '1990-01-01' AND date < '1991-01-01'`
- Monitor query performance; can denormalize year/month later if needed

**Measurement:**
- Benchmark query performance after ingestion
- If `strftime()` queries exceed 50ms, consider adding year/month columns

## Migration Plan

### Schema Migration

```sql
-- Generated by Drizzle
ALTER TABLE topten DROP COLUMN timestamp;
ALTER TABLE topten DROP COLUMN year;
ALTER TABLE topten DROP COLUMN month;
ALTER TABLE topten DROP COLUMN slug;
ALTER TABLE topten DROP COLUMN itemCount;
ALTER TABLE topten DROP COLUMN sourceUrl;
```

**Note:** SQLite does not support DROP COLUMN directly. Drizzle will generate a migration that:
1. Creates new table with correct schema
2. Copies data from old table
3. Drops old table
4. Renames new table

### Rollback Plan

If schema change causes issues:
1. Revert migration: manually recreate topten table with old schema
2. Re-run preprocessing to regenerate full records
3. Re-upload to R2 and re-ingest

## Future Enhancements

### Semantic Search with Vectorize (Separate Follow-Up Change)

**Planned capability:**
- Semantic search over top ten lists using natural language queries
- Powered by Cloudflare Vectorize (vector database)
- Embeddings generated from: title + all 10 items concatenated
- Separate batch process to generate and store embeddings

**Architecture:**
```
1. Batch job fetches all lists from D1 (ids + r2Keys)
2. For each list, fetch full JSON from R2
3. Concatenate: "{title}\n{item1}\n{item2}...\n{item10}"
4. Generate embedding via Workers AI or external API
5. Store in Vectorize with metadata: {id, show, date, title}
6. Semantic search endpoint queries Vectorize, returns top matches
```

**Why separate change:**
- Keeps this ingestion change focused and simple
- Vectorize integration has different requirements (embedding model, batch processing)
- Embeddings can be regenerated without re-ingesting source data
- Allows testing ingestion independently before adding search

**Design notes for future work:**
- R2 storage of full items array enables embedding generation without schema changes
- D1 id as primary key enables linking Vectorize results back to D1/R2
- Minimal D1 schema reduces data duplication (Vectorize stores id, show, date, title as metadata)

## Open Questions

None - design is ready for implementation.
