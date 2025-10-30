# Implementation Tasks

## 1. Database Schema

- [ ] 1.1 Update `apps/api/src/db/schema.ts` topten table definition
  - [ ] Remove `timestamp` field
  - [ ] Remove `year` field
  - [ ] Remove `month` field
  - [ ] Remove `slug` field
  - [ ] Remove `itemCount` field
  - [ ] Remove `sourceUrl` field
  - [ ] Keep: id, show, date, title, r2Key, createdAt, updatedAt
- [ ] 1.2 Generate Drizzle migration: `just migrate`
- [ ] 1.3 Apply migration locally: `just migrate-local`
- [ ] 1.4 Verify schema changes in local D1

## 2. Queue Processing

- [ ] 2.1 Add topten validation function to `apps/api/src/services/json-processor.ts`
  - [ ] Validate required fields: id, show, date, title
  - [ ] Map JSON fields to schema (camelCase conversion)
  - [ ] Return `NewTopTen` type for insertion
- [ ] 2.2 Add topten case to queue processor switch statement
  - [ ] Extract category from R2 key
  - [ ] Call validation function
  - [ ] Insert to D1 using Drizzle
  - [ ] Handle UNIQUE constraint violations gracefully

## 3. HTTP Endpoint

- [ ] 3.1 Add `POST /topten/ingest` endpoint to `apps/api/src/handlers/http.ts`
  - [ ] Verify AUTH_TOKEN authentication
  - [ ] List R2 objects with prefix `sr-json/topten/`
  - [ ] Filter for .json files only
  - [ ] Send queue message for each file with objectKey
  - [ ] Return JSON with count of messages queued
- [ ] 3.2 Add error handling for R2 list failures

## 4. Testing

- [ ] 4.1 Write unit tests for topten validation
  - [ ] Test valid JSON passes validation
  - [ ] Test missing required fields throw errors
  - [ ] Test field type validation
  - [ ] Test camelCase mapping
- [ ] 4.2 Write integration tests for HTTP endpoint
  - [ ] Test authentication requirement
  - [ ] Test R2 listing and message queueing
  - [ ] Test response format
  - [ ] Test error handling
- [ ] 4.3 Write integration tests for queue processing
  - [ ] Test successful insertion to D1
  - [ ] Test duplicate ID handling (UNIQUE constraint)
  - [ ] Test validation error handling
  - [ ] Test R2 fetch failures

## 5. Data Upload

- [ ] 5.1 Upload JSON files to R2: `rclone copy wip/topten/r2-staging/lists/ r2:sr-json/topten/ --transfers=20`
- [ ] 5.2 Verify files uploaded correctly
- [ ] 5.3 Trigger ingestion: `POST /topten/ingest`
- [ ] 5.4 Monitor queue processing
- [ ] 5.5 Verify D1 record count: `SELECT COUNT(*) FROM topten`

## 6. Documentation

- [ ] 6.1 Update TypeScript type exports if needed
- [ ] 6.2 Document year/month filtering using SQLite date functions
