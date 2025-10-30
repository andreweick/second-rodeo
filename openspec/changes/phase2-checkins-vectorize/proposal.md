# Proposal: Checkins Semantic Search with Vectorize

## Why

Enable semantic search for 2,607 checkin venue names already ingested via phase1-checkins-ingest. Users want to search by venue type or location description ("coffee shops in Seattle") rather than exact venue name matching.

**Dependencies:**
- Requires phase1-checkins-ingest to be completed and deployed
- Checkins data must already exist in D1 and R2

## What Changes

- Integrate Cloudflare Vectorize for semantic venue search
- Add backfill endpoint to generate embeddings for existing 2,607 checkins
- Add search endpoint `GET /checkins/search` for venue-based semantic queries
- Generate embeddings during future checkin ingestion (enhance queue processor)
- Add Vectorize binding to wrangler.toml

## Impact

**Affected specs:**
- New capability: `checkins-semantic-search` (semantic venue search via Vectorize)

**Affected code:**
- `apps/api/src/services/embedding.ts` - Reuse embedding service
- `apps/api/src/handlers/http.ts` - Add `/checkins/search` and `/checkins/vectorize/backfill` endpoints
- `apps/api/src/services/json-processor.ts` - Add embedding generation to checkins queue processor
- `wrangler.toml` - Add or reference Vectorize index binding

**Storage architecture:**
- D1: Unchanged (~200KB for 2,607 checkins)
- R2: Unchanged (~1.5MB)
- Vectorize: NEW ~8MB for embeddings (2,607 vectors × 768 dimensions)
- Pattern: Search via Vectorize → get checkin IDs → query D1 → fetch from R2

**User workflow:**
1. Create Vectorize index: `wrangler vectorize create checkins-venues --dimensions=768`
2. Deploy updated worker with Vectorize binding
3. Backfill existing checkins: `POST /checkins/vectorize/backfill`
4. Search: `GET /checkins/search?q=coffee+shops` → returns matching venue checkins

**Non-breaking changes:**
- Phase1 ingest flow continues to work unchanged
- Future checkin ingestions will automatically generate embeddings
- Existing D1/R2 data unchanged

**Search capabilities:**
- Venue type search: "coffee shops", "museums", "parks"
- Location-based semantic: combine with lat/long bounding box
- Temporal filtering: combine with D1 date filters
