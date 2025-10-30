# Proposal: Image Ingest Phase 1 - Upload Core

## Why

The current image upload endpoint is a mock implementation for testing. Phase 1 establishes the complete upload pipeline with production-ready hashing, metadata extraction, deduplication, and R2 storage. This phase focuses on getting the core upload right with proper SID generation (used elsewhere in the system) and efficient client-side optimization.

Key goals:
- Preserve photo metadata (EXIF, IPTC, GPS) for the digital archive
- Enable efficient deduplication to save bandwidth during migration of 50k legacy images
- Establish stable asset IDs (SID) that are deterministic and used across other systems
- Write once to R2 with complete metadata headers (no rewrites later)

## What Changes

### New Capabilities
- **Dual Content Hashing**: BLAKE3 + SHA256 computed client-side (optional) and validated server-side
- **Pre-Upload Deduplication**: HEAD endpoint to check if image already exists before uploading
- **Parallel R2 Storage**: Blobs in `sr-artifact` bucket, metadata JSON in `sr-json` bucket (same key structure)
- **Stable Asset IDs (SID)**: Deterministic IDs based on content hash + EXIF metadata using UUIDv5
- **Custom R2 Metadata**: x-amz headers for hashes, timestamps, and stable IDs
- **Client Hash Optimization**: Optional X-Client-SHA256 and X-Client-BLAKE3 headers to offload computation

### Replaced Components
- `apps/api/src/services/image-upload.ts` - Complete rewrite with production logic
- `POST /images` endpoint - Replace mock with full implementation

### New Components
- `HEAD /api/photos/check/:sha256` - Pre-upload deduplication endpoint
- `apps/api/src/services/hash.ts` - Hash computation utilities
- `apps/api/src/services/sid.ts` - Stable ID generation
- `apps/api/src/services/metadata-json.ts` - Metadata JSON builder

### Dependencies
- Add BLAKE3 hashing library (`@noble/hashes`)
- Use existing: `exifr`, Cloudflare R2

## Impact

### Affected Specs
- **NEW**: `image-ingest` capability (Phase 1 requirements)

### Affected Code
- `apps/api/src/services/image-upload.ts` - Complete rewrite
- `apps/api/src/handlers/http.ts` - Add deduplication endpoint, update upload endpoint
- `apps/api/package.json` - Add BLAKE3 dependency

### Non-Breaking
This is a new capability with no breaking changes. The mock endpoint is replaced with production implementation.

### Future Phases
This proposal is part 1 of 4:
- **Phase 1** (this): Upload core with hashing, SID, deduplication, R2 storage
- **Phase 2**: D1 async indexing for queries
- **Phase 3**: Full-text search with FTS5
- **Phase 4**: OpenAPI documentation

Design decisions made here (SID algorithm, dual hashing, R2 structure) support all future phases.
