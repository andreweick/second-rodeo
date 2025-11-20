# Tasks: Image Ingest Phase 1 - Upload Core

## 1. Schema Validation
- [ ] 1.1 Validate JSON schemas are well-formed
  - [ ] Validate `schemas/upload-response.schema.json` with JSON Schema validator
  - [ ] Validate `schemas/storage-metadata.schema.json` with JSON Schema validator
  - [ ] Validate `schemas/openapi.yaml` with OpenAPI validator
- [ ] 1.2 Ensure schemas match spec.md requirements
  - [ ] Upload response includes all required fields from spec
  - [ ] Storage metadata includes all required fields from spec
  - [ ] OpenAPI defines all error scenarios from spec

## 2. Dependencies & Setup
- [ ] 2.1 Install dependencies and verify build passes (no new dependencies - using Web Crypto API for SHA256)

## 3. Core Services

### 3.1 Hash Computation
- [ ] 3.1.1 Create `apps/api/src/services/hash.ts`
- [ ] 3.1.2 Implement `computeSHA256(buffer: ArrayBuffer): Promise<string>` using Web Crypto API
- [ ] 3.1.3 Write unit tests for SHA256 hash function with known inputs/outputs

### 3.2 Schema Validation Service
- [ ] 3.2.1 Create `apps/api/src/services/schema-validator.ts`
- [ ] 3.2.2 Implement `validateUploadResponse(data)` validating against `schemas/upload-response.schema.json`
- [ ] 3.2.3 Implement `validateStorageMetadata(data)` validating against `schemas/storage-metadata.schema.json`
- [ ] 3.2.4 Validation failures throw errors with descriptive messages
- [ ] 3.2.5 Write unit tests for both validators (valid data passes, invalid data fails)

### 3.3 Metadata JSON Builder
- [ ] 3.3.1 Create `apps/api/src/services/metadata-json.ts`
- [ ] 3.3.2 Implement `buildMetadataJSON(params)` returning complete JSON structure per `schemas/storage-metadata.schema.json`
- [ ] 3.3.3 Include fields: id (sha256:...), sha256, file info, exif, iptc, icc, uploadedAt, source
- [ ] 3.3.4 Call `validateStorageMetadata()` before returning to ensure compliance
- [ ] 3.3.5 Write unit tests for complete JSON structure and validate against schema

### 3.4 Image Upload Service (Rewrite)
- [ ] 3.4.1 Backup current `apps/api/src/services/image-upload.ts` to `image-upload.old.ts`
- [ ] 3.4.2 Rewrite `uploadImage()` function:
  - [ ] Parse multipart form data
  - [ ] Validate file type and size
  - [ ] Read optional client SHA256 hash from X-Client-SHA256 header
  - [ ] Extract EXIF metadata (existing `extractMetadata()`)
  - [ ] Compute SHA256 server-side using Web Crypto API
  - [ ] Validate client hash if provided (reject on mismatch)
  - [ ] Generate ID as `sha256:{hex}`
  - [ ] Prepare blob with custom headers (x-amz-sha256, x-amz-uploaddate, x-amz-createdate, x-amz-source)
  - [ ] Write to sr-artifact bucket with key `photos/sha256_{hash}.jpg`
  - [ ] Prepare metadata JSON using new service (validated per `schemas/storage-metadata.schema.json`)
  - [ ] Validate metadata JSON with `validateStorageMetadata()` before R2 write
  - [ ] Write to sr-json bucket with key `photos/sha256_{hash}.json` (only if validation passes)
  - [ ] Prepare upload response JSON
  - [ ] Validate response with `validateUploadResponse()` before returning
  - [ ] Return 201 with response matching `schemas/upload-response.schema.json` (only if validation passes)
- [ ] 3.4.3 Update error handling: schema validation failures return 500 with logged details
- [ ] 3.4.4 Add logging for debugging (include schema validation results)

## 4. HTTP Endpoints

### 4.1 Upload Endpoint
- [ ] 4.1.1 Update `POST /images` in `apps/api/src/handlers/http.ts`
- [ ] 4.1.2 Call rewritten `uploadImage()` service
- [ ] 4.1.3 Handle errors and return appropriate status codes per `schemas/openapi.yaml`
- [ ] 4.1.4 Update authentication logic if needed

## 5. Testing

### 5.1 Unit Tests
- [ ] 5.1.1 Test SHA256 hash function (known inputs → expected outputs)
- [ ] 5.1.2 Test schema validators:
  - [ ] Valid upload response passes `validateUploadResponse()`
  - [ ] Invalid upload response fails `validateUploadResponse()` with descriptive error
  - [ ] Valid storage metadata passes `validateStorageMetadata()`
  - [ ] Invalid storage metadata fails `validateStorageMetadata()` with descriptive error
  - [ ] Missing required fields cause validation failure
  - [ ] Invalid ID format (not `sha256:...`) causes validation failure
- [ ] 5.1.3 Test metadata JSON builder (complete structure with id field)
- [ ] 5.1.4 Validate metadata JSON builder output against `schemas/storage-metadata.schema.json`
- [ ] 5.1.5 Test client SHA256 hash validation (valid, invalid, missing)

### 5.2 Integration Tests
- [ ] 5.2.1 Update `apps/api/test/image-upload.spec.ts`
- [ ] 5.2.2 Test full upload flow (file → R2)
- [ ] 5.2.3 Validate upload response against `schemas/upload-response.schema.json`
- [ ] 5.2.4 Validate R2 metadata JSON against `schemas/storage-metadata.schema.json`
- [ ] 5.2.5 Test client hash optimization (with/without headers)
- [ ] 5.2.6 Test EXIF extraction for various image formats
- [ ] 5.2.7 Test missing EXIF fields (fallbacks)
- [ ] 5.2.8 Test all error scenarios from OpenAPI spec (400, 401, 500)
- [ ] 5.2.9 Test schema validation prevents invalid data from being written to R2

### 5.3 Manual Testing
- [ ] 5.3.1 Upload test images with `just curl-image`
- [ ] 5.3.2 Verify blobs in sr-artifact (check custom headers x-amz-sha256, x-amz-uploaddate, x-amz-createdate, x-amz-source)
- [ ] 5.3.3 Verify JSON in sr-json (structure matches `schemas/storage-metadata.schema.json`)
- [ ] 5.3.4 Verify R2 keys use format `photos/sha256_{hash}.jpg` and `photos/sha256_{hash}.json`

## 6. Deployment Preparation
- [ ] 6.1 Run type check: `just ts-check`
- [ ] 6.2 Run all tests: `just test`
- [ ] 6.3 Test locally end-to-end
- [ ] 6.4 Deploy Worker: `just deploy-api`
- [ ] 6.5 Smoke test production endpoint
- [ ] 6.6 Upload small batch of test images (5-10)
- [ ] 6.7 Validate production data (R2 blobs and JSON) against schemas

## Notes
- Complete tasks sequentially within each section
- Phase 1 does NOT include D1 indexing (Phase 2) or FTS5 (Phase 3)
- Phase 1 does NOT include deduplication endpoint (deferred to Phase 2)
- Run `just ts-check` frequently to catch type errors early
- ID format is `sha256:{hex}` - consistent with existing codebase patterns (chatter, films, quotes)
