# Implementation Tasks

## 1. Schema Changes

- [ ] 1.1 Update `shakespeare` table in schema.ts to remove: `workTitle`, `genreCode`, `genreName`, `characterName`
- [ ] 1.2 Add `shakespeare_works` table in schema.ts with fields: work_id, title, long_title, short_title, genre_code, genre_name, year, total_paragraphs, total_words, total_characters, stage_direction_count
- [ ] 1.3 Export TypeScript types: `ShakespeareWork`, `NewShakespeareWork`
- [ ] 1.4 Generate Drizzle migration: `just migrate`
- [ ] 1.5 Apply migration locally: `just migrate-local`
- [ ] 1.6 Verify migration in local D1 database

## 2. JSON Processor Updates

- [ ] 2.1 Fix typo in json-processor.ts: Rename case `shakespert` to `shakespeare`
- [ ] 2.2 Update `validateAndMapShakespeare()` to match new minimal schema (remove work_title, genre_code, genre_name, character_name from validation)
- [ ] 2.3 Add new function `validateAndMapShakespeareWork()` for manifest.jsonl records
- [ ] 2.4 Add new case in processJsonFromR2() switch statement for `shakespeare-works` category
- [ ] 2.5 Test validation logic with sample JSON files from wip/shakespeare2/r2-staging/

## 3. HTTP Endpoint - Bulk Ingestion

- [ ] 3.1 Add `POST /shakespeare/ingest` endpoint in http.ts
- [ ] 3.2 Implement authentication check (AUTH_TOKEN required)
- [ ] 3.3 List R2 objects with prefix `shakespeare/paragraphs/`
- [ ] 3.4 Send one queue message per paragraph file (objectKey format: `/shakespeare/paragraphs/{id}.json`)
- [ ] 3.5 Return JSON response with count of queued messages
- [ ] 3.6 Add error handling for R2 list failures

## 4. HTTP Endpoint - Works Manifest Ingestion

- [ ] 4.1 Add `POST /shakespeare/ingest/works` endpoint in http.ts
- [ ] 4.2 Implement authentication check (AUTH_TOKEN required)
- [ ] 4.3 Fetch manifest.jsonl from R2: `shakespeare/manifest.jsonl`
- [ ] 4.4 Parse JSONL (one work record per line)
- [ ] 4.5 Queue each work record for processing (objectKey format: `/shakespeare-works/manifest.jsonl#line{N}`)
- [ ] 4.6 Return JSON response with count of works queued

## 5. Testing

- [ ] 5.1 Write test for shakespeare validation in json-processor.test.ts
- [ ] 5.2 Write test for shakespeare_works validation
- [ ] 5.3 Write integration test for /shakespeare/ingest endpoint authentication
- [ ] 5.4 Write integration test for successful bulk ingestion trigger
- [ ] 5.5 Write integration test for R2 listing and queue message creation
- [ ] 5.6 Write integration test for error handling (R2 failures)
- [ ] 5.7 Write integration test for shakespeare queue processing
- [ ] 5.8 Verify validator excludes removed fields from D1 insert
- [ ] 5.9 Test works manifest JSONL parsing
- [ ] 5.10 Run full test suite: `just test`

## 6. R2 Upload

- [ ] 6.1 Upload paragraph files to R2: `rclone copy wip/shakespeare2/r2-staging/*.json r2:sr-json/shakespeare/paragraphs/ --transfers=50`
- [ ] 6.2 Upload manifest to R2: `rclone copy wip/shakespeare2/r2-staging/manifest.jsonl r2:sr-json/shakespeare/`
- [ ] 6.3 Verify file count in R2 (should be 35,629 paragraphs + 1 manifest)
- [ ] 6.4 Spot-check a few files are accessible

## 7. Production Deployment

- [ ] 7.1 Apply migration to production D1: `wrangler d1 migrations apply app_db`
- [ ] 7.2 Deploy worker: `wrangler deploy`
- [ ] 7.3 Trigger works ingestion: `curl -X POST https://api.../shakespeare/ingest/works -H "Authorization: Bearer $TOKEN"`
- [ ] 7.4 Trigger paragraphs ingestion: `curl -X POST https://api.../shakespeare/ingest -H "Authorization: Bearer $TOKEN"`
- [ ] 7.5 Monitor queue processing (check logs, D1 counts)
- [ ] 7.6 Verify completion: `wrangler d1 execute app_db --command "SELECT COUNT(*) FROM shakespeare"` (expect 35,629)
- [ ] 7.7 Verify works: `wrangler d1 execute app_db --command "SELECT COUNT(*) FROM shakespeare_works"` (expect 43)

## 8. Documentation

- [ ] 8.1 Update project.md if needed (document shakespeare data structure)
- [ ] 8.2 Document R2 fetch pattern for full text display
