# Spec: Image Ingest Phase 4

## ADDED Requirements

### Requirement: OpenAPI Documentation
The system SHALL provide OpenAPI 3.x specification for all image ingest endpoints to enable client developers to understand and integrate with the API.

#### Scenario: Upload endpoint documented
- **WHEN** OpenAPI spec is generated
- **THEN** POST /images endpoint includes request schema (multipart/form-data with file field), authentication (Bearer token), optional headers (X-Client-SHA256, X-Client-BLAKE3, X-Upload-Source), and response schemas (201 Created, 400 Bad Request, 401 Unauthorized, 500 Internal Server Error)

#### Scenario: Deduplication endpoint documented
- **WHEN** OpenAPI spec is generated
- **THEN** HEAD /api/photos/check/:sha256 endpoint includes path parameter (sha256 hash), authentication (Bearer token), response codes (200 OK with X-Stable-ID header, 404 Not Found, 401 Unauthorized), and examples

#### Scenario: Request examples provided
- **WHEN** OpenAPI spec includes examples
- **THEN** each endpoint has example requests with sample files, headers, and authentication tokens

#### Scenario: Response schemas defined
- **WHEN** OpenAPI spec defines responses
- **THEN** JSON response schemas include all fields (sid, sha256, blake3, metadata, uploadedAt) with types and descriptions

#### Scenario: Error responses documented
- **WHEN** OpenAPI spec includes error responses
- **THEN** 400, 401, 500 responses include error message schema with error field and description

#### Scenario: Custom headers documented
- **WHEN** OpenAPI spec describes optional headers
- **THEN** X-Client-SHA256, X-Client-BLAKE3, and X-Upload-Source headers are documented with type (string), format (hex for hashes), and description

#### Scenario: Authentication scheme specified
- **WHEN** OpenAPI spec defines security
- **THEN** Bearer token authentication is specified as required for all endpoints

#### Scenario: OpenAPI spec accessible
- **WHEN** API is deployed
- **THEN** OpenAPI spec is accessible at /api/openapi.json or similar endpoint for client discovery

### Requirement: Reusable Schema Components
The system SHALL define reusable schemas in OpenAPI spec for common data structures.

#### Scenario: Photo schema defined
- **WHEN** OpenAPI spec defines Photo schema
- **THEN** it includes fields: sid, sha256, blake3, takenAt, uploadedAt, cameraMake, cameraModel, lensModel, gpsLat, gpsLon, width, height, mimeType, fileSize, r2Key, source

#### Scenario: Error schema defined
- **WHEN** OpenAPI spec defines Error schema
- **THEN** it includes fields: error (string), message (string)

#### Scenario: UploadResponse schema defined
- **WHEN** OpenAPI spec defines UploadResponse schema
- **THEN** it includes fields: sid, sha256, blake3, uploadedAt, metadata (nested object with file, exif, iptc)

#### Scenario: Schemas referenced across endpoints
- **WHEN** multiple endpoints return Photo objects
- **THEN** they reference the shared Photo schema (DRY principle)

### Requirement: API Examples for Use Cases
The system SHALL provide examples for common use cases in OpenAPI spec.

#### Scenario: PWA upload example
- **WHEN** OpenAPI spec includes PWA upload example
- **THEN** example shows multipart form with file, Bearer token, and optional client hash headers

#### Scenario: Migration script example
- **WHEN** OpenAPI spec includes migration example
- **THEN** example shows X-Upload-Source: migration header and batch upload pattern

#### Scenario: Deduplication workflow example
- **WHEN** OpenAPI spec includes deduplication example
- **THEN** example shows HEAD request before POST, with decision tree (200 → skip, 404 → upload)

#### Scenario: Search query example
- **WHEN** OpenAPI spec includes search example (if endpoint exists)
- **THEN** example shows text search with optional filters (date range, camera)

### Requirement: OpenAPI Spec Validation
The system SHALL validate OpenAPI specification for correctness and completeness.

#### Scenario: Spec validates with OpenAPI 3.x
- **WHEN** OpenAPI spec is created
- **THEN** it validates successfully with OpenAPI 3.x validator (no syntax errors)

#### Scenario: Examples match actual API
- **WHEN** OpenAPI spec examples are defined
- **THEN** examples are tested against actual API endpoints and produce documented responses

#### Scenario: Schemas match implementation
- **WHEN** OpenAPI spec schemas are defined
- **THEN** response schemas match actual API JSON responses (field names, types, structure)

### Requirement: Interactive API Documentation (Optional)
The system SHALL optionally support interactive API documentation using Swagger UI or similar tool.

#### Scenario: Documentation page accessible
- **WHEN** interactive docs are implemented
- **THEN** GET /api/docs endpoint serves Swagger UI or Redoc interface

#### Scenario: Docs load OpenAPI spec
- **WHEN** documentation page loads
- **THEN** it fetches and renders /api/openapi.json specification

#### Scenario: Try It Out functionality
- **WHEN** user interacts with documentation
- **THEN** Swagger UI allows testing endpoints with authentication and file uploads

### Requirement: Client Code Generation Support
The system SHALL provide OpenAPI spec that supports client code generation for multiple languages.

#### Scenario: TypeScript client generation
- **WHEN** OpenAPI spec is used with TypeScript generator
- **THEN** it produces valid TypeScript types and API client functions

#### Scenario: Schema definitions complete
- **WHEN** code generator processes OpenAPI spec
- **THEN** all request and response types are fully defined (no missing fields or types)

#### Scenario: Examples aid generation
- **WHEN** OpenAPI spec includes examples
- **THEN** generated client code includes example usage comments or tests
