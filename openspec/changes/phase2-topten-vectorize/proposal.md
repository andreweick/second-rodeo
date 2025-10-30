# Proposal: Top Ten Lists Semantic Search with Vectorize

## Why

Enable semantic search for 1,199 top ten lists already ingested via phase1-topten-ingest. Users want to search by topic or theme ("top ten sci-fi movies", "favorite albums of 2010") rather than exact title matching.

**Dependencies:**
- Requires phase1-topten-ingest to be completed and deployed
- Top ten lists data must already exist in D1 and R2

## What Changes

- Integrate Cloudflare Vectorize for semantic list title search
- Add backfill endpoint to generate embeddings for existing 1,199 lists
- Add search endpoint `GET /topten/search` for thematic queries
- Generate embeddings during future topten ingestion (enhance queue processor)
- Add Vectorize binding to wrangler.toml

## Impact

**Affected specs:**
- New capability: `topten-semantic-search` (semantic list search via Vectorize)

**Affected code:**
- `apps/api/src/services/embedding.ts` - Reuse embedding service
- `apps/api/src/handlers/http.ts` - Add `/topten/search` and `/topten/vectorize/backfill` endpoints
- `apps/api/src/services/json-processor.ts` - Add embedding generation to topten queue processor
- `wrangler.toml` - Add or reference Vectorize index binding

**Storage architecture:**
- D1: Unchanged (~60KB for 1,199 lists)
- R2: Unchanged (~2.7MB)
- Vectorize: NEW ~4MB for embeddings (1,199 vectors × 768 dimensions)
- Pattern: Search via Vectorize → get list IDs → query D1 → fetch from R2

**User workflow:**
1. Create Vectorize index: `wrangler vectorize create topten-lists --dimensions=768`
2. Deploy updated worker with Vectorize binding
3. Backfill existing lists: `POST /topten/vectorize/backfill`
4. Search: `GET /topten/search?q=sci-fi+movies` → returns matching lists

**Non-breaking changes:**
- Phase1 ingest flow continues to work unchanged
- Future topten ingestions will automatically generate embeddings
- Existing D1/R2 data unchanged

**Search capabilities:**
- Topic-based search: "sci-fi movies", "jazz albums", "travel destinations"
- Temporal filtering: combine with year/date from D1
- Theme-based discovery: find lists by conceptual similarity
