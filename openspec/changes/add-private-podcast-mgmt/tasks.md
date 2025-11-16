# Implementation Tasks

## 1. Infrastructure Setup
- [ ] 1.1 Create R2 bucket `sr-podcast` for audio storage
- [ ] 1.2 Create Workers KV namespace `PODCAST_FEEDS` for feed URL mappings
- [ ] 1.3 Add KV binding to `apps/api/wrangler.jsonc`
- [ ] 1.4 Add R2 bucket binding to `apps/api/wrangler.jsonc`
- [ ] 1.5 Configure Cloudflare Access for `/admin/podcasts/*` routes

## 2. Database Schema
- [ ] 2.1 Create `podcast_shows` table in D1 with columns: id, name, title, description, author, category, createdAt, updatedAt
- [ ] 2.2 Create `podcast_episodes` table in D1 with columns: id, showId, title, description, publishDate, duration, fileSize, mimeType, r2Key, createdAt, updatedAt
- [ ] 2.3 Add foreign key constraint: episodes.showId → shows.id
- [ ] 2.4 Create indexes on episodes.showId and episodes.publishDate
- [ ] 2.5 Generate Drizzle migration file
- [ ] 2.6 Apply migration to local D1 database
- [ ] 2.7 Update TypeScript types from Drizzle schema

## 3. API - Show Management
- [ ] 3.1 Create `apps/api/src/services/podcast-show.ts` service
- [ ] 3.2 Implement `createShow(data)` function
- [ ] 3.3 Implement `listShows()` function with episode counts
- [ ] 3.4 Implement `getShow(id)` function
- [ ] 3.5 Implement `updateShow(id, data)` function
- [ ] 3.6 Implement `deleteShow(id)` function (prevent if has episodes)
- [ ] 3.7 Add POST `/api/podcasts/shows` route handler
- [ ] 3.8 Add GET `/api/podcasts/shows` route handler
- [ ] 3.9 Add GET `/api/podcasts/shows/:id` route handler
- [ ] 3.10 Add PATCH `/api/podcasts/shows/:id` route handler
- [ ] 3.11 Add DELETE `/api/podcasts/shows/:id` route handler
- [ ] 3.12 Add authentication middleware to all show routes
- [ ] 3.13 Write tests for show CRUD operations

## 4. API - Episode Upload and Management
- [ ] 4.1 Create `apps/api/src/services/podcast-episode.ts` service
- [ ] 4.2 Implement `uploadEpisode(file, metadata, env)` function
- [ ] 4.3 Implement audio file type validation (mp3, m4a, mp4)
- [ ] 4.4 Implement R2 key generation: `podcasts/{showId}/{uuid}.{ext}`
- [ ] 4.5 Implement R2 upload with custom metadata headers
- [ ] 4.6 Implement JSON metadata write to `sr-json/podcasts/{episodeId}.json`
- [ ] 4.7 Implement D1 episode record creation
- [ ] 4.8 Implement `listEpisodes(showId?, pagination)` function
- [ ] 4.9 Implement `getEpisode(id)` function
- [ ] 4.10 Implement `updateEpisode(id, metadata)` function (update D1 and JSON)
- [ ] 4.11 Implement `deleteEpisode(id, env)` function (D1, R2 audio, R2 JSON)
- [ ] 4.12 Add POST `/api/podcasts/episodes` multipart route handler
- [ ] 4.13 Add GET `/api/podcasts/episodes` route handler with showId filter
- [ ] 4.14 Add GET `/api/podcasts/shows/:showId/episodes` route handler
- [ ] 4.15 Add GET `/api/podcasts/episodes/:id` route handler
- [ ] 4.16 Add PATCH `/api/podcasts/episodes/:id` route handler
- [ ] 4.17 Add DELETE `/api/podcasts/episodes/:id` route handler
- [ ] 4.18 Add authentication middleware to all episode routes
- [ ] 4.19 Write tests for episode CRUD operations

## 5. API - Audio Serving
- [ ] 5.1 Implement `getEpisodeAudio(id, env)` function in episode service
- [ ] 5.2 Add GET `/api/podcasts/episodes/:id/audio` route handler
- [ ] 5.3 Implement R2 streaming with proper Content-Type and Content-Length
- [ ] 5.4 Implement HTTP Range request support for seeking (206 Partial Content)
- [ ] 5.5 Write tests for audio serving and range requests

## 6. API - Feed URL Management
- [ ] 6.1 Create `apps/api/src/services/podcast-feed.ts` service
- [ ] 6.2 Implement UUID v4 generation for feed IDs
- [ ] 6.3 Implement `createFeedUrl(showId, recipientName, env)` function
- [ ] 6.4 Implement KV storage: `podcast:feed:{uuid}` → {showId, recipientName, createdAt}
- [ ] 6.5 Implement `listFeedUrls(env)` function (scan KV with prefix)
- [ ] 6.6 Implement `deleteFeedUrl(uuid, env)` function
- [ ] 6.7 Add POST `/api/podcasts/feeds` route handler
- [ ] 6.8 Add GET `/api/podcasts/feeds` route handler
- [ ] 6.9 Add DELETE `/api/podcasts/feeds/:uuid` route handler
- [ ] 6.10 Add authentication middleware to all feed routes
- [ ] 6.11 Write tests for feed URL CRUD operations

## 7. API - RSS Feed Generation
- [ ] 7.1 Create `apps/api/src/services/podcast-rss.ts` service
- [ ] 7.2 Implement `generateRssFeed(uuid, env)` function
- [ ] 7.3 Implement KV lookup to get showId from feed UUID
- [ ] 7.4 Implement D1 query for episodes by showId
- [ ] 7.5 Implement RSS 2.0 XML generation with channel metadata
- [ ] 7.6 Implement iTunes podcast namespace tags
- [ ] 7.7 Implement episode items with enclosures
- [ ] 7.8 Implement RFC 2822 date formatting for pubDate
- [ ] 7.9 Add GET `/rss/podcast/:uuid.xml` route handler (no auth)
- [ ] 7.10 Set Content-Type to `application/rss+xml`
- [ ] 7.11 Write tests for RSS generation and XML validity

## 8. Robots.txt Configuration
- [ ] 8.1 Update `apps/paper/src/pages/robots.txt.ts`
- [ ] 8.2 Add `Disallow: /rss/podcast/` rule
- [ ] 8.3 Test robots.txt output includes podcast disallow rule

## 9. Admin UI - Shows Management
- [ ] 9.1 Create `apps/paper/src/pages/admin/podcasts/shows/index.astro`
- [ ] 9.2 Implement shows list table with episode counts
- [ ] 9.3 Create `apps/paper/src/pages/admin/podcasts/shows/new.astro` form
- [ ] 9.4 Implement show creation with validation
- [ ] 9.5 Create `apps/paper/src/pages/admin/podcasts/shows/[id]/edit.astro`
- [ ] 9.6 Implement show editing with pre-filled form
- [ ] 9.7 Implement delete confirmation modal
- [ ] 9.8 Add error handling and success messages
- [ ] 9.9 Style with existing Astro theme patterns

## 10. Admin UI - Episodes Management
- [ ] 10.1 Create `apps/paper/src/pages/admin/podcasts/shows/[showId]/episodes/index.astro`
- [ ] 10.2 Implement episodes list table for show
- [ ] 10.3 Create `apps/paper/src/pages/admin/podcasts/shows/[showId]/episodes/new.astro`
- [ ] 10.4 Implement file upload form with progress indicator
- [ ] 10.5 Add client-side audio file validation
- [ ] 10.6 Create `apps/paper/src/pages/admin/podcasts/episodes/[id]/edit.astro`
- [ ] 10.7 Implement episode metadata editing (no re-upload)
- [ ] 10.8 Add inline audio player preview using HTML5 `<audio>`
- [ ] 10.9 Implement delete confirmation with episode title
- [ ] 10.10 Add error handling and success messages
- [ ] 10.11 Create `apps/paper/src/pages/admin/podcasts/episodes/index.astro` for all episodes

## 11. Admin UI - Feed URLs Management
- [ ] 11.1 Create `apps/paper/src/pages/admin/podcasts/feeds/index.astro`
- [ ] 11.2 Implement feeds list table with recipientName, showName, URL
- [ ] 11.3 Create `apps/paper/src/pages/admin/podcasts/feeds/new.astro`
- [ ] 11.4 Implement feed creation form with show dropdown
- [ ] 11.5 Display generated feed URL on success
- [ ] 11.6 Implement copy-to-clipboard button for feed URLs
- [ ] 11.7 Implement delete confirmation with recipient name
- [ ] 11.8 Add error handling and success messages

## 12. Admin UI - Navigation and Layout
- [ ] 12.1 Create admin navigation component for podcast sections
- [ ] 12.2 Implement breadcrumb navigation
- [ ] 12.3 Add responsive table layouts for tablet/desktop
- [ ] 12.4 Style forms consistently with existing admin patterns
- [ ] 12.5 Ensure Cloudflare Access protection is documented

## 13. Testing and Validation
- [ ] 13.1 Test episode upload with various audio formats (mp3, m4a, mp4)
- [ ] 13.2 Test RSS feed validity with podcast validator
- [ ] 13.3 Test feed in Overcast app
- [ ] 13.4 Test feed in Apple Podcasts app
- [ ] 13.5 Test audio playback and seeking in podcast apps
- [ ] 13.6 Verify unguessable URLs are truly random (UUID v4)
- [ ] 13.7 Verify robots.txt blocks crawlers
- [ ] 13.8 Test Cloudflare Access protection on admin routes
- [ ] 13.9 Test range request support for audio streaming
- [ ] 13.10 Run full test suite: `pnpm --filter api test`

## 14. Documentation
- [ ] 14.1 Document KV namespace setup in README
- [ ] 14.2 Document R2 bucket creation in README
- [ ] 14.3 Document Cloudflare Access configuration
- [ ] 14.4 Add example curl commands for API usage
- [ ] 14.5 Document RSS feed URL sharing workflow
