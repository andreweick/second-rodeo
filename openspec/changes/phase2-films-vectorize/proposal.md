# Proposal: Films Semantic Search with Vectorize

## Why

Enable semantic search for 2,659 film titles already ingested via phase1-films-ingest. Users want to search using natural language ("When did I watch Inception?", "sci-fi films I watched in 2023") rather than browsing chronologically or by exact title matching.

This follows the hot/cold storage architecture by adding semantic search without modifying the phase1 ingest flow, keeping concerns separated.

**Dependencies:**
- Requires phase1-films-ingest to be completed and deployed
- Films data must already exist in D1 and R2

## What Changes

- Integrate Cloudflare Vectorize for semantic film title search
- Add backfill endpoint to generate embeddings for existing 2,659 films
- Add search endpoint `GET /films/search` for natural language queries
- Generate embeddings during future film ingestion (enhance queue processor)
- Add Vectorize binding to wrangler.toml

## Impact

**Affected specs:**
- New capability: `films-semantic-search` (semantic search via Vectorize)

**Affected code:**
- `apps/api/src/services/embedding.ts` - New embedding generation service
- `apps/api/src/handlers/http.ts` - Add `/films/search` and `/films/vectorize/backfill` endpoints
- `apps/api/src/services/json-processor.ts` - Add embedding generation to films queue processor
- `wrangler.toml` - Add Vectorize index binding

**Storage architecture:**
- D1: Unchanged (~90KB for 2,659 films)
- R2: Unchanged (~1.2MB)
- Vectorize: NEW ~5MB for title embeddings (768-dimensional vectors)
- Pattern: Search via Vectorize → get film IDs → query D1 → fetch from R2

**User workflow:**
1. Create Vectorize index: `wrangler vectorize create films-titles --dimensions=768`
2. Deploy updated worker with Vectorize binding
3. Backfill existing films: `POST /films/vectorize/backfill`
4. Search: `GET /films/search?q=inception` → returns matching films with metadata

**Non-breaking changes:**
- Phase1 ingest flow continues to work unchanged
- Future film ingestions will automatically generate embeddings
- Existing D1/R2 data unchanged

**Search capabilities:**
- Natural language: "when did I watch that movie about dreams" → finds "Inception"
- Typo tolerance: "incepshun" → finds "Inception"
- Multi-term: "Christopher Nolan sci-fi" → finds related films
- Ranking by similarity score
