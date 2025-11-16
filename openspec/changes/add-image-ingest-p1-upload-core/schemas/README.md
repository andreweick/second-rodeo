# Image Ingest Phase 1 - JSON Schemas

This directory contains formal JSON Schema and OpenAPI specifications for the image upload endpoint and metadata storage.

## Files

### 1. `upload-response.schema.json`
**Purpose:** Defines the JSON response returned by `POST /images` after successful upload.

**Required Fields:**
- `id` (string, pattern: `sha256:[a-f0-9]{64}`)
- `sha256` (string, pattern: `[a-f0-9]{64}`)
- `uploadedAt` (ISO8601 timestamp)

**Optional Fields:**
- `metadata` (preview object with file info and EXIF subset)

**Usage:**
- Validated before returning HTTP response to client
- Ensures all responses conform to documented contract

---

### 2. `storage-metadata.schema.json`
**Purpose:** Defines the complete metadata JSON stored in `sr-json` bucket at `photos/sha256_{hash}.json`.

**Required Fields:**
- `id` (string, pattern: `sha256:[a-f0-9]{64}`)
- `sha256` (string, pattern: `[a-f0-9]{64}`)
- `file` (object with size, mimeType)
- `uploadedAt` (ISO8601 timestamp)
- `source` (enum: `pwa` | `migration`)

**Optional Fields:**
- `file.originalName`, `file.width`, `file.height`, `file.format`
- `exif` (complete EXIF metadata: camera, GPS, settings)
- `iptc` (text metadata: title, caption, keywords, copyright)
- `icc` (color profile information)

**Usage:**
- Validated before writing to R2 sr-json bucket
- Ensures only complete, valid metadata is stored
- Serves as archival record for image metadata

---

### 3. `openapi.yaml`
**Purpose:** OpenAPI 3.1 specification for the `POST /images` endpoint.

**Defines:**
- Request format (multipart/form-data with image file)
- Optional `X-Client-SHA256` header for client-side hash optimization
- Authentication (Bearer token)
- Response schemas (201, 400, 401, 500)
- Error scenarios and examples

**Usage:**
- API documentation and contract
- Client SDK generation
- API testing tools (Postman, Insomnia)
- OpenAPI validators

---

### 4. `VALIDATION.md`
**Purpose:** Comprehensive validation report confirming schemas match OpenSpec requirements.

**Contents:**
- Cross-references between schemas and `specs/image-ingest/spec.md`
- Required vs optional field verification
- Format and pattern validation checks
- Error scenario coverage
- Cross-schema consistency checks

**Status:** ✅ All schemas validated and production-ready

---

## Schema Validation in Code

### Runtime Validation Flow

```typescript
// 1. Upload response validation (before HTTP return)
const response = { id, sha256, uploadedAt, metadata };
validateUploadResponse(response);  // Throws if invalid
return Response.json(response, { status: 201 });

// 2. Storage metadata validation (before R2 write)
const metadata = buildMetadataJSON({ id, sha256, file, exif, iptc, uploadedAt, source });
validateStorageMetadata(metadata);  // Throws if invalid
await env.SR_JSON.put(key, JSON.stringify(metadata));
```

### Implementation Location
- **Service:** `apps/api/src/services/schema-validator.ts`
- **Functions:**
  - `validateUploadResponse(data)` - Validates against `upload-response.schema.json`
  - `validateStorageMetadata(data)` - Validates against `storage-metadata.schema.json`

### Validation Checks
1. **Required fields present** - `id`, `sha256`, `uploadedAt`, `source`, etc.
2. **ID format** - Matches `^sha256:[a-f0-9]{64}$`
3. **SHA256 format** - Matches `^[a-f0-9]{64}$`
4. **Timestamps** - Valid ISO8601 format
5. **Enums** - Source is "pwa" or "migration"
6. **Types** - Numbers, strings, arrays match expected types

### Error Handling
- Validation failures throw descriptive errors
- Upload endpoint returns 500 Internal Server Error
- Errors logged with context: id, sha256, operation, timestamp
- Invalid data never reaches R2 storage

---

## Why Schema Validation?

### Data Quality
- Ensures only valid, complete data is stored in R2
- Catches missing fields or format errors before they reach storage
- Prevents inconsistent data from being written to production

### Fail-Fast
- Detects errors early in the upload pipeline
- Prevents cascading failures from invalid data
- Easier debugging with clear validation error messages

### Documentation
- Schemas serve as executable documentation
- Single source of truth for data contracts
- Clear required vs optional field designations

### Type Safety
- Runtime validation complements TypeScript compile-time checks
- Catches data issues that TypeScript can't (dynamic EXIF/IPTC)
- Validates external inputs (multipart uploads)

---

## Future Enhancements

### Phase 2 (D1 Indexing)
- Add `schemas/d1-index-record.schema.json` for database rows
- Validate D1 inserts before queue processing

### Phase 3 (Full-Text Search)
- Add `schemas/fts5-search-result.schema.json` for search responses

### Phase 4 (OpenAPI Documentation)
- Publish OpenAPI spec to API documentation portal
- Generate client SDKs from OpenAPI spec
- Add OpenAPI validation to CI/CD pipeline

### Later
- Consider migrating to Zod for cleaner validation syntax
- Add JSON Schema validation library (AJV) if complexity increases
- Generate TypeScript types from JSON Schemas

---

## Maintenance

### When to Update Schemas

1. **Adding new fields** - Update schema with new optional/required fields
2. **Changing formats** - Update pattern/format validators
3. **New error scenarios** - Add to OpenAPI responses
4. **Breaking changes** - Version the schema (e.g., `v2/`)

### Validation Checklist

After updating schemas:
- [ ] Run `openspec validate add-image-ingest-p1-upload-core --strict`
- [ ] Update `VALIDATION.md` with new checks
- [ ] Update unit tests for new validation rules
- [ ] Update `design.md` examples to match schema
- [ ] Regenerate TypeScript types if using codegen

---

## References

- **OpenSpec:** `../specs/image-ingest/spec.md`
- **Design Doc:** `../design.md`
- **Tasks:** `../tasks.md`
- **Implementation:** `apps/api/src/services/schema-validator.ts`
