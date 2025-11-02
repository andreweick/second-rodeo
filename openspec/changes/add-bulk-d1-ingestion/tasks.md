# Tasks: Bulk D1 Ingestion from R2

## 1. Schema Changes

- [ ] 1.1 Update chatter table schema in `apps/api/src/db/schema.ts` (remove title, date)
- [ ] 1.2 Update checkins table schema (remove 11 fields: venueName, address components, date, time)
- [ ] 1.3 Update films table schema (remove title, date, posterUrl, letterboxdUri)
- [ ] 1.4 Update quotes table schema (remove text, date)
- [ ] 1.5 Update shakespeare table schema (remove text, phonetic, stem, work/character names)
- [ ] 1.6 Update topten table schema (remove items, timestamp, year, month, slug, etc.)
- [ ] 1.7 Generate Drizzle migrations: `just migrate`
- [ ] 1.8 Review migration SQL for all 6 tables
- [ ] 1.9 Apply migrations locally: `just migrate-local`
- [ ] 1.10 Verify local D1 schema matches expected structure for all tables

## 2. Validator Updates for Wrapped JSON

- [ ] 2.1 Update validateAndMapChatter to unwrap data object and exclude removed fields
- [ ] 2.2 Update validateAndMapCheckin to unwrap data object and exclude removed fields
- [ ] 2.3 Update validateAndMapFilm to unwrap data object and exclude removed fields
- [ ] 2.4 Update validateAndMapQuote to unwrap data object and exclude removed fields
- [ ] 2.5 Update validateAndMapShakespeare to unwrap data object and exclude removed fields
- [ ] 2.6 Create validateAndMapTopten to unwrap data object (new validator)
- [ ] 2.7 Update processJsonFromR2 to handle wrapped JSON format
- [ ] 2.8 Add 'topten' case to routing switch statement
- [ ] 2.9 Preserve all existing field validations from phase1-* proposals

## 3. Bulk Ingestion Endpoints

- [ ] 3.1 Add POST /ingest/all endpoint in `apps/api/src/handlers/http.ts`
- [ ] 3.2 Add POST /ingest/{objectKey} endpoint for single-file ingestion
- [ ] 3.3 Implement authentication check using AUTH_TOKEN for both endpoints
- [ ] 3.4 Implement R2 list operations with pagination (cursor, limit: 1000)
- [ ] 3.5 Implement sendBatch() to queue 1000 messages per page
- [ ] 3.6 Loop through all pages until cursor is undefined
- [ ] 3.7 Return JSON response with total count of queued messages
- [ ] 3.8 Handle R2 listing errors with 500 status
- [ ] 3.9 Add logging for pagination progress (pages processed, total queued)

## 4. Testing - Bulk Ingestion Endpoints

- [ ] 4.1 Write integration test for /ingest/all endpoint authentication
- [ ] 4.2 Write integration test for /ingest/{objectKey} endpoint authentication
- [ ] 4.3 Write integration test for successful bulk ingestion with pagination
- [ ] 4.4 Write integration test for R2 pagination (cursor handling, sendBatch)
- [ ] 4.5 Write integration test for error handling (R2 failures)
- [ ] 4.6 Verify sendBatch queues correct number of messages per page
- [ ] 4.7 Test single-file ingestion endpoint

## 5. Testing - Queue Consumer (All Types)

- [ ] 5.1 Write integration test for chatter queue processing with wrapped JSON
- [ ] 5.2 Verify chatter validator unwraps data and excludes title, date from D1 insert
- [ ] 5.3 Write integration test for checkins queue processing with wrapped JSON
- [ ] 5.4 Verify checkins validator excludes 11 removed fields from D1 insert
- [ ] 5.5 Write integration test for films queue processing with wrapped JSON
- [ ] 5.6 Verify films validator excludes 4 removed fields from D1 insert
- [ ] 5.7 Write integration test for quotes queue processing with wrapped JSON
- [ ] 5.8 Verify quotes validator excludes text, date from D1 insert
- [ ] 5.9 Write integration test for shakespeare queue processing with wrapped JSON
- [ ] 5.10 Verify shakespeare validator excludes text fields from D1 insert
- [ ] 5.11 Write integration test for topten queue processing with wrapped JSON
- [ ] 5.12 Verify topten validator stores only minimal metadata in D1
- [ ] 5.13 Test consumer routing (type field determines which validator to use)

## 6. Integration Testing

- [ ] 6.1 Run full test suite: `just test`
- [ ] 6.2 Verify all 6 content types process correctly with wrapped JSON
- [ ] 6.3 Test idempotent re-ingestion (duplicate slug handling)
- [ ] 6.4 Test error handling for missing required fields
- [ ] 6.5 Test error handling for malformed wrapped JSON
- [ ] 6.6 Test bulk ingestion with mixed content types in R2

## 7. Deployment Preparation

- [ ] 7.1 Ensure all R2 files are migrated to wrapped format (manual migration)
- [ ] 7.2 Configure queue bindings in wrangler.jsonc (producer and consumer)
- [ ] 7.3 Create queue in Cloudflare: `wrangler queues create sr-ingest-queue`
- [ ] 7.4 Add INGEST_QUEUE binding to Env type interface
- [ ] 7.5 Test locally with wrangler dev (all 6 content types)
- [ ] 7.6 Deploy worker to production
- [ ] 7.7 Apply migrations to production D1: `wrangler d1 migrations apply app_db`
- [ ] 7.8 Call POST /ingest/all to queue all 50K+ files
- [ ] 7.9 Monitor queue processing and D1 record counts (~15-30 minutes)
- [ ] 7.10 Verify final counts match expected records per type
- [ ] 7.11 Spot-check: Query D1 and verify schema, fetch full JSON from R2
