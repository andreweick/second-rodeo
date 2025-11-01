# Tasks: R2 JSON Upload API

## 1. Implementation

- [ ] 1.1 Create `apps/api/src/services/json-upload.ts` module
- [ ] 1.2 Implement SHA-256 hash computation for JSON data object
- [ ] 1.3 Implement JSON envelope wrapping (type, id, data)
- [ ] 1.4 Implement R2 storage with x-amz-meta-sha256 metadata
- [ ] 1.5 Add POST /upload endpoint in `apps/api/src/handlers/http.ts`
- [ ] 1.6 Implement authentication check using AUTH_TOKEN
- [ ] 1.7 Validate request has required fields (type, data)
- [ ] 1.8 Return JSON response with objectKey and id

## 2. Testing

- [ ] 2.1 Write unit test for SHA-256 hash computation
- [ ] 2.2 Write unit test for JSON envelope wrapping
- [ ] 2.3 Write integration test for /upload endpoint authentication
- [ ] 2.4 Write integration test for successful upload with valid JSON
- [ ] 2.5 Write integration test for missing type field (400 error)
- [ ] 2.6 Write integration test for missing data field (400 error)
- [ ] 2.7 Write integration test for invalid JSON (400 error)
- [ ] 2.8 Write integration test for R2 storage failure (500 error)
- [ ] 2.9 Write integration test verifying x-amz-meta-sha256 metadata
- [ ] 2.10 Write integration test for object key format
- [ ] 2.11 Run full test suite: `just test`

## 3. Deployment

- [ ] 3.1 Test locally with wrangler dev
- [ ] 3.2 Deploy worker to production
- [ ] 3.3 Test production endpoint with sample JSON
- [ ] 3.4 Verify R2 object created with correct metadata
- [ ] 3.5 Verify hash computation matches expected values
