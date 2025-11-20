# Proposal: Image Ingest Phase 4 - API Documentation

## Why

Phases 1-3 implemented the complete image ingestion system (upload, indexing, search). Phase 4 provides comprehensive API documentation using OpenAPI 3.x specification to enable client developers (PWA, CLI tools, migration scripts) to integrate with the image ingest endpoints.

Key goals:
- Document all image ingest endpoints with request/response schemas
- Provide examples for common use cases
- Enable API client generation from OpenAPI spec
- Support future API evolution with versioning

## What Changes

### New Capabilities
- **OpenAPI 3.x Specification**: Complete API documentation for image ingest endpoints
- **Request/Response Schemas**: Detailed schemas for all endpoints (upload, deduplication, search)
- **Examples and Use Cases**: Sample requests for PWA uploads, migration scripts, search queries
- **API Endpoint**: Serve OpenAPI spec at `/api/openapi.json` or `/api/docs`

### New Components
- `apps/api/openapi.yaml` (or `.json`) - OpenAPI 3.x specification file
- `apps/api/src/handlers/http.ts` - Add endpoint to serve OpenAPI spec

### Dependencies
- OpenAPI spec validator (optional for CI)

## Impact

### Affected Specs
- **MODIFIED**: `image-ingest` capability (Phase 4 requirements)

### Affected Code
- Create OpenAPI specification file
- `apps/api/src/handlers/http.ts` - Add GET /api/openapi.json endpoint (optional)

### Non-Breaking
This phase is purely additive (documentation). No changes to existing functionality.

### Future Phases
This proposal is part 4 of 4:
- **Phase 1** (complete): Upload core with SHA256 hashing, content-addressed IDs, R2 storage
- **Phase 2** (complete): D1 async indexing for queries and deduplication
- **Phase 3** (complete): Full-text search with FTS5
- **Phase 4** (this): OpenAPI documentation

This completes the image ingestion system.
