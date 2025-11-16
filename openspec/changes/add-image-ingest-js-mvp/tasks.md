# Tasks: Image Ingest JavaScript MVP

## 1. Dependencies & Setup
- [ ] 1.1 Install dependencies and verify build passes
- [ ] 1.2 Update `apps/api/wrangler.jsonc` with queue binding (if new queue needed)

## 2. Database Schema (Drizzle ORM)
- [ ] 2.1 Add `photos` table to `apps/api/src/db/schema.ts`
- [ ] 2.2 Add TypeScript types for Photo (inferSelect, inferInsert)
- [ ] 2.3 Generate Drizzle migration: `just migrate`
- [ ] 2.4 Create SQL migration for FTS5 virtual table (manual, separate from Drizzle)
- [ ] 2.5 Add indexes (taken_at, camera, location, source)
- [ ] 2.6 Apply migrations locally: `just migrate-local`
- [ ] 2.7 Verify schema with `just db` (sqlite3 console)

## 3. Core Services

### 3.1 Hash Computation
- [ ] 3.1.1 Create `apps/api/src/services/hash.ts`
- [ ] 3.1.2 Implement `computeSHA256(buffer: ArrayBuffer): Promise<string>`
- [ ] 3.1.3 Write unit tests for SHA256 hash function

### 3.2 SID Generation
- [ ] 3.2.1 Create `apps/api/src/services/sid.ts`
- [ ] 3.2.2 Define namespace UUID constant
- [ ] 3.2.3 Implement `generateSID(sha256: string, exif: ExifData): string`
- [ ] 3.2.4 Handle missing EXIF fields (fallbacks)
- [ ] 3.2.5 Write unit tests with known inputs/outputs

### 3.3 Image Upload Service (Rewrite)
- [ ] 3.3.1 Backup current `apps/api/src/services/image-upload.ts` to `image-upload.old.ts`
- [ ] 3.3.2 Rewrite `uploadImage()` function:
  - [ ] Parse multipart form data
  - [ ] Validate file type and size
  - [ ] Read client SHA256 hash from X-Client-SHA256 header (optional)
  - [ ] Extract EXIF metadata (existing `extractMetadata()`)
  - [ ] Compute SHA256 server-side
  - [ ] Validate client SHA256 hash if provided
  - [ ] Generate SID
  - [ ] Check for existing SID in D1 (deduplication)
  - [ ] Prepare blob with custom headers
  - [ ] Write to sr-artifact bucket
  - [ ] Prepare metadata JSON
  - [ ] Write to sr-json bucket
  - [ ] Enqueue indexing message
  - [ ] Return 201 with SID and metadata
- [ ] 3.3.3 Update error handling and validation
- [ ] 3.3.4 Add logging for debugging

### 3.4 Metadata JSON Builder
- [ ] 3.4.1 Create `apps/api/src/services/metadata-json.ts`
- [ ] 3.4.2 Implement `buildMetadataJSON(params)` returning complete JSON structure
- [ ] 3.4.3 Include all fields: sid, hashes, file info, exif, iptc, timestamps, source

## 4. HTTP Endpoints

### 4.1 Deduplication Endpoint
- [ ] 4.1.1 Add `HEAD /api/photos/check/:sha256` to `apps/api/src/handlers/http.ts`
- [ ] 4.1.2 Query D1 for existing photo by SHA256
- [ ] 4.1.3 Return 200 OK with `X-Stable-ID` header if exists
- [ ] 4.1.4 Return 404 Not Found if new
- [ ] 4.1.5 Add authentication check

### 4.2 Upload Endpoint
- [ ] 4.2.1 Update `POST /images` in `apps/api/src/handlers/http.ts`
- [ ] 4.2.2 Call rewritten `uploadImage()` service
- [ ] 4.2.3 Handle errors and return appropriate status codes
- [ ] 4.2.4 Update authentication logic if needed

## 5. Queue Consumer (D1 Indexing)

### 5.1 Photo Indexer Service
- [ ] 5.1.1 Create `apps/api/src/services/photo-indexer.ts`
- [ ] 5.1.2 Implement `indexPhotoToD1(sid: string, r2Key: string, env: Env)`
- [ ] 5.1.3 Fetch JSON from sr-json bucket
- [ ] 5.1.4 Parse and validate JSON
- [ ] 5.1.5 Build upsert query for `photos` table (Drizzle)
- [ ] 5.1.6 Build upsert query for `photos_fts` table (raw SQL)
- [ ] 5.1.7 Execute upserts in transaction
- [ ] 5.1.8 Handle errors and log results

### 5.2 Queue Handler
- [ ] 5.2.1 Update `apps/api/src/handlers/queue.ts`
- [ ] 5.2.2 Add photo indexing message type to `QueueMessageBody` interface
- [ ] 5.2.3 Route photo messages to `indexPhotoToD1()`
- [ ] 5.2.4 Add error handling and retry logic

## 6. Testing

### 6.1 Unit Tests
- [ ] 6.1.1 Test SHA256 hash function (known inputs → expected outputs)
- [ ] 6.1.2 Test SID generation (deterministic, handles missing EXIF)
- [ ] 6.1.3 Test metadata JSON builder (complete structure)
- [ ] 6.1.4 Test client SHA256 validation (valid, invalid, missing)

### 6.2 Integration Tests
- [ ] 6.2.1 Update `apps/api/test/image-upload.spec.ts`
- [ ] 6.2.2 Test full upload flow (file → R2 → queue → D1)
- [ ] 6.2.3 Test deduplication (upload same file twice)
- [ ] 6.2.4 Test client SHA256 optimization (with/without X-Client-SHA256 header)
- [ ] 6.2.5 Test EXIF extraction for various image formats
- [ ] 6.2.6 Test FTS5 search queries
- [ ] 6.2.7 Test missing EXIF fields (fallbacks)
- [ ] 6.2.8 Test queue consumer (message processing, upserts)

### 6.3 Manual Testing
- [ ] 6.3.1 Upload test images with `just curl-image`
- [ ] 6.3.2 Verify blobs in sr-artifact (check custom headers)
- [ ] 6.3.3 Verify JSON in sr-json (structure, completeness)
- [ ] 6.3.4 Verify D1 records (query via `just db`)
- [ ] 6.3.5 Test FTS5 search (various queries)
- [ ] 6.3.6 Test deduplication endpoint (HEAD request)

## 7. OpenAPI Specification
- [ ] 7.1 Create OpenAPI 3.x spec file (`apps/api/openapi.yaml` or `openapi.json`)
- [ ] 7.2 Document POST /images endpoint:
  - [ ] Request schema (multipart/form-data with file field)
  - [ ] Optional headers (X-Client-SHA256)
  - [ ] Response schemas (201 Created with id, sha256, metadata)
  - [ ] Error responses (400, 401, 500 with error schemas)
  - [ ] Authentication (Bearer token security scheme)
- [ ] 7.3 Document HEAD /api/photos/check/:sha256 endpoint:
  - [ ] Path parameter (sha256 hash string)
  - [ ] Response headers (X-Stable-ID)
  - [ ] Response codes (200, 404, 401)
- [ ] 7.4 Add request/response examples for both endpoints
- [ ] 7.5 Add endpoint to serve OpenAPI spec (GET /api/openapi.json)
- [ ] 7.6 Validate OpenAPI spec with linter
- [ ] 7.7 Test OpenAPI spec with Swagger UI or similar tool

## 8. Additional Documentation
- [ ] 8.1 Document SID generation algorithm
- [ ] 8.2 Document R2 bucket structure and key patterns
- [ ] 8.3 Document custom headers format
- [ ] 8.4 Document metadata JSON schema
- [ ] 8.5 Add examples for client SHA256 computation (PWA/CLI)
- [ ] 8.6 Update README with photo upload instructions
- [ ] 8.7 Add code comments referencing OpenAPI spec

## 9. Deployment Preparation
- [ ] 9.1 Run type check: `just ts-check`
- [ ] 9.2 Run all tests: `just test`
- [ ] 9.3 Test locally end-to-end
- [ ] 9.4 Apply migrations to production D1: `just migrate-prod`
- [ ] 9.5 Deploy Worker: `just deploy-api`
- [ ] 9.6 Smoke test production endpoint
- [ ] 9.7 Upload small batch of test images (5-10)
- [ ] 9.8 Validate production data (R2 + D1)

## 10. Migration Preparation
- [ ] 10.1 Create migration script/CLI tool (optional)
- [ ] 10.2 Test migration with 100 legacy images
- [ ] 10.3 Monitor Worker metrics (CPU, errors, queue depth)
- [ ] 10.4 Adjust parallelism if needed
- [ ] 10.5 Document migration procedure

## Notes
- Complete tasks sequentially within each section
- Mark tasks complete only after testing
- Run `just ts-check` frequently to catch type errors early
- Keep `design.md` updated if significant decisions change during implementation
