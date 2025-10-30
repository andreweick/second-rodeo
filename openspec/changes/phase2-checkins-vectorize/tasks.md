# Tasks: Checkins Semantic Search with Vectorize

## 1. Vectorize Setup

- [ ] 1.1 Create Vectorize index: `wrangler vectorize create checkins-venues --dimensions=768`
- [ ] 1.2 Add Vectorize binding to `wrangler.toml`

## 2. Backfill Endpoint

- [ ] 2.1 Add POST /checkins/vectorize/backfill endpoint
- [ ] 2.2 Implement authentication check
- [ ] 2.3 Query D1 for all checkins with r2Key
- [ ] 2.4 For each: fetch from R2, extract venueName+address, generate embedding, upsert
- [ ] 2.5 Add metadata: checkin_id, venueId, lat, long, datetime
- [ ] 2.6 Return count processed

## 3. Search Endpoint

- [ ] 3.1 Add GET /checkins/search endpoint
- [ ] 3.2 Accept query `q`, optional `limit`
- [ ] 3.3 Accept optional lat/long bounding box for location filtering
- [ ] 3.4 Generate embedding from query
- [ ] 3.5 Query Vectorize, filter D1 by location if provided
- [ ] 3.6 Return results with similarity scores

## 4. Queue Enhancement

- [ ] 4.1 Update checkins queue processor for embeddings
- [ ] 4.2 Extract venueName for embedding
- [ ] 4.3 Upsert to Vectorize

## 5. Testing

- [ ] 5.1 Test backfill endpoint
- [ ] 5.2 Test search: "coffee shops", "museums"
- [ ] 5.3 Test with location filtering
- [ ] 5.4 Run full test suite

## 6. Deployment

- [ ] 6.1 Create production index
- [ ] 6.2 Deploy worker
- [ ] 6.3 Backfill 2,607 checkins
- [ ] 6.4 Test searches
