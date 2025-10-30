# Tasks: Chatter Semantic Search with Vectorize

## 1. Vectorize Setup

- [ ] 1.1 Create Vectorize index: `wrangler vectorize create chatter-texts --dimensions=768`
- [ ] 1.2 Add Vectorize binding to `wrangler.toml`
- [ ] 1.3 Verify Vectorize index configuration

## 2. Backfill Endpoint

- [ ] 2.1 Add POST /chatter/vectorize/backfill endpoint
- [ ] 2.2 Implement authentication check using AUTH_TOKEN
- [ ] 2.3 Query D1 for all chatter posts with r2Key
- [ ] 2.4 For each post: fetch from R2, extract title+content, generate embedding, upsert to Vectorize
- [ ] 2.5 Add metadata: post_id, year, month, slug
- [ ] 2.6 Add progress logging (every 500 posts)
- [ ] 2.7 Return count of posts processed

## 3. Search Endpoint

- [ ] 3.1 Add GET /chatter/search endpoint
- [ ] 3.2 Accept query parameter `q`
- [ ] 3.3 Accept optional `limit` (default 10)
- [ ] 3.4 Accept optional `year`/`month` for temporal filtering
- [ ] 3.5 Generate embedding from query
- [ ] 3.6 Query Vectorize with topK
- [ ] 3.7 Query D1 for metadata, apply temporal filters
- [ ] 3.8 Return results with similarity scores

## 4. Queue Enhancement

- [ ] 4.1 Update chatter queue processor to generate embeddings
- [ ] 4.2 Extract title+content for embedding
- [ ] 4.3 Upsert to Vectorize with metadata
- [ ] 4.4 Ensure idempotent

## 5. Testing

- [ ] 5.1 Test backfill endpoint
- [ ] 5.2 Test search endpoint
- [ ] 5.3 Test topic-based search
- [ ] 5.4 Test with temporal filtering
- [ ] 5.5 Run full test suite

## 6. Deployment

- [ ] 6.1 Create production Vectorize index
- [ ] 6.2 Deploy worker
- [ ] 6.3 Backfill 8,006 posts
- [ ] 6.4 Verify 8,006 vectors
- [ ] 6.5 Test searches
