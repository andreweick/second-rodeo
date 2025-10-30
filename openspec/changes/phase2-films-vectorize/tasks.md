# Tasks: Films Semantic Search with Vectorize

## 1. Vectorize Setup

- [ ] 1.1 Create Vectorize index: `wrangler vectorize create films-titles --dimensions=768`
- [ ] 1.2 Add Vectorize binding to `wrangler.toml`
- [ ] 1.3 Verify Vectorize index configuration
- [ ] 1.4 Test embedding generation locally

## 2. Embedding Service

- [ ] 2.1 Create `apps/api/src/services/embedding.ts` with generateEmbedding function
- [ ] 2.2 Use Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5) for 768-dim embeddings
- [ ] 2.3 Add error handling for embedding generation failures
- [ ] 2.4 Add retry logic for transient failures
- [ ] 2.5 Export reusable embedding service for other content types

## 3. Backfill Endpoint

- [ ] 3.1 Add POST /films/vectorize/backfill endpoint in `apps/api/src/handlers/http.ts`
- [ ] 3.2 Implement authentication check using AUTH_TOKEN
- [ ] 3.3 Query D1 for all films with r2Key
- [ ] 3.4 For each film: fetch from R2, extract title, generate embedding, upsert to Vectorize
- [ ] 3.5 Add progress logging (e.g., every 100 films)
- [ ] 3.6 Return JSON response with count of films processed
- [ ] 3.7 Handle existing vectors gracefully (upsert, not error)

## 4. Search Endpoint

- [ ] 4.1 Add GET /films/search endpoint for semantic queries
- [ ] 4.2 Accept query parameter `q` (search query)
- [ ] 4.3 Accept optional `limit` parameter (default 10)
- [ ] 4.4 Generate embedding from query text
- [ ] 4.5 Query Vectorize with topK=limit
- [ ] 4.6 Extract film IDs from Vectorize results
- [ ] 4.7 Query D1 for metadata using film IDs
- [ ] 4.8 Return search results with similarity scores
- [ ] 4.9 Add optional `?fetch=full` to include R2 data in response

## 5. Queue Enhancement (Future Ingestion)

- [ ] 5.1 Update films queue processor to generate embeddings
- [ ] 5.2 After D1 insert, extract title from JSON
- [ ] 5.3 Generate embedding and upsert to Vectorize
- [ ] 5.4 Add metadata: film_id, title, year, slug
- [ ] 5.5 Log embedding generation success/failure
- [ ] 5.6 Ensure idempotent (upsert handles re-runs)

## 6. Testing

- [ ] 6.1 Write test for embedding generation service
- [ ] 6.2 Write integration test for /films/vectorize/backfill endpoint
- [ ] 6.3 Write integration test for /films/search endpoint
- [ ] 6.4 Test search queries: exact match, typo, semantic similarity
- [ ] 6.5 Test search with different limit values
- [ ] 6.6 Test queue processor embedding generation
- [ ] 6.7 Verify Vectorize upsert idempotency
- [ ] 6.8 Run full test suite: `just test`

## 7. Deployment

- [ ] 7.1 Create production Vectorize index
- [ ] 7.2 Update production wrangler.toml with Vectorize binding
- [ ] 7.3 Deploy worker to production
- [ ] 7.4 Call POST /films/vectorize/backfill to process existing 2,659 films
- [ ] 7.5 Monitor backfill progress and Vectorize vector count
- [ ] 7.6 Verify final count: 2,659 vectors in Vectorize
- [ ] 7.7 Test semantic search: "inception", "sci-fi 2023", "christopher nolan"
- [ ] 7.8 Verify search latency meets expectations (<100ms)
- [ ] 7.9 Test typo tolerance: "incepshun" → "Inception"
- [ ] 7.10 Test natural language: "movies about dreams"
