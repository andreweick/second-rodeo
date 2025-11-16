# Spec: Image Ingest

## ADDED Requirements

### Requirement: Image Upload with Authentication
The system SHALL accept authenticated image uploads via POST endpoint and return upload confirmation with content-addressed ID.

#### Scenario: Successful authenticated upload
- **WHEN** a client sends a POST request to `/images` with valid Bearer token and image file
- **THEN** the system returns 201 Created with `id` (format: "sha256:..."), `sha256`, and upload metadata

#### Scenario: Missing authentication
- **WHEN** a client sends a POST request without Authorization header
- **THEN** the system returns 401 Unauthorized

#### Scenario: Invalid authentication token
- **WHEN** a client sends a POST request with invalid Bearer token
- **THEN** the system returns 401 Unauthorized

#### Scenario: Invalid file type
- **WHEN** a client uploads a non-image file (e.g., PDF, text)
- **THEN** the system returns 400 Bad Request with error message listing allowed types

#### Scenario: Missing file in request
- **WHEN** a client sends a POST request without a file in form data
- **THEN** the system returns 400 Bad Request

### Requirement: SHA256 Content Hashing
The system SHALL compute SHA256 hash for every uploaded image to enable deduplication and integrity verification.

#### Scenario: Server computes SHA256 hash
- **WHEN** an image is uploaded without client-provided hash
- **THEN** the system computes SHA256 hash from the file buffer using Web Crypto API

#### Scenario: Hash stored in all locations
- **WHEN** hash is computed
- **THEN** SHA256 hash is stored in R2 blob custom headers, metadata JSON, and D1 table

#### Scenario: SHA256 used for deduplication
- **WHEN** checking if image already exists
- **THEN** the system uses SHA256 hash for lookup

### Requirement: Client Hash Optimization
The system SHALL accept optional client-computed SHA256 hash via HTTP header and validate it server-side to enable pre-upload deduplication and reduce Worker CPU usage.

#### Scenario: Client provides valid SHA256
- **WHEN** client sends `X-Client-SHA256` header with correct hash
- **THEN** server computes SHA256, validates match, and uses validated hash

#### Scenario: Client hash mismatch detected
- **WHEN** client-provided hash does not match server computation
- **THEN** system returns 400 Bad Request with "Hash mismatch - possible corruption" error

#### Scenario: Missing client hash
- **WHEN** client does not provide hash header
- **THEN** server computes SHA256 without validation and proceeds normally

### Requirement: Pre-Upload Deduplication
The system SHALL provide a HEAD endpoint to check if an image already exists by SHA256 hash, enabling clients to skip redundant uploads.

#### Scenario: Image already exists
- **WHEN** client sends `HEAD /api/photos/check/:sha256` for existing image
- **THEN** system returns 200 OK with `X-Photo-ID` header containing the ID

#### Scenario: Image does not exist
- **WHEN** client sends `HEAD /api/photos/check/:sha256` for new image
- **THEN** system returns 404 Not Found

#### Scenario: Unauthenticated check request
- **WHEN** client sends HEAD request without valid Bearer token
- **THEN** system returns 401 Unauthorized

#### Scenario: Client workflow optimization
- **WHEN** client computes SHA256 locally and calls check endpoint before upload
- **THEN** client can skip 4MB upload if hash matches existing image, saving bandwidth

### Requirement: Content-Addressed Storage
The system SHALL use SHA256 hash directly as the image identifier, enabling deterministic deduplication and content-addressed storage.

#### Scenario: ID from content hash
- **WHEN** an image is uploaded
- **THEN** ID is generated as `sha256:{hash}` where {hash} is the hex-encoded SHA256

#### Scenario: Deterministic deduplication
- **WHEN** the same image file is uploaded multiple times
- **THEN** the same ID is generated each time (same bytes = same ID)

#### Scenario: R2 key from ID
- **WHEN** storing files in R2
- **THEN** artifact key is `photos/sha256_{hash}.jpg` and metadata key is `photos/sha256_{hash}.json`

#### Scenario: ID uniqueness
- **WHEN** two different images are uploaded
- **THEN** they receive different IDs (SHA256 collision probability is negligible)

### Requirement: EXIF Metadata Extraction
The system SHALL extract comprehensive metadata from uploaded images including camera settings, GPS coordinates, timestamps, and IPTC text fields using the exifr library.

#### Scenario: Extract basic EXIF data
- **WHEN** an image with EXIF data is uploaded
- **THEN** system extracts Make, Model, DateTimeOriginal, ISO, Aperture, ExposureTime, FocalLength

#### Scenario: Extract GPS coordinates
- **WHEN** an image contains GPS metadata
- **THEN** system extracts latitude and longitude as decimal degrees

#### Scenario: Extract IPTC text fields
- **WHEN** an image contains IPTC metadata
- **THEN** system extracts title (ObjectName), caption, keywords, creator, city, country, copyright

#### Scenario: Handle Windows-1252 encoding in IPTC
- **WHEN** IPTC text contains Windows-1252 encoded characters
- **THEN** system decodes to UTF-8 using existing `decodeIptcString()` function

#### Scenario: Missing EXIF data
- **WHEN** an image has no EXIF metadata (e.g., screenshot)
- **THEN** extraction succeeds with empty/undefined fields and upload continues

### Requirement: Parallel R2 Bucket Storage
The system SHALL store image blobs and metadata JSON in separate R2 buckets with identical key structures for separation of concerns.

#### Scenario: Blob stored in sr-artifact
- **WHEN** an image is uploaded with ID `sha256:abc123...` and MIME type `image/jpeg`
- **THEN** blob is written to `sr-artifact/photos/sha256_abc123.jpg`

#### Scenario: Metadata JSON stored in sr-json
- **WHEN** an image is uploaded with ID `sha256:abc123...`
- **THEN** complete metadata JSON is written to `sr-json/photos/sha256_abc123.json`

#### Scenario: File extension matches MIME type
- **WHEN** MIME type is `image/jpeg`, `image/png`, `image/gif`, or `image/webp`
- **THEN** file extension is `.jpg`, `.png`, `.gif`, or `.webp` respectively

#### Scenario: Parallel key structure
- **WHEN** blob key is `photos/sha256_abc123.jpg`
- **THEN** metadata key is `photos/sha256_abc123.json` (same path structure, different bucket)

### Requirement: R2 Custom Metadata Headers
The system SHALL store key metadata in custom HTTP headers (x-amz-*) on blob objects for fast access without fetching the full file.

#### Scenario: Content hash in headers
- **WHEN** blob is written to sr-artifact
- **THEN** header includes `x-amz-sha256` with hex-encoded hash


#### Scenario: Upload timestamp in headers
- **WHEN** blob is written to sr-artifact
- **THEN** header `x-amz-uploaddate` contains ISO8601 timestamp of upload

#### Scenario: Creation date from EXIF
- **WHEN** blob has EXIF DateTimeOriginal
- **THEN** header `x-amz-createdate` contains ISO8601 timestamp from EXIF

#### Scenario: Missing EXIF creation date
- **WHEN** blob has no EXIF DateTimeOriginal
- **THEN** header `x-amz-createdate` is omitted or set to upload date

#### Scenario: Source tracking
- **WHEN** blob is uploaded
- **THEN** header `x-amz-source` is set to "pwa" or "migration" based on upload origin

### Requirement: Metadata JSON Structure
The system SHALL write complete, uncompressed JSON files to sr-json containing full EXIF/IPTC data and computed metadata for web app consumption.

#### Scenario: Complete JSON structure
- **WHEN** metadata JSON is written
- **THEN** it contains fields: `id`, `sha256`, `file` (size, mime, dimensions), `exif`, `iptc`, `uploadedAt`, `source`

#### Scenario: Nested file metadata
- **WHEN** JSON `file` object is written
- **THEN** it includes `originalName`, `size`, `mimeType`, `width`, `height`, `format`

#### Scenario: EXIF object structure
- **WHEN** image has EXIF data
- **THEN** JSON `exif` object includes all extracted fields (make, model, dateTimeOriginal, gps, camera settings)

#### Scenario: IPTC object structure
- **WHEN** image has IPTC data
- **THEN** JSON `iptc` object includes title, caption, keywords (array), creator, city, country, copyright

#### Scenario: Uncompressed JSON for fast reading
- **WHEN** JSON is written to R2
- **THEN** it is stored uncompressed (no gzip) to enable fast web app reads

#### Scenario: JSON overwrite on updates
- **WHEN** metadata is updated (e.g., adding C2PA data later)
- **THEN** the entire JSON file is overwritten with merged data (no event sourcing)

### Requirement: Asynchronous D1 Indexing
The system SHALL index photo metadata to D1 database asynchronously via Cloudflare Queues to avoid Worker CPU time limits and enable fast query responses.

#### Scenario: Queue message sent after R2 writes
- **WHEN** blob and JSON are successfully written to R2
- **THEN** a queue message is sent with `{id, r2Key}` payload

#### Scenario: Client receives fast response
- **WHEN** R2 writes and queue message complete
- **THEN** client receives 201 Created response without waiting for D1 indexing

#### Scenario: Queue consumer processes message
- **WHEN** queue consumer receives photo indexing message
- **THEN** it fetches JSON from sr-json, parses it, and upserts to D1 tables

#### Scenario: Idempotent upserts
- **WHEN** the same queue message is processed multiple times (retry)
- **THEN** D1 record is upserted with `ON CONFLICT(id) DO UPDATE`, preventing duplicates

#### Scenario: Failed indexing retries
- **WHEN** D1 upsert fails (e.g., database busy)
- **THEN** queue automatically retries message delivery per Cloudflare Queues policy

### Requirement: Lightweight D1 Schema
The system SHALL store only queryable fields in D1 main table using Drizzle ORM, with full metadata always available in R2 JSON.

#### Scenario: Main table queryable fields
- **WHEN** photo is indexed to D1 `photos` table
- **THEN** fields include: id, sha256, takenAt, uploadedAt, cameraMake, cameraModel, gpsLat, gpsLon, width, height, mimeType, fileSize, hasC2pa, r2Key, source

#### Scenario: EXIF fields excluded from D1
- **WHEN** photo has 200+ EXIF fields
- **THEN** only ~15 queryable fields are indexed to D1; full data remains in R2

#### Scenario: Indexes for common queries
- **WHEN** D1 table is created
- **THEN** indexes exist on: taken_at, (camera_make, camera_model), (gps_lat, gps_lon), source

#### Scenario: Timestamp fields as Unix epoch
- **WHEN** timestamps are stored in D1
- **THEN** they use Drizzle `integer({ mode: 'timestamp' })` for efficient range queries

#### Scenario: GPS fields as real numbers
- **WHEN** GPS coordinates are stored
- **THEN** latitude and longitude are stored as REAL (floating-point) for proximity queries

### Requirement: Full-Text Search with FTS5
The system SHALL provide full-text search on photo captions, titles, keywords, and locations using SQLite FTS5 virtual table.

#### Scenario: FTS5 virtual table created
- **WHEN** database schema is initialized
- **THEN** `photos_fts` FTS5 virtual table exists with tokenize='porter'

#### Scenario: Searchable text fields
- **WHEN** FTS5 table is populated
- **THEN** it includes fields: title, caption, keywords (space-separated), creator, city, country, camera_make, camera_model

#### Scenario: ID as join key only
- **WHEN** FTS5 table is created
- **THEN** `id` field is marked UNINDEXED (used only for joining, not searching)

#### Scenario: Text search query
- **WHEN** user searches for "sunset beach"
- **THEN** query is `SELECT p.* FROM photos p JOIN photos_fts fts ON p.id = fts.id WHERE photos_fts MATCH 'sunset beach' ORDER BY rank`

#### Scenario: FTS5 ranking
- **WHEN** search matches multiple photos
- **THEN** results are ordered by FTS5 relevance ranking

#### Scenario: Upsert to FTS5 on indexing
- **WHEN** queue consumer indexes a photo
- **THEN** both `photos` table and `photos_fts` table are updated in same transaction

### Requirement: Deduplication by Content Hash
The system SHALL prevent duplicate uploads by detecting existing images via SHA256 lookup before writing to R2.

#### Scenario: Duplicate detected by SHA256
- **WHEN** uploaded image SHA256 matches existing photo in D1
- **THEN** system returns 200 OK with existing ID and message "Image already exists"

#### Scenario: New image uploaded
- **WHEN** uploaded image SHA256 does not exist in D1
- **THEN** system proceeds with R2 writes and queue message

#### Scenario: Deduplication saves storage
- **WHEN** duplicate image is detected
- **THEN** no new R2 objects are created, saving storage costs

#### Scenario: Client-side deduplication
- **WHEN** client calls `HEAD /api/photos/check/:sha256` before upload
- **THEN** client can skip upload entirely if hash matches, saving bandwidth

### Requirement: Source Tracking
The system SHALL track the upload source (PWA or migration) for each photo to enable analytics and troubleshooting.

#### Scenario: Source from upload origin
- **WHEN** image is uploaded from PWA
- **THEN** source field is set to "pwa"

#### Scenario: Source for migration
- **WHEN** image is uploaded via migration script
- **THEN** source field is set to "migration"

#### Scenario: Source stored in all locations
- **WHEN** source is determined
- **THEN** it is stored in R2 blob header (x-amz-source), metadata JSON, and D1 table

#### Scenario: Query by source
- **WHEN** user queries photos by source
- **THEN** D1 index on `source` field enables fast filtering

### Requirement: Error Handling and Validation
The system SHALL validate all inputs and provide clear error messages for debugging and client feedback.

#### Scenario: Large file size limit
- **WHEN** uploaded file exceeds size limit (e.g., 50MB)
- **THEN** system returns 400 Bad Request with "File size exceeds limit" message

#### Scenario: Corrupt image file
- **WHEN** EXIF extraction fails on corrupt file
- **THEN** system returns 400 Bad Request with "Metadata extraction failed" error

#### Scenario: R2 write failure
- **WHEN** R2 bucket is unavailable or write fails
- **THEN** system returns 500 Internal Server Error and logs detailed error

#### Scenario: Queue send failure
- **WHEN** queue message fails to send
- **THEN** system logs error but still returns 201 Created (indexing can retry)

#### Scenario: Detailed error logging
- **WHEN** any error occurs
- **THEN** system logs error with context: id, sha256, operation, timestamp

### Requirement: Future C2PA Extension
The system SHALL support future addition of C2PA content authenticity data without breaking changes to schema or API.

#### Scenario: C2PA field reserved in JSON
- **WHEN** metadata JSON is written
- **THEN** structure allows adding `c2pa` object in future without breaking clients

#### Scenario: C2PA flag in D1
- **WHEN** photos table is created
- **THEN** `has_c2pa` boolean field defaults to false, ready for future updates

#### Scenario: JSON overwrite for C2PA updates
- **WHEN** C2PA data is extracted later
- **THEN** existing JSON is read, merged with C2PA data, and overwritten

#### Scenario: No schema migration for C2PA
- **WHEN** C2PA feature is added
- **THEN** no D1 migration required (field already exists), only JSON update needed

### Requirement: Rebuildable D1 Index
The system SHALL treat D1 as a rebuildable cache, with R2 JSON as the authoritative source of truth.

#### Scenario: D1 rebuilt from R2
- **WHEN** D1 database is corrupted or needs reset
- **THEN** full index can be rebuilt by scanning sr-json bucket and reprocessing all JSON files

#### Scenario: R2 JSON is immutable truth
- **WHEN** conflict exists between D1 and R2
- **THEN** R2 JSON is authoritative, D1 is updated to match

#### Scenario: Web app fetches from R2
- **WHEN** web app needs full photo metadata
- **THEN** it queries D1 for lists but fetches complete JSON from R2 for detail views

#### Scenario: Disaster recovery
- **WHEN** D1 database is lost
- **THEN** no data loss occurs; all metadata can be restored from sr-json bucket

### Requirement: OpenAPI Documentation
The system SHALL provide OpenAPI 3.x specification for all image ingest endpoints to enable client developers to understand and integrate with the API.

#### Scenario: Upload endpoint documented
- **WHEN** OpenAPI spec is generated
- **THEN** POST /images endpoint includes request schema (multipart/form-data with file field), authentication (Bearer token), optional headers (X-Client-SHA256, X-Client-BLAKE3), and response schemas (201 Created, 400 Bad Request, 401 Unauthorized, 500 Internal Server Error)

#### Scenario: Deduplication endpoint documented
- **WHEN** OpenAPI spec is generated
- **THEN** HEAD /api/photos/check/:sha256 endpoint includes path parameter (sha256 hash), authentication (Bearer token), and response codes (200 OK with X-Stable-ID header, 404 Not Found, 401 Unauthorized)

#### Scenario: Request examples provided
- **WHEN** OpenAPI spec includes examples
- **THEN** each endpoint has example requests with sample files, headers, and authentication tokens

#### Scenario: Response schemas defined
- **WHEN** OpenAPI spec defines responses
- **THEN** JSON response schemas include all fields (id, sha256, metadata, uploadedAt) with types and descriptions

#### Scenario: Error responses documented
- **WHEN** OpenAPI spec includes error responses
- **THEN** 400, 401, 500 responses include error message schema with error field and description

#### Scenario: Custom headers documented
- **WHEN** OpenAPI spec describes optional headers
- **THEN** X-Client-SHA256 header is documented with type (string), format (hex), and description

#### Scenario: Authentication scheme specified
- **WHEN** OpenAPI spec defines security
- **THEN** Bearer token authentication is specified as required for all endpoints

#### Scenario: OpenAPI spec accessible
- **WHEN** API is deployed
- **THEN** OpenAPI spec is accessible at /api/openapi.json or similar endpoint for client discovery
