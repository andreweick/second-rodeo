# Design: R2 JSON Upload API

## Context

Client applications (PWAs, mobile apps) need to upload user-generated JSON content to R2 storage. Currently, the workflow requires manual rclone uploads, which is impractical for client apps. We need a programmatic API endpoint that:
- Accepts arbitrary JSON content
- Computes content-based hashes for deduplication and integrity
- Stores to R2 with proper metadata
- Returns identifiers for later retrieval

## Goals / Non-Goals

**Goals:**
- Single generic upload endpoint for all content types
- Content-based SHA-256 hashing of data payload
- Wrapped JSON format for consistent structure
- R2 metadata for hash verification
- Future-proof design (no hardcoded type validation)

**Non-Goals:**
- D1 ingestion (separate proposal)
- File migration (handled manually)
- Batch upload (one object per request)
- Client-side hash validation (trust server computation)
- Authentication beyond AUTH_TOKEN (existing pattern)

## Decisions

### Decision 1: Wrapped JSON Envelope

**Choice:** Standardized envelope format with type, id, and data fields

**Format:**
```json
{
  "type": "chatter",
  "id": "sha256:abc123...",
  "data": {
    "title": "My post",
    "content": "...",
    ...
  }
}
```

**Rationale:**
- Clean separation of routing metadata (type, id) from content payload (data)
- Server-injected ID ensures consistency
- Generic format works for all content types
- Extensible (can add fields like uploaded_at, version, etc.)
- Client sends unwrapped data, server handles wrapping

**Alternatives considered:**
- Flat format with id in data: Mixing concerns, harder to extend
- Type in URL path: Less flexible, requires URL routing logic
- Client computes hash: More complex client, trust issues

### Decision 2: Hash Only Data Object

**Choice:** Compute SHA-256 hash of the `data` object only, not the entire envelope

**Implementation:**
```typescript
const hash = sha256(JSON.stringify(req.data));
const id = `sha256:${hash}`;
const wrapped = { type: req.type, id, data: req.data };
```

**Rationale:**
- Hash represents content, not metadata
- Deterministic - same data always produces same hash
- Verifiable - can re-hash `data` object to verify `id`
- No chicken-egg problem (id not part of hash computation)

**Alternatives considered:**
- Hash entire envelope: Circular dependency, id changes hash
- Hash stringified data as received: JSON key ordering issues

### Decision 3: SHA-256 Hex Encoding

**Choice:** Use SHA-256 with hex encoding (already URL-safe)

**Format:**
- ID: `sha256:abc123def456...` (64 hex characters)
- Filename: `{type}/sha256_abc123def456....json`
- Metadata: `x-amz-meta-sha256: abc123def456...`

**Rationale:**
- Hex is already URL-safe (no special characters)
- Standard encoding, widely supported
- Human-readable for debugging
- Matches existing file naming pattern
- 64-character hash (32 bytes * 2 hex chars/byte)

**Alternatives considered:**
- BLAKE3: Faster but requires migration of existing files
- Base64url: Shorter but less readable, encoding complexity

### Decision 4: No Type Validation

**Choice:** Accept any type string, no validation against allowed list

**Implementation:**
```typescript
if (typeof req.type !== 'string' || req.type.length === 0) {
  return 400; // type must be non-empty string
}
// No validation against allowed types
```

**Rationale:**
- Future-proof - new content types work automatically
- Simpler code - no hardcoded type list to maintain
- Client flexibility - experimentation without server changes
- R2 path-based organization handles namespacing

**Alternatives considered:**
- Validate against list: Requires code changes for each new type
- Regex validation: Overly restrictive, limits creativity

### Decision 5: Single Upload Endpoint

**Choice:** `POST /upload` (not per-type endpoints like /chatter/upload)

**Endpoint:** `POST /upload`

**Request:**
```json
{
  "type": "chatter",
  "data": { ... }
}
```

**Response:**
```json
{
  "objectKey": "chatter/sha256_abc123.json",
  "id": "sha256:abc123..."
}
```

**Rationale:**
- Single endpoint to document and maintain
- Type in payload is more flexible
- No URL routing complexity
- Consistent with "no type validation" decision

**Alternatives considered:**
- Per-type endpoints (/chatter/upload): More RESTful but less flexible

## Risks / Trade-offs

### Risk: Hash Collision

- **Impact:** Two different data objects produce same SHA-256 hash (extremely unlikely)
- **Mitigation:** SHA-256 collision probability is negligible (2^256 space)
- **Future:** Add content-length validation if needed

### Risk: Large Payload Size

- **Impact:** Cloudflare Workers have 128MB memory limit
- **Mitigation:** Cloudflare Workers can handle multi-MB JSON payloads
- **Future:** Add size validation if abuse occurs (reject >10MB)

### Risk: Type Namespace Pollution

- **Impact:** Clients create arbitrary type values, R2 bucket gets messy
- **Mitigation:** Convention-based naming (use lowercase, hyphens)
- **Future:** Add type naming guidelines to API docs

### Trade-off: Server Computes Hash

- **Impact:** Client cannot predict objectKey before upload
- **Mitigation:** Server returns objectKey immediately in response
- **Benefit:** Simpler client, guaranteed hash consistency

## Migration Plan

**Phase 1: Deploy Upload API**
```bash
# Implement endpoint
just test
wrangler deploy
```

**Phase 2: Test with Sample Data**
```bash
curl -X POST https://api.your-domain.com/upload \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":{"message":"hello"}}'
```

**Phase 3: Verify R2 Storage**
```bash
# Check object exists
wrangler r2 object get sr-json test/sha256_xxx.json

# Verify metadata
wrangler r2 object info sr-json test/sha256_xxx.json
```

**Phase 4: Client Integration**
- Update PWA to use /upload endpoint
- Remove dependency on manual rclone uploads

**Rollback Plan:**
- Remove /upload endpoint
- Delete test objects from R2
- Revert to manual rclone workflow

## Open Questions

None - design is complete and ready for implementation.
