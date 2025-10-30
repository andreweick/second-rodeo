# Tasks: Image Ingest Phase 1 - Upload Core

## 1. Dependencies & Setup
- [ ] 1.1 Add BLAKE3 library (`@noble/hashes`) to `apps/api/package.json`
- [ ] 1.2 Install dependencies and verify build passes

## 2. Core Services

### 2.1 Hash Computation
- [ ] 2.1.1 Create `apps/api/src/services/hash.ts`
- [ ] 2.1.2 Implement `computeSHA256(buffer: ArrayBuffer): Promise<string>`
- [ ] 2.1.3 Implement `computeBLAKE3(buffer: ArrayBuffer): Promise<string>`
- [ ] 2.1.4 Write unit tests for hash functions with known inputs/outputs

### 2.2 SID Generation
- [ ] 2.2.1 Create `apps/api/src/services/sid.ts`
- [ ] 2.2.2 Define namespace UUID constant
- [ ] 2.2.3 Implement `generateSID(sha256: string, exif: ExifData): string` using UUIDv5
- [ ] 2.2.4 Handle missing EXIF fields (fallbacks: uploadDate, "unknown", "unknown")
- [ ] 2.2.5 Write unit tests with known inputs/outputs to validate algorithm
- [ ] 2.2.6 Document SID algorithm for use in other systems

### 2.3 Metadata JSON Builder
- [ ] 2.3.1 Create `apps/api/src/services/metadata-json.ts`
- [ ] 2.3.2 Implement `buildMetadataJSON(params)` returning complete JSON structure
- [ ] 2.3.3 Include fields: sid, sha256, blake3, file info, exif, iptc, timestamps, source
- [ ] 2.3.4 Write unit tests for complete JSON structure

### 2.4 Image Upload Service (Rewrite)
- [ ] 2.4.1 Backup current `apps/api/src/services/image-upload.ts` to `image-upload.old.ts`
- [ ] 2.4.2 Rewrite `uploadImage()` function:
  - [ ] Parse multipart form data
  - [ ] Validate file type and size
  - [ ] Read client hashes from headers (X-Client-SHA256, X-Client-BLAKE3)
  - [ ] Extract EXIF metadata (existing `extractMetadata()`)
  - [ ] Compute SHA256 and BLAKE3 server-side
  - [ ] Validate client hashes if provided (reject on mismatch)
  - [ ] Generate SID using new service
  - [ ] Prepare blob with custom headers (x-amz-sha256, x-amz-blake3, x-amz-stable-id, etc.)
  - [ ] Write to sr-artifact bucket
  - [ ] Prepare metadata JSON using new service
  - [ ] Write to sr-json bucket (parallel key structure)
  - [ ] Return 201 with SID, hashes, and metadata
- [ ] 2.4.3 Update error handling and validation
- [ ] 2.4.4 Add logging for debugging

## 3. HTTP Endpoints

### 3.1 Deduplication Endpoint
- [ ] 3.1.1 Add `HEAD /api/photos/check/:sha256` to `apps/api/src/handlers/http.ts`
- [ ] 3.1.2 Query existing photos (stub for now - returns 404 until Phase 2 adds D1)
- [ ] 3.1.3 Return 200 OK with `X-Stable-ID` header if exists
- [ ] 3.1.4 Return 404 Not Found if new
- [ ] 3.1.5 Add authentication check

### 3.2 Upload Endpoint
- [ ] 3.2.1 Update `POST /images` in `apps/api/src/handlers/http.ts`
- [ ] 3.2.2 Call rewritten `uploadImage()` service
- [ ] 3.2.3 Handle errors and return appropriate status codes
- [ ] 3.2.4 Update authentication logic if needed

## 4. Testing

### 4.1 Unit Tests
- [ ] 4.1.1 Test hash functions (known inputs → expected outputs)
- [ ] 4.1.2 Test SID generation (deterministic, handles missing EXIF)
- [ ] 4.1.3 Test metadata JSON builder (complete structure)
- [ ] 4.1.4 Test client hash validation (valid, invalid, missing)

### 4.2 Integration Tests
- [ ] 4.2.1 Update `apps/api/test/image-upload.spec.ts`
- [ ] 4.2.2 Test full upload flow (file → R2)
- [ ] 4.2.3 Test client hash optimization (with/without headers)
- [ ] 4.2.4 Test EXIF extraction for various image formats
- [ ] 4.2.5 Test missing EXIF fields (fallbacks)

### 4.3 Manual Testing
- [ ] 4.3.1 Upload test images with `just curl-image`
- [ ] 4.3.2 Verify blobs in sr-artifact (check custom headers with R2 console)
- [ ] 4.3.3 Verify JSON in sr-json (structure, completeness)
- [ ] 4.3.4 Test deduplication endpoint (HEAD request)

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
- Deduplication endpoint is stubbed (always returns 404) until Phase 2 adds D1
- Run `just ts-check` frequently to catch type errors early
- SID algorithm must be correct - it's used in other systems
