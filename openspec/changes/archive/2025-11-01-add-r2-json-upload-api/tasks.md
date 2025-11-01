# Tasks: R2 JSON Upload API

## 1. Implementation

- [X] 1.1 Create `apps/api/src/services/json-upload.ts` module
- [X] 1.2 Implement SHA-256 hash computation for JSON data object
- [X] 1.3 Implement JSON envelope wrapping (type, id, data)
- [X] 1.4 Implement R2 storage with x-amz-meta-sha256 metadata
- [X] 1.5 Add POST /upload endpoint in `apps/api/src/handlers/http.ts`
- [X] 1.6 Implement authentication check using AUTH_TOKEN
- [X] 1.7 Validate request has required fields (type, data)
- [X] 1.8 Return JSON response with objectKey and id

## 2. Testing

- [X] 2.1 Write unit test for SHA-256 hash computation
- [X] 2.2 Write unit test for JSON envelope wrapping
- [X] 2.3 Write integration test for /upload endpoint authentication
- [X] 2.4 Write integration test for successful upload with valid JSON
- [X] 2.5 Write integration test for missing type field (400 error)
- [X] 2.6 Write integration test for missing data field (400 error)
- [X] 2.7 Write integration test for invalid JSON (400 error)
- [X] 2.8 Write integration test for R2 storage failure (500 error)
- [X] 2.9 Write integration test verifying x-amz-meta-sha256 metadata
- [X] 2.10 Write integration test for object key format
- [X] 2.11 Run full test suite: `just test`

## 3. Deployment

- [X] 3.1 Test locally with wrangler dev
- [X] 3.2 Deploy worker to production
- [X] 3.3 Test production endpoint with sample JSON
- [X] 3.4 Verify R2 object created with correct metadata
- [X] 3.5 Verify hash computation matches expected values
