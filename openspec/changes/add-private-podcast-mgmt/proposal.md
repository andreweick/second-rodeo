# Private Podcast Management System

## Why

Enable private, unindexed podcast distribution for selective sharing without public discovery. Current system lacks podcast hosting capabilities, requiring external services for private audio content distribution. This provides self-hosted, secure podcast feeds with unguessable URLs that work seamlessly with standard podcast apps (Overcast, Apple Podcasts, etc.).

## What Changes

- **NEW**: Podcast episode upload API endpoint with audio file storage in R2
- **NEW**: Episode metadata management (title, description, publish date, show assignment)
- **NEW**: Unguessable RSS feed generation with UUID-based URLs stored in Workers KV
- **NEW**: Multi-show support with episode grouping per show
- **NEW**: Cloudflare Access-protected admin interface in Astro site for episode and feed management
- **NEW**: CRUD operations for episodes (create, read, update, delete)
- **NEW**: CRUD operations for RSS feed URLs (create, list, delete)
- **NEW**: Public RSS endpoint serving podcast XML for app consumption
- **NEW**: robots.txt disallow rules for RSS feed endpoints

## Impact

### Affected Specs
- **NEW**: `podcast-upload` - Episode upload and storage
- **NEW**: `podcast-rss` - RSS feed generation and management
- **NEW**: `podcast-admin` - Admin interface for content management

### Affected Code
- `apps/api/src/handlers/http.ts` - New routes for podcast endpoints
- `apps/api/src/services/` - New podcast service modules
- `apps/api/wrangler.jsonc` - Add KV namespace binding for feed URLs, new R2 bucket for podcast audio
- `apps/paper/src/pages/` - New admin pages for podcast management
- `apps/api/src/db/schema/` - New D1 tables for episodes and shows
- `apps/paper/src/pages/robots.txt.ts` - Add disallow rules for `/rss/podcast/*`

### New Infrastructure
- **Workers KV**: Store RSS feed UUID → feed metadata mappings
- **R2 Bucket**: `sr-podcast` for audio file storage
- **D1 Tables**: `podcast_shows`, `podcast_episodes`
- **Cloudflare Access**: Protect `/admin/podcasts` routes

### Security Considerations
- Unguessable UUID-based RSS feed URLs (v4 UUIDs, 122 bits entropy)
- robots.txt disallow rules for podcast RSS paths
- No AI crawling via meta tags on RSS endpoints
- Cloudflare Access authentication for admin interface
- Bearer token authentication for API endpoints
- Audio files served via unguessable R2 keys
