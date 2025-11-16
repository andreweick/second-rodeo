# Private Podcast Management - Design Document

## Context

Building private podcast distribution system for Second Rodeo that allows sharing audio content via unguessable RSS feeds without public indexing. Must integrate with existing Cloudflare Workers infrastructure (D1, R2, KV) and work seamlessly with standard podcast apps (Overcast, Apple Podcasts).

**Constraints:**
- Cloudflare Workers V8 isolate environment (not Node.js)
- D1 SQLite database for queryable metadata
- R2 for audio storage (cheap, durable)
- Workers KV for feed URL mappings (low-latency global reads)
- Astro static site for admin UI (served via Workers Assets)

**Stakeholders:**
- Content creator (Andy) managing private podcast content
- Recipients with unguessable feed URLs for their podcast apps

## Goals / Non-Goals

### Goals
- Private podcast hosting with unguessable URLs (UUID v4, 122-bit entropy)
- Multi-show support (separate shows with distinct feeds)
- Standard RSS 2.0 + iTunes tags for podcast app compatibility
- Admin UI for episode/feed management protected by Cloudflare Access
- Durable audio storage in R2 with JSON metadata pattern
- HTTP Range request support for seeking in podcast apps

### Non-Goals
- Public podcast directory submission
- Advanced analytics or download tracking
- Automatic transcription or show notes generation
- Multi-user permission system (single admin via Cloudflare Access)
- Podcast hosting for external parties (personal use only)

## Decisions

### Decision 1: Workers KV for Feed URL Storage
**What:** Store feed UUID → {showId, recipientName, createdAt} mappings in Workers KV.

**Why:**
- Low-latency global reads for RSS feed generation
- Simple key-value access pattern: `podcast:feed:{uuid}`
- No complex queries needed (feeds accessed by UUID only)
- Cheaper than D1 for read-heavy workload (RSS feeds fetched frequently)

**Alternatives considered:**
- **D1 table:** Higher latency, unnecessary query capabilities, more complex
- **R2 JSON files:** Slower reads, no atomic updates, awkward listing

**Trade-offs:**
- KV listing is eventually consistent (feed list UI may lag briefly after creation)
- No relational queries (can't easily filter feeds by show without scanning)

### Decision 2: R2 for Audio Storage
**What:** Store audio files in R2 bucket `sr-podcast` with keys: `podcasts/{showId}/{uuid}.{ext}`

**Why:**
- Extremely cheap storage (~$0.015/GB/month)
- No egress fees for Cloudflare Workers access
- Durable, scalable object storage
- Custom metadata headers for episode tracking
- Consistent with existing architecture (sr-json, sr-artifact buckets)

**Alternatives considered:**
- **Cloudflare Stream:** Designed for video, expensive for audio-only, overkill
- **External S3:** Unnecessary complexity, egress costs

### Decision 3: D1 for Episode Metadata
**What:** Store episodes in D1 `podcast_episodes` table with columns: id, showId, title, description, publishDate, duration, fileSize, mimeType, r2Key.

**Why:**
- Fast queries for episode listing by show
- Sorting by publishDate for RSS feed generation
- Type-safe Drizzle ORM schema
- Consistent with existing content type pattern (photos, chatter, etc.)

**Schema:**
```sql
CREATE TABLE podcast_shows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT NOT NULL,
  category TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE podcast_episodes (
  id TEXT PRIMARY KEY,
  show_id TEXT NOT NULL REFERENCES podcast_shows(id),
  title TEXT NOT NULL,
  description TEXT,
  publish_date INTEGER NOT NULL,
  duration INTEGER,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_episodes_show_id ON podcast_episodes(show_id);
CREATE INDEX idx_episodes_publish_date ON podcast_episodes(publish_date DESC);
```

### Decision 4: JSON Metadata Pattern
**What:** Write complete episode metadata to `sr-json/podcasts/{episodeId}.json` on upload.

**Why:**
- Consistent with existing architecture (all content types use JSON source of truth)
- Enables future rebuilding of D1 index if needed
- Preserves all metadata even if not queryable in D1
- Supports future enhancements without schema migrations

**Trade-offs:**
- Slight overhead writing to both R2 JSON and D1
- Must keep JSON and D1 in sync during updates

### Decision 5: UUID v4 for Unguessable URLs
**What:** Generate cryptographically random UUID v4 for both feed IDs and audio file keys.

**Why:**
- 122 bits of entropy (practically unguessable)
- Standard format, widely supported
- No collision risk in practice
- URL-safe without encoding

**Format:**
- Feed URLs: `https://domain.com/rss/podcast/{uuid}.xml`
- Audio keys: `podcasts/{showId}/{uuid}.{ext}`

**Alternatives considered:**
- **Incremental IDs:** Easily enumerable, insecure
- **Short codes (6-8 chars):** Brute-forceable, collision risk
- **Signed tokens:** Expiration complexity, unnecessary for permanent feeds

### Decision 6: Separate Audio Serving Endpoint
**What:** Serve audio via `/api/podcasts/episodes/{id}/audio` instead of direct R2 URLs.

**Why:**
- Hides R2 bucket structure and keys from RSS feed
- Enables future access control or analytics insertion point
- Supports HTTP Range requests for podcast app seeking
- Allows changing R2 keys without breaking RSS feeds

**Implementation:**
- Lookup episode in D1 to get r2Key
- Stream from R2 with proper Content-Type and Content-Length
- Support Range header for partial content (206 responses)

### Decision 7: Cloudflare Access for Admin Protection
**What:** Protect `/admin/podcasts/*` routes with Cloudflare Access, not bearer token auth.

**Why:**
- Web UI needs session-based auth (not API tokens)
- Cloudflare Access provides SSO, MFA, audit logs
- No need to build custom auth system for UI
- Consistent with best practices for admin interfaces

**Trade-offs:**
- Requires Cloudflare Access configuration (documented in README)
- Separate auth mechanism from API (API still uses AUTH_TOKEN)

### Decision 8: RSS 2.0 + iTunes Tags
**What:** Generate RSS feeds conforming to RSS 2.0 spec with iTunes podcast extensions.

**Why:**
- Widest compatibility with podcast apps
- Apple Podcasts dominant platform (iTunes tags required)
- Simple XML generation in Workers (no external dependencies)

**Required iTunes tags:**
- `<itunes:author>`
- `<itunes:explicit>`
- `<itunes:category>`
- `<itunes:duration>` per episode
- `<itunes:type>episodic`

**Enclosure format:**
```xml
<enclosure
  url="https://domain.com/api/podcasts/episodes/{id}/audio"
  length="12345678"
  type="audio/mpeg" />
```

### Decision 9: No Queue Processing for Uploads
**What:** Handle episode uploads synchronously in HTTP handler.

**Why:**
- Audio files are moderate size (10-100 MB typical)
- Upload already takes time (file transfer), additional processing minimal
- Simpler architecture without queue consumer complexity
- Immediate feedback to user (success/failure)

**Alternatives considered:**
- **Queue for metadata extraction:** Unnecessary complexity for simple metadata
- **Queue for transcoding:** Out of scope, audio stored as-uploaded

**Trade-offs:**
- Larger files may approach Worker CPU limits (monitor and revisit if needed)

### Decision 10: Robots.txt Disallow Rules
**What:** Add `Disallow: /rss/podcast/` to robots.txt.

**Why:**
- Prevent search engine indexing of feed URLs
- Simple, standard mechanism for crawler exclusion
- Cloudflare appends to existing robots.txt

**Implementation:**
Update `apps/paper/src/pages/robots.txt.ts` to include:
```
Disallow: /rss/podcast/
```

**Note:** Does not prevent determined crawlers, but UUID entropy is primary security.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Admin UI (Astro - Cloudflare Access Protected)             │
│  /admin/podcasts/shows                                       │
│  /admin/podcasts/episodes                                    │
│  /admin/podcasts/feeds                                       │
└────────────┬────────────────────────────────────────────────┘
             │ HTTP (Authenticated)
             v
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare Worker API (apps/api)                            │
│                                                              │
│  POST   /api/podcasts/shows                                  │
│  GET    /api/podcasts/shows                                  │
│  PATCH  /api/podcasts/shows/:id                              │
│  DELETE /api/podcasts/shows/:id                              │
│                                                              │
│  POST   /api/podcasts/episodes (multipart)                   │
│  GET    /api/podcasts/episodes                               │
│  PATCH  /api/podcasts/episodes/:id                           │
│  DELETE /api/podcasts/episodes/:id                           │
│  GET    /api/podcasts/episodes/:id/audio (range support)     │
│                                                              │
│  POST   /api/podcasts/feeds                                  │
│  GET    /api/podcasts/feeds                                  │
│  DELETE /api/podcasts/feeds/:uuid                            │
│                                                              │
│  GET    /rss/podcast/:uuid.xml (public, no auth)             │
└───┬──────────┬──────────────┬───────────────────────────────┘
    │          │              │
    v          v              v
┌────────┐ ┌────────┐ ┌─────────────────┐
│   D1   │ │   R2   │ │  Workers KV     │
│        │ │        │ │                 │
│ shows  │ │ audio  │ │ podcast:feed:   │
│episodes│ │ files  │ │ {uuid} → meta   │
└────────┘ └────────┘ └─────────────────┘
             │
             │ (also JSON metadata)
             v
         sr-json/podcasts/{id}.json

┌─────────────────────────────────────────────────────────────┐
│ Podcast Apps (Overcast, Apple Podcasts)                     │
│  GET /rss/podcast/{uuid}.xml                                 │
│  GET /api/podcasts/episodes/{id}/audio                       │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Episode Upload Flow
1. Admin uploads audio file via `/admin/podcasts/shows/{showId}/episodes/new`
2. Astro form POSTs multipart/form-data to `/api/podcasts/episodes`
3. Worker validates file type (audio/mpeg, audio/mp4, audio/x-m4a)
4. Generate UUID for episode ID and R2 key
5. Write audio to R2: `sr-podcast/podcasts/{showId}/{uuid}.{ext}`
6. Write metadata JSON to R2: `sr-json/podcasts/{episodeId}.json`
7. Insert episode record to D1 `podcast_episodes` table
8. Return episode ID and metadata to UI

### Feed Creation Flow
1. Admin creates feed via `/admin/podcasts/feeds/new`
2. Select show and enter recipient name
3. Astro form POSTs to `/api/podcasts/feeds`
4. Worker generates UUID v4 for feed ID
5. Store in KV: `podcast:feed:{uuid}` → `{showId, recipientName, createdAt}`
6. Return feed URL: `https://domain.com/rss/podcast/{uuid}.xml`
7. Admin shares URL with recipient

### RSS Feed Generation Flow
1. Podcast app requests `/rss/podcast/{uuid}.xml`
2. Worker looks up feed in KV by UUID
3. If not found, return 404
4. Fetch showId from KV value
5. Query D1 for episodes in show ordered by publishDate DESC
6. Generate RSS 2.0 XML with iTunes tags
7. Return XML with Content-Type: application/rss+xml

### Audio Playback Flow
1. Podcast app parses RSS, finds `<enclosure url="...">`
2. App requests `/api/podcasts/episodes/{id}/audio`
3. Worker queries D1 for episode to get r2Key
4. Stream audio from R2 using r2Key
5. Support Range requests for seeking (206 Partial Content)

## Risks / Trade-offs

### Risk 1: KV Listing Performance
- **Risk:** Listing all feeds may be slow as count grows (100s of feeds)
- **Mitigation:** KV list operations are paginated; acceptable for single-digit to low hundreds of feeds
- **Future:** If feed count exceeds 1000, consider D1 table for feed metadata with KV for fast RSS lookups

### Risk 2: Audio File Size Limits
- **Risk:** Large audio files (>100 MB) may approach Worker memory/CPU limits during upload
- **Mitigation:** Workers support streaming uploads to R2; test with realistic file sizes
- **Fallback:** If issues arise, implement chunked upload or direct-to-R2 presigned URLs

### Risk 3: RSS Feed Caching
- **Risk:** Podcast apps may cache RSS feeds aggressively, delaying episode visibility
- **Mitigation:** Set appropriate cache headers (max-age=3600 for hourly updates)
- **Future:** Consider ETag support for conditional requests

### Risk 4: UUID Collision
- **Risk:** UUID v4 collision (extremely rare but non-zero)
- **Mitigation:** Check for existing key before writing, regenerate if collision detected
- **Probability:** ~1 in 2^122 (~5.3 × 10^36) - negligible risk

### Risk 5: Feed URL Leakage
- **Risk:** Recipients may share unguessable URLs publicly or with unintended parties
- **Mitigation:**
  - Document expectation that URLs should be kept private
  - Support feed deletion if leaked (creates new feed with new UUID)
  - No automated revocation (requires manual delete + recreate)

## Migration Plan

### Initial Deployment
1. Create R2 bucket `sr-podcast` in Cloudflare dashboard
2. Create KV namespace `PODCAST_FEEDS` in Cloudflare dashboard
3. Add bindings to `apps/api/wrangler.jsonc`
4. Apply D1 migrations: `just migrate-local` (dev), `wrangler d1 migrations apply` (prod)
5. Configure Cloudflare Access policy for `/admin/podcasts/*` path
6. Deploy API changes via `wrangler deploy`
7. Build and deploy Astro site via `just build` + asset upload

### Rollback Plan
- Delete D1 tables if unused: `DROP TABLE podcast_episodes; DROP TABLE podcast_shows;`
- Remove KV namespace (no cost if empty)
- Delete R2 bucket if no audio uploaded
- Remove Cloudflare Access policy
- Revert code changes via git

### Data Migration (Future)
If moving to external podcast host:
1. Export episodes from D1 to CSV
2. Download audio files from R2
3. Upload to new host
4. Update RSS feed URLs (breaking change for recipients)

## Open Questions

1. **Audio metadata extraction:** Should we extract duration from audio files automatically, or require manual input?
   - **Recommendation:** Manual input initially; add automated extraction later if needed (complexity of parsing MP3/M4A in Workers)

2. **Episode ordering:** Should episodes support explicit ordering beyond publishDate?
   - **Recommendation:** Use publishDate only; admin can adjust dates for ordering

3. **Feed artwork:** Should feeds support custom artwork per show?
   - **Recommendation:** Add `imageUrl` field to shows table; defer implementation until requested

4. **Episode limits per feed:** Should there be a max episode count in RSS output?
   - **Recommendation:** No limit initially; most podcast apps handle large feeds fine; add pagination if performance issues arise

5. **Delete behavior:** Should deleted episodes remain in R2 for archival, or hard delete?
   - **Current decision:** Hard delete (remove from D1, R2 audio, R2 JSON)
   - **Future consideration:** Soft delete flag if archival needed
