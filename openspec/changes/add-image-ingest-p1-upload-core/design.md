# Design: Image Ingest Phase 1 - Upload Core

## Context

This is the first phase of implementing photo ingestion for the Second Rodeo digital archive. Phase 1 focuses on the upload pipeline: receiving files, computing hashes, extracting metadata, generating stable IDs, and storing in R2. The system must handle both PWA uploads and batch migration of ~50k legacy images.

Key constraints:
- JavaScript/TypeScript only (Cloudflare Workers)
- Cloudflare Workers CPU time limits
- Need to support 50k image migration without excessive costs
- SID algorithm must be correct from day one (used in other systems)
- Write once to R2 (no rewrites for headers later)

## Goals / Non-Goals

### Goals
- Production-ready image upload with EXIF metadata extraction
- Efficient deduplication to save bandwidth during migration
- Deterministic stable IDs (SID) for asset tracking
- Write-once R2 storage with complete metadata headers
- Foundation for future phases (D1 indexing, FTS5 search)

### Non-Goals (Deferred to Later Phases)
- D1 database indexing (Phase 2)
- Full-text search with FTS5 (Phase 3)
- OpenAPI documentation (Phase 4)
- Vector embeddings / AI search (out of scope)
- Image resizing / optimization (handled by Cloudflare Images separately)

## Decisions

### 1. Stable ID (SID) Generation

**Decision:** Use `uuidv5(namespace, sha256 + dateTimeOriginal + make + model)`

**Rationale:**
- Deterministic: Same image always produces same SID (enables deduplication)
- Stable across minor edits: EXIF-based components remain constant
- UUIDv5 provides collision resistance with namespace isolation
- **Critical**: SID is used in other parts of the system, must be correct from start

**Alternatives Considered:**
- **Random UUID:** Not deterministic, can't detect duplicates
- **SHA256 only:** Changes on any pixel modification (too sensitive)
- **Filename-based:** Unreliable, files get renamed

**Fallback Strategy:**
If EXIF fields missing:
```
dateTimeOriginal → uploadDate (ISO8601 timestamp)
make → "unknown"
model → "unknown"
```
SID still deterministic based on content hash + upload timestamp.

**Namespace UUID:**
Hardcoded constant for MVP (single-user system). Document clearly for use in other systems.

### 2. Dual Hashing: BLAKE3 + SHA256

**Decision:** Compute both BLAKE3 and SHA256 for each image in Phase 1

**Rationale:**
- **SHA256:** Industry standard, widest compatibility, used for SID generation
- **BLAKE3:** Faster, more secure, future-proofing (cryptographic community trend)
- **Minimal Cost:** Both hashes computed in single file read pass
- **Write Once:** R2 headers written once with both hashes (no rewrites later)
- **Flexibility:** Can migrate to BLAKE3-primary later without losing SHA256 compatibility

**Storage:**
- SHA256 → Used for deduplication, SID generation
- BLAKE3 → Stored in R2 headers, available for future use
- Both → Stored in metadata JSON and x-amz headers

**Library:** `@noble/hashes` - TypeScript-native, tree-shakeable, well-maintained

### 3. Client-Side Hash Computation

**Decision:** Optional client hashes with mandatory server validation

**Protocol:**
```http
POST /images
X-Client-SHA256: abc123...  (optional)
X-Client-BLAKE3: def456...  (optional)
```

Server always computes hashes and validates against client-provided values.

**Rationale:**
- **Bandwidth Savings:** Client can call `HEAD /api/photos/check/:sha256` before uploading 4MB file
- **Worker CPU Offload:** Client devices often more powerful, saves Worker execution time
- **Security:** Server validation prevents malicious/corrupt uploads
- **Progressive Enhancement:** Works without client hashes (server computes), faster with them

**Flow:**
1. Client computes SHA256 (if capable)
2. Client calls `HEAD /api/photos/check/:sha256` → skip if 200 OK (Phase 2+)
3. Client uploads with `X-Client-SHA256` header
4. Server validates against its own computation
5. If mismatch → reject 400 Bad Request (corruption/tampering)
6. If valid or missing → use server hash

### 4. Parallel R2 Bucket Architecture

**Decision:** Two buckets with identical key structures

```
sr-artifact/photos/<sid>.jpg    # Image blob
sr-json/photos/<sid>.json       # Metadata
```

**Rationale:**
- **Separation of Concerns:** Blobs vs structured data have different access patterns
- **IAM Control:** Can grant different permissions to artifact vs metadata buckets
- **Cost Optimization:** Different lifecycle policies (compress old metadata, keep artifacts)
- **Mental Model:** Simple parallel structure, easy to reason about
- **Web App Pattern:** Query lists (Phase 2), fetch JSON from R2 for details, display images from sr-artifact

**Alternatives Considered:**
- **Single bucket with prefixes:** Harder to apply different IAM/lifecycle policies
- **Metadata as object tags:** Limited size, not suitable for full EXIF data
- **Metadata in D1 only:** Too large for D1, loses full-fidelity archive

### 5. R2 Custom Metadata Headers

**Decision:** Store key metadata in x-amz custom headers on blob objects

```
x-amz-sha256: <hex>           # Content hash
x-amz-blake3: <hex>           # Alternative hash
x-amz-stable-id: <sid>        # Asset ID
x-amz-uploaddate: <ISO8601>   # When uploaded
x-amz-createdate: <ISO8601>   # From EXIF DateTimeOriginal (if present)
x-amz-source: pwa|migration   # Origin
```

**Rationale:**
- **Fast Metadata Access:** No separate JSON fetch needed for basic info
- **R2 List Operations:** Headers returned with list results
- **Deduplication:** Can check existing SID/hash without downloading blob (Phase 2+)
- **Migration:** Preserve both upload date and original capture date
- **Write Once:** All headers written during initial upload, no rewrites

**No R2 Object Tags:**
Tags are redundant with headers + JSON. Skip for MVP to reduce complexity.

### 6. Metadata Storage: Simple Overwrite Pattern

**Decision:** One JSON file per image, overwrite on updates (no event sourcing)

**Rationale:**
- **Simplicity:** Easy to implement, debug, and reason about
- **Web App Pattern:** Direct R2 GET for photo details (fast, simple)
- **Update Pattern:** When adding new fields later, just overwrite JSON with merged data
- **Cost Effective:** One object per image, no shard management

**JSON Structure:**
```json
{
  "sid": "sid_abc123",
  "sha256": "def456...",
  "blake3": "xyz789...",
  "file": { /* size, mime, dimensions */ },
  "exif": { /* camera, settings, GPS */ },
  "iptc": { /* title, caption, keywords */ },
  "uploadedAt": "2025-10-28T12:00:00Z",
  "source": "pwa" | "migration"
}
```

Future updates can add fields like `c2pa`, `vectorEmbedding`, etc. by reading, merging, and overwriting.

### 7. Phase 1 Scope Boundaries

**In Scope:**
- Complete upload pipeline (parse, validate, hash, extract, store)
- SID generation with UUIDv5
- Deduplication endpoint (stubbed - always returns 404 until Phase 2)
- R2 storage with custom headers
- Client hash optimization
- Unit and integration tests

**Out of Scope (Future Phases):**
- D1 database schema and indexing (Phase 2)
- Queue-based async processing (Phase 2)
- FTS5 full-text search (Phase 3)
- OpenAPI documentation (Phase 4)

**Deduplication Endpoint Stub:**
The `HEAD /api/photos/check/:sha256` endpoint is implemented but always returns 404 Not Found in Phase 1 (no D1 to query). Phase 2 will add the D1 lookup logic.

## Risks / Trade-offs

### Risk: SID Collisions Without pHash
**Impact:** Two different images could get same SID if EXIF matches and content hash collides

**Mitigation:**
- SHA256 collision probability: 2^-256 (astronomically low)
- UUIDv5 namespace isolation
- Server validates SHA256 on upload
- SID algorithm documented and tested with known inputs

**Likelihood:** Negligible

### Risk: Workers CPU Time Limits
**Impact:** Large images or batch uploads could hit 50ms CPU limit

**Mitigation:**
- Client-side hashing offloads computation
- EXIF extraction with `exifr` is fast (<10ms typical)
- BLAKE3 faster than SHA256
- Monitor with Cloudflare Analytics

**Likelihood:** Low for typical 4-8MB JPEGs

### Trade-off: Stubbed Deduplication in Phase 1
**Impact:** Deduplication endpoint exists but doesn't work until Phase 2

**Mitigation:**
- Clearly document stub behavior
- Returns 404 consistently (client treats as "new image")
- Phase 2 adds D1 lookup without API changes

**Accepted:** Allows Phase 1 to ship without D1 complexity

## Migration Plan

### Phase 1 Implementation (This Proposal)
1. Implement dual hashing with client optimization
2. Implement SID generation and test thoroughly
3. Build complete upload service
4. Add deduplication endpoint (stubbed)
5. Test with small batch (10-20 images)

### Handoff to Phase 2
- R2 structure and SID algorithm established
- Metadata JSON format finalized
- Phase 2 adds D1 schema and queue-based indexing
- Phase 2 implements deduplication lookup logic

### Rollback Plan
If Phase 1 has critical issues:
1. Revert to mock endpoint (no uploads processed)
2. R2 objects can be deleted (no dependencies yet)
3. No data loss: everything recoverable

## Open Questions

1. **Namespace UUID for SID:** Generate once and document in code, or derive from user/project context?
   **Recommendation:** Hardcoded constant for MVP (single-user system). Document clearly.

2. **EXIF Date Parsing:** Handle timezone-less EXIF dates (common issue)?
   **Recommendation:** Store as-is, interpret as local time for display.

3. **File Size Limit:** What's the maximum upload size?
   **Recommendation:** 50MB limit (typical for high-res photos).

4. **Source Detection:** How to distinguish PWA vs migration uploads?
   **Recommendation:** Accept optional `X-Upload-Source` header, default to "pwa".
