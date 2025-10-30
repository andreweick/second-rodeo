# Tasks: Quotes Semantic Search with Vectorize

## 1. Vectorize Setup

- [ ] 1.1 Decide: Share films Vectorize index or create separate quotes index
- [ ] 1.2 If separate: Create index `wrangler vectorize create quotes-texts --dimensions=768`
- [ ] 1.3 Add Vectorize binding to `wrangler.toml` (if not already present)
- [ ] 1.4 Test embedding generation locally for quote text

## 2. Backfill Endpoint

- [ ] 2.1 Add POST /quotes/vectorize/backfill endpoint in `apps/api/src/handlers/http.ts`
- [ ] 2.2 Implement authentication check using AUTH_TOKEN
- [ ] 2.3 Query D1 for all quotes with r2Key
- [ ] 2.4 For each quote: fetch from R2, extract text, generate embedding, upsert to Vectorize
- [ ] 2.5 Add metadata to vector: quote_id, author, year, slug
- [ ] 2.6 Return JSON response with count of quotes processed
- [ ] 2.7 Handle existing vectors gracefully (upsert, not error)

## 3. Search Endpoint

- [ ] 3.1 Add GET /quotes/search endpoint for semantic queries
- [ ] 3.2 Accept query parameter `q` (search query)
- [ ] 3.3 Accept optional `limit` parameter (default 10)
- [ ] 3.4 Accept optional `author` parameter for filtering
- [ ] 3.5 Generate embedding from query text
- [ ] 3.6 Query Vectorize with topK=limit
- [ ] 3.7 Extract quote IDs from Vectorize results
- [ ] 3.8 Query D1 for metadata, filter by author if provided
- [ ] 3.9 Return search results with similarity scores
- [ ] 3.10 Add optional `?fetch=full` to include R2 text in response

## 4. Queue Enhancement (Future Ingestion)

- [ ] 4.1 Update quotes queue processor to generate embeddings
- [ ] 4.2 After D1 insert, extract text from JSON
- [ ] 4.3 Generate embedding and upsert to Vectorize
- [ ] 4.4 Add metadata: quote_id, author, year, slug
- [ ] 4.5 Log embedding generation success/failure
- [ ] 4.6 Ensure idempotent (upsert handles re-runs)

## 5. Testing

- [ ] 5.1 Write integration test for /quotes/vectorize/backfill endpoint
- [ ] 5.2 Write integration test for /quotes/search endpoint
- [ ] 5.3 Test thematic search: "courage", "leadership", "mortality"
- [ ] 5.4 Test philosophical concepts: "stoic philosophy"
- [ ] 5.5 Test paraphrase matching
- [ ] 5.6 Test author-scoped search
- [ ] 5.7 Test with different limit values
- [ ] 5.8 Verify queue processor embedding generation
- [ ] 5.9 Run full test suite: `just test`

## 6. Deployment

- [ ] 6.1 Create production Vectorize index (or configure shared index)
- [ ] 6.2 Update production wrangler.toml with Vectorize binding
- [ ] 6.3 Deploy worker to production
- [ ] 6.4 Call POST /quotes/vectorize/backfill to process existing 32 quotes
- [ ] 6.5 Verify final count: 32 vectors in Vectorize
- [ ] 6.6 Test semantic search: "leadership", "stoic philosophy"
- [ ] 6.7 Test paraphrase: "madmen and blind"
- [ ] 6.8 Test author filtering: "Shakespeare quotes about power"
- [ ] 6.9 Verify search latency meets expectations (<100ms)
