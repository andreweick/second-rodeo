# Tasks: Checkins Bulk Ingestion with Schema Optimization

## 1. Schema Changes

- [ ] 1.1 Update checkins table schema in `apps/api/src/db/schema.ts` (remove 11 fields)
- [ ] 1.2 Update validateAndMapCheckin in `apps/api/src/services/json-processor.ts` (exclude removed fields)
- [ ] 1.3 Generate Drizzle migration: `just migrate`
- [ ] 1.4 Review migration SQL to verify 11 columns are dropped correctly
- [ ] 1.5 Apply migration locally: `just migrate-local`
- [ ] 1.6 Verify local D1 schema matches expected structure (12 fields only)

## 2. Bulk Ingestion Endpoint

- [ ] 2.1 Add POST /checkins/ingest endpoint in `apps/api/src/handlers/http.ts`
- [ ] 2.2 Implement authentication check using AUTH_TOKEN
- [ ] 2.3 Implement R2 list operation for `checkins/` prefix
- [ ] 2.4 Queue one message per checkin file with objectKey
- [ ] 2.5 Return JSON response with count of queued messages
- [ ] 2.6 Handle R2 listing errors with 500 status

## 3. Testing

- [ ] 3.1 Write integration test for /checkins/ingest endpoint authentication
- [ ] 3.2 Write integration test for successful bulk ingestion trigger
- [ ] 3.3 Write integration test for R2 listing and queue message creation
- [ ] 3.4 Write integration test for error handling (R2 failures)
- [ ] 3.5 Write integration test for checkins queue processing with optimized schema
- [ ] 3.6 Verify validator excludes 11 removed fields from D1 insert
- [ ] 3.7 Test geospatial queries using lat/long bounding box
- [ ] 3.8 Test date derivation from datetime timestamp
- [ ] 3.9 Run full test suite: `just test`

## 4. Deployment Preparation

- [ ] 4.1 Upload checkin JSON files to R2: `rclone copy r2-staging/checkins/ r2:sr-json/checkins/`
- [ ] 4.2 Verify R2 file count matches expected 2,607 files
- [ ] 4.3 Test locally with wrangler dev
- [ ] 4.4 Deploy worker to production
- [ ] 4.5 Apply migration to production D1: `wrangler d1 migrations apply app_db`
- [ ] 4.6 Call POST /checkins/ingest endpoint to trigger ingestion
- [ ] 4.7 Monitor queue processing and D1 record counts
- [ ] 4.8 Verify final count: 2,607 records in D1 checkins table
- [ ] 4.9 Spot-check: Query D1 and verify no removed fields, fetch full JSON from R2
- [ ] 4.10 Test geospatial query (bounding box around a city)
- [ ] 4.11 Test venue grouping query (all checkins at same venueId)
