# Tasks: Image Ingest Phase 4 - API Documentation

## 1. OpenAPI Specification File

### 1.1 Create Specification
- [ ] 1.1.1 Create `apps/api/openapi.yaml` (or `.json`)
- [ ] 1.1.2 Define OpenAPI 3.x metadata:
  - [ ] title: "Second Rodeo Image Ingest API"
  - [ ] version: "1.0.0"
  - [ ] description: Overview of image ingest system
- [ ] 1.1.3 Define security schemes (Bearer token authentication)

### 1.2 Document Upload Endpoint
- [ ] 1.2.1 Document `POST /images` endpoint
- [ ] 1.2.2 Define request schema:
  - [ ] Content-Type: multipart/form-data
  - [ ] Field: `file` (binary, required)
  - [ ] Optional headers: X-Client-SHA256, X-Client-BLAKE3, X-Upload-Source
- [ ] 1.2.3 Define response schemas:
  - [ ] 201 Created: { sid, sha256, blake3, uploadedAt, metadata }
  - [ ] 400 Bad Request: { error, message }
  - [ ] 401 Unauthorized: { error, message }
  - [ ] 500 Internal Server Error: { error, message }
- [ ] 1.2.4 Add request examples (PWA upload, migration upload)
- [ ] 1.2.5 Add response examples (success, errors)

### 1.3 Document Deduplication Endpoint
- [ ] 1.3.1 Document `HEAD /api/photos/check/:sha256` endpoint
- [ ] 1.3.2 Define path parameter:
  - [ ] sha256: string (hex-encoded hash)
- [ ] 1.3.3 Define response codes:
  - [ ] 200 OK (with X-Stable-ID header)
  - [ ] 404 Not Found
  - [ ] 401 Unauthorized
- [ ] 1.3.4 Document X-Stable-ID response header
- [ ] 1.3.5 Add examples (image exists, image not found)

### 1.4 Document Search Endpoint (Optional)
- [ ] 1.4.1 Document `GET /api/photos/search` endpoint (if implemented)
- [ ] 1.4.2 Define query parameters:
  - [ ] q: string (search query)
  - [ ] limit: integer (default 50)
  - [ ] offset: integer (default 0)
  - [ ] dateStart, dateEnd: ISO8601 timestamps
  - [ ] cameraMake, cameraModel: strings
- [ ] 1.4.3 Define response schema:
  - [ ] 200 OK: { results: [Photo], total, limit, offset }
  - [ ] 400 Bad Request: { error, message }
- [ ] 1.4.4 Add examples (text search, combined filters)

### 1.5 Document Query Endpoints (Optional)
- [ ] 1.5.1 Document `GET /api/photos` endpoint (if implemented)
- [ ] 1.5.2 Define query parameters for filters
- [ ] 1.5.3 Define response schema
- [ ] 1.5.4 Add examples

## 2. Schemas and Components

### 2.1 Define Reusable Schemas
- [ ] 2.1.1 Define Photo schema:
  - [ ] sid, sha256, blake3, takenAt, uploadedAt
  - [ ] cameraMake, cameraModel, lensModel
  - [ ] gpsLat, gpsLon, width, height, mimeType, fileSize
  - [ ] r2Key, source
- [ ] 2.1.2 Define Error schema:
  - [ ] error: string
  - [ ] message: string
- [ ] 2.1.3 Define UploadResponse schema:
  - [ ] sid, sha256, blake3, uploadedAt
  - [ ] metadata: { file, exif, iptc }

### 2.2 Security Definitions
- [ ] 2.2.1 Define Bearer token security scheme
- [ ] 2.2.2 Apply security to all endpoints
- [ ] 2.2.3 Document authentication flow

## 3. Examples and Use Cases

### 3.1 Upload Examples
- [ ] 3.1.1 Example: PWA upload with client hashes
- [ ] 3.1.2 Example: Migration script upload
- [ ] 3.1.3 Example: Upload without client hashes
- [ ] 3.1.4 Example: Upload error responses

### 3.2 Deduplication Examples
- [ ] 3.2.1 Example: Check before upload (bandwidth savings)
- [ ] 3.2.2 Example: Image exists (200 OK)
- [ ] 3.2.3 Example: Image not found (404)

### 3.3 Search Examples (Optional)
- [ ] 3.3.1 Example: Simple text search
- [ ] 3.3.2 Example: Search with date range filter
- [ ] 3.3.3 Example: Search with camera filter

## 4. Validation and Testing

### 4.1 Spec Validation
- [ ] 4.1.1 Install OpenAPI validator (e.g., `@apidevtools/swagger-cli`)
- [ ] 4.1.2 Validate spec: `swagger-cli validate openapi.yaml`
- [ ] 4.1.3 Fix any validation errors

### 4.2 Documentation Review
- [ ] 4.2.1 Review spec completeness (all endpoints documented)
- [ ] 4.2.2 Review examples (accurate and helpful)
- [ ] 4.2.3 Review schemas (match actual API responses)
- [ ] 4.2.4 Test examples with actual API

### 4.3 Interactive Testing
- [ ] 4.3.1 Set up Swagger UI or Redoc (optional)
- [ ] 4.3.2 Test endpoints via Swagger UI
- [ ] 4.3.3 Verify examples work

## 5. Serve OpenAPI Spec (Optional)

### 5.1 Add Endpoint
- [ ] 5.1.1 Add `GET /api/openapi.json` to `apps/api/src/handlers/http.ts`
- [ ] 5.1.2 Read openapi.yaml and return as JSON
- [ ] 5.1.3 Add CORS headers if needed
- [ ] 5.1.4 Test endpoint locally

### 5.2 Documentation Landing Page (Optional)
- [ ] 5.2.1 Create `GET /api/docs` endpoint
- [ ] 5.2.2 Serve Swagger UI or Redoc HTML
- [ ] 5.2.3 Point UI to /api/openapi.json
- [ ] 5.2.4 Test documentation page

## 6. Client Code Generation (Optional)

### 6.1 Generate TypeScript Client
- [ ] 6.1.1 Install client generator (e.g., `openapi-typescript`)
- [ ] 6.1.2 Generate TypeScript types from spec
- [ ] 6.1.3 Add to PWA or CLI tools
- [ ] 6.1.4 Test generated client

## 7. Documentation and README

### 7.1 Update Project Documentation
- [ ] 7.1.1 Add "API Documentation" section to README
- [ ] 7.1.2 Link to OpenAPI spec file
- [ ] 7.1.3 Add usage examples (curl, JavaScript, Python)
- [ ] 7.1.4 Document authentication setup

### 7.2 Code Comments
- [ ] 7.2.1 Add comments in endpoint handlers referencing OpenAPI spec
- [ ] 7.2.2 Add JSDoc comments with OpenAPI tags (optional)

## 8. Deployment
- [ ] 8.1 Commit OpenAPI spec to repository
- [ ] 8.2 Deploy API with spec endpoint (if added)
- [ ] 8.3 Verify /api/openapi.json accessible in production (if added)
- [ ] 8.4 Share API documentation with stakeholders

## Notes
- Complete tasks sequentially within each section
- Phase 4 is documentation-only (no code changes except serving spec)
- OpenAPI spec should match actual API behavior from Phases 1-3
- Examples should be tested against real API
- Consider using YAML for readability (convert to JSON for serving)
