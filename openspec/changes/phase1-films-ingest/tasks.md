# Tasks: Films Bulk Ingestion

## 1. Schema Changes

- [ ] 1.1 Update films table schema in `apps/api/src/db/schema.ts` (remove 4 fields)
- [ ] 1.2 Update validateAndMapFilm in `apps/api/src/services/json-processor.ts` (exclude removed fields)
- [ ] 1.3 Generate Drizzle migration: `just migrate`
- [ ] 1.4 Review migration SQL to verify 4 columns are dropped correctly
- [ ] 1.5 Apply migration locally: `just migrate-local`
- [ ] 1.6 Verify local D1 schema matches expected structure (14 fields only)

## 2. Bulk Ingestion Endpoint

- [ ] 2.1 Add POST /films/ingest endpoint in `apps/api/src/handlers/http.ts`
- [ ] 2.2 Implement authentication check using AUTH_TOKEN
- [ ] 2.3 Implement R2 list operation for `films/` prefix
- [ ] 2.4 Queue one message per film file with objectKey
- [ ] 2.5 Return JSON response with count of queued messages
- [ ] 2.6 Handle R2 listing errors with 500 status

## 3. Testing

- [ ] 3.1 Write integration test for /films/ingest endpoint authentication
- [ ] 3.2 Write integration test for successful bulk ingestion trigger
- [ ] 3.3 Write integration test for R2 listing and queue message creation
- [ ] 3.4 Write integration test for error handling (R2 failures)
- [ ] 3.5 Write integration test for films queue processing
- [ ] 3.6 Verify validator excludes 4 removed fields from D1 insert
- [ ] 3.7 Test date derivation from dateWatched timestamp
- [ ] 3.8 Test URL derivation (Letterboxd, TMDB poster)
- [ ] 3.9 Run full test suite: `just test`

## 4. Deployment Preparation

- [ ] 4.1 Upload film JSON files to R2: `rclone copy r2-staging/films/ r2:sr-json/films/`
- [ ] 4.2 Verify R2 file count matches expected 2,659 files
- [ ] 4.3 Test locally with wrangler dev
- [ ] 4.4 Deploy worker to production
- [ ] 4.5 Apply migration to production D1: `wrangler d1 migrations apply app_db`
- [ ] 4.6 Call POST /films/ingest endpoint to trigger ingestion
- [ ] 4.7 Monitor queue processing and D1 records
- [ ] 4.8 Verify final counts: 2,659 records in D1
- [ ] 4.9 Spot-check: Query D1 and verify no removed fields, fetch full JSON from R2
- [ ] 4.10 Test URL derivation in production
