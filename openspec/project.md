# Project Context

## Purpose
**Second Rodeo** is a personal digital archive and lifelogging system that captures, processes, and preserves various aspects of digital life. The system ingests content from multiple sources and formats including:

- **Photographs** - Images with EXIF, ITPC, and C2PA metadata extraction
- **Videos** - Personal recordings stored in Cloudflare Stream
- **Chatter** - Social media posts and quick thoughts
- **Quotes** - Memorable quotes with attribution
- **Films** - Movie viewing history with TMDB/Letterboxd integration
- **Checkins** - Location-based checkins (Foursquare-style)
- **Bookmarks** - Web bookmarks from Raindrop.io
- **Memes** - Saved images and memes
- **Audio** - Audio recordings and clips
- **Shakespeare** - Shakespeare text corpus for reference
- **Top Ten Lists** - Curated lists from various sources

All content is stored with rich metadata, timestamps, and is organized for easy retrieval and display through web interfaces.

## Durable JSON + Lightweight D1 Architecture

### Overview
All durable data is written as complete JSON files in R2, one file per item.
Each JSON file represents the current state of a single record (photo, chatter post, film, etc.).
When updates occur, the entire JSON file is read, merged with new data, and overwritten.

R2 buckets:
- `sr-artifact` - Binary blobs (images, videos, etc.) with custom metadata headers
- `sr-json` - Complete JSON metadata files

Key structure: `<type>/<id>.json`
- Photos: `sr-json/photos/sid_abc123.json`
- Chatter: `sr-json/chatter/chatter_456.json`
- Films: `sr-json/films/film_789.json`

D1 ingestors read JSON files from R2 and upsert to D1 using:
```sql
INSERT INTO <table> (id, field1, field2, ...)
VALUES (:id, :field1, :field2, ...)
ON CONFLICT(id) DO UPDATE SET
  field1 = excluded.field1,
  field2 = excluded.field2,
  updated_at = unixepoch();
```

This guarantees idempotent ingestion—processing the same JSON file multiple times produces the same D1 state.

### Why This Architecture

**Cost Optimization:**
R2 storage costs ~$0.015/GB/month (extremely cheap) while D1 has storage limits and is optimized for queries, not bulk storage. By storing complete metadata in R2 and only queryable fields in D1, we minimize D1 footprint and maximize R2's cost advantage.

**Durability & Rebuild Capability:**
R2 is the durable, authoritative source of truth. If D1 becomes corrupted, hits limits, or needs schema changes, the entire index can be rebuilt by scanning `sr-json` bucket and reprocessing all JSON files. D1 is treated as a disposable, rebuildable cache.

**Simplicity:**
One JSON file per item is straightforward to understand, debug, and maintain. No event log complexity, no ordering dependencies, no partial state. Each file is self-contained and can be independently processed, reprocessed, or migrated.

**Web Application Pattern:**
- **List views**: Query D1 with filters (date ranges, location, tags) → fast results with summary data
- **Detail views**: Fetch complete JSON from R2 → rich metadata display
- **Search**: Use D1 FTS5 virtual tables → fast full-text search across captions, titles, keywords

**Update Flexibility:**
When new fields or capabilities are added (e.g., C2PA content authenticity), JSON files are simply read, merged with new data, and overwritten. No complex event log reconciliation. D1 schema can be updated via migrations, and existing JSON files can be reprocessed to populate new columns.

### D1 Schema Optimization Strategy

D1 tables store only **queryable and filterable fields** to keep rows small and queries fast:

**Typical D1 fields** (~15-20 per table):
- Primary key (id, sid)
- Timestamps (created_at, taken_at, uploaded_at)
- Categorical filters (camera_make, camera_model, source)
- Numeric filters (width, height, file_size, gps_lat, gps_lon)
- Boolean flags (has_c2pa, publish)
- R2 reference (r2_key)

**Excluded from D1** (stay in R2 JSON):
- Full EXIF data (200+ fields for photos)
- Large text bodies (full blog posts, long captions)
- Binary data or base64 encoded content
- Nested complex objects
- Historical/versioning data

**Example: Photos table**
- D1 stores: sid, sha256, taken_at, camera_make, gps_lat, gps_lon, width, height, has_c2pa (~500 bytes per row)
- R2 JSON contains: All EXIF fields, IPTC metadata, ICC profiles, file info, hashes, upload details (~5-20 KB per file)

**FTS5 Virtual Tables:**
Each content type with searchable text has a companion FTS5 table:
- `photos_fts` - title, caption, keywords, city, country, creator
- `chatter_fts` - title, content
- `films_fts` - title, notes

FTS5 tables are automatically indexed for fast full-text search with relevance ranking. Only text fields are indexed; D1 main tables hold structured data.

### Read Patterns

**List/Browse Views:**
```sql
-- Recent photos
SELECT sid, taken_at, camera_make, gps_lat, gps_lon, r2_key
FROM photos
WHERE taken_at > ?
ORDER BY taken_at DESC
LIMIT 50;

-- Text search
SELECT p.sid, p.taken_at, p.r2_key
FROM photos p
JOIN photos_fts fts ON p.sid = fts.sid
WHERE photos_fts MATCH 'sunset beach'
ORDER BY rank
LIMIT 20;
```

**Detail Views:**
1. Get basic data from D1 (fast, cached)
2. Fetch complete JSON from R2: `GET sr-json/photos/{sid}.json`
3. Display rich metadata (full EXIF, IPTC, all fields)

**Bulk Operations:**
For migrations, analytics, or exports:
1. Scan `sr-json` bucket directly (bypass D1)
2. Stream JSON files and process in parallel
3. Optionally rebuild D1 index from scratch

### Update Patterns

**New Items:**
1. Extract/generate metadata
2. Write complete JSON to `sr-json/<type>/<id>.json`
3. Send queue message: `{id, r2_key}`
4. Queue consumer reads JSON and upserts to D1

**Updates (e.g., adding C2PA data):**
1. Fetch existing JSON from R2
2. Merge new fields: `{...existingData, c2pa: {...}}`
3. Overwrite JSON file in R2
4. Send queue message for D1 re-index
5. D1 upsert updates fields (idempotent)

**Idempotency:**
Processing the same update multiple times (queue retries) produces identical results. D1 upserts use `ON CONFLICT ... DO UPDATE` which is safe to replay.

### Purpose
R2 acts as the canonical, durable, low-cost source of truth.
D1 acts as a lightweight, queryable cache and index that can be fully rebuilt from R2.
D1 holds only compact subsets of fields—keys, timestamps, search text, numeric metrics, and references to the R2 object—minimizing its storage footprint.

### Structure
- One D1 database for all data types (images, chatter, checkins, shakespeare, etc.).
- Each type has its own table (e.g., `photos`, `chatter`, `films`, `quotes`).
- Each table includes an **FTS5 virtual table** (e.g., `photos_fts`, `chatter_fts`) for fast full-text search.
- FTS5 tables index only tokenized text fields; large content remains in R2.

### Design Goals
- **Durable-first**: R2 storage is the source of truth; D1 is disposable and rebuildable
- **Idempotent ingestion**: Safe to replay updates, process files in any order
- **Cost minimization**: Cheap R2 writes, small D1 footprint, infrequent D1 updates
- **Read-time hydration**: Query D1 for filtering, fetch R2 for complete content
- **Simple mental model**: One file per item, easy to reason about and debug
- **Easy schema evolution**: New fields added to JSON, D1 migrations add columns as needed

## Tech Stack
- **TypeScript** - Primary language for type-safe development
- **Cloudflare Workers** - Serverless compute for API,
    These run in V8 Isolates and **not** node.

    A V8 isolate is an isolated instance of the V8 JavaScript engine, featuring its own dedicated memory heap, garbage collector, and state.

    Many packages do not work in this environment so care must be taken to ensure that you are not using 'normal' nodeJS.  **DO NOT** install packages, but give me manual instructions on how to install them for you.  If the task is small, prefer to write typescript to "do it yourself" rather than import a package.  Every package should be reviewed with me based on merits.
- **D1** - Cloudflare's SQLite database for metadata
- **Drizzle ORM** - Type-safe database queries and migrations
- **Astro** - Static site generator for web frontend and blog
- **R2** - Object storage for JSON files and artifacts
- **Cloudflare Queues** - Async message processing
- **Cloudflare Stream** - Video storage and streaming
- **pnpm** - Fast, disk-efficient package manager with workspace support
- **Vitest** - Testing framework with Cloudflare Workers support

### Cloudflare
Cloudflare workers, containers (for golang or WASM) and other cloudflare services are used.  All server side code is in the "api" project, and "paper" is where the front end app is.  The front end is Astro.js, but only interacts with the server via http (cloudflare worker) exposed APIs

## Project Conventions

### Code Style
- **TypeScript** with strict type checking enabled
- **ESLint** for linting (configured at root and app level)
- **Prettier** for code formatting (v3.6+)
- **Naming Conventions:**
  - Files: kebab-case (e.g., `image-upload.ts`, `json-processor.ts`)
  - Interfaces/Types: PascalCase (e.g., `Env`, `QueueMessageBody`)
  - Functions: camelCase (e.g., `handleHttp`, `uploadImage`)
  - Database tables: snake_case in schema, but exposed as camelCase in TypeScript
- **File Organization:**
  - `src/handlers/` - Request handlers (HTTP, queue)
  - `src/services/` - Business logic and integrations
  - `src/db/` - Database schema and client
  - `src/types/` - TypeScript type definitions
  - `test/` - Test files mirroring src structure

### Architecture Patterns
**Monorepo Structure:**
```
apps/
├── api/          # Cloudflare Worker (HTTP + Queue handlers)
├── web/          # Astro web application
└── paper/        # AstroPaper blog theme
```

**Service-Based Architecture:**
- Clean separation between handlers (routing/validation) and services (business logic)
- Each service is self-contained and testable
- Services interact with Cloudflare bindings (D1, R2, Queues)

**Data Flow:**
1. Content uploaded via authenticated POST to `/images`
2. Metadata extracted and JSON written to R2
3. Queue message triggered for async processing
4. Queue consumer reads JSON from R2 and writes to D1
5. Web frontends query D1 for display

**Database Strategy:**
- JSON source of truth stored in R2 (immutable)
- Structured metadata in D1 for queries and indexing
- Drizzle ORM for type-safe migrations and queries
- Separate tables for each content type with shared tagging infrastructure

**Authentication:**
- Bearer token authentication via `AUTH_TOKEN` secret
- Tokens stored in environment variables (`.dev.vars` for local, secrets for production)

### Testing Strategy
- **Framework:** Vitest v3+ with `@cloudflare/vitest-pool-workers`
- **Location:** Tests live in `apps/api/test/` directory
- **Approach:** Integration tests using real Cloudflare Workers environment
- **Commands:**
  - `just test` - Run tests once
  - `just test-watch` - Run in watch mode
  - `just ts-check` - Type check without running tests

### Git Workflow
- **Main Branch:** `main` (default)
- **Feature Branches:** Descriptive names (e.g., `spec-ingest-image`, `cf-queue`)
- **Commit Style:** Descriptive messages using backticks for identifiers
- **Development Commands:**
  - Use `justfile` for common operations
  - `just api` / `just web` / `just paper` to start individual apps
  - `just dev-all` to run all apps in parallel
  - `just migrate` to generate migrations, `just migrate-local` to apply

## Domain Context
**Content Ingestion Flow:**
1. **Upload:** Content (image/file) uploaded to API endpoint
2. **Processing:** Metadata extracted (EXIF, file info, etc.)
3. **Storage:** JSON file written to R2 bucket (`sr-json`)
4. **Queueing:** Message sent to Cloudflare Queue with R2 key
5. **Database:** Queue consumer processes JSON and inserts records into D1

**Content Types & R2 Keys:**
- Each content type has its own table in D1
- Every record includes an `r2Key` field pointing to source JSON in R2
- Original assets (images, videos) stored in `sr-artifact` bucket

**Publishing Model:**
- Most content types have a `publish` boolean flag
- Unpublished content exists in database but hidden from public views
- Timestamps tracked: `createdAt`, `updatedAt` (auto-managed by Drizzle)

## Important Constraints
- **Cloudflare Limits:**
  - D1: SQLite with size limits (check Cloudflare docs for current limits)
  - Workers: CPU time limits, memory limits
  - R2: No egress fees but API rate limits apply
- **SQLite Constraints:**
  - No full-text search (use external service if needed)
  - Limited concurrent writes (handled by queue processing)
- **Authentication:**
  - Single shared token (not user-specific)
  - Token must be kept secret and rotated periodically

## External Dependencies
**Cloudflare Services:**
- **Workers** - Serverless compute platform
- **D1** - SQLite database (`app_db`)
- **R2** - Object storage (`sr-json`, `sr-artifact`)
- **Queues** - Message queue for async processing
- **Stream** - Video encoding and streaming

**Third-Party APIs:**
- **Raindrop.io** - Bookmark synchronization (bookmarks table)

**Development Tools:**
- **Wrangler** - Cloudflare CLI for deployment and local dev
- **just** - Command runner (alternative to make)
- **pnpm** - Package manager with workspace support
