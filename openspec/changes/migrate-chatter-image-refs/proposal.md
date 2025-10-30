# Proposal: Migrate Chatter Image References to Stable IDs

## Why

Chatter JSON files (142 out of 8,006 files, ~1.8%) currently reference images using old filenames like `"2024-11-21-74c9cff9-0.jpg"` or `"IMG_0509.jpg"`. With the new image ingest system using stable IDs (SIDs), these references need to be translated to the new format before uploading.

The SID generation algorithm is deterministic (based on SHA256 + EXIF metadata), so we can compute SIDs locally without uploading images first.

This is a one-time migration operation that will:
- Compute SIDs locally for all images referenced in chatter files
- Update chatter JSON files to reference images by their stable IDs
- Preserve original filenames in metadata for historical records
- Enable proper image resolution in the chatter viewing interface

## What Changes

### New Components
- Local migration script (Python or Go) to:
  - Scan chatter JSONs for image references
  - Find corresponding image files on laptop
  - Compute SHA256 hash and extract EXIF metadata
  - Generate SID using same algorithm as server (UUIDv5)
  - Update chatter JSONs with computed SIDs
- Updated chatter JSON schema with optional `image_metadata` field for historical tracking

### Migration Workflow
1. **Run migration script** - Scans `r2-staging/chatter/*.json`, finds images, computes SIDs, updates JSONs in place
2. **Upload images** - Use image ingest API (images will get same SIDs since algorithm is deterministic)
3. **Upload chatter** - Upload updated JSONs to R2 via existing bulk ingestion

### Schema Changes
- `images` array: Replace old filenames with computed SIDs
- `image_metadata` (new optional field): Store original filename mapping for historical records

**Before:**
```json
{
  "images": ["2024-11-21-74c9cff9-0.jpg"],
  ...
}
```

**After:**
```json
{
  "images": ["sid_abc123xyz"],
  "image_metadata": {
    "sid_abc123xyz": {
      "original_filename": "2024-11-21-74c9cff9-0.jpg"
    }
  },
  ...
}
```

## Impact

**Affected specs:**
- MODIFIED: `chatter-ingestion` capability (add optional image_metadata field validation)

**Affected code:**
- **NEW**: Local migration script (outside main codebase, one-time use tool)
- `apps/api/src/services/json-processor.ts` - Update chatter validator to accept optional `image_metadata` field (no validation required, pass-through to R2)

**User workflow:**
1. Run migration script on laptop: `python3 migrate-chatter-images.py --chatter-dir r2-staging/chatter/ --images-dir ~/photos/`
2. Script updates 142 chatter JSON files in place with computed SIDs
3. Upload images through image ingest API endpoint (get same SIDs back)
4. Upload updated chatter JSONs to R2 using existing bulk ingestion

**Non-Breaking:**
- Migration happens locally before files are uploaded to production
- Chatter validator accepts optional `image_metadata` field (backwards compatible)
- No changes to D1 schema (image_metadata stays in R2 JSON only)

**Warnings and Error Handling:**
- Script logs warning if image file can't be found on disk (missing from images directory)
- Script logs warning if EXIF extraction fails (still generates SID with fallbacks)
- Script logs warning if SID can't be computed (leaves old filename, indicates algorithm issue)
- Migration is idempotent - safe to re-run if image files are found later
