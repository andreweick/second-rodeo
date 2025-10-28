# API Worker

Cloudflare Worker application with HTTP endpoints and queue processing for JSON files stored in R2.

## Features

- **HTTP Handler**: Health check endpoint and image upload API
- **Image Upload API**: Upload images to Cloudflare Images with authentication and validation
- **Queue Consumer**: Processes messages from Cloudflare Queue to read and validate JSON files from R2
- **R2 Integration**: Reads JSON files from the `sr-json` bucket
- **D1 Database**: Connected to `app_db` for data storage

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
└── queue.spec.ts        # Queue handler tests (6 scenarios)
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
2. Set secrets (for production):

```sh
pnpm --filter api exec wrangler secret put CLOUDFLARE_MEDIA_TOKEN
pnpm --filter api exec wrangler secret put AUTH_TOKEN
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
- Real remote Cloudflare Queue (`sr-queue`)
- Local D1 database (`.wrangler/state/v3/d1/`)

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

The queue consumer expects messages with this structure:

```typescript
{
  objectKey: string  // Key of the JSON file in the SR_JSON bucket
}
```

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
wrangler queues create sr-queue
```

Then configure the consumer in `wrangler.jsonc`:

```json
"queues": {
  "consumers": [{
    "queue": "sr-queue",
    "max_batch_size": 10,
    "max_batch_timeout": 30
  }]
}
```

## Sending Test Messages

Send messages to the queue for testing:

```bash
wrangler queues send sr-queue '{"objectKey":"test.json"}'
```

## Environment Bindings

Configured in `wrangler.jsonc`:

- `DB` - D1 database (`app_db`)
- `SR_JSON` - R2 bucket for JSON files
- `SR_ARTIFACT` - R2 bucket for artifacts
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID (variable)
- `CLOUDFLARE_MEDIA_TOKEN` - Cloudflare Media API token (secret)
- `AUTH_TOKEN` - API authentication token (secret)

### Setting Up Environment Variables

1. **Update `wrangler.jsonc`** with your Cloudflare Account ID:
   ```json
   "vars": {
     "CLOUDFLARE_ACCOUNT_ID": "your-account-id-here"
   }
   ```

2. **Set secrets** using Wrangler CLI:
   ```bash
   # Set Cloudflare Media API token (create at dash.cloudflare.com with Images:Edit permission)
   wrangler secret put CLOUDFLARE_MEDIA_TOKEN

   # Set API authentication token (generate a random secure string)
   wrangler secret put AUTH_TOKEN
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
