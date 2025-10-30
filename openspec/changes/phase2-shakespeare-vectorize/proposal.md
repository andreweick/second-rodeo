# Proposal: Shakespeare Semantic Search with Vectorize

## Why

Enable semantic search across 35,629 Shakespeare paragraphs already ingested via phase1-shakespeare-ingest. Users want to search by theme or concept ("Find quotes about mortality in Hamlet", "betrayal scenes in Julius Caesar") rather than browsing by work/act/scene structure.

Shakespeare's Early Modern English benefits greatly from semantic understanding - thematic searches work better than exact text matching for literary analysis.

**Dependencies:**
- Requires phase1-shakespeare-ingest to be completed and deployed
- Shakespeare data must already exist in D1 and R2 (35,629 paragraphs + 43 works)

## What Changes

- Integrate Cloudflare Vectorize for semantic Shakespeare text search
- Add backfill endpoint to generate embeddings for existing 35,629 paragraphs
- Add search endpoint `GET /shakespeare/search` for thematic/semantic queries
- Generate embeddings during future shakespeare ingestion (enhance queue processor)
- Add Vectorize binding to wrangler.toml

## Impact

**Affected specs:**
- New capability: `shakespeare-semantic-search` (semantic search via Vectorize)

**Affected code:**
- `apps/api/src/services/embedding.ts` - Reuse embedding service
- `apps/api/src/handlers/http.ts` - Add `/shakespeare/search` and `/shakespeare/vectorize/backfill` endpoints
- `apps/api/src/services/json-processor.ts` - Add embedding generation to shakespeare queue processor
- `wrangler.toml` - Add Vectorize index binding

**Storage architecture:**
- D1: Unchanged (~500KB for 35,629 paragraphs + 43 works)
- R2: Unchanged (~30MB)
- Vectorize: NEW ~110MB for text embeddings (35,629 vectors × 768 dimensions)
- Pattern: Search via Vectorize → get paragraph IDs → query D1 → fetch from R2

**User workflow:**
1. Create Vectorize index: `wrangler vectorize create shakespeare-texts --dimensions=768`
2. Deploy updated worker with Vectorize binding
3. Backfill existing paragraphs: `POST /shakespeare/vectorize/backfill` (may take 30-60 minutes)
4. Search: `GET /shakespeare/search?q=mortality+in+Hamlet` → returns matching paragraphs

**Non-breaking changes:**
- Phase1 ingest flow continues to work unchanged
- Future shakespeare ingestions will automatically generate embeddings
- Existing D1/R2 data unchanged

**Search capabilities:**
- Thematic search: "mortality in Hamlet" → finds death/dying themes
- Scene-level search: "betrayal scenes in Julius Caesar"
- Paraphrase matching: "that speech about madmen and blind"
- Character-scoped: filter by work_id or character_id in D1
- Conceptual search: "poetic descriptions of nature"
