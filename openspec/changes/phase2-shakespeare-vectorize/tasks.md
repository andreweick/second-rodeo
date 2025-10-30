# Tasks: Shakespeare Semantic Search with Vectorize

## 1. Vectorize Setup

- [ ] 1.1 Create Vectorize index: `wrangler vectorize create shakespeare-texts --dimensions=768`
- [ ] 1.2 Add Vectorize binding to `wrangler.toml`
- [ ] 1.3 Verify Vectorize index configuration
- [ ] 1.4 Test embedding generation locally for Early Modern English text

## 2. Backfill Endpoint

- [ ] 2.1 Add POST /shakespeare/vectorize/backfill endpoint in `apps/api/src/handlers/http.ts`
- [ ] 2.2 Implement authentication check using AUTH_TOKEN
- [ ] 2.3 Query D1 for all shakespeare paragraphs with r2Key
- [ ] 2.4 For each paragraph: fetch from R2, extract text, generate embedding, upsert to Vectorize
- [ ] 2.5 Add metadata to vector: paragraph_id, work_id, act, scene, character_id
- [ ] 2.6 Add progress logging (every 1000 paragraphs)
- [ ] 2.7 Return JSON response with count of paragraphs processed
- [ ] 2.8 Handle existing vectors gracefully (upsert, not error)
- [ ] 2.9 Optimize for large dataset (35,629 vectors, may take 30-60 minutes)

## 3. Search Endpoint

- [ ] 3.1 Add GET /shakespeare/search endpoint for semantic queries
- [ ] 3.2 Accept query parameter `q` (search query)
- [ ] 3.3 Accept optional `limit` parameter (default 20)
- [ ] 3.4 Accept optional `work_id` parameter for work-scoped search
- [ ] 3.5 Accept optional `character_id` parameter for character-scoped search
- [ ] 3.6 Generate embedding from query text
- [ ] 3.7 Query Vectorize with topK=limit
- [ ] 3.8 Extract paragraph IDs from Vectorize results
- [ ] 3.9 Query D1 for metadata, filter by work_id/character_id if provided
- [ ] 3.10 Return search results with similarity scores
- [ ] 3.11 Add optional `?fetch=full` to include R2 text in response
- [ ] 3.12 Support grouping by scene for scene-level results

## 4. Queue Enhancement (Future Ingestion)

- [ ] 4.1 Update shakespeare queue processor to generate embeddings
- [ ] 4.2 After D1 insert, extract text from JSON
- [ ] 4.3 Generate embedding and upsert to Vectorize
- [ ] 4.4 Add metadata: paragraph_id, work_id, act, scene, character_id
- [ ] 4.5 Log embedding generation success/failure
- [ ] 4.6 Ensure idempotent (upsert handles re-runs)

## 5. Testing

- [ ] 5.1 Write integration test for /shakespeare/vectorize/backfill endpoint
- [ ] 5.2 Write integration test for /shakespeare/search endpoint
- [ ] 5.3 Test thematic search: "mortality in Hamlet"
- [ ] 5.4 Test scene-level: "betrayal scenes in Julius Caesar"
- [ ] 5.5 Test paraphrase matching
- [ ] 5.6 Test work-scoped search (filter by work_id)
- [ ] 5.7 Test character-scoped search
- [ ] 5.8 Test with Early Modern English text samples
- [ ] 5.9 Test with different limit values
- [ ] 5.10 Verify queue processor embedding generation
- [ ] 5.11 Run full test suite: `just test`

## 6. Deployment

- [ ] 6.1 Create production Vectorize index
- [ ] 6.2 Update production wrangler.toml with Vectorize binding
- [ ] 6.3 Deploy worker to production
- [ ] 6.4 Call POST /shakespeare/vectorize/backfill to process 35,629 paragraphs
- [ ] 6.5 Monitor backfill progress (expect 30-60 minutes)
- [ ] 6.6 Verify final count: 35,629 vectors in Vectorize
- [ ] 6.7 Test semantic search: "mortality in Hamlet"
- [ ] 6.8 Test paraphrase: "that speech about madmen and blind"
- [ ] 6.9 Test thematic: "poetic descriptions of nature"
- [ ] 6.10 Test character-scoped: "Hamlet's speeches about madness"
- [ ] 6.11 Verify search latency meets expectations (<150ms)
