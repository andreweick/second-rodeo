# Design: Image Ingest Phase 1 - Upload Core

## Context

Phase 1 establishes the complete upload pipeline with production-ready hashing, metadata extraction, and R2 storage. This phase focuses on getting the core upload right with content-addressed IDs while deferring queryability and deduplication to Phase 2 (D1 indexing).

Key constraints:
- JavaScript/TypeScript only (Cloudflare Workers)
- Cloudflare Workers CPU time limits
- Full metadata fidelity for long-term archival
- No database dependencies (R2 only)

## Goals / Non-Goals

### Goals
- Production-ready image upload with EXIF/IPTC metadata extraction
- Content-addressed storage with SHA256 IDs
- Complete metadata preservation in R2 JSON
- Simple, maintainable architecture using existing patterns
- Foundation for Phase 2 (D1 indexing) and Phase 3 (FTS5 search)

### Non-Goals (Deferred to Later Phases)
- D1 database indexing - Phase 2
- Deduplication endpoint - Phase 2
- Full-text search (FTS5) - Phase 3
- Queryability (date, camera, location) - Phase 2
- Perceptual hashing (pHash64) - Future (containers)
- C2PA content authenticity - Future
- Vector embeddings / AI search - Future (Vectorize integration)
- Image resizing / optimization - Cloudflare Images handles separately

## Decisions

### 1. Content-Addressed Storage

**Decision:** Use SHA256 hash directly as the image identifier (format: `sha256:{hex}`)

**Rationale:**
- **Deterministic:** Same file always produces same ID (perfect deduplication)
- **Simple:** No UUIDv5 computation, no namespace management, no EXIF dependency
- **Consistent:** Matches existing codebase patterns (chatter, films, quotes all use `sha256:...` format)
- **Content-Addressed:** ID represents the actual bytes of the file
- **Foundation for pHash:** ID is immutable, perceptual hashing can be added as separate index

**Alternatives Considered:**
- **UUIDv5(SHA256 + EXIF):** Complex, adds EXIF dependency for ID generation, not actually stable when EXIF changes
- **Random UUID:** Not deterministic, can't detect duplicates before upload
- **Sequential IDs:** Not content-addressed, unsuitable for distributed systems

**ID Format:**
```
id = "sha256:abc123def456..."  // 64-char hex hash
```

**R2 Keys:**
```
sr-artifact/photos/sha256_abc123def456.jpg
sr-json/photos/sha256_abc123def456.json
```

### 2. Parallel R2 Bucket Architecture

**Decision:** Two buckets with identical key structures

```
sr-artifact/photos/sha256_abc123.jpg    # Image blob
sr-json/photos/sha256_abc123.json       # Metadata
```

**Rationale:**
- **Separation of Concerns:** Blobs vs structured data have different access patterns
- **IAM Control:** Can grant different permissions to artifact vs metadata buckets
- **Cost Optimization:** Different lifecycle policies (compress old metadata, keep artifacts)
- **Mental Model:** Simple parallel structure, easy to reason about
- **Web App Pattern:** Query D1 for lists, fetch JSON from R2 for details, display images from sr-artifact

**Alternatives Considered:**
- **Single bucket with prefixes:** Harder to apply different IAM/lifecycle policies
- **Metadata as object tags:** Limited size, not suitable for full EXIF data
- **Metadata in D1 only:** Too large for D1, loses full-fidelity archive

### 3. Client-Side Hash Computation

**Decision:** Optional client hashes with mandatory server validation

**Protocol:**
```http
POST /images
X-Client-SHA256: abc123...  (optional)
```

Server always computes SHA256 hash and validates against client-provided value.

**Rationale:**
- **Bandwidth Savings:** Client can call `HEAD /api/photos/check/:sha256` before uploading 4MB file
- **Worker CPU Offload:** Client devices often more powerful, saves Worker execution time
- **Security:** Server validation prevents malicious/corrupt uploads
- **Progressive Enhancement:** Works without client hashes (server computes), faster with them

**Flow:**
1. Client computes SHA256 (if capable)
2. Client calls `HEAD /api/photos/check/:sha256` → skip if 200 OK
3. Client uploads with `X-Client-SHA256` header
4. Server validates against its own computation
5. If mismatch → reject (corruption/tampering)
6. If valid or missing → use server hash

### 4. Content Hashing: SHA256

**Decision:** Use SHA256 for content hashing

**Rationale:**
- **SHA256:** Industry standard, widely supported, cryptographically secure
- **Web Crypto API:** Native browser and Worker support (no dependencies)
- **Deduplication:** Standard hash for detecting duplicate uploads
- **SID Generation:** Used as primary input for stable ID computation

**Storage:**
- SHA256 → Used for deduplication endpoint, SID generation
- Stored in R2 headers, metadata JSON, and D1 table

### 5. Metadata Storage: Simple Overwrite Pattern

**Decision:** One JSON file per image, overwrite on updates (no event sourcing)

**Rationale:**
- **Simplicity:** Easy to implement, debug, and reason about
- **Web App Pattern:** Direct R2 GET for photo details (fast, simple)
- **Update Pattern:** When C2PA added later, just overwrite JSON with merged data
- **Cost Effective:** One object per image, no shard management
- **D1 Rebuild:** Can always rebuild D1 index by scanning R2 JSON files

**Alternatives Considered:**
- **Event-sourced JSONL per image:** Complex, many tiny files for 50k images
- **Sharded JSONL:** Over-engineered for MVP, deferred to container phase
- **Metadata in D1 only:** Loses full fidelity, can't rebuild

**JSON Structure:**

See formal schemas in `schemas/` directory:
- **Storage metadata JSON:** `schemas/storage-metadata.schema.json` (complete JSON stored in sr-json bucket)
- **Upload response JSON:** `schemas/upload-response.schema.json` (response from POST /images)
- **OpenAPI specification:** `schemas/openapi.yaml` (complete API contract)

**Storage Metadata (sr-json bucket):**
```json
{
  "id": "sha256:abc123...",              // Required: content-addressed ID
  "sha256": "abc123...",                 // Required: hex hash
  "file": {                              // Required: file metadata
    "originalName": "IMG_2024.jpg",      // Optional
    "width": 4032,                       // Optional
    "height": 3024,                      // Optional
    "size": 4562891,                     // Required
    "mimeType": "image/jpeg",            // Required
    "format": "jpeg"                     // Optional
  },
  "exif": {                              // Optional: camera/capture metadata
    "make": "Apple",
    "model": "iPhone 15 Pro",
    "dateTimeOriginal": "2025-11-15T09:42:17Z",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "iso": 64,
    "fNumber": 1.78,
    "exposureTime": 0.00125,
    "focalLength": 6.86,
    "orientation": 1,
    "software": "iOS 18.1"
  },
  "iptc": {                              // Optional: text metadata
    "objectName": "Golden Gate Bridge",
    "caption": "View from Baker Beach",
    "keywords": ["san francisco", "sunset"],
    "creator": "Andy Eick",
    "city": "San Francisco",
    "country": "USA"
  },
  "icc": {                               // Optional: color profile
    "colorSpace": "sRGB",
    "description": "Display P3"
  },
  "uploadedAt": "2025-11-16T14:23:45Z",  // Required: ISO8601
  "source": "pwa"                        // Required: "pwa" | "migration"
}
```

**Upload Response (POST /images returns):**
```json
{
  "id": "sha256:abc123...",              // Required
  "sha256": "abc123...",                 // Required
  "uploadedAt": "2025-11-16T14:23:45Z",  // Required
  "metadata": {                          // Optional: preview of extracted data
    "file": {
      "width": 4032,
      "height": 3024,
      "size": 4562891,
      "mimeType": "image/jpeg",
      "format": "jpeg"
    },
    "exif": {                            // Optional subset for quick preview
      "make": "Apple",
      "model": "iPhone 15 Pro",
      "dateTimeOriginal": "2025-11-15T09:42:17Z"
    }
  }
}
```

Future C2PA update will add optional `c2pa` field to storage metadata:
```json
{
  /* existing fields */
  "c2pa": {                              // Optional: content authenticity
    /* manifest, assertions, trust */
  }
}
```

### 6. R2 Custom Metadata Headers

**Decision:** Store key metadata in x-amz custom headers on blob objects

```
x-amz-sha256: <hex>           # Content hash
x-amz-uploaddate: <ISO8601>   # When uploaded
x-amz-createdate: <ISO8601>   # From EXIF DateTimeOriginal (if present)
x-amz-source: pwa|migration   # Origin
```

**Rationale:**
- **Fast Metadata Access:** No separate JSON fetch needed for basic info
- **R2 List Operations:** Headers returned with list results
- **Deduplication:** Can check existing SID/hash without downloading blob
- **Migration:** Preserve both upload date and original capture date

**No R2 Object Tags:**
Tags are redundant with headers + D1 + JSON. Skip for MVP to reduce complexity.

### 7. Schema Validation

**Decision:** Validate all JSON structures against schemas before R2 writes and HTTP responses

**Rationale:**
- **Data Quality:** Ensures only valid, complete data is stored in R2
- **Early Detection:** Catches missing fields or format errors before they reach storage
- **Fail-Fast:** Prevents inconsistent data from being written to production
- **Documentation:** Schemas serve as executable documentation of data contracts
- **Type Safety:** Runtime validation complements TypeScript compile-time checks

**Implementation:**
- Use simple in-code validation (no external libraries needed for MVP)
- Validate upload responses before returning from POST /images
- Validate storage metadata before writing to sr-json bucket
- Schema validation failures return 500 Internal Server Error with logged details
- Required field checks: `id`, `sha256`, `uploadedAt`, `source`, `file.size`, `file.mimeType`
- Format pattern checks: ID format (`sha256:{hex}`), SHA256 format (64-char hex)

**Validation Points:**
```typescript
// Before R2 write
const metadata = buildMetadataJSON(...);
validateStorageMetadata(metadata);  // Throws on failure
await env.SR_JSON.put(key, JSON.stringify(metadata));

// Before HTTP response
const response = { id, sha256, uploadedAt, metadata };
validateUploadResponse(response);  // Throws on failure
return Response.json(response, { status: 201 });
```

**Alternatives Considered:**
- **No runtime validation:** Risky, allows invalid data into storage
- **AJV library:** Adds dependency, may not work in V8 Isolates, overkill for MVP
- **Zod validation:** Cleaner but adds dependency, deferred to future refactor

## Risks / Trade-offs

### Risk: SHA256 Hash Collisions
**Impact:** Two different images could theoretically have the same SHA256 hash

**Mitigation:**
- SHA256 collision probability: 2^-256 (astronomically low)
- Server validates SHA256 on upload (detects corruption/tampering)
- Content-addressed storage is industry-standard pattern (Git, IPFS, etc.)

**Likelihood:** Negligible for practical purposes

### Risk: Workers CPU Time Limits
**Impact:** Large images or batch uploads could hit 50ms CPU limit

**Mitigation:**
- Client-side hashing offloads computation
- EXIF extraction with `exifr` is fast (<10ms typical)
- SHA256 via Web Crypto API is optimized
- Monitor with Cloudflare Analytics

**Likelihood:** Low for typical 4-8MB JPEGs

## Migration Plan

### Phase 1: Implementation (This Phase)
1. Implement SHA256 hashing with client optimization
2. Build R2 upload pipeline
3. Test with small batch (100 images)

### Phase 2: D1 Indexing (Next Phase)
1. Add D1 schema and queue-based indexing
2. Enable queryability and deduplication
3. Rebuild existing uploads into D1

### Future Enhancements
1. **Phase 3:** FTS5 full-text search
2. **Phase 4:** OpenAPI documentation
3. **Containers:** Migrate to Go-based containers
4. **pHash64:** Add perceptual hash field for visual similarity
5. **C2PA:** Add content authenticity extraction
6. **Vectorize:** Add AI embeddings for visual search

