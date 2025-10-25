# Image API Specification

## Overview

This document specifies the design and implementation of an image management API that provides CRUD operations for images, stores metadata in a Cloudflare D1 database, and leverages Cloudflare Images for storage.

### Key Features

- RESTful API endpoints for image CRUD operations
- Comprehensive metadata extraction (EXIF, IPTC, C2PA)
- Content authenticity verification via C2PA (Content Authenticity Initiative)
- Integration with Cloudflare Images for storage
- Durable-first architecture with R2 as source of truth
- D1 database as indexed view for fast queries
- Idempotent operations with deterministic content-hash IDs
- HMAC-signed URLs for private image delivery

---

## Architecture Philosophy

### Durable-First Design

This API follows a **durable-first** architecture pattern where data durability and recoverability are prioritized:

**1. R2 as Source of Truth (Canonical Storage)**
- **Purpose:** Immutable storage, one JSON file per image
- **Content:** Complete image metadata records with all extracted data
- **Durability:** R2 provides 11 nines of durability
- **Recovery:** Can rebuild D1 entirely from R2 if needed
- **Format:** Individual JSON files for simple, race-condition-free writes

**2. D1 as Indexed View (Query Layer)**
- **Purpose:** Fast queries, filtering, sorting, pagination
- **Content:** All image metadata with indexes for common queries
- **Relationship:** Derived from R2, can be rebuilt
- **Updates:** Idempotent writes with `ON CONFLICT` clauses
- **Role:** Searchable index, optimized for API queries

### Data Flow

```
[Upload Phase]
Upload → Cloudflare Images → Store basic record in D1 → Queue metadata job → Return

[Metadata Extraction Phase - Queue Worker]
Fetch from Cloudflare Images
    ↓
Extract EXIF + IPTC (fast, in Worker)
    ↓
Extract C2PA (call Golang container via Durable Object)
    ↓
[1] Write complete record to R2 (single JSON file) - SOURCE OF TRUTH
    ↓
[2] Update D1 (indexed view) - idempotent
```

**Why R2 write happens AFTER all metadata extraction:**
- R2 stores the COMPLETE, immutable record with all metadata (EXIF + IPTC + C2PA)
- Single write per image - no updates needed
- Individual JSON files prevent race conditions
- Simpler: one write to R2 per image, ever

### Key Principles

**Idempotency:**
- Every image has a deterministic ID based on content hash (SHA-256)
- All writes use `INSERT ... ON CONFLICT(id) DO UPDATE ...`
- Replays are safe - same input produces same result
- Enables retry logic without duplication

**Simple Storage:**
- One JSON file per image in R2
- No complex append logic or race conditions
- Rebuild operations: list all files and read each one
- Parallel processing: each file is independent

**Failure Recovery:**
- If D1 is cleared: rebuild from R2 (list all JSON files)
- If R2 is lost: catastrophic (but 11 nines durability)
- Queue failures: retry with idempotent operations
- Worker failures: queue system auto-retries

**Immutability:**
- R2 files are written once, never updated
- Image ID is content-based (same file = same ID)
- Deduplication happens before upload
- Audit trail via file timestamps and versions

---

## Storage Architecture

### R2 Storage (Source of Truth)

**Bucket:** `images-metadata`

**Structure:** Individual JSON files - one file per image

**File Organization:**
```
/images/{imageId}.json
```

Example: `/images/img_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.json`

**Benefits:**
- Simple, race-condition-free writes (each image = separate file)
- No complex append logic needed
- Easy to rebuild: just list all files
- Parallel processing: each file is independent
- Immutable: write once, never update

**JSON Record Format:**
```json
{
  "id": "img_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "content_hash": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
  "original_filename": "photo.jpg",
  "cloudflare_image_id": "cf_xyz789",
  "mime_type": "image/jpeg",
  "file_size": 2048576,
  "width": 4032,
  "height": 3024,
  "uploaded_at": 1729785600000,
  "uploaded_by": "user123",
  "exif_data": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTime": "2025:10:20 14:30:00",
    "FocalLength": "50mm",
    "FNumber": 2.8,
    "ISO": 100,
    "GPS": {"latitude": 42.3923, "longitude": -83.0495}
  },
  "iptc_data": {
    "caption": "Sample photo",
    "creator": "John Doe",
    "copyright": "© 2025 John Doe",
    "keywords": ["nature", "landscape"]
  },
  "c2pa_manifest": {
    "claim_generator": "Adobe Photoshop 24.0",
    "signature_valid": true,
    "issuer": "Adobe Content Credentials"
  },
  "c2pa_verified": true,
  "c2pa_signature_valid": true,
  "c2pa_issuer": "Adobe Content Credentials",
  "cloudflare_url_base": "https://imagedelivery.net/account-hash/cf_xyz789",
  "variants": ["w800", "w1280", "w1920", "w2560", "sq256", "sq512"],
  "description": "Sample description",
  "tags": ["nature", "landscape"],
  "status": "active",
  "is_public": false,
  "metadata_status": "completed",
  "updated_at": 1729785605000,
  "deleted_at": null,
  "_version": "1.0",
  "_written_at": 1729785605000
}
```

**ID Generation (Content-Based, Deterministic):**
```typescript
// Hash the actual image file content
async function generateImageId(fileBuffer: ArrayBuffer): Promise<{
  imageId: string;
  contentHash: string;
}> {
  // Compute full SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Use first 128 bits (32 hex chars) for ID
  const imageId = `img_${contentHash.slice(0, 32)}`;

  return { imageId, contentHash };
}

// Example result:
// imageId: "img_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" (36 chars total)
// contentHash: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4..." (64 chars)
```

**Write Operations:**
```typescript
// Write complete record to R2 (simple, single write)
const r2Key = `images/${imageId}.json`;

const record = {
  id: imageId,
  content_hash: contentHash,
  original_filename: originalFilename,
  cloudflare_image_id: cloudflareImageId,
  // ... all metadata fields (EXIF + IPTC + C2PA)
  _version: '1.0',
  _written_at: Date.now()
};

// Single PUT operation - no append, no race conditions
await env.R2_BUCKET.put(r2Key, JSON.stringify(record, null, 2));
```

**Read Operations (Rebuild):**
```typescript
// Rebuild D1 from R2
async function rebuildFromR2(env: Env) {
  const objects = await env.R2_BUCKET.list({ prefix: 'images/' });

  for (const obj of objects.objects) {
    const content = await env.R2_BUCKET.get(obj.key);
    const record = await content.json(); // Single JSON object per file

    // Idempotent insert
    await env.DB.prepare(`
      INSERT INTO images (id, content_hash, original_filename, cloudflare_image_id, ...)
      VALUES (?, ?, ?, ?, ...)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        metadata_status = excluded.metadata_status
    `).bind(/* ... */).run();
  }
}
```

---

## Database Schema (D1)

### Images Table

```sql
CREATE TABLE images (
  -- Primary identification
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE, -- Full SHA-256 hash for verification/deduplication
  original_filename TEXT NOT NULL,
  cloudflare_image_id TEXT NOT NULL UNIQUE,

  -- Basic metadata
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,

  -- Upload information
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by TEXT,

  -- EXIF metadata (JSON blob)
  exif_data TEXT, -- JSON string containing all EXIF data

  -- IPTC metadata (JSON blob)
  iptc_data TEXT, -- JSON string containing all IPTC data

  -- C2PA Content Authenticity
  c2pa_manifest TEXT, -- JSON string containing C2PA manifest
  c2pa_verified BOOLEAN DEFAULT FALSE,
  c2pa_signature_valid BOOLEAN,
  c2pa_issuer TEXT,

  -- Cloudflare Images URLs
  cloudflare_url_base TEXT,
  cloudflare_url_public TEXT,

  -- Image variants (JSON array of available variants)
  variants TEXT, -- JSON array of variant names/sizes

  -- Additional metadata
  description TEXT,
  tags TEXT, -- JSON array of tags

  -- Status and flags
  status TEXT DEFAULT 'active', -- active, archived, deleted
  is_public BOOLEAN DEFAULT FALSE,
  metadata_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed

  -- Timestamps
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_images_content_hash ON images(content_hash);
CREATE INDEX idx_images_cloudflare_id ON images(cloudflare_image_id);
CREATE INDEX idx_images_uploaded_at ON images(uploaded_at);
CREATE INDEX idx_images_status ON images(status);
CREATE INDEX idx_images_uploaded_by ON images(uploaded_by);
CREATE INDEX idx_images_c2pa_verified ON images(c2pa_verified);
CREATE INDEX idx_images_metadata_status ON images(metadata_status);
```

---

## Drizzle ORM Schema

### Overview

This project uses [Drizzle ORM](https://orm.drizzle.team/) for type-safe database operations with Cloudflare D1. Drizzle provides compile-time type checking, excellent TypeScript integration, and a lightweight runtime.

### Images Table Definition

**Location:** `packages/db/schema.ts`

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const images = sqliteTable("images", {
  // Primary identification
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull().unique(), // Full SHA-256 for verification
  originalFilename: text("original_filename").notNull(),
  cloudflareImageId: text("cloudflare_image_id").notNull().unique(),

  // Basic metadata
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  width: integer("width"),
  height: integer("height"),

  // Upload information
  uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" }).notNull(),
  uploadedBy: text("uploaded_by"),

  // EXIF metadata (JSON blob)
  exifData: text("exif_data"),  // JSON string containing all EXIF data

  // IPTC metadata (JSON blob)
  iptcData: text("iptc_data"),  // JSON string containing all IPTC data

  // C2PA Content Authenticity
  c2paManifest: text("c2pa_manifest"),  // JSON string containing C2PA manifest
  c2paVerified: integer("c2pa_verified", { mode: "boolean" }).default(false),
  c2paSignatureValid: integer("c2pa_signature_valid", { mode: "boolean" }),
  c2paIssuer: text("c2pa_issuer"),

  // Cloudflare Images URLs
  cloudflareUrlBase: text("cloudflare_url_base"),
  cloudflareUrlPublic: text("cloudflare_url_public"),

  // Image variants (JSON array of available variants)
  variants: text("variants"),  // JSON array of variant names/sizes

  // Additional metadata
  description: text("description"),
  tags: text("tags"),  // JSON array of tags

  // Status and flags
  status: text("status").default("active"),  // active, archived, deleted
  isPublic: integer("is_public", { mode: "boolean" }).default(false),
  metadataStatus: text("metadata_status").default("pending"),  // pending, processing, completed, failed

  // Timestamps
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" })
});

// Type inference for TypeScript
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
```

### Schema Field Mappings

| TypeScript Field      | Database Column          | Type      | Purpose                                    |
|-----------------------|--------------------------|-----------|-------------------------------------------|
| `id`                  | `id`                     | text      | Unique image identifier (primary key)     |
| `originalFilename`    | `original_filename`      | text      | Original uploaded filename                |
| `cloudflareImageId`   | `cloudflare_image_id`    | text      | Cloudflare Images unique ID (unique)      |
| `mimeType`            | `mime_type`              | text      | Image MIME type (e.g., image/jpeg)        |
| `fileSize`            | `file_size`              | integer   | File size in bytes                        |
| `width`               | `width`                  | integer   | Image width in pixels                     |
| `height`              | `height`                 | integer   | Image height in pixels                    |
| `uploadedAt`          | `uploaded_at`            | timestamp | Upload timestamp (milliseconds)           |
| `uploadedBy`          | `uploaded_by`            | text      | User ID who uploaded                      |
| `exifData`            | `exif_data`              | text      | JSON-encoded EXIF metadata                |
| `iptcData`            | `iptc_data`              | text      | JSON-encoded IPTC metadata                |
| `c2paManifest`        | `c2pa_manifest`          | text      | JSON-encoded C2PA manifest                |
| `c2paVerified`        | `c2pa_verified`          | boolean   | Whether C2PA verification passed          |
| `c2paSignatureValid`  | `c2pa_signature_valid`   | boolean   | Whether C2PA signature is valid           |
| `c2paIssuer`          | `c2pa_issuer`            | text      | C2PA certificate issuer                   |
| `cloudflareUrlBase`   | `cloudflare_url_base`    | text      | Base URL for Cloudflare delivery          |
| `cloudflareUrlPublic` | `cloudflare_url_public`  | text      | Public variant URL                        |
| `variants`            | `variants`               | text      | JSON array of available variant names     |
| `description`         | `description`            | text      | User-provided description                 |
| `tags`                | `tags`                   | text      | JSON array of tags                        |
| `status`              | `status`                 | text      | Record status (active/archived/deleted)   |
| `isPublic`            | `is_public`              | boolean   | Whether image is publicly accessible      |
| `metadataStatus`      | `metadata_status`        | text      | Metadata processing status (pending/processing/completed/failed) |
| `updatedAt`           | `updated_at`             | timestamp | Last update timestamp (milliseconds)      |
| `deletedAt`           | `deleted_at`             | timestamp | Soft delete timestamp (milliseconds)      |

### Type Safety Features

**Type Inference:**
```typescript
// Selecting (reading) from database - includes all fields
type Image = {
  id: string;
  originalFilename: string;
  cloudflareImageId: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  uploadedAt: Date;
  uploadedBy: string | null;
  exifData: string | null;
  iptcData: string | null;
  c2paManifest: string | null;
  c2paVerified: boolean;
  c2paSignatureValid: boolean | null;
  c2paIssuer: string | null;
  cloudflareUrlBase: string | null;
  cloudflareUrlPublic: string | null;
  variants: string | null;
  description: string | null;
  tags: string | null;
  status: string;
  isPublic: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
};

// Inserting (creating) records - omits auto-generated/optional fields
type NewImage = {
  id: string;
  originalFilename: string;
  cloudflareImageId: string;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  uploadedAt: Date;
  uploadedBy?: string | null;
  exifData?: string | null;
  iptcData?: string | null;
  c2paManifest?: string | null;
  c2paVerified?: boolean;
  c2paSignatureValid?: boolean | null;
  c2paIssuer?: string | null;
  cloudflareUrlBase?: string | null;
  cloudflareUrlPublic?: string | null;
  variants?: string | null;
  description?: string | null;
  tags?: string | null;
  status?: string;
  isPublic?: boolean;
  updatedAt: Date;
  deletedAt?: Date | null;
};
```

### JSON Field Handling

Several fields store JSON data as text and require parsing/serialization:

**EXIF Data Structure:**
```typescript
interface ExifData {
  Make?: string;
  Model?: string;
  DateTime?: string;
  DateTimeOriginal?: string;
  DateTimeDigitized?: string;
  FocalLength?: string;
  FNumber?: number;
  ISO?: number;
  ShutterSpeed?: string;
  WhiteBalance?: string;
  Flash?: string;
  Lens?: string;
  GPS?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  Width?: number;
  Height?: number;
  Resolution?: number;
  ColorSpace?: string;
  Orientation?: number;
}
```

**IPTC Data Structure:**
```typescript
interface IptcData {
  caption?: string;
  headline?: string;
  keywords?: string[];
  category?: string;
  creator?: string;
  creatorContactInfo?: {
    city?: string;
    country?: string;
    address?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  copyright?: string;
  usageTerms?: string;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  sublocation?: string;
  copyrightStatus?: string;
  rightsUsageTerms?: string;
  webStatement?: string;
}
```

**C2PA Manifest Structure:**
```typescript
interface C2paManifest {
  claim_generator: string;
  claim_generator_info?: any[];
  signature_valid: boolean;
  issuer: string;
  assertions: Array<{
    label: string;
    data: any;
  }>;
  ingredients: Array<{
    title: string;
    format: string;
    relationship: string;
  }>;
  signature_info: {
    alg: string;
    time: string;
    issuer: string;
  };
}
```

**Variants Array:**
```typescript
type Variants = string[]; // e.g., ["public", "thumbnail", "medium", "large"]
```

**Tags Array:**
```typescript
type Tags = string[]; // e.g., ["nature", "landscape", "sunset"]
```

### Helper Functions for JSON Fields

```typescript
// Serialize/deserialize EXIF data
function serializeExif(exif: ExifData): string {
  return JSON.stringify(exif);
}

function deserializeExif(exifString: string | null): ExifData | null {
  if (!exifString) return null;
  try {
    return JSON.parse(exifString);
  } catch {
    return null;
  }
}

// Serialize/deserialize IPTC data
function serializeIptc(iptc: IptcData): string {
  return JSON.stringify(iptc);
}

function deserializeIptc(iptcString: string | null): IptcData | null {
  if (!iptcString) return null;
  try {
    return JSON.parse(iptcString);
  } catch {
    return null;
  }
}

// Serialize/deserialize C2PA manifest
function serializeC2pa(manifest: C2paManifest): string {
  return JSON.stringify(manifest);
}

function deserializeC2pa(manifestString: string | null): C2paManifest | null {
  if (!manifestString) return null;
  try {
    return JSON.parse(manifestString);
  } catch {
    return null;
  }
}

// Serialize/deserialize variants
function serializeVariants(variants: string[]): string {
  return JSON.stringify(variants);
}

function deserializeVariants(variantsString: string | null): string[] {
  if (!variantsString) return [];
  try {
    return JSON.parse(variantsString);
  } catch {
    return [];
  }
}

// Serialize/deserialize tags
function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

function deserializeTags(tagsString: string | null): string[] {
  if (!tagsString) return [];
  try {
    return JSON.parse(tagsString);
  } catch {
    return [];
  }
}
```

### Drizzle Usage Examples

**Querying a single image:**
```typescript
import { db } from './db/client';
import { images } from './db/schema';
import { eq } from 'drizzle-orm';

const image = await db
  .select()
  .from(images)
  .where(eq(images.id, 'img_abc123'))
  .get();

// Parse JSON fields
const exif = deserializeExif(image.exifData);
const iptc = deserializeIptc(image.iptcData);
const c2pa = deserializeC2pa(image.c2paManifest);
```

**Inserting a new image:**
```typescript
const newImage: NewImage = {
  id: generateId(),
  originalFilename: 'photo.jpg',
  cloudflareImageId: 'cf_xyz789',
  mimeType: 'image/jpeg',
  fileSize: 2048576,
  width: 4032,
  height: 3024,
  uploadedAt: new Date(),
  uploadedBy: 'user123',
  exifData: serializeExif(extractedExif),
  iptcData: serializeIptc(extractedIptc),
  c2paManifest: serializeC2pa(extractedC2pa),
  c2paVerified: true,
  c2paSignatureValid: true,
  c2paIssuer: 'Adobe Content Credentials',
  cloudflareUrlPublic: 'https://...',
  variants: serializeVariants(['public', 'thumbnail']),
  status: 'active',
  isPublic: false,
  updatedAt: new Date()
};

await db.insert(images).values(newImage);
```

**Filtering and pagination:**
```typescript
import { and, eq, gte, lte, desc } from 'drizzle-orm';

const results = await db
  .select()
  .from(images)
  .where(
    and(
      eq(images.status, 'active'),
      eq(images.uploadedBy, 'user123'),
      gte(images.uploadedAt, startDate),
      lte(images.uploadedAt, endDate)
    )
  )
  .orderBy(desc(images.uploadedAt))
  .limit(20)
  .offset(0);
```

**Updating image metadata:**
```typescript
await db
  .update(images)
  .set({
    description: 'Updated description',
    tags: serializeTags(['new', 'tags']),
    updatedAt: new Date()
  })
  .where(eq(images.id, 'img_abc123'));
```

**Soft delete:**
```typescript
await db
  .update(images)
  .set({
    status: 'deleted',
    deletedAt: new Date(),
    updatedAt: new Date()
  })
  .where(eq(images.id, 'img_abc123'));
```

**Hard delete:**
```typescript
await db
  .delete(images)
  .where(eq(images.id, 'img_abc123'));
```

### Benefits of Drizzle ORM

1. **Type Safety:** Full TypeScript support with compile-time type checking
2. **Lightweight:** Minimal runtime overhead compared to heavier ORMs
3. **SQL-like Syntax:** Familiar query builder that resembles SQL
4. **Edge-Ready:** Optimized for Cloudflare Workers and edge runtimes
5. **Migration Support:** Built-in schema migration tools
6. **Flexibility:** Can drop down to raw SQL when needed
7. **Auto-completion:** IDE support for schema fields and queries

---

## Image URL Generation with HMAC Signing

### Overview

The API returns URLs that leverage your existing HMAC signing infrastructure (from `cf-images.txt`). URLs work differently for public vs private images.

### URL Patterns

**Public Images:**
```
https://eick.com/images/{cloudflare_image_id}/{variant}
```
- Handled by: Cloudflare Zone Rewrite (automatic, no Worker)
- Rewrites to: `/cdn-cgi/imagedelivery/<ACCOUNT_HASH>/{cloudflare_image_id}/{variant}`
- Caching: Maximum (unsigned, shared across all users)
- Performance: Fastest (no Worker hop)

**Private Images:**
```
https://eick.com/images-secure/{cloudflare_image_id}/{variant}
```
- Handled by: HMAC Signing Worker (`worker-images-signer.ts`)
- Computes: HMAC signature with 30-day expiry bucket
- Returns: 302 redirect to signed URL
- Caching: 30-day bucket (signed URLs shared within bucket)

### Supported Variants

- **w800** - 800px width, scale-down
- **w1280** - 1280px width, scale-down
- **w1920** - 1920px width, scale-down
- **w2560** - 2560px width, scale-down (hero/lightbox)
- **sq256** - 256×256px square, cover crop
- **sq512** - 512×512px square, cover crop

### API Response Format

**GET /api/v1/images/:id**

```json
{
  "success": true,
  "data": {
    "id": "img_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "cloudflare_image_id": "083eb7b2-5392-4565-b69e-aff66acddd00",
    "original_filename": "photo.jpg",
    "is_public": false,
    "variants": ["w800", "w1280", "w1920", "w2560", "sq256", "sq512"],
    "urls": {
      "w800": "https://eick.com/images-secure/083eb7b2-5392-4565-b69e-aff66acddd00/w800",
      "w1280": "https://eick.com/images-secure/083eb7b2-5392-4565-b69e-aff66acddd00/w1280",
      "w1920": "https://eick.com/images-secure/083eb7b2-5392-4565-b69e-aff66acddd00/w1920",
      "w2560": "https://eick.com/images-secure/083eb7b2-5392-4565-b69e-aff66acddd00/w2560",
      "sq256": "https://eick.com/images-secure/083eb7b2-5392-4565-b69e-aff66acddd00/sq256",
      "sq512": "https://eick.com/images-secure/083eb7b2-5392-4565-b69e-aff66acddd00/sq512"
    }
  }
}
```

### Implementation

**URL Generation Logic:**
```typescript
function buildImageUrls(image: Image): Record<string, string> {
  const variants = ['w800', 'w1280', 'w1920', 'w2560', 'sq256', 'sq512'];

  // Choose prefix based on public/private flag
  const urlPrefix = image.isPublic
    ? 'https://eick.com/images'
    : 'https://eick.com/images-secure';

  // Generate URL for each variant
  const urls: Record<string, string> = {};
  for (const variant of variants) {
    urls[variant] = `${urlPrefix}/${image.cloudflareImageId}/${variant}`;
  }

  return urls;
}
```

**GET Endpoint with URLs:**
```typescript
router.get('/api/v1/images/:id', async (request, env) => {
  const imageId = request.params.id;

  const db = connectD1(env.DB);
  const image = await db
    .select()
    .from(images)
    .where(eq(images.id, imageId))
    .limit(1);

  if (!image.length) {
    return Response.json(
      { success: false, error: 'Image not found' },
      { status: 404 }
    );
  }

  const record = image[0];
  const urls = buildImageUrls(record);

  return Response.json({
    success: true,
    data: {
      id: record.id,
      cloudflare_image_id: record.cloudflareImageId,
      original_filename: record.originalFilename,
      is_public: record.isPublic,
      variants: ['w800', 'w1280', 'w1920', 'w2560', 'sq256', 'sq512'],
      urls: urls,
      mime_type: record.mimeType,
      file_size: record.fileSize,
      width: record.width,
      height: record.height,
      uploaded_at: record.uploadedAt.toISOString(),
      // Include metadata if requested
      exif_data: record.exifData ? JSON.parse(record.exifData) : null,
      iptc_data: record.iptcData ? JSON.parse(record.iptcData) : null,
      c2pa_manifest: record.c2paManifest ? JSON.parse(record.c2paManifest) : null,
      c2pa_verified: record.c2paVerified,
    }
  });
});
```

### Client Usage

**Browser:**
```html
<img
  src="https://eick.com/images-secure/083eb7b2.../w1280"
  srcset="
    https://eick.com/images-secure/083eb7b2.../w800 800w,
    https://eick.com/images-secure/083eb7b2.../w1280 1280w,
    https://eick.com/images-secure/083eb7b2.../w1920 1920w
  "
  sizes="(min-width: 1400px) 1300px, (min-width: 900px) 85vw, 95vw"
  alt="Photo">
```

**Request Flow (Private Image):**
```
1. Browser requests: https://eick.com/images-secure/083eb7b2.../w1280
2. HMAC Worker signs request (30-day bucket)
3. 302 redirect to: https://imagedelivery.net/.../w1280?exp=...&sig=...
4. Browser follows redirect
5. Cloudflare Images validates signature and serves image
6. Image cached at edge with 30-day TTL
```

### Benefits

- ✅ **Leverages existing infrastructure** - Uses deployed HMAC Worker
- ✅ **No signing in API** - API just returns URLs, Worker handles signing
- ✅ **Secure** - Signing key only in dedicated Worker
- ✅ **Cacheable** - 30-day bucket URLs share cache
- ✅ **Fast** - Public images bypass Worker entirely (zone rewrite)
- ✅ **Flexible** - Easy to switch image between public/private

### Zone Rewrite Configuration (Public Images)

**Cloudflare Dashboard → Rules → Page Rules:**
```
If Path: /images/*
Then Rewrite: /cdn-cgi/imagedelivery/<ACCOUNT_HASH>/${1}
```

**No Worker needed** - Zone rewrite happens automatically.

---

## API Endpoints

### OpenAPI Compliance

This API follows **OpenAPI 3.1.0** specification standards.

**OpenAPI Document Location:** `/openapi.yaml` or `/openapi.json`

**Key Requirements:**
- All endpoints documented with OpenAPI spec
- Request/response schemas defined
- Error responses standardized
- Authentication schemes defined
- Examples provided for all operations

**Standard Response Format:**
```typescript
{
  success: boolean;
  data?: T;           // On success
  error?: {           // On failure
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {        // Optional pagination/context
    page?: number;
    limit?: number;
    total_count?: number;
    total_pages?: number;
  };
}
```

**Standard Error Codes:**
- `INVALID_REQUEST` - Malformed request
- `INVALID_FILE_TYPE` - Unsupported image format
- `FILE_TOO_LARGE` - Exceeds size limit
- `IMAGE_NOT_FOUND` - Image ID doesn't exist
- `UNAUTHORIZED` - Missing/invalid authentication
- `FORBIDDEN` - Insufficient permissions
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `CLOUDFLARE_UPLOAD_FAILED` - Upload to Cloudflare failed
- `METADATA_EXTRACTION_FAILED` - Metadata processing error
- `DATABASE_ERROR` - D1 operation failed
- `INTERNAL_SERVER_ERROR` - Unexpected error

**Standard HTTP Status Codes:**
- `200 OK` - Successful GET, PATCH
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `413 Payload Too Large` - File exceeds limit
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Temporary outage

### Base URL
```
/api/v1/images
```

### API Versioning
- Version in URL path: `/api/v1/...`
- Breaking changes require new version
- Old versions supported for 6 months minimum

### 1. Create (Upload) Image

**Endpoint:** `POST /api/v1/images`

**Description:** Upload a new image, extract metadata, and store in Cloudflare Images

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  ```
  image: File (required)
  description: String (optional)
  tags: Array<String> (optional)
  is_public: Boolean (optional, default: false)
  uploaded_by: String (optional)
  ```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "original_filename": "photo.jpg",
    "cloudflare_image_id": "cf_xyz789",
    "mime_type": "image/jpeg",
    "file_size": 2048576,
    "width": 4032,
    "height": 3024,
    "uploaded_at": "2025-10-24T12:00:00Z",
    "exif_data": {
      "Make": "Canon",
      "Model": "EOS R5",
      "DateTime": "2025:10:20 14:30:00",
      "FocalLength": "50mm",
      "FNumber": 2.8,
      "ISO": 100,
      "GPS": {
        "latitude": 42.3923,
        "longitude": -83.0495
      }
    },
    "iptc_data": {
      "caption": "Sample photo",
      "creator": "John Doe",
      "copyright": "© 2025 John Doe",
      "keywords": ["nature", "landscape"]
    },
    "c2pa_manifest": {
      "claim_generator": "Adobe Photoshop 24.0",
      "signature_valid": true,
      "issuer": "Adobe Content Credentials",
      "assertions": [...],
      "ingredients": [...]
    },
    "c2pa_verified": true,
    "c2pa_signature_valid": true,
    "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/public",
    "variants": ["public", "thumbnail", "medium", "large"]
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid file type or missing required fields
- `413 Payload Too Large` - File exceeds maximum size
- `500 Internal Server Error` - Upload or processing failed

---

### 2. Read (Get) Image

**Endpoint:** `GET /api/v1/images/:id`

**Description:** Retrieve metadata for a specific image

**Parameters:**
- `id` (path): Image ID

**Query Parameters:**
- `include_metadata` (boolean): Include full EXIF/IPTC/C2PA data (default: true)

**Implementation Details:**

This endpoint uses Drizzle ORM to query the images table and transform the data for API consumption:

```typescript
import { db } from '@/db/client';
import { images } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function getImageById(id: string, includeMetadata = true) {
  // Query the database using Drizzle
  const image = await db
    .select()
    .from(images)
    .where(eq(images.id, id))
    .get();

  if (!image) {
    throw new NotFoundError('Image not found');
  }

  // Parse JSON fields from the database
  const exifData = deserializeExif(image.exifData);
  const iptcData = deserializeIptc(image.iptcData);
  const c2paManifest = deserializeC2pa(image.c2paManifest);
  const variants = deserializeVariants(image.variants);
  const tags = deserializeTags(image.tags);

  // Transform database record to API response format
  const response = {
    id: image.id,
    original_filename: image.originalFilename,
    cloudflare_image_id: image.cloudflareImageId,
    mime_type: image.mimeType,
    file_size: image.fileSize,
    width: image.width,
    height: image.height,
    uploaded_at: image.uploadedAt.toISOString(),
    uploaded_by: image.uploadedBy,
    description: image.description,
    tags: tags,
    status: image.status,
    is_public: image.isPublic,
    cloudflare_url_public: image.cloudflareUrlPublic,
    variants: variants,
    updated_at: image.updatedAt.toISOString(),
  };

  // Conditionally include metadata based on query parameter
  if (includeMetadata) {
    return {
      ...response,
      exif_data: exifData,
      iptc_data: iptcData,
      c2pa_manifest: c2paManifest,
      c2pa_verified: image.c2paVerified,
      c2pa_signature_valid: image.c2paSignatureValid,
      c2pa_issuer: image.c2paIssuer,
    };
  }

  return response;
}
```

**Data Transformation Flow:**

1. **Query Database:** Use Drizzle to select the image record by ID
2. **Deserialize JSON Fields:** Parse stored JSON strings into typed objects
   - `exifData` → `ExifData` object
   - `iptcData` → `IptcData` object
   - `c2paManifest` → `C2paManifest` object
   - `variants` → string array
   - `tags` → string array
3. **Transform Field Names:** Convert camelCase (TypeScript) to snake_case (API)
4. **Format Timestamps:** Convert Date objects to ISO 8601 strings
5. **Conditional Metadata:** Include/exclude full metadata based on query parameter

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "original_filename": "photo.jpg",
    "cloudflare_image_id": "cf_xyz789",
    "mime_type": "image/jpeg",
    "file_size": 2048576,
    "width": 4032,
    "height": 3024,
    "uploaded_at": "2025-10-24T12:00:00Z",
    "uploaded_by": "user123",
    "description": "Sample description",
    "tags": ["nature", "landscape"],
    "status": "active",
    "is_public": false,
    "exif_data": {
      "Make": "Canon",
      "Model": "EOS R5",
      "DateTime": "2025:10:20 14:30:00",
      "FocalLength": "50mm",
      "FNumber": 2.8,
      "ISO": 100,
      "GPS": {
        "latitude": 42.3923,
        "longitude": -83.0495
      }
    },
    "iptc_data": {
      "caption": "Beautiful sunset over the lake",
      "creator": "John Doe",
      "copyright": "© 2025 John Doe",
      "keywords": ["nature", "landscape", "sunset"]
    },
    "c2pa_manifest": {
      "claim_generator": "Adobe Photoshop 24.0",
      "signature_valid": true,
      "issuer": "Adobe Content Credentials",
      "assertions": [
        {
          "label": "c2pa.actions",
          "data": {
            "actions": [
              {
                "action": "c2pa.edited",
                "when": "2025-10-20T14:30:00Z",
                "softwareAgent": "Adobe Photoshop 24.0"
              }
            ]
          }
        }
      ],
      "ingredients": [
        {
          "title": "original_photo.jpg",
          "format": "image/jpeg",
          "relationship": "parentOf"
        }
      ]
    },
    "c2pa_verified": true,
    "c2pa_signature_valid": true,
    "c2pa_issuer": "Adobe Content Credentials",
    "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/public",
    "variants": ["public", "thumbnail", "medium", "large"],
    "updated_at": "2025-10-24T12:00:00Z"
  }
}
```

**Response with `include_metadata=false`:**
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "original_filename": "photo.jpg",
    "cloudflare_image_id": "cf_xyz789",
    "mime_type": "image/jpeg",
    "file_size": 2048576,
    "width": 4032,
    "height": 3024,
    "uploaded_at": "2025-10-24T12:00:00Z",
    "uploaded_by": "user123",
    "description": "Sample description",
    "tags": ["nature", "landscape"],
    "status": "active",
    "is_public": false,
    "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/public",
    "variants": ["public", "thumbnail", "medium", "large"],
    "updated_at": "2025-10-24T12:00:00Z"
  }
}
```

**Exposed Metadata Fields:**

From the Drizzle schema, the following metadata is exposed through this endpoint:

| Field                  | Source               | Description                                    |
|------------------------|----------------------|------------------------------------------------|
| `exif_data`            | `images.exifData`    | Complete EXIF metadata from image file         |
| `iptc_data`            | `images.iptcData`    | Complete IPTC metadata (copyright, creator)    |
| `c2pa_manifest`        | `images.c2paManifest`| Full C2PA content authenticity manifest        |
| `c2pa_verified`        | `images.c2paVerified`| Boolean indicating C2PA verification status    |
| `c2pa_signature_valid` | `images.c2paSignatureValid` | Boolean for signature validity       |
| `c2pa_issuer`          | `images.c2paIssuer`  | Certificate issuer name                        |

**Performance Considerations:**

- The `include_metadata` parameter allows clients to skip large JSON payloads when only basic info is needed
- Metadata parsing only occurs when requested
- Single database query using Drizzle's optimized SQLite adapter
- JSON deserialization is done lazily

**Error Responses:**
- `404 Not Found` - Image does not exist or has been deleted

---

### 3. List Images

**Endpoint:** `GET /api/v1/images`

**Description:** List images with filtering and pagination

**Query Parameters:**
- `page` (integer): Page number (default: 1)
- `limit` (integer): Results per page (default: 20, max: 100)
- `status` (string): Filter by status (active, archived, deleted)
- `uploaded_by` (string): Filter by uploader
- `c2pa_verified` (boolean): Filter by C2PA verification status
- `from_date` (ISO 8601): Filter images uploaded after this date
- `to_date` (ISO 8601): Filter images uploaded before this date
- `search` (string): Search in filename, description, tags
- `sort` (string): Sort field (uploaded_at, file_size, original_filename)
- `order` (string): Sort order (asc, desc)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "images": [
      {
        "id": "img_abc123def456",
        "original_filename": "photo.jpg",
        "cloudflare_image_id": "cf_xyz789",
        "mime_type": "image/jpeg",
        "file_size": 2048576,
        "width": 4032,
        "height": 3024,
        "uploaded_at": "2025-10-24T12:00:00Z",
        "cloudflare_url_public": "https://imagedelivery.net/account-hash/cf_xyz789/thumbnail",
        "c2pa_verified": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total_pages": 5,
      "total_count": 98
    }
  }
}
```

---

### 4. Update Image

**Endpoint:** `PATCH /api/v1/images/:id`

**Description:** Update image metadata (not the image file itself)

**Parameters:**
- `id` (path): Image ID

**Request Body:**
```json
{
  "description": "Updated description",
  "tags": ["new", "tags"],
  "is_public": true,
  "status": "active"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "img_abc123def456",
    "updated_at": "2025-10-24T13:00:00Z",
    ...
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid update fields
- `404 Not Found` - Image does not exist

---

### 5. Delete Image

**Endpoint:** `DELETE /api/v1/images/:id`

**Description:** Delete an image (soft delete by default)

**Parameters:**
- `id` (path): Image ID

**Query Parameters:**
- `hard_delete` (boolean): Permanently delete from Cloudflare Images (default: false)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Image deleted successfully",
  "data": {
    "id": "img_abc123def456",
    "deleted_at": "2025-10-24T14:00:00Z"
  }
}
```

**Error Responses:**
- `404 Not Found` - Image does not exist
- `500 Internal Server Error` - Deletion failed

---

### 6. Get C2PA Manifest

**Endpoint:** `GET /api/v1/images/:id/c2pa`

**Description:** Get detailed C2PA content authenticity information

**Parameters:**
- `id` (path): Image ID

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "verified": true,
    "signature_valid": true,
    "issuer": "Adobe Content Credentials",
    "manifest": {
      "claim_generator": "Adobe Photoshop 24.0",
      "claim_generator_info": [...],
      "assertions": [
        {
          "label": "c2pa.actions",
          "data": {
            "actions": [
              {
                "action": "c2pa.edited",
                "when": "2025-10-20T14:30:00Z",
                "softwareAgent": "Adobe Photoshop 24.0"
              }
            ]
          }
        }
      ],
      "ingredients": [
        {
          "title": "original_photo.jpg",
          "format": "image/jpeg",
          "relationship": "parentOf"
        }
      ],
      "signature_info": {
        "alg": "ps256",
        "time": "2025-10-20T14:31:00Z",
        "issuer": "Adobe Content Credentials"
      }
    }
  }
}
```

---

### 7. Get Image Variants

**Endpoint:** `GET /api/v1/images/:id/variants`

**Description:** Get all available Cloudflare Images variants and URLs

**Parameters:**
- `id` (path): Image ID

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "cloudflare_image_id": "cf_xyz789",
    "variants": [
      {
        "name": "public",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/public"
      },
      {
        "name": "thumbnail",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/thumbnail"
      },
      {
        "name": "medium",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/medium"
      },
      {
        "name": "large",
        "url": "https://imagedelivery.net/account-hash/cf_xyz789/large"
      }
    ]
  }
}
```

---

## Metadata Extraction Specifications

### EXIF Data

Extract all available EXIF metadata including:

**Camera Information:**
- Make, Model
- Software version
- Lens information

**Photo Settings:**
- ISO, Aperture (FNumber), Shutter Speed
- Focal Length
- Flash settings
- White Balance

**Date/Time:**
- DateTimeOriginal
- DateTimeDigitized
- DateTime (last modified)

**GPS Location:**
- Latitude, Longitude
- Altitude
- GPS timestamp

**Image Properties:**
- Width, Height
- Resolution
- Color Space
- Orientation

### IPTC Data

Extract IPTC metadata including:

**Content Description:**
- Caption/Description
- Headline
- Keywords/Tags
- Category

**Creator Information:**
- Creator/Photographer name
- Creator's contact info
- Copyright notice
- Usage terms

**Location:**
- City, State, Country
- Location name
- Sublocation

**Rights:**
- Copyright status
- Rights usage terms
- Web statement

### C2PA (Content Authenticity Initiative)

Extract and verify C2PA manifests:

**Verification:**
- Signature validation
- Certificate chain verification
- Tamper detection

**Claim Information:**
- Claim generator (software used)
- Timestamp of claim
- Issuer information

**Assertions:**
- Actions performed (edited, cropped, filtered, etc.)
- AI-generated content indicators
- Training/mining restrictions
- Relationships to other content

**Ingredients:**
- Parent/source files
- Component images
- Asset relationships

**Signature Information:**
- Algorithm used
- Signing authority
- Certificate details
- Validation timestamp

---

## Image Metadata Extraction Implementation in Cloudflare Workers

### Overview

Extracting image metadata (EXIF, IPTC, C2PA) in Cloudflare Workers presents unique challenges due to the edge runtime environment. This section covers implementation strategies, library choices, and code examples specific to Cloudflare Workers.

### Cloudflare Workers Constraints

**Runtime Limitations:**
- **CPU Time:** 50ms for free tier, 50-500ms for paid (configurable)
- **Memory:** 128MB limit
- **No Node.js APIs:** Limited to Web Standards APIs
- **No native modules:** Must use pure JavaScript/WebAssembly
- **No filesystem:** All operations in-memory

**Implications for Image Processing:**
- Large images may exceed memory limits
- Complex metadata extraction may exceed CPU time
- Must use edge-compatible libraries
- Consider asynchronous/deferred processing for large files

### Implementation Strategies

#### Strategy 1: Deferred Processing with Cloudflare Containers (⭐ RECOMMENDED)

Upload to Cloudflare Images first, then extract ALL metadata asynchronously (including C2PA via Golang container).

**Flow:**
1. Upload image to Cloudflare Images
2. Store basic record in D1 (ID, filename, Cloudflare ID, file size, MIME type)
3. Queue metadata extraction job
4. Return immediately with image ID and URLs
5. Background worker extracts ALL metadata in single job:
   - EXIF + IPTC (fast, in Worker using exifr library ~50KB)
   - C2PA (call Golang container via Durable Object binding)
6. Write complete record to R2 (single write with all metadata)
7. Update D1 (idempotent)

**Pros:**
- **No bundle size limits** - C2PA in separate container
- **Native performance** - Golang runs natively, not WASM
- **Single R2 write** - all metadata written together (immutable)
- **Fast upload response** - no variability based on file size
- **No Worker timeout concerns** - upload completes in milliseconds
- **Images immediately available** - variants ready for use
- **Simpler architecture** - single queue, single worker

**Cons:**
- Metadata not immediately available (typically ready within 1-5 seconds)
- Requires Cloudflare Containers (beta, paid plan)
- Requires Cloudflare Queues
- Client must handle "metadata processing" state

**Why This is Best:**
- Solves C2PA bundle size problem elegantly
- Users care most about fast uploads and image availability
- Metadata is "nice to have" and rarely needed immediately
- Single R2 write = truly immutable storage
- Easier to test and debug

**Best for:** ✅ **ALL use cases with C2PA** - recommended default

---

#### Strategy 2: Edge Extraction (Alternative for Special Cases)

Extract metadata directly in the Worker during upload.

**Pros:**
- Immediate metadata availability
- Single-step upload process
- No additional infrastructure

**Cons:**
- May timeout on large files
- Limited by Worker CPU/memory constraints
- Blocks upload response
- Inconsistent response times

**Best for:** ⚠️ Only if you have hard requirement for immediate metadata (rare)

---

#### Strategy 3: Hybrid Approach (Not Recommended)

Extract lightweight metadata (basic EXIF) at edge, defer heavy processing (C2PA verification).

**Pros:**
- Some metadata immediately available
- Fast response with basic data

**Cons:**
- **Most complex to implement**
- Requires careful state management
- Two code paths to maintain
- Still subject to Worker timeouts on large files
- Inconsistent: sometimes has metadata, sometimes doesn't

**Best for:** ❌ **Not recommended** - adds complexity without significant benefit

### Library Compatibility

#### EXIF Extraction

**exifr** (Recommended)
- **Status:** ✅ Works in Cloudflare Workers
- **Size:** ~50KB minified
- **Speed:** Fast, optimized for browsers
- **Installation:** `npm install exifr`

```typescript
import exifr from 'exifr';

// Works with ArrayBuffer or Blob
const exif = await exifr.parse(imageBuffer, {
  tiff: true,
  exif: true,
  gps: true,
  iptc: false, // Disable if not needed
  icc: false
});
```

**piexifjs**
- **Status:** ⚠️ May work with modifications
- **Size:** Smaller than exifr
- **Note:** Designed for browser, may need polyfills

#### IPTC Extraction

**exifr** (with IPTC enabled)
- **Status:** ✅ Works in Cloudflare Workers
- **Note:** Same library, just enable IPTC parsing

```typescript
import exifr from 'exifr';

const iptc = await exifr.parse(imageBuffer, {
  tiff: false,
  exif: false,
  iptc: true,  // Enable IPTC
  translateKeys: true,  // Get human-readable keys
  translateValues: true
});
```

**iptc-reader**
- **Status:** ❌ Not compatible (uses Node.js APIs)
- **Alternative:** Use exifr or implement custom parser

#### C2PA Verification

**c2pa-js** (Adobe's official library)
- **Status:** ⚠️ Partial compatibility
- **Note:** Uses WebAssembly, may work in Workers
- **Size:** Large (~1MB+)
- **Installation:** `npm install c2pa`

```typescript
import { createC2pa } from 'c2pa';

const c2pa = await createC2pa();
const result = await c2pa.read(imageBuffer);

if (result) {
  const manifest = result.active_manifest;
  const isValid = result.validation_status.some(
    s => s.code === 'signingCredential.trusted'
  );
}
```

**Challenges:**
- Large bundle size may exceed Worker limits
- WASM initialization overhead
- May need to defer to separate worker or Durable Object

**Alternative Approach:**
```typescript
// Defer C2PA to Queue Worker
await env.METADATA_QUEUE.send({
  imageId: imageId,
  cloudflareImageId: cfImageId,
  task: 'c2pa_verification'
});
```

### Implementation Examples

#### Example 1: Deferred Processing Upload Endpoint (⭐ RECOMMENDED)

This is the cleanest, simplest implementation - upload and defer ALL metadata extraction.

```typescript
import { Router } from 'itty-router';

const router = Router();

router.post('/api/v1/images', async (request, env) => {
  const formData = await request.formData();
  const imageFile = formData.get('image');
  const description = formData.get('description');
  const uploadedBy = formData.get('uploaded_by');

  if (!imageFile || !(imageFile instanceof File)) {
    return new Response(
      JSON.stringify({ success: false, error: 'No image provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate file type
  if (!imageFile.type.startsWith('image/')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid file type' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Upload to Cloudflare Images immediately
  const uploadForm = new FormData();
  uploadForm.append('file', imageFile);

  const uploadResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`
      },
      body: uploadForm
    }
  );

  if (!uploadResponse.ok) {
    return new Response(
      JSON.stringify({ success: false, error: 'Cloudflare upload failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const uploadResult = await uploadResponse.json();
  const cloudflareImageId = uploadResult.result.id;
  const variants = uploadResult.result.variants;

  // Generate image ID
  const imageId = `img_${crypto.randomUUID()}`;
  const now = Date.now();

  // Store basic record in D1 (NO metadata yet)
  await env.DB.prepare(`
    INSERT INTO images (
      id, original_filename, cloudflare_image_id,
      mime_type, file_size,
      description, uploaded_by,
      cloudflare_url_public, variants,
      status, uploaded_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    imageId,
    imageFile.name,
    cloudflareImageId,
    imageFile.type,
    imageFile.size,
    description || null,
    uploadedBy || null,
    variants[0], // First variant URL
    JSON.stringify(variants),
    'active',
    now,
    now
  ).run();

  // Queue metadata extraction for ALL metadata types
  await env.METADATA_QUEUE.send({
    imageId: imageId,
    cloudflareImageId: cloudflareImageId,
    originalFilename: imageFile.name
  });

  // Return immediately - image is ready to use!
  return Response.json({
    success: true,
    data: {
      id: imageId,
      original_filename: imageFile.name,
      cloudflare_image_id: cloudflareImageId,
      mime_type: imageFile.type,
      file_size: imageFile.size,
      cloudflare_url_public: variants[0],
      variants: variants,
      metadata_status: 'processing', // Will be updated by queue worker
      uploaded_at: new Date(now).toISOString()
    }
  });
});

export default router;
```

#### Example 2: Queue Consumer for Metadata Extraction

```typescript
// metadata-worker.ts - Separate Worker or Queue Consumer
import exifr from 'exifr';
import { createC2pa } from 'c2pa';

export default {
  async queue(batch: MessageBatch<MetadataJob>, env: Env) {
    for (const message of batch.messages) {
      const job = message.body;

      try {
        // Mark as processing
        await env.DB.prepare(`
          UPDATE images SET metadata_status = ?, updated_at = ? WHERE id = ?
        `).bind('processing', Date.now(), job.imageId).run();

        // Fetch image from Cloudflare Images
        const imageUrl = `https://imagedelivery.net/${env.CF_ACCOUNT_HASH}/${job.cloudflareImageId}/public`;
        const response = await fetch(imageUrl);

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Extract ALL metadata types in parallel
        const [exifData, iptcData, c2paResult] = await Promise.allSettled([
          // Extract EXIF
          exifr.parse(arrayBuffer, {
            tiff: true,
            exif: true,
            gps: true,
            translateKeys: true,
            translateValues: true
          }),
          // Extract IPTC
          exifr.parse(arrayBuffer, {
            iptc: true,
            translateKeys: true,
            translateValues: true
          }),
          // Extract C2PA (may fail if not present)
          (async () => {
            try {
              const c2pa = await createC2pa();
              return await c2pa.read(arrayBuffer);
            } catch (err) {
              return null; // C2PA not present is OK
            }
          })()
        ]);

        // Process results
        const exif = exifData.status === 'fulfilled' ? exifData.value : null;
        const iptc = iptcData.status === 'fulfilled' ? iptcData.value : null;
        const c2pa = c2paResult.status === 'fulfilled' ? c2paResult.value : null;

        // Extract image dimensions
        const width = exif?.ImageWidth || null;
        const height = exif?.ImageHeight || null;

        // Fetch original upload record from D1
        const originalRecord = await env.DB.prepare(`
          SELECT * FROM images WHERE id = ?
        `).bind(job.imageId).first();

        if (!originalRecord) {
          throw new Error(`Image ${job.imageId} not found in D1`);
        }

        // Process C2PA verification
        let c2paManifest = null;
        let c2paVerified = false;
        let c2paSignatureValid = null;
        let c2paIssuer = null;

        if (c2pa) {
          c2paManifest = c2pa.active_manifest;
          c2paSignatureValid = c2pa.validation_status?.some(
            s => s.code === 'signingCredential.trusted'
          ) || false;
          c2paVerified = !!c2paManifest;
          c2paIssuer = c2paManifest?.claim_generator_info?.[0]?.issuer || null;
        }

        const now = Date.now();

        // Build complete record
        const completeRecord = {
          id: job.imageId,
          original_filename: originalRecord.original_filename,
          cloudflare_image_id: job.cloudflareImageId,
          mime_type: originalRecord.mime_type,
          file_size: originalRecord.file_size,
          width,
          height,
          uploaded_at: originalRecord.uploaded_at,
          uploaded_by: originalRecord.uploaded_by,
          exif_data: exif,
          iptc_data: iptc,
          c2pa_manifest: c2paManifest,
          c2pa_verified: c2paVerified,
          c2pa_signature_valid: c2paSignatureValid,
          c2pa_issuer: c2paIssuer,
          cloudflare_url_base: originalRecord.cloudflare_url_base,
          cloudflare_url_public: originalRecord.cloudflare_url_public,
          variants: JSON.parse(originalRecord.variants || '[]'),
          description: originalRecord.description,
          tags: JSON.parse(originalRecord.tags || '[]'),
          status: 'active',
          is_public: originalRecord.is_public,
          metadata_status: 'completed',
          updated_at: now,
          deleted_at: null,
          _version: '1.0',
          _written_at: now
        };

        // [1] Write to R2 (SOURCE OF TRUTH) - One JSON file per image
        const r2Key = `images/${job.imageId}.json`;
        await env.R2_BUCKET.put(r2Key, JSON.stringify(completeRecord, null, 2));

        // [2] Update D1 (INDEXED VIEW) - Idempotent
        await env.DB.prepare(`
          INSERT INTO images (
            id, original_filename, cloudflare_image_id,
            mime_type, file_size, width, height,
            uploaded_at, uploaded_by,
            exif_data, iptc_data,
            c2pa_manifest, c2pa_verified, c2pa_signature_valid, c2pa_issuer,
            cloudflare_url_base, cloudflare_url_public, variants,
            description, tags,
            status, is_public, metadata_status,
            updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            width = excluded.width,
            height = excluded.height,
            exif_data = excluded.exif_data,
            iptc_data = excluded.iptc_data,
            c2pa_manifest = excluded.c2pa_manifest,
            c2pa_verified = excluded.c2pa_verified,
            c2pa_signature_valid = excluded.c2pa_signature_valid,
            c2pa_issuer = excluded.c2pa_issuer,
            metadata_status = excluded.metadata_status,
            updated_at = excluded.updated_at
        `).bind(
          job.imageId,
          originalRecord.original_filename,
          job.cloudflareImageId,
          originalRecord.mime_type,
          originalRecord.file_size,
          width,
          height,
          originalRecord.uploaded_at,
          originalRecord.uploaded_by,
          exif ? JSON.stringify(exif) : null,
          iptc ? JSON.stringify(iptc) : null,
          c2paManifest ? JSON.stringify(c2paManifest) : null,
          c2paVerified,
          c2paSignatureValid,
          c2paIssuer,
          originalRecord.cloudflare_url_base,
          originalRecord.cloudflare_url_public,
          originalRecord.variants,
          originalRecord.description,
          originalRecord.tags,
          'active',
          originalRecord.is_public,
          'completed',
          now,
          null
        ).run();

        // Optional: Trigger webhook
        if (env.WEBHOOK_URL) {
          await fetch(env.WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'metadata.completed',
              image_id: job.imageId,
              has_exif: !!exif,
              has_iptc: !!iptc,
              has_c2pa: !!c2pa
            })
          });
        }

        message.ack();

      } catch (error) {
        console.error(`Metadata extraction failed for ${job.imageId}:`, error);

        // Mark as failed
        await env.DB.prepare(`
          UPDATE images SET metadata_status = ?, updated_at = ? WHERE id = ?
        `).bind('failed', Date.now(), job.imageId).run();

        // Retry logic: retry up to 3 times
        if (message.attempts < 3) {
          message.retry();
        } else {
          message.ack(); // Give up after 3 attempts
        }
      }
    }
  }
};

interface MetadataJob {
  imageId: string;
  cloudflareImageId: string;
  originalFilename: string;
}
```

#### Example 3: Status Check Endpoint

Allow clients to check if metadata processing is complete:

```typescript
router.get('/api/v1/images/:id/status', async (request, env) => {
  const imageId = request.params.id;

  const image = await env.DB.prepare(`
    SELECT
      id,
      metadata_status,
      exif_data IS NOT NULL as has_exif,
      iptc_data IS NOT NULL as has_iptc,
      c2pa_manifest IS NOT NULL as has_c2pa,
      updated_at
    FROM images
    WHERE id = ?
  `).bind(imageId).first();

  if (!image) {
    return new Response(
      JSON.stringify({ success: false, error: 'Image not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return Response.json({
    success: true,
    data: {
      id: image.id,
      metadata_status: image.metadata_status,
      metadata_available: {
        exif: !!image.has_exif,
        iptc: !!image.has_iptc,
        c2pa: !!image.has_c2pa
      },
      last_updated: new Date(image.updated_at).toISOString()
    }
  });
});
```

### Performance Optimization Tips

#### 1. Use Streaming for Large Files

```typescript
// Instead of loading entire file into memory
const stream = imageFile.stream();
const reader = stream.getReader();

// Process in chunks
let buffer = new Uint8Array();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  // Only read first N bytes for EXIF (usually in first 64KB)
  buffer = new Uint8Array([...buffer, ...value]);
  if (buffer.length > 65536) break;
}

const exif = await exifr.parse(buffer);
```

#### 2. Selective Parsing

```typescript
// Only extract what you need
const minimalExif = await exifr.parse(buffer, {
  pick: ['Make', 'Model', 'DateTime', 'latitude', 'longitude'],
  skip: ['thumbnail', 'Thumbnail'] // Skip thumbnail data
});
```

#### 3. Timeout Protection

```typescript
const METADATA_TIMEOUT = 5000; // 5 seconds

const metadataPromise = extractAllMetadata(buffer);
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Metadata extraction timeout')), METADATA_TIMEOUT)
);

try {
  const metadata = await Promise.race([metadataPromise, timeoutPromise]);
} catch (error) {
  // Fall back to deferred processing
  await queueMetadataExtraction(imageId);
}
```

#### 4. Conditional Extraction Based on File Size

```typescript
async function handleImageUpload(file: File, env: Env) {
  const fileSize = file.size;

  if (fileSize < 2_000_000) {
    // Small file: extract everything immediately
    return await extractAllMetadataSync(file, env);
  } else if (fileSize < 10_000_000) {
    // Medium file: extract EXIF/IPTC, defer C2PA
    return await extractPartialMetadata(file, env);
  } else {
    // Large file: defer all heavy processing
    return await deferAllMetadataExtraction(file, env);
  }
}
```

### Error Handling

```typescript
async function safeMetadataExtraction(buffer: ArrayBuffer) {
  const metadata = {
    exif: null,
    iptc: null,
    c2pa: null,
    errors: []
  };

  // EXIF extraction
  try {
    metadata.exif = await exifr.parse(buffer, { exif: true });
  } catch (error) {
    metadata.errors.push({ type: 'exif', message: error.message });
  }

  // IPTC extraction
  try {
    metadata.iptc = await exifr.parse(buffer, { iptc: true });
  } catch (error) {
    metadata.errors.push({ type: 'iptc', message: error.message });
  }

  // C2PA extraction (most likely to fail)
  try {
    const c2pa = await createC2pa();
    const result = await c2pa.read(buffer);
    metadata.c2pa = result?.active_manifest;
  } catch (error) {
    metadata.errors.push({ type: 'c2pa', message: error.message });
    // C2PA not present is not necessarily an error
  }

  return metadata;
}
```

### Recommended Architecture (Deferred-by-Default)

**For Production:**

1. **Upload Endpoint (Worker):**
   - ✅ Upload to Cloudflare Images
   - ✅ Store basic record in D1 (ID, filename, Cloudflare ID, file size, MIME type)
   - ✅ Queue metadata extraction job
   - ✅ Return immediately with image ID and URLs
   - ⏱️ **Target response time: < 500ms**

2. **Metadata Queue Worker:**
   - Fetch image from Cloudflare Images
   - Extract ALL metadata in single worker:
     - EXIF data (camera, settings, GPS)
     - IPTC data (copyright, creator, keywords)
     - C2PA manifest via Cloudflare Container (Golang)
   - **[1] Write complete record to R2** (SOURCE OF TRUTH - one JSON file per image)
   - **[2] Update D1 with idempotent INSERT/UPDATE** (INDEXED VIEW)
   - Optional: Trigger webhook when complete
   - ⏱️ **Typical processing time: 1-5 seconds**

3. **Read Endpoint:**
   - Query D1 directly for image record
   - Build URLs based on is_public flag
   - Return image data with metadata (if available)
   - Include `metadata_status` field: 'pending', 'processing', 'completed', 'failed'
   - Client can poll or use webhooks for status updates

**Complete Data Flow (Upload → Metadata → Read):**

```
┌─────────────────────────────────────────────────────────────────┐
│                        UPLOAD PHASE                             │
└─────────────────────────────────────────────────────────────────┘

1. POST /api/v1/images
   ↓
2. Generate content-based ID: sha256(file_content) → img_[32 hex chars]
   ↓
3. Check D1 for duplicate (by content_hash)
   ↓
4. Upload to Cloudflare Images (if new)
   ↓
5. INSERT basic record into D1 (metadata_status = 'pending')
   ↓
6. Queue.send({ imageId, cloudflareImageId, originalFilename })
   ↓
7. Return 201 with image ID + URLs (< 500ms)

┌─────────────────────────────────────────────────────────────────┐
│                   METADATA EXTRACTION PHASE                      │
└─────────────────────────────────────────────────────────────────┘

Queue Worker receives job:
   ↓
1. UPDATE D1: metadata_status = 'processing'
   ↓
2. Fetch image from Cloudflare Images
   ↓
3. Extract EXIF + IPTC (in Worker) and C2PA (via Golang Container)
   ↓
4. Build complete record with all metadata
   ↓
5. [R2] Write complete record to JSON file (images/{imageId}.json)
   ↓
6. [D1] INSERT ... ON CONFLICT DO UPDATE (idempotent)
   ↓
7. Trigger webhook (optional)
   ↓
8. ACK message

┌─────────────────────────────────────────────────────────────────┐
│                         READ PHASE                              │
└─────────────────────────────────────────────────────────────────┘

GET /api/v1/images/:id
   ↓
1. Query D1 for image record
   ↓
2. Build URLs based on is_public flag
   ↓
3. Return image data with URLs (< 50ms)
```

**Architecture Benefits:**

- **Simple:** Single code path, easy to reason about
- **Fast:** Upload response in milliseconds, not seconds
- **Durable:** R2 provides 11 nines durability
- **Recoverable:** Can rebuild D1 entirely from R2
- **Reliable:** No Worker timeout issues
- **Scalable:** Queue handles burst traffic, D1 handles read queries efficiently
- **Debuggable:** Can retry metadata extraction independently
- **Testable:** Easy to test upload and extraction separately
- **Idempotent:** Replays are safe with content-based deterministic IDs
- **Deduplication:** Content-hash prevents storing duplicates

### Testing Metadata Extraction

```typescript
// Test with sample images
const testImages = {
  jpeg_with_exif: './test/images/sample_exif.jpg',
  jpeg_with_iptc: './test/images/sample_iptc.jpg',
  jpeg_with_c2pa: './test/images/sample_c2pa.jpg',
  png_no_metadata: './test/images/sample_plain.png'
};

// Unit test
test('extracts EXIF from JPEG', async () => {
  const buffer = await readFile(testImages.jpeg_with_exif);
  const exif = await exifr.parse(buffer);

  expect(exif.Make).toBeDefined();
  expect(exif.Model).toBeDefined();
});
```

### Dependencies & Bundle Size

**Recommended packages for Cloudflare Workers:**

```json
{
  "dependencies": {
    "exifr": "^7.1.3",
    "c2pa": "^0.15.0"
  }
}
```

**Bundle size considerations:**
- `exifr`: ~50KB minified
- `c2pa`: ~1MB+ (WASM included)
- **Total:** Keep under 1MB for Worker upload size limits
- Consider code splitting if using C2PA

### Summary

| Metadata Type | Difficulty | Library | Edge Compatible | Recommendation |
|---------------|------------|---------|-----------------|----------------|
| EXIF | Easy | exifr | ✅ Yes | ⭐ Defer to queue |
| IPTC | Easy | exifr | ✅ Yes | ⭐ Defer to queue |
| C2PA | Hard | c2pa-js | ⚠️ Partial | ⭐ Defer to queue |
| Image Dimensions | Easy | exifr | ✅ Yes | ⭐ Defer to queue |

**Best Practice: Defer ALL metadata extraction to a queue worker.**

**Why?**
- Simplest architecture (single code path)
- Fastest upload response times (< 500ms)
- No Worker timeout concerns
- Images immediately available via Cloudflare URLs
- Metadata typically ready within 1-5 seconds
- Easy to retry on failure

**Implementation:**
1. Upload → Store basic record → Queue job → Return immediately
2. Queue worker fetches image and extracts all metadata
3. Client polls for metadata or uses webhooks

---

## Cloudflare Containers for C2PA Verification

### Overview

C2PA verification is handled by a **Golang HTTP service** running in a Cloudflare Container. This solves the bundle size problem (C2PA library is ~1MB+) while keeping everything in the Cloudflare ecosystem.

### Architecture

```
Metadata Queue Worker (TypeScript)
  ↓
Extracts EXIF + IPTC (fast, ~50KB library)
  ↓
Calls C2PA Container via Durable Object binding
  ↓
Golang Container (C2PA Verification Service)
  ↓
Returns C2PA manifest + verification result
  ↓
Worker writes complete record to R2 + D1
```

### wrangler.toml Configuration

```toml
# Existing config
name = "api"
main = "src/index.ts"
compatibility_date = "2025-10-23"

[[d1_databases]]
binding = "DB"
database_name = "app_db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "images-metadata"

[[queues.producers]]
binding = "METADATA_QUEUE"
queue = "image-metadata-processing"

# NEW: Cloudflare Container for C2PA
[[containers]]
max_instances = 10
class_name = "C2PAVerifier"
image = "./c2pa-container/Dockerfile"

[[durable_objects.bindings]]
name = "C2PA_CONTAINER"
class_name = "C2PAVerifier"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["C2PAVerifier"]
```

### Golang C2PA Container

**Directory structure:**
```
apps/
├── api/                    # Main Worker
│   ├── src/index.ts
│   └── wrangler.toml
└── c2pa-container/         # Golang C2PA service
    ├── Dockerfile
    ├── main.go
    ├── go.mod
    └── go.sum
```

**Dockerfile:**
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o c2pa-verifier .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/c2pa-verifier /usr/local/bin/
EXPOSE 8080
CMD ["c2pa-verifier"]
```

**main.go:**
```go
package main

import (
    "encoding/json"
    "io"
    "log"
    "net/http"
)

type VerifyRequest struct {
    ImageData []byte `json:"image_data"`
}

type VerifyResponse struct {
    Verified       bool                   `json:"verified"`
    SignatureValid bool                   `json:"signature_valid"`
    Issuer         string                 `json:"issuer"`
    Manifest       map[string]interface{} `json:"manifest"`
}

func verifyHandler(w http.ResponseWriter, r *http.Request) {
    var req VerifyRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Use C2PA Go library (example - use actual library)
    // import "github.com/contentauth/c2pa-go"
    manifest, verified := verifyC2PA(req.ImageData)

    result := VerifyResponse{
        Verified:       verified,
        SignatureValid: verified,
        Issuer:         manifest["issuer"].(string),
        Manifest:       manifest,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}

func verifyC2PA(imageData []byte) (map[string]interface{}, bool) {
    // TODO: Implement actual C2PA verification
    // This is a placeholder
    return map[string]interface{}{
        "issuer": "Adobe Content Credentials",
        "claim_generator": "Adobe Photoshop",
    }, true
}

func main() {
    http.HandleFunc("/verify", verifyHandler)
    log.Println("C2PA verifier listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

**go.mod:**
```go
module c2pa-verifier

go 1.21

// Add C2PA library dependency here
// require github.com/contentauth/c2pa-go v0.x.x
```

### Queue Worker Implementation

**Calling the C2PA Container:**
```typescript
export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      const { imageId, cloudflareImageId } = message.body;

      // Fetch image from Cloudflare Images
      const imageUrl = `https://imagedelivery.net/${env.CF_ACCOUNT_HASH}/${cloudflareImageId}/public`;
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();

      // Extract EXIF + IPTC in parallel (fast)
      const [exif, iptc] = await Promise.all([
        exifr.parse(arrayBuffer, { exif: true, gps: true }),
        exifr.parse(arrayBuffer, { iptc: true })
      ]);

      // Call C2PA Container
      const containerId = env.C2PA_CONTAINER.idFromName('c2pa-verifier');
      const containerStub = env.C2PA_CONTAINER.get(containerId);

      const c2paResponse = await containerStub.fetch('http://container/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: Array.from(new Uint8Array(arrayBuffer))
        })
      });

      const c2paData = await c2paResponse.json();

      // Build complete record
      const completeRecord = {
        id: imageId,
        exif_data: exif,
        iptc_data: iptc,
        c2pa_manifest: c2paData.manifest,
        c2pa_verified: c2paData.verified,
        c2pa_signature_valid: c2paData.signature_valid,
        c2pa_issuer: c2paData.issuer,
        metadata_status: 'completed'
      };

      // [R2] Write complete record (single write)
      await env.R2_BUCKET.put(
        `images/${imageId}.json`,
        JSON.stringify(completeRecord)
      );

      // [D1] Update (idempotent)
      const db = connectD1(env.DB);
      await db.insert(images).values(completeRecord).onConflictDoUpdate({
        target: images.id,
        set: completeRecord
      });

      message.ack();
    }
  }
};
```

### Deployment

```bash
# Deploy everything together
npx wrangler deploy

# Wrangler will:
# 1. Build Golang Docker image from Dockerfile
# 2. Push image to Cloudflare Container Registry
# 3. Deploy Worker with container binding
# 4. Provision Durable Objects
```

### Benefits

- ✅ **No bundle size limits** - Container is separate from Worker
- ✅ **Native performance** - Golang runs natively, not WASM
- ✅ **Edge deployment** - Runs on Cloudflare's global network
- ✅ **Simple deployment** - `wrangler deploy` handles everything
- ✅ **Stays in Cloudflare** - No external services needed
- ✅ **Programmable** - Worker controls container lifecycle

### Requirements

- **Cloudflare Workers Paid Plan** (~$5/month base)
- **Cloudflare Containers** (public beta)
- **Docker** installed locally for building images

---

## Cloudflare Images Integration

### Upload Flow

1. Receive image file via API
2. Extract metadata (EXIF, IPTC, C2PA) before upload
3. Upload to Cloudflare Images via direct upload API
4. Store returned Cloudflare Image ID
5. Store metadata in D1 database
6. Return complete image record to client

### Storage Details

**Store in D1:**
- `cloudflare_image_id`: Unique identifier from Cloudflare
- `original_filename`: Original file name for reference
- `cloudflare_url_base`: Base URL for accessing variants
- `variants`: Available image variants/sizes

**Cloudflare Images Configuration:**
- Configure variants (thumbnail, medium, large, etc.)
- Set up delivery URL structure
- Configure access controls for public/private images

### URL Structure

```
https://imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>/<VARIANT_NAME>
```

Example:
```
https://imagedelivery.net/abc123/cf_xyz789/thumbnail
https://imagedelivery.net/abc123/cf_xyz789/public
```

---

## Data Flow

### Upload Process

```
1. Client → API: POST /api/v1/images (multipart/form-data)
2. API → Metadata Extractor: Extract EXIF, IPTC, C2PA
3. API → Cloudflare Images: Upload image file
4. Cloudflare Images → API: Return image ID and URLs
5. API → D1 Database: Store metadata and references
6. API → Client: Return complete image record
```

### Retrieval Process

```
1. Client → API: GET /api/v1/images/:id
2. API → D1 Database: Query image metadata
3. D1 Database → API: Return image record
4. API → Client: Return image data with Cloudflare URLs
5. Client → Cloudflare Images: Direct image request (if needed)
```

### Delete Process

```
Soft Delete:
1. Client → API: DELETE /api/v1/images/:id
2. API → D1 Database: Update status to 'deleted', set deleted_at
3. API → Client: Confirm deletion

Hard Delete:
1. Client → API: DELETE /api/v1/images/:id?hard_delete=true
2. API → Cloudflare Images: Delete image
3. API → D1 Database: Remove record
4. API → Client: Confirm deletion
```

---

## Technical Requirements

### Libraries/Dependencies

**Metadata Extraction:**
- `exifr` - EXIF parsing
- `iptc-reader` or `exiftool` wrapper - IPTC parsing
- `c2pa-node` or Adobe C2PA SDK - C2PA manifest extraction and verification

**Image Processing:**
- `sharp` (optional) - Image validation and processing
- Cloudflare Images API client

**Database:**
- Cloudflare D1 client
- SQL migration tools

### Environment Variables

```
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_IMAGES_ACCOUNT_HASH=your_account_hash
D1_DATABASE_ID=your_database_id
```

### Supported Image Formats

- JPEG/JPG
- PNG
- GIF
- WebP
- TIFF
- HEIC/HEIF
- BMP

### File Size Limits

- Maximum upload size: 10MB (configurable)
- Recommended minimum: 1KB

### Security Considerations

1. **Authentication:** All endpoints require authentication
2. **Authorization:** User-based access control for image operations
3. **Input Validation:** Validate file types, sizes, and malicious content
4. **Rate Limiting:** Implement rate limits on upload endpoints
5. **CORS:** Configure appropriate CORS policies
6. **Signed URLs:** Generate signed URLs for private images

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context"
    }
  }
}
```

### Error Codes

- `INVALID_FILE_TYPE` - Unsupported image format
- `FILE_TOO_LARGE` - Exceeds maximum file size
- `METADATA_EXTRACTION_FAILED` - Could not extract metadata
- `C2PA_VERIFICATION_FAILED` - C2PA signature invalid
- `CLOUDFLARE_UPLOAD_FAILED` - Upload to Cloudflare failed
- `DATABASE_ERROR` - D1 database operation failed
- `IMAGE_NOT_FOUND` - Requested image does not exist
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions

---

## Future Enhancements

### Phase 2 Features

1. **Batch Operations:** Upload/delete multiple images
2. **Image Transformations:** On-the-fly resizing, cropping
3. **Advanced Search:** Full-text search on metadata
4. **AI Analysis:** Auto-tagging, content detection
5. **WebP/AVIF Conversion:** Automatic format optimization
6. **Duplicate Detection:** Perceptual hashing
7. **Image Collections:** Group related images
8. **Version History:** Track image modifications
9. **Analytics:** Track image views and downloads
10. **Webhooks:** Event notifications for image operations

### Monitoring & Analytics

- Track upload success/failure rates
- Monitor C2PA verification rates
- Track storage usage
- API performance metrics
- Popular image variants

---

## Implementation Checklist

- [ ] Set up Cloudflare D1 database
- [ ] Create images table and indexes
- [ ] Set up Cloudflare Images account
- [ ] Configure image variants
- [ ] Implement POST /api/v1/images endpoint
- [ ] Integrate EXIF extraction
- [ ] Integrate IPTC extraction
- [ ] Integrate C2PA verification
- [ ] Implement Cloudflare Images upload
- [ ] Implement GET /api/v1/images/:id endpoint
- [ ] Implement GET /api/v1/images list endpoint
- [ ] Implement PATCH /api/v1/images/:id endpoint
- [ ] Implement DELETE /api/v1/images/:id endpoint
- [ ] Implement C2PA manifest endpoint
- [ ] Implement variants endpoint
- [ ] Add authentication/authorization
- [ ] Add rate limiting
- [ ] Add error handling
- [ ] Write API documentation
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Performance testing
- [ ] Security audit

---

## References

- [Cloudflare Images Documentation](https://developers.cloudflare.com/images/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [C2PA Specification](https://c2pa.org/specifications/)
- [EXIF Standard](https://exif.org/)
- [IPTC Photo Metadata Standard](https://www.iptc.org/standards/photo-metadata/)
- [Adobe Content Credentials](https://contentcredentials.org/)

---

**Version:** 1.0
**Last Updated:** 2025-10-24
**Status:** Draft
