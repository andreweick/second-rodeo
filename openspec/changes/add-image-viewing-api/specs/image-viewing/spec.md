# Spec: Image Viewing API

## ADDED Requirements

### Requirement: Signed URL Generation with Authentication
The system SHALL provide an authenticated API endpoint to generate time-limited signed URLs for images with configurable expiration.

#### Scenario: Generate signed URL for single image
- **WHEN** authenticated client sends GET request to `/api/photos/:sid/url` with valid Bearer token
- **THEN** system returns 200 OK with JSON containing `url` (signed Cloudflare Image Resizing URL) and `expiresAt` (ISO8601 timestamp)

#### Scenario: Generate signed URL with transform parameters
- **WHEN** authenticated client sends GET request to `/api/photos/:sid/url?width=800&format=webp&quality=85`
- **THEN** returned URL includes width, format, quality, and metadata=none parameters

#### Scenario: Missing authentication
- **WHEN** client sends request to `/api/photos/:sid/url` without Authorization header
- **THEN** system returns 401 Unauthorized

#### Scenario: Invalid Bearer token
- **WHEN** client sends request with incorrect Bearer token
- **THEN** system returns 401 Unauthorized

#### Scenario: Photo does not exist
- **WHEN** client requests URL for non-existent SID
- **THEN** system returns 404 Not Found

#### Scenario: Default expiration is 30 days
- **WHEN** client requests URL without expiration parameter
- **THEN** returned URL expires 30 days from generation time

### Requirement: Responsive Image Set Generation
The system SHALL generate multiple signed URLs for different image sizes in a single API call to enable responsive image delivery.

#### Scenario: Generate responsive image set
- **WHEN** authenticated client sends GET request to `/api/photos/:sid/url?sizes=400,800,1200`
- **THEN** system returns JSON with `urls` object containing keys "400", "800", "1200" with corresponding signed URLs and `srcset` string formatted for HTML

#### Scenario: srcset format for HTML consumption
- **WHEN** responsive image set is generated with sizes 400,800,1200
- **THEN** `srcset` field contains: `"https://...width=400 400w, https://...width=800 800w, https://...width=1200 1200w"`

#### Scenario: Single size in sizes parameter
- **WHEN** client requests `?sizes=800`
- **THEN** system returns single URL in urls object and srcset with one entry

#### Scenario: Invalid sizes parameter
- **WHEN** client requests `?sizes=invalid`
- **THEN** system returns 400 Bad Request with error message

#### Scenario: Combine sizes with format and quality
- **WHEN** client requests `?sizes=400,800&format=webp&quality=80`
- **THEN** all generated URLs include format=webp and quality=80 parameters

### Requirement: Time-Bucketed HMAC Signature Generation
The system SHALL use time-bucketed HMAC-SHA256 signatures to maximize CDN cache hit rates while maintaining security.

#### Scenario: Same signature within time bucket
- **WHEN** two URLs are generated for same photo within the same daily bucket
- **THEN** both URLs have identical signature components (only differing in transform parameters)

#### Scenario: Different signatures across buckets
- **WHEN** URLs are generated for same photo in different daily buckets
- **THEN** signatures differ even for identical transform parameters

#### Scenario: Signature includes photo identifier
- **WHEN** signature is generated
- **THEN** HMAC input includes SID, expiration bucket timestamp, and SIGNING_SECRET

#### Scenario: Signature validation uses constant-time comparison
- **WHEN** system validates incoming signature
- **THEN** comparison uses constant-time algorithm to prevent timing attacks

#### Scenario: Time bucket is daily by default
- **WHEN** URL is generated without custom bucket parameter
- **THEN** bucket timestamp is midnight UTC of the expiration date

### Requirement: Public Image Serving with Signature Validation
The system SHALL serve images via Cloudflare Image Resizing after validating time-limited signatures without requiring authentication.

#### Scenario: Valid signature serves image
- **WHEN** client requests `GET /api/photos/:sid?signature=abc&expires=123456&width=800&metadata=none`
- **THEN** system validates signature and returns image via Cloudflare Image Resizing with 200 OK

#### Scenario: Invalid signature rejected
- **WHEN** client requests image with incorrect signature
- **THEN** system returns 403 Forbidden with error message "Invalid signature"

#### Scenario: Expired signature rejected
- **WHEN** client requests image with valid signature but expires timestamp in the past
- **THEN** system returns 403 Forbidden with error message "URL expired"

#### Scenario: Missing signature parameter
- **WHEN** client requests image without signature parameter
- **THEN** system returns 400 Bad Request

#### Scenario: Tampered URL detected
- **WHEN** client modifies URL parameters (e.g., changes width) after signature generation
- **THEN** signature validation fails and system returns 403 Forbidden

#### Scenario: No authentication required for signed URLs
- **WHEN** client requests image with valid signature
- **THEN** image is served without checking Authorization header (publicly shareable)

### Requirement: Automatic Metadata Stripping for Privacy
The system SHALL remove all EXIF and IPTC metadata from served images using Cloudflare Image Resizing metadata parameter.

#### Scenario: All served images strip metadata
- **WHEN** signed URL is generated
- **THEN** URL includes `metadata=none` parameter

#### Scenario: GPS coordinates removed from served images
- **WHEN** image with GPS EXIF data is served via signed URL
- **THEN** served image contains no GPS metadata

#### Scenario: Camera information removed from served images
- **WHEN** image with camera make/model EXIF is served
- **THEN** served image contains no camera metadata

#### Scenario: Original metadata preserved in R2
- **WHEN** metadata is stripped from served images
- **THEN** original metadata JSON in R2 remains unchanged

#### Scenario: Metadata stripping works with all formats
- **WHEN** JPEG, PNG, or WebP images are served
- **THEN** all formats have metadata stripped (PNG/WebP always strip, JPEG via metadata=none)

### Requirement: Cloudflare Image Resizing Integration
The system SHALL use Cloudflare Image Resizing to transform images on-the-fly with width, height, format, and quality parameters.

#### Scenario: Width parameter resizes image
- **WHEN** URL includes `width=800`
- **THEN** served image has width of 800 pixels (proportional height)

#### Scenario: Height parameter resizes image
- **WHEN** URL includes `height=600`
- **THEN** served image has height of 600 pixels (proportional width)

#### Scenario: Format conversion to WebP
- **WHEN** URL includes `format=webp`
- **THEN** served image is converted to WebP format

#### Scenario: Format conversion to AVIF
- **WHEN** URL includes `format=avif`
- **THEN** served image is converted to AVIF format

#### Scenario: Quality parameter controls compression
- **WHEN** URL includes `quality=80`
- **THEN** served image uses 80% quality compression

#### Scenario: Multiple parameters combined
- **WHEN** URL includes `width=1200&format=webp&quality=85&metadata=none`
- **THEN** image is resized to 1200px width, converted to WebP, compressed at 85% quality, with metadata stripped

#### Scenario: Invalid transform parameter ignored
- **WHEN** URL includes invalid parameter value
- **THEN** Cloudflare Image Resizing uses default and serves image

### Requirement: Photo Listing with Filters and Pagination
The system SHALL provide an authenticated API endpoint to list photos with date range, camera, location, source filters and cursor-based pagination.

#### Scenario: List recent photos
- **WHEN** authenticated client sends GET request to `/api/photos?limit=50`
- **THEN** system queries D1 and returns JSON array of 50 most recent photos ordered by `takenAt` DESC

#### Scenario: Filter by date range
- **WHEN** client sends `/api/photos?start_date=2024-01-01&end_date=2024-12-31`
- **THEN** system returns only photos with `takenAt` between those dates

#### Scenario: Filter by camera make and model
- **WHEN** client sends `/api/photos?camera_make=Canon&camera_model=EOS R5`
- **THEN** system returns only photos matching camera make and model

#### Scenario: Filter by source
- **WHEN** client sends `/api/photos?source=pwa`
- **THEN** system returns only photos uploaded from PWA (not migration)

#### Scenario: Filter by GPS bounding box
- **WHEN** client sends `/api/photos?min_lat=40.0&max_lat=41.0&min_lon=-74.0&max_lon=-73.0`
- **THEN** system returns only photos within GPS bounding box

#### Scenario: Cursor-based pagination
- **WHEN** client sends `/api/photos?limit=50&cursor=sid_xyz123`
- **THEN** system returns next 50 photos after the cursor SID

#### Scenario: Response includes pagination metadata
- **WHEN** listing returns results
- **THEN** response includes `data` array, `nextCursor` (null if last page), and `hasMore` boolean

#### Scenario: Combine multiple filters
- **WHEN** client sends `/api/photos?start_date=2024-01-01&camera_make=Canon&source=pwa&limit=20`
- **THEN** system applies all filters with AND logic

#### Scenario: Empty results
- **WHEN** filters match no photos
- **THEN** system returns 200 OK with empty `data` array and `hasMore: false`

#### Scenario: Invalid date format
- **WHEN** client sends invalid date in start_date or end_date
- **THEN** system returns 400 Bad Request with error message

### Requirement: Full-Text Search via FTS5
The system SHALL provide an authenticated API endpoint for full-text search across photo captions, titles, keywords, and locations using D1 FTS5.

#### Scenario: Search photo captions
- **WHEN** authenticated client sends GET request to `/api/photos/search?q=sunset+beach`
- **THEN** system queries `photos_fts` table and returns photos matching "sunset beach" ordered by relevance rank

#### Scenario: Search photo titles
- **WHEN** client searches for text that appears in photo titles
- **THEN** matching photos are returned ranked by FTS5 relevance

#### Scenario: Search photo keywords
- **WHEN** client searches for IPTC keywords
- **THEN** photos with matching keywords are returned

#### Scenario: Search location names
- **WHEN** client searches for city or country names
- **THEN** photos taken in those locations are returned

#### Scenario: Multi-word search query
- **WHEN** client sends `?q=summer+vacation+italy`
- **THEN** FTS5 matches photos containing all terms with highest relevance first

#### Scenario: Search with pagination
- **WHEN** client sends `/api/photos/search?q=sunset&limit=20&cursor=sid_abc`
- **THEN** system returns paginated search results starting after cursor

#### Scenario: Empty search query
- **WHEN** client sends `/api/photos/search` without q parameter
- **THEN** system returns 400 Bad Request with error message

#### Scenario: No search results
- **WHEN** search query matches no photos
- **THEN** system returns 200 OK with empty results array

#### Scenario: Search joins main table
- **WHEN** FTS5 search completes
- **THEN** results include fields from main `photos` table via JOIN on SID

### Requirement: Metadata JSON Retrieval from R2
The system SHALL provide an authenticated API endpoint to fetch complete metadata JSON files from R2 for detail views.

#### Scenario: Fetch complete metadata JSON
- **WHEN** authenticated client sends GET request to `/api/photos/:sid/metadata`
- **THEN** system fetches JSON from `sr-json/photos/:sid.json` and returns with 200 OK

#### Scenario: Metadata includes all EXIF fields
- **WHEN** metadata JSON is returned
- **THEN** response includes complete EXIF object with all extracted fields

#### Scenario: Metadata includes IPTC fields
- **WHEN** metadata JSON is returned
- **THEN** response includes IPTC object with title, caption, keywords, creator, location

#### Scenario: Metadata includes file information
- **WHEN** metadata JSON is returned
- **THEN** response includes file object with originalName, size, mimeType, width, height

#### Scenario: Metadata includes computed hashes
- **WHEN** metadata JSON is returned
- **THEN** response includes sha256, blake3, and sid fields

#### Scenario: Photo metadata not found in R2
- **WHEN** client requests metadata for SID that exists in D1 but not in R2
- **THEN** system returns 404 Not Found

#### Scenario: Missing authentication for metadata
- **WHEN** client requests metadata without Bearer token
- **THEN** system returns 401 Unauthorized

### Requirement: Efficient Caching with HTTP Headers
The system SHALL set appropriate Cache-Control and ETag headers to maximize CDN cache efficiency and reduce bandwidth usage.

#### Scenario: Long cache duration for signed images
- **WHEN** image is served via valid signed URL
- **THEN** response includes `Cache-Control: public, max-age=2592000` (30 days)

#### Scenario: ETag based on content hash
- **WHEN** image is served
- **THEN** response includes `ETag: "sha256-<hash>"` header

#### Scenario: Conditional request with If-None-Match
- **WHEN** client sends request with `If-None-Match: "sha256-abc123"`
- **THEN** system returns 304 Not Modified if ETag matches

#### Scenario: Immutable cache for signed URLs
- **WHEN** signed URL is served
- **THEN** Cache-Control includes `immutable` directive (URL changes when content changes)

#### Scenario: No cache for metadata JSON
- **WHEN** metadata JSON is served
- **THEN** response includes `Cache-Control: private, no-cache` (frequently updated)

#### Scenario: Vary header for content negotiation
- **WHEN** image supports multiple formats
- **THEN** response includes `Vary: Accept` header for proper caching

### Requirement: Error Handling and Validation
The system SHALL validate all inputs and provide clear error messages for debugging and client feedback.

#### Scenario: Invalid SID format
- **WHEN** client provides malformed SID
- **THEN** system returns 400 Bad Request with "Invalid SID format" error

#### Scenario: R2 fetch failure
- **WHEN** R2 bucket is unavailable
- **THEN** system returns 500 Internal Server Error with logged error details

#### Scenario: D1 query failure
- **WHEN** D1 database is unavailable
- **THEN** system returns 500 Internal Server Error and logs error with query context

#### Scenario: Missing SIGNING_SECRET
- **WHEN** Worker starts without SIGNING_SECRET configured
- **THEN** Worker fails to start and logs configuration error

#### Scenario: Cloudflare Image Resizing error
- **WHEN** Image Resizing service returns error
- **THEN** system returns 502 Bad Gateway with error details

#### Scenario: Rate limiting on URL generation
- **WHEN** client exceeds rate limit for URL generation endpoint
- **THEN** system returns 429 Too Many Requests with Retry-After header

### Requirement: Security Best Practices
The system SHALL implement security measures to prevent unauthorized access, enumeration, and abuse.

#### Scenario: Constant-time signature comparison
- **WHEN** validating HMAC signatures
- **THEN** system uses constant-time comparison to prevent timing attacks

#### Scenario: Signature includes photo identifier
- **WHEN** generating signature
- **THEN** HMAC input includes SID to prevent signature reuse across different photos

#### Scenario: Non-enumerable photo collection
- **WHEN** attacker attempts to enumerate photos by guessing SIDs
- **THEN** all requests require valid signatures or authentication, preventing enumeration

#### Scenario: SIGNING_SECRET rotation support
- **WHEN** SIGNING_SECRET is rotated
- **THEN** previously generated URLs continue to work until expiration (no immediate invalidation)

#### Scenario: CORS headers for cross-origin requests
- **WHEN** browser makes cross-origin request to image endpoint
- **THEN** response includes appropriate CORS headers for public images

#### Scenario: No sensitive data in error messages
- **WHEN** errors occur
- **THEN** public error messages do not leak internal paths, secrets, or database schema

### Requirement: OpenAPI Documentation
The system SHALL provide comprehensive OpenAPI 3.x specification for all image viewing endpoints to enable client developers to integrate with the API.

#### Scenario: URL generation endpoint documented
- **WHEN** OpenAPI spec is generated
- **THEN** GET /api/photos/:sid/url includes path parameter, query parameters (width, height, format, quality, sizes), authentication (Bearer token), and response schemas

#### Scenario: Responsive image set parameters documented
- **WHEN** OpenAPI spec describes /url endpoint
- **THEN** sizes parameter is documented with example values and format description

#### Scenario: Image serving endpoint documented
- **WHEN** OpenAPI spec is generated
- **THEN** GET /api/photos/:sid includes signature, expires, and transform parameters with descriptions

#### Scenario: Listing endpoint filters documented
- **WHEN** OpenAPI spec describes /api/photos endpoint
- **THEN** all filter parameters (start_date, end_date, camera_make, camera_model, source, min_lat, max_lat, min_lon, max_lon, limit, cursor) are documented

#### Scenario: Search endpoint documented
- **WHEN** OpenAPI spec describes search endpoint
- **THEN** query parameter q and pagination parameters are documented with examples

#### Scenario: Error responses documented
- **WHEN** OpenAPI spec includes endpoints
- **THEN** 400, 401, 403, 404, 429, 500, 502 responses include error schemas with error field

#### Scenario: Example requests provided
- **WHEN** OpenAPI spec is viewed
- **THEN** each endpoint includes example requests with sample SIDs, parameters, and authentication

#### Scenario: Response schemas defined
- **WHEN** OpenAPI spec defines successful responses
- **THEN** JSON schemas include all fields with types and descriptions
