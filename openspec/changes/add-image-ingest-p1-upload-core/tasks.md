# Tasks: Image Ingest Phase 1 - Upload Core

## 1. Dependencies & Setup
- [ ] 1.1 Install dependencies and verify build passes (no new dependencies - using Web Crypto API for SHA256)

## 2. Core Services

### 2.1 Hash Computation
- [ ] 2.1.1 Create `apps/api/src/services/hash.ts`
- [ ] 2.1.2 Implement `computeSHA256(buffer: ArrayBuffer): Promise<string>` using Web Crypto API
- [ ] 2.1.3 Write unit tests for SHA256 hash function with known inputs/outputs

### 2.2 Metadata JSON Builder
- [ ] 2.2.1 Create `apps/api/src/services/metadata-json.ts`
- [ ] 2.2.2 Implement `buildMetadataJSON(params)` returning complete JSON structure
- [ ] 2.2.3 Include fields: id (sha256:...), sha256, file info, exif, iptc, timestamps, source
- [ ] 2.2.4 Write unit tests for complete JSON structure

### 2.3 Image Upload Service (Rewrite)
- [ ] 2.3.1 Backup current `apps/api/src/services/image-upload.ts` to `image-upload.old.ts`
- [ ] 2.3.2 Rewrite `uploadImage()` function:
  - [ ] Parse multipart form data
  - [ ] Validate file type and size
  - [ ] Read optional client SHA256 hash from X-Client-SHA256 header
  - [ ] Extract EXIF metadata (existing `extractMetadata()`)
  - [ ] Compute SHA256 server-side using Web Crypto API
  - [ ] Validate client hash if provided (reject on mismatch)
  - [ ] Generate ID as `sha256:{hex}`
  - [ ] Prepare blob with custom headers (x-amz-sha256, x-amz-uploaddate, x-amz-createdate, x-amz-source)
  - [ ] Write to sr-artifact bucket with key `photos/sha256_{hash}.jpg`
  - [ ] Prepare metadata JSON using new service
  - [ ] Write to sr-json bucket with key `photos/sha256_{hash}.json`
  - [ ] Return 201 with id, sha256, and metadata
- [ ] 2.3.3 Update error handling and validation
- [ ] 2.3.4 Add logging for debugging

## 3. HTTP Endpoints

### 3.1 Upload Endpoint
- [ ] 3.1.1 Update `POST /images` in `apps/api/src/handlers/http.ts`
- [ ] 3.1.2 Call rewritten `uploadImage()` service
- [ ] 3.1.3 Handle errors and return appropriate status codes
- [ ] 3.1.4 Update authentication logic if needed

## 4. Testing

### 4.1 Unit Tests
- [ ] 4.1.1 Test SHA256 hash function (known inputs → expected outputs)
- [ ] 4.1.2 Test metadata JSON builder (complete structure with id field)
- [ ] 4.1.3 Test client SHA256 hash validation (valid, invalid, missing)

### 4.2 Integration Tests
- [ ] 4.2.1 Update `apps/api/test/image-upload.spec.ts`
- [ ] 4.2.2 Test full upload flow (file → R2)
- [ ] 4.2.3 Test client hash optimization (with/without headers)
- [ ] 4.2.4 Test EXIF extraction for various image formats
- [ ] 4.2.5 Test missing EXIF fields (fallbacks)

### 4.3 Manual Testing
- [ ] 4.3.1 Upload test images with `just curl-image`
- [ ] 4.3.2 Verify blobs in sr-artifact (check custom headers x-amz-sha256, x-amz-uploaddate, x-amz-createdate, x-amz-source)
- [ ] 4.3.3 Verify JSON in sr-json (structure includes id, sha256, file, exif, iptc, uploadedAt, source)
- [ ] 4.3.4 Verify R2 keys use format `photos/sha256_{hash}.jpg` and `photos/sha256_{hash}.json`

## 5. Deployment Preparation
- [ ] 5.1 Run type check: `just ts-check`
- [ ] 5.2 Run all tests: `just test`
- [ ] 5.3 Test locally end-to-end
- [ ] 5.4 Deploy Worker: `just deploy-api`
- [ ] 5.5 Smoke test production endpoint
- [ ] 5.6 Upload small batch of test images (5-10)
- [ ] 5.7 Validate production data (R2 blobs and JSON)

## Notes
- Complete tasks sequentially within each section
- Phase 1 does NOT include D1 indexing (Phase 2) or FTS5 (Phase 3)
- Phase 1 does NOT include deduplication endpoint (deferred to Phase 2)
- Run `just ts-check` frequently to catch type errors early
- ID format is `sha256:{hex}` - consistent with existing codebase patterns (chatter, films, quotes)
