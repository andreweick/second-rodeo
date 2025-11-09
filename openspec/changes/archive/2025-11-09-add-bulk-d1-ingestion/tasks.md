# Tasks: Bulk D1 Ingestion from R2

## 1. Schema Changes

- [X] 1.1 Update chatter table schema in `apps/api/src/db/schema.ts` (remove title, date)
- [X] 1.2 Update checkins table schema (remove 11 fields: venueName, address components, date, time)
- [X] 1.3 Update films table schema (remove title, date, posterUrl, letterboxdUri)
- [X] 1.4 Update quotes table schema (remove text, date)
- [X] 1.5 Update shakespeare table schema (remove text, phonetic, stem, work/character names)
- [X] 1.6 Update topten table schema (remove items, timestamp, year, month, slug, etc.)
- [X] 1.7 Generate Drizzle migrations: `just migrate`
- [X] 1.8 Review migration SQL for all 6 tables
- [X] 1.9 Apply migrations locally: `just migrate-local`
- [X] 1.10 Verify local D1 schema matches expected structure for all tables

## 2. Validator Updates for Wrapped JSON

- [X] 2.1 Update validateAndMapChatter to unwrap data object and exclude removed fields
- [X] 2.2 Update validateAndMapCheckin to unwrap data object and exclude removed fields
- [X] 2.3 Update validateAndMapFilm to unwrap data object and exclude removed fields
- [X] 2.4 Update validateAndMapQuote to unwrap data object and exclude removed fields
- [X] 2.5 Update validateAndMapShakespeare to unwrap data object and exclude removed fields
- [X] 2.6 Create validateAndMapTopten to unwrap data object (new validator)
- [X] 2.7 Update processJsonFromR2 to handle wrapped JSON format
- [X] 2.8 Add 'topten' case to routing switch statement
- [X] 2.9 Preserve all existing field validations from phase1-* proposals

## 3. Bulk Ingestion Endpoints

- [X] 3.1 Add POST /ingest/all endpoint in `apps/api/src/handlers/http.ts`
- [X] 3.2 Add POST /ingest/{objectKey} endpoint for single-file ingestion
- [X] 3.3 Implement authentication check using AUTH_TOKEN for both endpoints
- [X] 3.4 Implement R2 list operations with pagination (cursor, limit: 1000)
- [X] 3.5 Implement sendBatch() to queue 1000 messages per page
- [X] 3.6 Loop through all pages until cursor is undefined
- [X] 3.7 Return JSON response with total count of queued messages
- [X] 3.8 Handle R2 listing errors with 500 status
- [X] 3.9 Add logging for pagination progress (pages processed, total queued)

## 4. Testing - Bulk Ingestion Endpoints

- [X] 4.1 Write integration test for /ingest/all endpoint authentication
- [X] 4.2 Write integration test for /ingest/{objectKey} endpoint authentication
- [X] 4.3 Write integration test for successful bulk ingestion with pagination
- [X] 4.4 Write integration test for R2 pagination (cursor handling, sendBatch)
- [X] 4.5 Write integration test for error handling (R2 failures)
- [X] 4.6 Verify sendBatch queues correct number of messages per page
- [X] 4.7 Test single-file ingestion endpoint

## 5. Testing - Queue Consumer (All Types)

- [X] 5.1 Write integration test for chatter queue processing with wrapped JSON
- [X] 5.2 Verify chatter validator unwraps data and excludes title, date from D1 insert
- [X] 5.3 Write integration test for checkins queue processing with wrapped JSON
- [X] 5.4 Verify checkins validator excludes 11 removed fields from D1 insert
- [X] 5.5 Write integration test for films queue processing with wrapped JSON
- [X] 5.6 Verify films validator excludes 4 removed fields from D1 insert
- [X] 5.7 Write integration test for quotes queue processing with wrapped JSON
- [X] 5.8 Verify quotes validator excludes text, date from D1 insert
- [X] 5.9 Write integration test for shakespeare queue processing with wrapped JSON
- [X] 5.10 Verify shakespeare validator excludes text fields from D1 insert
- [X] 5.11 Write integration test for topten queue processing with wrapped JSON
- [X] 5.12 Verify topten validator stores only minimal metadata in D1
- [X] 5.13 Test consumer routing (type field determines which validator to use)

## 6. Integration Testing

- [X] 6.1 Run full test suite: `just test`
- [X] 6.2 Verify all 6 content types process correctly with wrapped JSON
- [X] 6.3 Test idempotent re-ingestion (duplicate slug handling)
- [X] 6.4 Test error handling for missing required fields
- [X] 6.5 Test error handling for malformed wrapped JSON
- [X] 6.6 Test bulk ingestion with mixed content types in R2

## 7. Deployment Preparation

- [X] 7.1 Ensure all R2 files are migrated to wrapped format (manual migration)
- [X] 7.2 Configure queue bindings in wrangler.jsonc (producer and consumer)
- [X] 7.3 Create queue in Cloudflare: `wrangler queues create sr-ingest-queue`
- [X] 7.4 Add INGEST_QUEUE binding to Env type interface
- [X] 7.5 Test locally with wrangler dev (all 6 content types)
- [X] 7.6 Deploy worker to production
- [X] 7.7 Apply migrations to production D1: `wrangler d1 migrations apply app_db`
- [X] 7.8 Call POST /ingest/all to queue all 50K+ files
- [X] 7.9 Monitor queue processing and D1 record counts (~15-30 minutes)
- [X] 7.10 Verify final counts match expected records per type
- [X] 7.11 Spot-check: Query D1 and verify schema, fetch full JSON from R2
