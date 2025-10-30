# Implementation Tasks: Image Viewing API

## 1. URL Signing Service
- [ ] 1.1 Create `apps/api/src/services/url-signing.ts`
- [ ] 1.2 Implement HMAC-SHA256 signature generation with time bucketing
- [ ] 1.3 Implement signature validation with expiration checking
- [ ] 1.4 Add time-bucket calculation (daily buckets for cache efficiency)
- [ ] 1.5 Create helper for generating Cloudflare Image Resizing URLs
- [ ] 1.6 Write unit tests for signing and validation logic

## 2. Photo Retrieval Service
- [ ] 2.1 Create `apps/api/src/services/photo-retrieval.ts`
- [ ] 2.2 Implement D1 query for photo by SID
- [ ] 2.3 Implement D1 query for photo listing with filters
- [ ] 2.4 Implement D1 FTS5 full-text search query
- [ ] 2.5 Implement cursor-based pagination helpers
- [ ] 2.6 Implement R2 metadata JSON fetching
- [ ] 2.7 Write unit tests for D1 queries and R2 fetching

## 3. HTTP Endpoints
- [ ] 3.1 Add `GET /api/photos/:sid/url` endpoint to `http.ts`
- [ ] 3.2 Add `GET /api/photos/:sid/url?sizes=...` endpoint for responsive sets
- [ ] 3.3 Add `GET /api/photos/:sid` endpoint with signature validation
- [ ] 3.4 Add `GET /api/photos/:sid/metadata` endpoint
- [ ] 3.5 Add `GET /api/photos` endpoint with filters and pagination
- [ ] 3.6 Add `GET /api/photos/search?q=...` endpoint for FTS5 search
- [ ] 3.7 Implement Bearer token authentication check (reuse `AUTH_TOKEN`)
- [ ] 3.8 Write integration tests for all endpoints

## 4. Cloudflare Image Resizing Integration
- [ ] 4.1 Implement URL builder with transform parameters (width, height, format, quality)
- [ ] 4.2 Add `metadata=none` parameter to all image URLs
- [ ] 4.3 Implement multi-size URL generation for responsive image sets
- [ ] 4.4 Generate proper srcset strings for HTML consumption
- [ ] 4.5 Test metadata stripping with sample images
- [ ] 4.6 Test various image formats (JPEG, PNG, WebP)

## 5. Configuration & Secrets
- [ ] 5.1 Add `SIGNING_SECRET` to `apps/api/wrangler.toml` secrets
- [ ] 5.2 Generate secure random value for `SIGNING_SECRET` (32+ bytes hex)
- [ ] 5.3 Update `.dev.vars.example` with `SIGNING_SECRET` placeholder
- [ ] 5.4 Document secret rotation procedure in README
- [ ] 5.5 Add validation for secret presence on Worker startup

## 6. OpenAPI Documentation
- [ ] 6.1 Document `GET /api/photos/:sid/url` endpoint
- [ ] 6.2 Document responsive image sets query parameters
- [ ] 6.3 Document `GET /api/photos/:sid` with signature validation
- [ ] 6.4 Document `GET /api/photos/:sid/metadata` endpoint
- [ ] 6.5 Document `GET /api/photos` with all filter parameters
- [ ] 6.6 Document `GET /api/photos/search` endpoint
- [ ] 6.7 Add request/response examples for all endpoints
- [ ] 6.8 Document error responses (400, 401, 404, 500)

## 7. Testing & Validation
- [ ] 7.1 Test signed URL generation and validation flow
- [ ] 7.2 Test time bucket caching (URLs generated in same bucket match)
- [ ] 7.3 Test expired signature rejection
- [ ] 7.4 Test responsive image set generation
- [ ] 7.5 Test photo listing with various filter combinations
- [ ] 7.6 Test FTS5 search with different queries
- [ ] 7.7 Test metadata JSON retrieval from R2
- [ ] 7.8 Test Cloudflare Image Resizing with different parameters
- [ ] 7.9 Load test with realistic photo collection size
- [ ] 7.10 Verify EXIF metadata is stripped from served images

## 8. Integration with Existing System
- [ ] 8.1 Verify compatibility with existing `photos` and `photos_fts` tables
- [ ] 8.2 Test with photos uploaded via existing ingestion system
- [ ] 8.3 Ensure R2 key format matches between ingestion and retrieval
- [ ] 8.4 Verify D1 indexes are used efficiently in queries
- [ ] 8.5 Document integration points in README

## 9. Performance Optimization
- [ ] 9.1 Add appropriate Cache-Control headers to signed image responses
- [ ] 9.2 Add ETag support for image serving
- [ ] 9.3 Verify CDN caching behavior with time-bucketed signatures
- [ ] 9.4 Optimize D1 queries with EXPLAIN QUERY PLAN
- [ ] 9.5 Add response time logging for monitoring

## 10. Documentation
- [ ] 10.1 Update main README with image viewing API usage
- [ ] 10.2 Document Astro integration example
- [ ] 10.3 Document responsive image sets usage
- [ ] 10.4 Add architecture diagram (optional)
- [ ] 10.5 Document troubleshooting common issues
