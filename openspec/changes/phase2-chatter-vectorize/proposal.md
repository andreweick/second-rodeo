# Proposal: Chatter Semantic Search with Vectorize

## Why

Enable semantic search for 8,006 chatter posts already ingested via phase1-chatter-ingest. Users want to search by topic or concept rather than browsing chronologically or by date.

**Dependencies:**
- Requires phase1-chatter-ingest to be completed and deployed
- Chatter data must already exist in D1 and R2

## What Changes

- Integrate Cloudflare Vectorize for semantic chatter text search
- Add backfill endpoint to generate embeddings for existing 8,006 posts
- Add search endpoint `GET /chatter/search` for semantic queries
- Generate embeddings during future chatter ingestion (enhance queue processor)
- Add Vectorize binding to wrangler.toml

## Impact

**Affected specs:**
- New capability: `chatter-semantic-search` (semantic search via Vectorize)

**Affected code:**
- `apps/api/src/services/embedding.ts` - Reuse embedding service
- `apps/api/src/handlers/http.ts` - Add `/chatter/search` and `/chatter/vectorize/backfill` endpoints
- `apps/api/src/services/json-processor.ts` - Add embedding generation to chatter queue processor
- `wrangler.toml` - Add or reference Vectorize index binding

**Storage architecture:**
- D1: Unchanged (~160KB for 8,006 posts)
- R2: Unchanged (~3MB)
- Vectorize: NEW ~25MB for embeddings (8,006 vectors × 768 dimensions)
- Pattern: Search via Vectorize → get post IDs → query D1 → fetch from R2

**User workflow:**
1. Create Vectorize index: `wrangler vectorize create chatter-texts --dimensions=768`
2. Deploy updated worker with Vectorize binding
3. Backfill existing posts: `POST /chatter/vectorize/backfill`
4. Search: `GET /chatter/search?q=technology+trends` → returns matching posts

**Non-breaking changes:**
- Phase1 ingest flow continues to work unchanged
- Future chatter ingestions will automatically generate embeddings
- Existing D1/R2 data unchanged

**Search capabilities:**
- Topic-based search: "posts about technology"
- Conceptual search: "personal reflections"
- Temporal filtering: combine semantic search with D1 year/month filters
