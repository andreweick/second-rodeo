# Proposal: Image Viewing API with Signed URLs

## Why

The image ingestion system stores photos in R2 and indexes metadata in D1, but there's no API to retrieve and view these images. We need a clean API-driven architecture where:

- Astro frontend (or any future UI) is just HTML consuming REST APIs for true decoupling
- Users can share image URLs via text/social media without authentication requirements
- Images are served with privacy protection (EXIF stripped) and on-the-fly transformations
- Time-limited signed URLs (30-day default) maximize CDN cache efficiency through time bucketing
- All business logic (signing, filtering, search) lives in the API, enabling frontend flexibility

## What Changes

### New Capabilities
- **Signed URL Generation API**: Authenticated endpoint returns signed image URLs with configurable expiration (default 30 days)
- **Responsive Image Sets**: Single API call generates multiple sizes with proper srcset formatting
- **Cache-Friendly Time-Bucketed Signatures**: URLs use time buckets (daily) so same signature is generated within the bucket, maximizing CDN cache hits
- **Public Image Serving**: Validates signatures and serves images via Cloudflare Image Resizing (no auth needed after signing)
- **Automatic Metadata Stripping**: All served images use `metadata=none` to remove EXIF/IPTC for privacy
- **Photo Listing API**: Query D1 with filters (date range, camera, location, source, cursor pagination)
- **Full-Text Search API**: D1 FTS5 integration for caption/location/keyword search
- **Metadata JSON API**: Fetch complete metadata from R2 for detail views
- **Image Transformations**: Support width, height, format, quality params via Cloudflare Image Resizing

### API Endpoints

**Image URLs & Serving:**
- `GET /api/photos/:sid/url` - Generate signed URL (authenticated) - returns `{ url, expiresAt }`
- `GET /api/photos/:sid/url?sizes=400,800,1200` - Generate responsive image set (authenticated) - returns `{ urls, srcset }`
- `GET /api/photos/:sid?signature=...&expires=...&width=...&format=...&metadata=none` - Serve image (public, validates signature)

**Metadata & Search:**
- `GET /api/photos/:sid/metadata` - Get complete JSON metadata from R2 (authenticated)
- `GET /api/photos` - List photos with filters: `?start_date=...&end_date=...&camera=...&source=...&limit=...&cursor=...` (authenticated)
- `GET /api/photos/search?q=sunset+beach` - Full-text search via FTS5 (authenticated)

**Future Extensions (not in MVP):**
- `GET /api/photos/search/semantic?q=...` - Vector/embedding search with Cloudflare Vectorize
- `GET /api/shakespeare/search?q=...` - Shakespeare corpus search
- Other content type searches (chatter, films, quotes, etc.)

### Dependencies
- **Cloudflare Image Resizing** - Built-in Workers feature for transforms and metadata stripping
- **Existing**: R2 buckets (`sr-artifact`, `sr-json`), D1 with `photos` and `photos_fts` tables, `AUTH_TOKEN` secret
- **New secret**: `SIGNING_SECRET` - HMAC key for URL signing (32+ byte random hex string)

## Impact

### Affected Specs
- **NEW**: `image-viewing` capability (this proposal)

### Affected Code
- `apps/api/src/handlers/http.ts` - Add GET endpoints for photos
- `apps/api/src/services/photo-retrieval.ts` - New service for D1 queries and R2 fetching
- `apps/api/src/services/url-signing.ts` - New service for HMAC signature generation/validation with time bucketing
- `apps/api/wrangler.toml` - Add `SIGNING_SECRET` to secrets configuration
- OpenAPI spec - Document all new endpoints

### Architecture Benefits
- **True decoupling**: Astro (or any frontend) only calls APIs, no shared secrets or business logic
- **Swappable frontends**: React, Vue, mobile app, CLI - all consume same REST API
- **Security**: Signing logic and `SIGNING_SECRET` only in API Worker
- **Single source of truth**: All queries, filtering, permissions centralized in API
- **Future-proof**: Easy to add new search types (embeddings, semantic) or content types without frontend changes

### Security & Privacy
- **URL signing prevents**:
  - Unauthorized enumeration of photo collection
  - Hotlinking without time limits
  - Direct R2 access bypass
- **Metadata stripping (`metadata=none`) protects**:
  - GPS coordinates from served images
  - Camera serial numbers and photographer identity
  - All EXIF/IPTC data removed from public URLs
- **Time-bucketed signatures enable caching**:
  - URLs expire after 30 days (configurable)
  - Same daily bucket = same signature = better CDN cache hit rate
  - Example: All URLs generated on 2025-10-29 share the same signature components
- **Bearer token auth (reusing AUTH_TOKEN)**:
  - Only authorized clients (Astro SSR, upload scripts) can generate signed URLs
  - Signed URLs are public but time-limited and non-enumerable

### Non-Breaking
This is a new capability with no breaking changes. Complements the existing image ingestion system.

### Future Extensions
- **Semantic search**: Vector embeddings with Cloudflare Vectorize for "find similar photos"
- **Thumbnail pre-generation**: Cache common sizes to R2 for instant delivery
- **Per-photo permissions**: Add visibility/sharing controls (public, private, unlisted)
- **Download tracking**: Analytics on signed URL usage and sharing patterns
- **WebP/AVIF auto-negotiation**: Automatic format selection based on Accept header
