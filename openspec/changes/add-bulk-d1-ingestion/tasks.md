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

- [ ] 3.1 Add POST /chatter/ingest endpoint in `apps/api/src/handlers/http.ts`
- [ ] 3.2 Add POST /checkins/ingest endpoint
- [ ] 3.3 Add POST /films/ingest endpoint
- [ ] 3.4 Add POST /quotes/ingest endpoint
- [ ] 3.5 Add POST /shakespeare/ingest endpoint
- [ ] 3.6 Add POST /topten/ingest endpoint
- [ ] 3.7 Implement authentication check using AUTH_TOKEN for all endpoints
- [ ] 3.8 Implement R2 list operations for each content type prefix
- [ ] 3.9 Queue one message per file with objectKey
- [ ] 3.10 Return JSON response with count of queued messages
- [ ] 3.11 Handle R2 listing errors with 500 status

## 4. Testing - Chatter

- [ ] 4.1 Write integration test for /chatter/ingest endpoint authentication
- [ ] 4.2 Write integration test for successful bulk ingestion trigger
- [ ] 4.3 Write integration test for R2 listing and queue message creation
- [ ] 4.4 Write integration test for error handling (R2 failures)
- [ ] 4.5 Write integration test for chatter queue processing with wrapped JSON
- [ ] 4.6 Verify validator unwraps data and excludes title, date from D1 insert

## 5. Testing - Checkins

- [ ] 5.1 Write integration test for /checkins/ingest endpoint authentication
- [ ] 5.2 Write integration test for successful bulk ingestion trigger
- [ ] 5.3 Write integration test for checkins queue processing with wrapped JSON
- [ ] 5.4 Verify validator excludes 11 removed fields from D1 insert

## 6. Testing - Films

- [ ] 6.1 Write integration test for /films/ingest endpoint authentication
- [ ] 6.2 Write integration test for successful bulk ingestion trigger
- [ ] 6.3 Write integration test for films queue processing with wrapped JSON
- [ ] 6.4 Verify validator excludes 4 removed fields from D1 insert
- [ ] 6.5 Test URL derivation (Letterboxd, TMDB poster)

## 7. Testing - Quotes

- [ ] 7.1 Write integration test for /quotes/ingest endpoint authentication
- [ ] 7.2 Write integration test for quotes queue processing with wrapped JSON
- [ ] 7.3 Verify validator excludes text, date from D1 insert

## 8. Testing - Shakespeare

- [ ] 8.1 Write integration test for /shakespeare/ingest endpoint authentication
- [ ] 8.2 Write integration test for shakespeare queue processing with wrapped JSON
- [ ] 8.3 Verify validator excludes text fields from D1 insert
- [ ] 8.4 Test shakespeare_works table ingestion (if applicable)

## 9. Testing - Topten

- [ ] 9.1 Write integration test for /topten/ingest endpoint authentication
- [ ] 9.2 Write integration test for topten queue processing with wrapped JSON
- [ ] 9.3 Verify validator stores only minimal metadata in D1
- [ ] 9.4 Test year/month derivation from date field using SQLite functions

## 10. Integration Testing

- [ ] 10.1 Run full test suite: `just test`
- [ ] 10.2 Verify all 6 content types process correctly with wrapped JSON
- [ ] 10.3 Test idempotent re-ingestion (duplicate slug handling)
- [ ] 10.4 Test error handling for missing required fields
- [ ] 10.5 Test error handling for malformed wrapped JSON

## 11. Deployment Preparation

- [ ] 11.1 Ensure all R2 files are migrated to wrapped format (manual migration)
- [ ] 11.2 Test locally with wrangler dev for all 6 content types
- [ ] 11.3 Deploy worker to production
- [ ] 11.4 Apply migrations to production D1: `wrangler d1 migrations apply app_db`
- [ ] 11.5 Call POST /{type}/ingest endpoints for all 6 types
- [ ] 11.6 Monitor queue processing and D1 record counts
- [ ] 11.7 Verify final counts match expected records per type
- [ ] 11.8 Spot-check: Query D1 and verify schema, fetch full JSON from R2
