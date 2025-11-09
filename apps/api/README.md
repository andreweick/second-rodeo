# API Worker

Cloudflare Worker application with HTTP endpoints and queue processing for JSON files stored in R2.

## Features

- **HTTP Endpoints**:
  - Health check (`GET /health`)
  - Image upload to Cloudflare Images (`POST /images`)
  - JSON upload with content hashing (`POST /upload`)
  - Bulk ingestion with self-paginating queue (`POST /ingest/all`)
  - Single file ingestion (`POST /ingest/{objectKey}`)
- **Queue Consumer**: Processes file ingestion and pagination messages from Cloudflare Queue
- **R2 Integration**: Content-addressable storage for JSON files with type-based prefixes
- **D1 Database**: Stores minimal metadata (hot/cold architecture with R2 for full content)
- **Self-Paginating Architecture**: Single curl command ingests all 50K+ files via queue-based pagination

## Project Structure

```
src/
├── index.ts              # Worker entry point (exports fetch and queue handlers)
├── types/
│   └── env.ts           # Environment bindings (DB, SR_JSON, SR_ARTIFACT, CF Images)
├── handlers/
│   ├── http.ts          # HTTP request handler (health check, image upload)
│   └── queue.ts         # Queue message batch handler
└── services/
    ├── image-upload.ts  # Image upload to Cloudflare Images with validation
    └── json-processor.ts # R2 read, JSON parse, and validation logic

test/
├── index.spec.ts        # HTTP handler tests
├── image-upload.spec.ts # Image upload API tests
├── json-upload.spec.ts  # JSON upload API tests
└── queue.spec.ts        # Queue handler tests (9 scenarios)
```

## API Endpoints

### Development Configuration

	pnpm config set store-dir ~/.pnpm-store
	pnpm add  --filter api --store-dir ~/.pnpm-store iconv-lite

0. Generate AUTH_TOKEN for Bearer
This generates a 256-bit (32 byte) random token encoded in base64, which will be 44 characters long. It's cryptographically secure and perfect for a bearer token.

	```sh
	openssl rand -base64 32
	```

1. Update your Cloudflare Account ID in wrangler.jsonc:
"vars": {
  "CLOUDFLARE_ACCOUNT_ID": "your-actual-account-id"
}
2. Set up Secret Store and add secrets:

```sh
# Create a Secret Store (if you don't have one)
wrangler secrets-store store create my-secrets --remote

# List Secret Stores to get the ID
wrangler secrets-store store list

# Add AUTH_TOKEN to the Secret Store
wrangler secrets-store secret put AUTH_TOKEN --store-id <your-store-id>

# Legacy: Set CLOUDFLARE_MEDIA_TOKEN using old secrets (deprecated)
pnpm --filter api exec wrangler secret put CLOUDFLARE_MEDIA_TOKEN
```

3. For local testing, create .dev.vars file in apps/api/:
CLOUDFLARE_MEDIA_TOKEN=your-media-token
AUTH_TOKEN=your-test-auth-token
4. Deploy:
cd apps/api
pnpm deploy

### POST /images

Upload an image to Cloudflare Images.

**Authentication**: Requires `Authorization: Bearer <AUTH_TOKEN>` header

**Request**:
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Form field named `file` containing the image

**Supported Image Types**:
- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`

**Example using curl**:
```bash
curl -X POST https://your-worker.workers.dev/images \
  -H "Authorization: Bearer your-auth-token" \
  -F "file=@/path/to/image.jpg"
```

**Success Response** (201 Created):
```json
{
  "success": true,
  "result": {
    "id": "2cdc28f0-017a-49c4-9ed7-87056c83901",
    "filename": "image.jpg",
    "uploaded": "2025-10-26T12:00:00.000Z",
    "requireSignedURLs": false,
    "variants": [
      "https://imagedelivery.net/account-hash/2cdc28f0-017a-49c4-9ed7-87056c83901/public"
    ]
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `400 Bad Request`: Invalid file type or missing file
- `500 Internal Server Error`: Cloudflare Images API error

### POST /upload

Upload JSON content to R2 with content-addressable storage and automatic queue-based D1 ingestion.

**Authentication**: Requires `Authorization: Bearer <AUTH_TOKEN>` header

**Request**:
- Method: `POST`
- Content-Type: `application/json`
- Body: JSON object with `type` and `data` fields

**Wrapped JSON Format**:
```json
{
  "type": "chatter",
  "data": {
    "date_posted": "2025-01-15T12:00:00Z",
    "year": 2025,
    "month": 1,
    "slug": "example-post",
    "title": "Example Post",
    "content": "Post content here..."
  }
}
```

**Supported Types**:
- `chatter` - Blog-style posts
- `checkins` - Location check-ins
- `films` - Film reviews/data
- `quotes` - Quote collections
- `shakespeare` - Shakespeare text
- `topten` - Top ten lists

**Example using curl**:
```bash
curl -X POST https://your-worker.workers.dev/upload \
  -H "Authorization: Bearer your-auth-token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "chatter",
    "data": {
      "date_posted": "2025-01-15T12:00:00Z",
      "year": 2025,
      "month": 1,
      "slug": "my-post",
      "title": "My Post"
    }
  }'
```

**Success Response** (201 Created):
```json
{
  "objectKey": "chatter/sha256_abc123...def.json",
  "id": "sha256:abc123...def"
}
```

**How it Works**:
1. Server computes SHA-256 hash of the `data` object
2. Wraps content in envelope: `{type, id: "sha256:hash", data}`
3. Stores to R2 at path: `{type}/sha256_{hash}.json`
4. Sends message to queue for D1 ingestion
5. Queue consumer processes file and inserts metadata to D1

**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `400 Bad Request`: Missing or invalid `type` or `data` fields
- `500 Internal Server Error`: R2 storage failure

### POST /ingest/all

Trigger bulk ingestion of all JSON files from R2 into D1 database using self-paginating queue mechanism.

**Authentication**: Requires `Authorization: Bearer <AUTH_TOKEN>` header

**Request**:
- Method: `POST`
- Query Parameters (optional):
  - `cursor` - Pagination cursor (automatically handled by queue, not needed by clients)

**How Self-Pagination Works**:
1. Client calls `/ingest/all` **once** (no cursor needed)
2. Endpoint lists up to 1000 files from R2 and queues them in batches of 100
3. If more files exist, endpoint queues a special pagination message: `{type: "pagination", cursor: "..."}`
4. Queue consumer detects pagination messages and calls `/ingest/all?cursor=...` internally
5. Process repeats automatically until all files are queued
6. **Result**: Single curl command ingests all 50K+ files without client pagination

**Example using curl**:
```bash
# One command ingests ALL files via self-paginating queue
curl -X POST https://your-worker.workers.dev/ingest/all \
  -H "Authorization: Bearer your-auth-token"
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "queued": 1000,
  "hasMore": true,
  "message": "Queued 1000 files. Pagination will continue automatically."
}
```

**Final Page Response**:
```json
{
  "success": true,
  "queued": 132,
  "hasMore": false,
  "message": "Queued 132 files. Ingestion complete."
}
```

**Architecture Details**:
- **R2 List Limit**: 1000 objects per page
- **Queue Batch Limit**: 100 messages per sendBatch()
- **Pagination Messages**: `{type: "pagination", cursor: string}`
- **File Messages**: `{objectKey: "type/sha256_hash.json"}`
- **Idempotent**: Safe to re-run - uses `onConflictDoNothing()` for D1 inserts

**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `500 Internal Server Error`: R2 listing or queue send failure

### POST /ingest/{objectKey}

Queue a specific R2 object for ingestion into D1 database.

**Authentication**: Requires `Authorization: Bearer <AUTH_TOKEN>` header

**Request**:
- Method: `POST`
- URL: `/ingest/{objectKey}` where `{objectKey}` is the full R2 object path

**Example using curl**:
```bash
curl -X POST https://your-worker.workers.dev/ingest/chatter/sha256_abc123.json \
  -H "Authorization: Bearer your-auth-token"
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "objectKey": "chatter/sha256_abc123.json",
  "message": "Queued chatter/sha256_abc123.json for ingestion"
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `400 Bad Request`: Empty object key
- `500 Internal Server Error`: Queue send failure

## Development

### Prerequisites

- Node.js and pnpm
- Wrangler CLI installed
- Cloudflare account with R2 and Queue access

### Install Dependencies

```bash
pnpm install
```

### Local Development

```bash
# Start local development server (connects to remote R2 and Queue)
pnpm dev

# Or using wrangler directly
wrangler dev
```

The local dev server connects to:
- Real remote R2 buckets (`sr-json`, `sr-artifact`)
- Real remote Cloudflare Queue (`json-processing-queue`)
- Local D1 database (`.wrangler/state/v3/d1/`)

### Database Migrations

This project uses Drizzle ORM for database schema management with production migration files in `migrations/`.

**Generate new migration from schema changes**:
```bash
# After modifying src/db/schema.ts
pnpm --filter api exec drizzle-kit generate
```

**Apply migrations to local database**:
```bash
# Run migrations against local .wrangler/state/v3/d1/ database
pnpm --filter api exec wrangler d1 migrations apply DB --local
```

**Apply migrations to production database**:
```bash
# Run migrations against remote Cloudflare D1 database
pnpm --filter api exec wrangler d1 migrations apply DB --remote
```

**Reset production database** (⚠️ Destructive):
```bash
# Drop all tables and re-apply migrations
just reset-db-prod
```

**Query local database**:
```bash
# Open SQLite console to local database
sqlite3 apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
```

**Migration Files**:
- Location: `apps/api/migrations/`
- Format: Drizzle SQL migrations with statement breakpoints
- Execution: Tests use `?raw` imports to stay in sync with production schema

## Testing

This project uses [Vitest](https://vitest.dev/) with [@cloudflare/vitest-pool-workers](https://github.com/cloudflare/workers-sdk/tree/main/packages/vitest-pool-workers) for testing.

### Run Tests

```bash
# Run all tests (watch mode)
pnpm test

# Run tests once (no watch mode)
pnpm test --run

# Run specific test file
pnpm test queue

# Run with UI
pnpm test --ui

# Run with coverage
pnpm test --coverage
```

### Test Environment

Tests use **in-memory** implementations of Cloudflare resources:
- R2 buckets (in-memory, fresh for each test)
- D1 database (in-memory, fresh for each test)
- Queue messages (mocked in test code)

**No real Cloudflare infrastructure is used during testing** - everything runs locally and offline.

#### Database Schema in Tests

Tests run **actual production migration files** from `migrations/` directory:
- Migration SQL files are imported as raw strings using Vite's `?raw` import
- Executed using D1's `batch()` API in `beforeEach()` hooks
- **Test schema automatically stays in sync with production** - no manual maintenance needed
- If you add/modify migrations, tests will automatically use the updated schema

This approach ensures that tests always validate against the real production schema.

### Queue Handler Tests

The queue handler tests (`test/queue.spec.ts`) include 9 scenarios:

1. ✅ Process chatter file
2. ✅ Process checkin file
3. ✅ Process film file
4. ✅ Process quote file
5. ✅ Process shakespeare file
6. ❌ Handle missing file in R2
7. ✅ Process batch with multiple files from different categories
8. ❌ Handle malformed message (missing objectKey)
9. ✅ Handle empty batch

### Test Fixtures

Test fixtures are stored in `test/fixtures/` and imported as raw strings:
- **Category-based organization**: `chatter/`, `checkins/`, `films/`, `quotes/`, `shakespert/`
- **Imported at build time** using Vite's `?raw` import syntax
- **Loaded into in-memory R2** during test setup

To add new test fixtures:
1. Add `.jsonl` files to appropriate `test/fixtures/{category}/` directory
2. Import them in `test/queue.spec.ts`:
   ```typescript
   import newFixture from './fixtures/category/file.jsonl?raw';
   ```
3. Add to the `fixtures` array in `loadFixtures()` function

## Queue Message Format

The queue consumer processes two types of messages:

**File Ingestion Message**:
```typescript
{
  objectKey: string  // R2 object path: "type/sha256_hash.json"
}
```

**Pagination Message** (used internally for self-paginating bulk ingestion):
```typescript
{
  type: "pagination",  // Special type marker
  cursor: string       // R2 list cursor for next page
}
```

When the queue consumer receives a pagination message, it makes an authenticated internal HTTP request to `/ingest/all?cursor={cursor}` to trigger the next page of ingestion automatically.

## Deployment

```bash
# Deploy to Cloudflare
pnpm deploy

# Or using wrangler directly
wrangler deploy
```

## Queue Setup

To create the queue in Cloudflare:

```bash
wrangler queues create json-processing-queue
```

Then configure the consumer in `wrangler.jsonc`:

```json
"queues": {
  "consumers": [{
    "queue": "json-processing-queue",
    "max_batch_size": 100,
    "max_batch_timeout": 30
  }]
}
```

**Queue Configuration**:
- **max_batch_size**: 100 (maximum messages per batch)
- **max_batch_timeout**: 30 seconds (wait time before processing partial batch)
- **Consumer**: Automatically triggered when messages are available

## Sending Test Messages

Send messages to the queue for testing:

```bash
# Test file ingestion message
wrangler queues send json-processing-queue '{"objectKey":"chatter/sha256_test.json"}'

# Test pagination message (internal use)
wrangler queues send json-processing-queue '{"type":"pagination","cursor":"test-cursor"}'
```

## Environment Bindings

Configured in `wrangler.jsonc`:

- `DB` - D1 database (`app_db`)
- `SR_JSON` - R2 bucket for JSON files
- `SR_ARTIFACT` - R2 bucket for artifacts
- `SECRETS` - Secret Store binding for sensitive data
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID (variable)
- `CLOUDFLARE_MEDIA_TOKEN` - Cloudflare Media API token (legacy secret)
- `AUTH_TOKEN` - API authentication token (stored in Secret Store)

### Setting Up Environment Variables

1. **Update `wrangler.jsonc`** with your Cloudflare Account ID:
   ```json
   "vars": {
     "CLOUDFLARE_ACCOUNT_ID": "your-account-id-here"
   }
   ```

2. **Set up Secret Store and add secrets**:
   ```bash
   # List Secret Stores to get your Store ID
   wrangler secrets-store store list

   # Add AUTH_TOKEN to the Secret Store
   wrangler secrets-store secret put AUTH_TOKEN --store-id <your-store-id>

   # Legacy: Set Cloudflare Media API token using old secrets
   wrangler secret put CLOUDFLARE_MEDIA_TOKEN
   ```

3. **For local development**, create `.dev.vars` file:
   ```
   CLOUDFLARE_MEDIA_TOKEN=your-media-token
   AUTH_TOKEN=your-auth-token
   ```

---

## Cloudflare Workers vs Node.js: Key Differences

This section documents the unique challenges of developing for Cloudflare Workers and the solutions we've implemented in this project.

### Architecture Overview

Cloudflare Workers run in **V8 isolates**, not in a Node.js runtime:

| Feature | Node.js | Cloudflare Workers |
|---------|---------|-------------------|
| Runtime | V8 + Node.js APIs | V8 isolate only |
| Filesystem | Full `fs` module access | ❌ **No filesystem access** |
| Startup time | ~100-500ms | ~0ms (already loaded) |
| Memory | Configurable, GBs | 128MB limit |
| CPU time | Unlimited | 50ms (paid) / 10ms (free) |
| Imports | CommonJS, ESM, dynamic | ESM only, static imports |

**Key insight**: Workers are **stateless** and **sandboxed** - they can't read files, spawn processes, or access the local filesystem.

### The Filesystem Problem

During development of this project, we encountered multiple failures due to Node.js filesystem APIs not being available:

#### ❌ What Doesn't Work

```typescript
// All of these FAIL in Workers:
import { readdirSync, readFileSync, statSync } from 'fs';

// Error: "readdirSync() is not yet implemented in Workers"
const files = readdirSync('./migrations');

// Error: "readFileSync() is not yet implemented in Workers"
const content = readFileSync('./data.json', 'utf-8');

// Error: "statSync() is not yet implemented in Workers"
const stats = statSync('./directory');
```

This affects common patterns like:
- ❌ Dynamic file discovery (scanning directories)
- ❌ Reading configuration files at runtime
- ❌ Loading migration files dynamically
- ❌ Using `require()` or `import()` with computed paths

#### ✅ What Does Work: Build-time Imports

Vite's `?raw` import suffix loads file content at **build time** (before deployment):

```typescript
// ✅ This works - file content bundled during build
import migration0 from '../migrations/0000_orange_retro_girl.sql?raw';
import migration1 from '../migrations/0001_normal_sue_storm.sql?raw';
import fixtureData from './fixtures/test.jsonl?raw';

// migration0 is now a string containing the SQL
console.log(typeof migration0); // "string"
```

**How it works**:
1. Vite processes the import during `pnpm build`
2. File content is inlined into the JavaScript bundle
3. At runtime, it's just a string variable - no filesystem needed

### Common Pitfalls & Solutions

#### Problem 1: Drizzle's Migrator Doesn't Work

```typescript
// ❌ This fails in Workers tests
import { migrate } from 'drizzle-orm/d1/migrator';

await migrate(db, { migrationsFolder: './migrations' });
// Error: Can't find meta/_journal.json file
```

**Why**: `drizzle-orm/d1/migrator` uses Node.js `fs` module to read migration files at runtime.

**Solution**: Import migrations as raw strings and execute with D1's `batch()` API:

```typescript
// ✅ This works
import migration0 from '../migrations/0000_orange_retro_girl.sql?raw';
import migration1 from '../migrations/0001_normal_sue_storm.sql?raw';

const migrations = [migration0, migration1];

for (const sql of migrations) {
  const statements = sql
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
}
```

#### Problem 2: D1's `exec()` vs `batch()` for Migrations

```typescript
// ❌ This had issues with multi-line CREATE TABLE statements
await env.DB.exec(migrationSql);
// Error: incomplete input: SQLITE_ERROR

// ✅ batch() handles multiple statements reliably
await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
```

**Why**: `exec()` expects carefully formatted SQL, while `batch()` accepts an array of prepared statements and is more robust.

#### Problem 3: Auto-Discovery of Test Fixtures

```typescript
// ❌ Can't scan directories
const files = readdirSync('./test/fixtures')
  .filter(f => f.endsWith('.jsonl'));

// ✅ Must explicitly import each fixture
import chatter1 from './fixtures/chatter/file1.jsonl?raw';
import chatter2 from './fixtures/chatter/file2.jsonl?raw';

const fixtures = [
  ['chatter', 'file1.jsonl', chatter1],
  ['chatter', 'file2.jsonl', chatter2],
];
```

**Tradeoff**: Less dynamic, but more explicit and works in Workers environment.

### Testing in Workers Environment

We use `@cloudflare/vitest-pool-workers` which provides:

- ✅ In-memory R2 buckets (no real Cloudflare API calls)
- ✅ In-memory D1 database (fresh SQLite for each test)
- ✅ Mock Queue implementation
- ✅ Same runtime constraints as production Workers

**Key insight**: Tests fail with the same errors as production would - if `readdirSync()` doesn't work in tests, it won't work in production either. This is a feature, not a bug!

### Migration Pattern: Staying in Sync with Production

**The Problem**: Hand-written table schemas in tests drift from production over time.

**Our Solution** (see `test/queue.spec.ts:5-65`):

1. Import actual migration files as raw strings
2. Parse and execute them in test `beforeEach()` hooks
3. Tests automatically use production schema - zero maintenance

```typescript
import migration0 from '../migrations/0000_orange_retro_girl.sql?raw';
import migration1 from '../migrations/0001_normal_sue_storm.sql?raw';

async function runMigrations() {
  const migrations = [migration0, migration1];
  // Execute actual production SQL...
}
```

**Benefits**:
- ✅ Test schema always matches production
- ✅ No manual synchronization needed
- ✅ Schema changes automatically propagate to tests
- ✅ Works in Workers environment

### Best Practices for Workers Development

1. **Think "Build-time vs Runtime"**
   - Load data/config at build time using `?raw` imports
   - Avoid dynamic file operations entirely

2. **Use D1's `batch()` for Multiple Statements**
   - More reliable than `exec()` for migrations
   - Handles multi-line SQL better

3. **Embrace Static Imports**
   - List all imports explicitly at the top of files
   - Avoid computed import paths or dynamic requires

4. **Test with vitest-pool-workers**
   - Catches Workers-specific issues early
   - Validates against real runtime constraints

5. **Document Workarounds**
   - Workers constraints aren't obvious to Node.js developers
   - Comment why code uses unusual patterns

### References

- [Cloudflare Workers Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/)
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [@cloudflare/vitest-pool-workers](https://github.com/cloudflare/workers-sdk/tree/main/packages/vitest-pool-workers)
- [Vite ?raw imports](https://vitejs.dev/guide/assets.html#importing-asset-as-string)
