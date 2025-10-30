# Proposal: Quotes Semantic Search with Vectorize

## Why

Enable semantic search for 32 literary/philosophical quotes already ingested via phase1-quotes-ingest. Users want to search by theme or concept ("quotes about leadership", "stoic philosophy") rather than exact text matching or browsing by author.

Literary quotes benefit greatly from semantic understanding - finding quotes about "courage" should also return quotes about "bravery" or "valor" even without exact word matches.

**Dependencies:**
- Requires phase1-quotes-ingest to be completed and deployed
- Quotes data must already exist in D1 and R2

## What Changes

- Integrate Cloudflare Vectorize for semantic quote text search
- Add backfill endpoint to generate embeddings for existing 32 quotes
- Add search endpoint `GET /quotes/search` for thematic/semantic queries
- Generate embeddings during future quote ingestion (enhance queue processor)
- Add Vectorize binding to wrangler.toml (may share index with films or create separate)

## Impact

**Affected specs:**
- New capability: `quotes-semantic-search` (semantic search via Vectorize)

**Affected code:**
- `apps/api/src/services/embedding.ts` - Reuse embedding service from phase2-films-vectorize
- `apps/api/src/handlers/http.ts` - Add `/quotes/search` and `/quotes/vectorize/backfill` endpoints
- `apps/api/src/services/json-processor.ts` - Add embedding generation to quotes queue processor
- `wrangler.toml` - Add or reference Vectorize index binding

**Storage architecture:**
- D1: Unchanged (~1KB for 32 quotes)
- R2: Unchanged (~15KB)
- Vectorize: NEW ~128KB for text embeddings (768-dimensional vectors)
- Pattern: Search via Vectorize → get quote IDs → query D1 → fetch from R2

**User workflow:**
1. Create Vectorize index (or reuse films index): `wrangler vectorize create quotes-texts --dimensions=768`
2. Deploy updated worker with Vectorize binding
3. Backfill existing quotes: `POST /quotes/vectorize/backfill`
4. Search: `GET /quotes/search?q=leadership` → returns matching quotes with metadata

**Non-breaking changes:**
- Phase1 ingest flow continues to work unchanged
- Future quote ingestions will automatically generate embeddings
- Existing D1/R2 data unchanged

**Search capabilities:**
- Thematic search: "quotes about courage" → finds related concepts (bravery, valor)
- Philosophical concepts: "stoic philosophy" → finds stoic themes
- Paraphrase matching: "that quote about madmen and blind" → finds exact quote
- Author-scoped search: semantic search + D1 author filtering
