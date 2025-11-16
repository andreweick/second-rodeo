# Tasks: Image Ingest Phase 2 - D1 Indexing

## 1. Database Schema (Drizzle ORM)
- [ ] 1.1 Add `photos` table to `apps/api/src/db/schema.ts`
- [ ] 1.2 Define columns: id (PK, format: "sha256:..."), sha256 (unique), takenAt, uploadedAt, cameraMake, cameraModel, lensModel, gpsLat, gpsLon, width, height, mimeType, fileSize, r2Key, source, createdAt, updatedAt
- [ ] 1.3 Add TypeScript types for Photo (inferSelect, inferInsert)
- [ ] 1.4 Generate Drizzle migration: `just migrate`
- [ ] 1.5 Add indexes:
  - [ ] idx_photos_taken_at on taken_at
  - [ ] idx_photos_camera on (camera_make, camera_model)
  - [ ] idx_photos_location on (gps_lat, gps_lon) WHERE gps_lat IS NOT NULL
  - [ ] idx_photos_source on source
- [ ] 1.6 Apply migrations locally: `just migrate-local`
- [ ] 1.7 Verify schema with `just db` (sqlite3 console)

## 2. Queue Consumer (D1 Indexing)

### 2.1 Photo Indexer Service
- [ ] 2.1.1 Create `apps/api/src/services/photo-indexer.ts`
- [ ] 2.1.2 Implement `indexPhotoToD1(id: string, r2Key: string, env: Env)`
- [ ] 2.1.3 Fetch JSON from sr-json bucket using r2Key
- [ ] 2.1.4 Parse and validate JSON structure
- [ ] 2.1.5 Build upsert query for `photos` table using Drizzle
- [ ] 2.1.6 Execute upsert with `ON CONFLICT(id) DO UPDATE`
- [ ] 2.1.7 Handle errors and log results
- [ ] 2.1.8 Write unit tests for indexer

### 2.2 Queue Handler
- [ ] 2.2.1 Update `apps/api/src/handlers/queue.ts`
- [ ] 2.2.2 Add photo indexing message type to `QueueMessageBody` interface
- [ ] 2.2.3 Route photo messages to `indexPhotoToD1()`
- [ ] 2.2.4 Add error handling and retry logic
- [ ] 2.2.5 Add logging for queue consumer operations

### 2.3 Upload Service Queue Integration
- [ ] 2.3.1 Update `apps/api/src/services/image-upload.ts`
- [ ] 2.3.2 After R2 writes succeed, send queue message with `{type: 'photo', id, r2Key}`
- [ ] 2.3.3 Handle queue send failures (log but don't fail upload)
- [ ] 2.3.4 Add logging for queue message send

## 3. Deduplication Endpoint Implementation

### 3.1 D1 Lookup Logic
- [ ] 3.1.1 Update `HEAD /api/photos/check/:sha256` in `apps/api/src/handlers/http.ts`
- [ ] 3.1.2 Remove stub logic (404 always)
- [ ] 3.1.3 Query D1 photos table by sha256 using Drizzle
- [ ] 3.1.4 If found: return 200 OK with `X-Photo-ID` header (format: "sha256:...")
- [ ] 3.1.5 If not found: return 404 Not Found
- [ ] 3.1.6 Add error handling for D1 query failures
- [ ] 3.1.7 Add logging for deduplication checks

## 4. Basic Query Functions

### 4.1 Query Service
- [ ] 4.1.1 Create `apps/api/src/services/photo-queries.ts` (optional, or inline in handlers)
- [ ] 4.1.2 Implement `queryPhotosByDateRange(start, end)` using Drizzle
- [ ] 4.1.3 Implement `queryPhotosByCamera(make, model)` using Drizzle
- [ ] 4.1.4 Implement `queryPhotosByLocation(lat, lon, radius)` using bounding box
- [ ] 4.1.5 Implement `queryPhotosBySource(source)` using Drizzle
- [ ] 4.1.6 Write unit tests for query functions

## 5. Testing

### 5.1 Unit Tests
- [ ] 5.1.1 Test photo indexer (mock R2 JSON fetch, verify D1 upsert)
- [ ] 5.1.2 Test queue consumer routing (photo message type)
- [ ] 5.1.3 Test deduplication lookup (found, not found, D1 error)
- [ ] 5.1.4 Test query functions (date range, camera, location, source)

### 5.2 Integration Tests
- [ ] 5.2.1 Test full flow: upload → queue → D1 upsert
- [ ] 5.2.2 Test deduplication: upload same file twice, verify 200 OK on second attempt
- [ ] 5.2.3 Test queue consumer with real messages
- [ ] 5.2.4 Test idempotent upserts (process same message twice)
- [ ] 5.2.5 Test D1 queries (various filters)

### 5.3 Manual Testing
- [ ] 5.3.1 Upload test images and verify D1 records appear
- [ ] 5.3.2 Query D1 with `just db` and verify data (check id format "sha256:...")
- [ ] 5.3.3 Test deduplication endpoint (HEAD request before/after indexing, verify X-Photo-ID header)
- [ ] 5.3.4 Test queue consumer logs
- [ ] 5.3.5 Upload duplicate image and verify existing ID returned

## 6. Wrangler Configuration
- [ ] 6.1 Update `apps/api/wrangler.jsonc` with queue binding (if new queue needed)
- [ ] 6.2 Verify D1 database binding exists
- [ ] 6.3 Verify R2 bucket bindings exist (sr-artifact, sr-json)

## 7. Deployment Preparation
- [ ] 7.1 Run type check: `just ts-check`
- [ ] 7.2 Run all tests: `just test`
- [ ] 7.3 Test locally end-to-end (upload → queue → D1)
- [ ] 7.4 Apply migrations to production D1: `just migrate-prod`
- [ ] 7.5 Deploy Worker: `just deploy-api`
- [ ] 7.6 Smoke test production endpoint
- [ ] 7.7 Upload test images and verify D1 indexing works
- [ ] 7.8 Test deduplication endpoint in production
- [ ] 7.9 Monitor queue depth and processing time

## 8. Data Consistency Tools (Optional)
- [ ] 8.1 Create script to rebuild D1 from R2 JSON files
- [ ] 8.2 Test rebuild script with sample data
- [ ] 8.3 Document rebuild procedure

## Notes
- Complete tasks sequentially within each section
- Phase 2 does NOT include FTS5 (Phase 3)
- D1 is treated as rebuildable cache - R2 JSON is source of truth
- Queue consumer must be idempotent (upserts handle duplicate processing)
- Run `just ts-check` frequently to catch type errors early
