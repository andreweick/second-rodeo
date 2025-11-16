# Spec: Image Ingest Phase 2

## ADDED Requirements

### Requirement: Asynchronous D1 Indexing
The system SHALL index photo metadata to D1 database asynchronously via Cloudflare Queues to avoid Worker CPU time limits and enable fast query responses.

#### Scenario: Queue message sent after R2 writes
- **WHEN** blob and JSON are successfully written to R2
- **THEN** a queue message is sent with `{type: 'photo', id, r2Key}` payload

#### Scenario: Client receives fast response
- **WHEN** R2 writes and queue message complete
- **THEN** client receives 201 Created response without waiting for D1 indexing

#### Scenario: Queue consumer processes message
- **WHEN** queue consumer receives photo indexing message
- **THEN** it fetches JSON from sr-json, parses it, and upserts to D1 photos table

#### Scenario: Idempotent upserts
- **WHEN** the same queue message is processed multiple times (retry)
- **THEN** D1 record is upserted with `ON CONFLICT(id) DO UPDATE`, preventing duplicates

#### Scenario: Failed indexing retries
- **WHEN** D1 upsert fails (e.g., database busy)
- **THEN** queue automatically retries message delivery per Cloudflare Queues policy

#### Scenario: Upload succeeds despite queue failure
- **WHEN** queue message send fails
- **THEN** upload still returns 201 Created (R2 writes succeeded), error is logged

### Requirement: Lightweight D1 Schema
The system SHALL store only queryable fields in D1 photos table using Drizzle ORM, with full metadata always available in R2 JSON.

#### Scenario: Main table queryable fields
- **WHEN** photo is indexed to D1 `photos` table
- **THEN** fields include: id (sha256:...), sha256, takenAt, uploadedAt, cameraMake, cameraModel, lensModel, gpsLat, gpsLon, width, height, mimeType, fileSize, r2Key, source, createdAt, updatedAt

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

### Requirement: Basic Photo Queries
The system SHALL provide basic query functions for filtering photos by date, camera, location, and source.

#### Scenario: Query by date range
- **WHEN** querying photos between two dates
- **THEN** D1 query uses `WHERE taken_at BETWEEN ? AND ?` with index on taken_at

#### Scenario: Query by camera make and model
- **WHEN** querying photos by camera
- **THEN** D1 query uses `WHERE camera_make = ? AND camera_model = ?` with composite index

#### Scenario: Query by GPS location
- **WHEN** querying photos near a location
- **THEN** D1 query uses bounding box `WHERE gps_lat BETWEEN ? AND ? AND gps_lon BETWEEN ? AND ?`

#### Scenario: Query by source
- **WHEN** querying photos by upload source (pwa or migration)
- **THEN** D1 query uses `WHERE source = ?` with index on source

#### Scenario: Pagination support
- **WHEN** queries return many results
- **THEN** queries support `LIMIT` and `OFFSET` for pagination

## MODIFIED Requirements

### Requirement: Pre-Upload Deduplication Endpoint
The system SHALL provide a HEAD endpoint to check if an image already exists by SHA256 hash, enabling clients to skip redundant uploads.

#### Scenario: Image already exists
- **WHEN** client sends `HEAD /api/photos/check/:sha256` for existing image
- **THEN** system queries D1 photos table and returns 200 OK with `X-Photo-ID` header containing the content-addressed ID

#### Scenario: Image does not exist
- **WHEN** client sends `HEAD /api/photos/check/:sha256` for new image
- **THEN** system queries D1 and returns 404 Not Found

#### Scenario: Unauthenticated check request
- **WHEN** client sends HEAD request without valid Bearer token
- **THEN** system returns 401 Unauthorized

#### Scenario: Client workflow optimization
- **WHEN** client computes SHA256 locally and calls check endpoint before upload
- **THEN** client can skip 4MB upload if hash matches existing image, saving bandwidth

#### Scenario: Eventual consistency edge case
- **WHEN** photo was just uploaded but not yet indexed to D1
- **THEN** deduplication endpoint may return 404 (acceptable - client uploads again, dedup happens server-side via SHA256)

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

#### Scenario: Server-side deduplication fallback
- **WHEN** client skips HEAD check and uploads duplicate
- **THEN** server detects duplicate during upload (D1 query) and returns existing ID
