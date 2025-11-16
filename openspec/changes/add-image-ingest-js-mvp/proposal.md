# Proposal: Image Ingest JavaScript MVP

## Why

The current image upload endpoint is a mock implementation for testing. We need a production-ready image ingestion system that:

- Preserves photo metadata (EXIF, IPTC, GPS) for the digital archive
- Enables efficient deduplication to save bandwidth during migration of 50k legacy images
- Supports searchable metadata for finding photos by date, location, camera, and text content
- Provides a foundation for future enhancements (C2PA authenticity, perceptual hashing, AI embeddings)

## What Changes

### New Capabilities
- **Content-Addressed Storage**: SHA256-based IDs for deterministic deduplication
- **SHA256 Content Hashing**: SHA256 computed client-side (optional) and validated server-side
- **Pre-Upload Deduplication**: HEAD endpoint to check if image already exists before uploading
- **Parallel R2 Storage**: Blobs in `sr-artifact` bucket, metadata JSON in `sr-json` bucket (same key structure)
- **Custom R2 Metadata**: x-amz headers for hashes, timestamps, and source tracking
- **Full-Text Search**: SQLite FTS5 index on photo captions, titles, keywords, and locations
- **Async D1 Indexing**: Queue-based lightweight indexing for fast queries

### Replaced Components
- `apps/api/src/services/image-upload.ts` - Complete rewrite with production logic
- `POST /images` endpoint - Replace mock with full implementation

### New Components
- `HEAD /api/photos/check/:sha256` - Pre-upload deduplication endpoint
- Queue consumer for D1 indexing
- Drizzle ORM schema for photos + FTS5 virtual table
- OpenAPI 3.x specification for all endpoints

### Dependencies
- Use existing: `exifr`, Drizzle ORM, Cloudflare Queues
- SHA256 available via Web Crypto API (no additional dependencies)

## Impact

### Affected Specs
- **NEW**: `image-ingest` capability (this proposal)

### Affected Code
- `apps/api/src/services/image-upload.ts` - Complete rewrite
- `apps/api/src/handlers/http.ts` - Add deduplication endpoint
- `apps/api/src/handlers/queue.ts` - Add photo indexing consumer
- `apps/api/src/db/schema.ts` - Add photos tables

### Non-Breaking
This is a new capability with no breaking changes to existing systems. The current queue-based architecture for other content types remains unchanged.

### Future Extensions
Design explicitly supports:
- **Perceptual hashing (pHash)** - Can recalculate SIDs when containers are added
- **C2PA content authenticity** - Metadata JSON designed to be overwritten with C2PA data
- **Vector embeddings** - D1 schema can be extended for Vectorize integration
- **Container architecture** - JavaScript implementation can be replaced with Go containers later
