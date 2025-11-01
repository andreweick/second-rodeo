# Proposal: R2 JSON Upload API

## Why

Enable programmatic upload of JSON content to R2 storage via an authenticated HTTP API endpoint. Currently, content is uploaded manually via rclone, which is cumbersome for client applications (PWAs, mobile apps) that need to persist user-generated content.

This provides a generic, type-agnostic upload mechanism that computes content hashes, wraps JSON in a standard envelope format, and stores to R2 with proper metadata for integrity verification.

## What Changes

- Add HTTP endpoint `POST /upload` accepting JSON with `type` and `data` fields
- Compute SHA-256 hash of the `data` object (lowercase hex-encoded)
- Serialize `data` using canonical JSON (stable key ordering) for consistent hashing
- Inject `id` field with format `sha256:{hash}`
- Store wrapped JSON to R2 at `sha256_{hash}.json`
- Set R2 object metadata `x-amz-meta-sha256-hex` with hash value
- Return object key and computed hash to client
- No type validation - accept any type string (future-proof)
- Use R2 bucket configured via `R2_BUCKET_NAME` environment variable (defaults to `sr-json`)

## Impact

**Affected specs:**
- New capability: `r2-json-upload` (programmatic JSON upload with content hashing)

**Affected code:**
- `apps/api/src/handlers/http.ts` - Add `/upload` endpoint
- New module: `apps/api/src/services/json-upload.ts` - Hash computation and R2 storage logic

**Configuration:**
- Environment variable: `R2_BUCKET_NAME` (default: `sr-json`)
- Target bucket for JSON object storage

**Storage format:**
- Wrapped JSON envelope:
  ```json
  {
    "type": "chatter",
    "id": "sha256:abc123...",
    "data": {
      "title": "...",
      "content": "...",
      ...
    }
  }
  ```
- R2 path: `{bucket}/sha256_{hash}.json` (where bucket = `R2_BUCKET_NAME`)
- Metadata: `x-amz-meta-sha256-hex: {hash}`

**User workflow:**
1. Client prepares content JSON (no wrapping needed)
2. POST to `/upload` with `{"type": "chatter", "data": {...}}`
3. Server computes hash, wraps, stores to R2
4. Server returns `{objectKey: "sha256_abc.json", id: "sha256:abc..."}`
5. Client saves object key for later reference

**Non-breaking changes:**
- Existing manual rclone uploads continue to work (migration handled separately)
- No changes to D1 ingestion (handled in separate proposal)
