# Tasks: Chatter Bulk Ingestion with Schema Optimization

## 1. Schema Changes

- [ ] 1.1 Update chatter table schema in `apps/api/src/db/schema.ts` (remove title, date fields)
- [ ] 1.2 Update validateAndMapChatter in `apps/api/src/services/json-processor.ts` (exclude title, date)
- [ ] 1.3 Generate Drizzle migration: `just migrate`
- [ ] 1.4 Review migration SQL to verify title and date columns are dropped
- [ ] 1.5 Apply migration locally: `just migrate-local`
- [ ] 1.6 Verify local D1 schema matches expected structure

## 2. Bulk Ingestion Endpoint

- [ ] 2.1 Add POST /chatter/ingest endpoint in `apps/api/src/handlers/http.ts`
- [ ] 2.2 Implement authentication check using AUTH_TOKEN
- [ ] 2.3 Implement R2 list operation for `chatter/` prefix
- [ ] 2.4 Queue one message per chatter file with objectKey
- [ ] 2.5 Return JSON response with count of queued messages
- [ ] 2.6 Handle R2 listing errors with 500 status

## 3. Testing

- [ ] 3.1 Write integration test for /chatter/ingest endpoint authentication
- [ ] 3.2 Write integration test for successful bulk ingestion trigger
- [ ] 3.3 Write integration test for R2 listing and queue message creation
- [ ] 3.4 Write integration test for error handling (R2 failures)
- [ ] 3.5 Write integration test for chatter queue processing with optimized schema
- [ ] 3.6 Verify validator excludes title and date from D1 insert
- [ ] 3.7 Run full test suite: `just test`

## 4. Deployment Preparation

- [ ] 4.1 Upload chatter JSON files to R2: `rclone copy r2-staging/chatter/ r2:sr-json/chatter/`
- [ ] 4.2 Verify R2 file count matches expected 8,006 files
- [ ] 4.3 Test locally with wrangler dev
- [ ] 4.4 Deploy worker to production
- [ ] 4.5 Apply migration to production D1: `wrangler d1 migrations apply app_db`
- [ ] 4.6 Call POST /chatter/ingest endpoint to trigger ingestion
- [ ] 4.7 Monitor queue processing and D1 record counts
- [ ] 4.8 Verify final count: 8,006 records in D1 chatter table
- [ ] 4.9 Spot-check: Query D1 and verify no title/date fields, fetch full JSON from R2
