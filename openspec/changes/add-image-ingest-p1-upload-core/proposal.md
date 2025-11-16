# Proposal: Image Ingest Phase 1 - Upload Core

## Why

The current image upload endpoint is a mock implementation for testing. Phase 1 establishes the complete upload pipeline with production-ready hashing, metadata extraction, and R2 storage. This phase focuses on getting the core upload right with content-addressed IDs and efficient client-side optimization.

Key goals:
- Preserve photo metadata (EXIF, IPTC, GPS) for the digital archive
- Establish content-addressed IDs using SHA256 (consistent with other content types)
- Write once to R2 with complete metadata headers (no rewrites later)
- Support efficient deduplication in Phase 2 (D1 indexing)

## What Changes

### New Capabilities
- **Content-Addressed Storage**: SHA256-based IDs for deterministic deduplication
- **SHA256 Content Hashing**: SHA256 computed client-side (optional) and validated server-side
- **Parallel R2 Storage**: Blobs in `sr-artifact` bucket, metadata JSON in `sr-json` bucket (same key structure)
- **Custom R2 Metadata**: x-amz headers for hashes, timestamps, and source tracking
- **Client Hash Optimization**: Optional X-Client-SHA256 header to offload computation

### Replaced Components
- `apps/api/src/services/image-upload.ts` - Complete rewrite with production logic
- `POST /images` endpoint - Replace mock with full implementation

### New Components
- `apps/api/src/services/hash.ts` - SHA256 hash computation utilities
- `apps/api/src/services/metadata-json.ts` - Metadata JSON builder

### Dependencies
- Use existing: `exifr`, Cloudflare R2
- SHA256 available via Web Crypto API (no additional dependencies)

## Impact

### Affected Specs
- **NEW**: `image-ingest` capability (Phase 1 requirements)

### Affected Code
- `apps/api/src/services/image-upload.ts` - Complete rewrite
- `apps/api/src/handlers/http.ts` - Update upload endpoint

### Non-Breaking
This is a new capability with no breaking changes. The mock endpoint is replaced with production implementation.

### Future Phases
This proposal is part 1 of 4:
- **Phase 1** (this): Upload core with SHA256 hashing, R2 storage
- **Phase 2**: D1 async indexing for queries and deduplication
- **Phase 3**: Full-text search with FTS5
- **Phase 4**: OpenAPI documentation

Design decisions made here (SHA256 IDs, R2 structure, metadata JSON format) support all future phases.
