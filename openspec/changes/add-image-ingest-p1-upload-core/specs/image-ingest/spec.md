# Spec: Image Ingest Phase 1

## ADDED Requirements

### Requirement: Image Upload with Authentication
The system SHALL accept authenticated image uploads via POST endpoint and return upload confirmation with content-addressed ID.

#### Scenario: Successful authenticated upload
- **WHEN** a client sends a POST request to `/images` with valid Bearer token and image file
- **THEN** the system returns 201 Created with `id` (format: `sha256:...`), `sha256`, and upload metadata

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
The system SHALL compute SHA256 hash for every uploaded image using the Web Crypto API to enable content-addressed storage and deduplication.

#### Scenario: Server computes SHA256 hash
- **WHEN** an image is uploaded without client-provided hash
- **THEN** the system computes SHA256 hash from the file buffer using Web Crypto API

#### Scenario: Hash stored in all locations
- **WHEN** hash is computed
- **THEN** SHA256 hash is stored in R2 blob custom headers and metadata JSON

#### Scenario: SHA256 used for ID generation
- **WHEN** generating content-addressed ID
- **THEN** the system uses format `sha256:{hex}` where {hex} is the hex-encoded SHA256 hash

### Requirement: Client Hash Optimization
The system SHALL accept optional client-computed SHA256 hash via HTTP header and validate it server-side to reduce Worker CPU usage.

#### Scenario: Client provides valid SHA256
- **WHEN** client sends `X-Client-SHA256` header with correct hash
- **THEN** server computes SHA256, validates match, and uses validated hash

#### Scenario: Client hash mismatch detected
- **WHEN** client-provided hash does not match server computation
- **THEN** system returns 400 Bad Request with "Hash mismatch - possible corruption" error

#### Scenario: Missing client hash
- **WHEN** client does not provide `X-Client-SHA256` header
- **THEN** server computes SHA256 hash without validation and proceeds normally

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
- **THEN** they receive different IDs (different bytes = different SHA256)

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
- **THEN** header `x-amz-sha256` contains hex-encoded SHA256 hash

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
- **WHEN** metadata is updated (e.g., adding fields in future phases)
- **THEN** the entire JSON file is overwritten with merged data (no event sourcing)

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

#### Scenario: Detailed error logging
- **WHEN** any error occurs
- **THEN** system logs error with context: id, sha256, operation, timestamp

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
- **THEN** it is stored in R2 blob header (x-amz-source) and metadata JSON
