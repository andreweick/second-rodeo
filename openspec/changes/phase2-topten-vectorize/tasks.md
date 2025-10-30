# Tasks: Top Ten Lists Semantic Search with Vectorize

## 1. Vectorize Setup

- [ ] 1.1 Create Vectorize index: `wrangler vectorize create topten-lists --dimensions=768`
- [ ] 1.2 Add Vectorize binding to `wrangler.toml`

## 2. Backfill Endpoint

- [ ] 2.1 Add POST /topten/vectorize/backfill endpoint
- [ ] 2.2 Implement authentication check
- [ ] 2.3 Query D1 for all topten lists with r2Key
- [ ] 2.4 For each: fetch from R2, extract title+items, generate embedding, upsert
- [ ] 2.5 Add metadata: list_id, timestamp
- [ ] 2.6 Return count processed

## 3. Search Endpoint

- [ ] 3.1 Add GET /topten/search endpoint
- [ ] 3.2 Accept query `q`, optional `limit`
- [ ] 3.3 Generate embedding from query
- [ ] 3.4 Query Vectorize, fetch D1 metadata
- [ ] 3.5 Return results with similarity scores

## 4. Queue Enhancement

- [ ] 4.1 Update topten queue processor for embeddings
- [ ] 4.2 Extract title for embedding (or title+items concatenated)
- [ ] 4.3 Upsert to Vectorize

## 5. Testing

- [ ] 5.1 Test backfill endpoint
- [ ] 5.2 Test search: "sci-fi movies", "jazz albums"
- [ ] 5.3 Test thematic discovery
- [ ] 5.4 Run full test suite

## 6. Deployment

- [ ] 6.1 Create production index
- [ ] 6.2 Deploy worker
- [ ] 6.3 Backfill 1,199 lists
- [ ] 6.4 Test searches
