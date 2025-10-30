# Design: Chatter Image Reference Migration

## Context

Chatter files reference images using original filenames (e.g., `"2024-11-21-74c9cff9-0.jpg"`). The new image ingest system uses deterministic stable IDs (SIDs) computed from SHA256 hash + EXIF metadata. This migration translates old references to new SIDs before uploading to production.

**Scope:**
- 142 chatter files out of 8,006 total (~1.8%) contain image references
- Images are stored locally on laptop, not yet uploaded
- This is a one-time migration operation

**SID Algorithm (from image-ingest spec):**
```
SID = uuidv5(namespace, sha256 + dateTimeOriginal + make + model)

Where:
- namespace: Fixed UUID namespace for the project
- sha256: Content hash of image file
- dateTimeOriginal: EXIF timestamp (or upload date as fallback)
- make: Camera make (or "unknown" as fallback)
- model: Camera model (or "unknown" as fallback)
```

## Goals / Non-Goals

**Goals:**
- Compute SIDs locally for all images referenced in chatter files
- Update chatter JSONs with SIDs in place (idempotent operation)
- Preserve original filenames for historical records
- Provide clear error reporting for missing or problematic images
- Enable one-time execution with minimal dependencies

**Non-Goals:**
- Upload images or chatter files (separate manual steps)
- Validate that images actually exist on server after upload
- Handle complex image file organization (assumes flat directory structure)
- Build complex mapping database (simple JSON lookup is sufficient)

## Decisions

### Decision 1: Script Language - Python

**Choice:** Implement migration script in Python with minimal dependencies

**Rationale:**
- Python has excellent EXIF libraries (`exifread` or `Pillow`)
- Simpler for one-time script compared to Go
- JSON handling is straightforward
- SHA256 and UUID libraries in standard library
- Easy to run on macOS laptop

**Dependencies:**
```
pip install exifread  # EXIF extraction
# Standard library: json, hashlib, uuid, pathlib
```

**Alternatives considered:**
- Go: More verbose for one-time script, requires external EXIF library
- Node.js: Not ideal given project's Cloudflare Workers focus

### Decision 2: Image File Discovery Strategy

**Choice:** Accept `--images-dir` parameter and search recursively for image files

**Search pattern:**
1. Parse chatter JSON for image filenames
2. For each filename, search `--images-dir` recursively
3. If multiple matches found, use first match and log warning
4. If no match found, log error and skip (leave old filename)

**Rationale:**
- Simple flat directory structure is most likely
- Recursive search handles nested directories without complex configuration
- Warnings allow user to fix ambiguous cases manually

**Alternatives considered:**
- Hardcoded paths: Too brittle for one-time script
- Database of filename→path mappings: Overcomplicated for 142 files

### Decision 3: Image Metadata Structure

**Choice:** Store original filename in nested `image_metadata` object keyed by SID

**Structure:**
```json
{
  "images": ["sid_abc123", "sid_def456"],
  "image_metadata": {
    "sid_abc123": {
      "original_filename": "2024-11-21-74c9cff9-0.jpg"
    },
    "sid_def456": {
      "original_filename": "IMG_0509.jpg"
    }
  }
}
```

**Rationale:**
- SID as key enables fast lookup when displaying chatter
- Extensible: Can add more metadata per image later (width, height, etc.)
- Stays in R2 JSON only (not indexed to D1)
- Easy to query: `metadata = chatter_json['image_metadata'].get(sid, {})`

**Alternatives considered:**
- Array of objects: `[{sid, filename}]` - harder to lookup by SID
- Flat structure: `"image_filenames": ["old.jpg"]` - loses SID association
- No metadata: Discards historical information permanently

### Decision 4: SID Namespace UUID

**Choice:** Use a project-specific namespace UUID hardcoded in script

**Value:** Generate once and reuse: `uuid.uuid5(uuid.NAMESPACE_DNS, "second-rodeo.photos")`

**Rationale:**
- Must match server implementation exactly for deterministic results
- Single source of truth: Document in script comments
- Easy to verify: Upload one test image and compare SID

**Implementation:**
```python
# Must match server-side namespace UUID exactly
NAMESPACE_UUID = uuid.UUID('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')

def generate_sid(sha256_hex, date_taken, make, model):
    # Combine inputs exactly as server does
    input_string = f"{sha256_hex}{date_taken}{make}{model}"
    return f"sid_{uuid.uuid5(NAMESPACE_UUID, input_string).hex}"
```

### Decision 5: EXIF Fallback Strategy

**Choice:** Use same fallback logic as server for missing EXIF fields

**Fallbacks:**
- `dateTimeOriginal` missing → Use file modification time (ISO8601 format)
- `make` missing → Use `"unknown"`
- `model` missing → Use `"unknown"`

**Rationale:**
- Ensures SID computed locally matches what server would generate
- Allows images without EXIF (screenshots, etc.) to still get valid SIDs
- Consistent behavior between migration and server upload

### Decision 6: Error Handling Strategy

**Choice:** Log warnings but continue processing, leave failures for manual review

**Error cases:**
1. **Image file not found:** Log warning with filename, skip image, leave old filename in JSON
2. **EXIF extraction fails:** Log warning, use fallback values, compute SID anyway
3. **Multiple files match filename:** Log warning, use first match
4. **Chatter JSON parse error:** Log error, skip entire chatter file

**Rationale:**
- One-time script doesn't need perfect error handling
- User can review logs and fix issues manually if needed
- Leaving old filenames intact makes it clear which images failed
- Script is idempotent - can fix issues and re-run

## Risks / Trade-offs

### Risk: Namespace UUID Mismatch

**Impact:** If script uses different namespace UUID than server, SIDs won't match after upload

**Mitigation:**
- Document namespace UUID clearly in both script and server code
- Test with one image: compute SID locally, upload via API, compare results
- Add script parameter `--verify-sid <image_path> <expected_sid>` for testing

### Risk: EXIF Parsing Differences

**Impact:** Different EXIF libraries might parse dates/strings differently

**Mitigation:**
- Use same EXIF library as server (exifr.js) if possible, or document differences
- Test with images that have various EXIF formats
- Focus on common fields (DateTimeOriginal, Make, Model) that are well-standardized

### Risk: Image Files Not Found

**Impact:** 142 chatter files reference images, but user might not have all images locally

**Mitigation:**
- Clear logging shows which images are missing
- Script leaves old filenames intact for missing images
- User can locate images and re-run script
- Alternative: Skip chatter entries with missing images entirely

### Trade-off: Image Metadata Storage Size

**Impact:** Adding `image_metadata` increases JSON file size slightly

**Example:** `"image_metadata": {"sid_abc": {"original_filename": "..."}}` adds ~100 bytes per image

**Benefit:** Historical record of original filenames for debugging and archival purposes

**Decision:** Acceptable trade-off for 142 files with small metadata additions

## Migration Plan

### Phase 1: Script Development and Testing

```bash
# Create migration script
mkdir -p tools/migration
touch tools/migration/migrate_chatter_images.py

# Test with one chatter file
python3 tools/migration/migrate_chatter_images.py \
  --chatter-dir r2-staging/chatter/ \
  --images-dir ~/photos/ \
  --dry-run \
  --filter "sha256_7b3b603d1b353fea781addd76ac9a406df4195e1bd2fed19fd639e285f295b06.json"

# Verify SID matches server
# 1. Upload test image via API: POST /images with 2024-11-21-74c9cff9-0.jpg
# 2. Compare returned SID with script-computed SID
# 3. If mismatch, debug namespace UUID or algorithm
```

### Phase 2: Full Migration

```bash
# Run on all chatter files
python3 tools/migration/migrate_chatter_images.py \
  --chatter-dir r2-staging/chatter/ \
  --images-dir ~/photos/ \
  > migration.log 2>&1

# Review log for warnings
grep "WARNING" migration.log
grep "ERROR" migration.log

# Manually fix any issues and re-run if needed
```

### Phase 3: Upload to Production

```bash
# Upload images (will get same SIDs)
# Manual process or bulk upload script

# Upload chatter JSONs
rclone copy r2-staging/chatter/ r2:sr-json/chatter/ --transfers=50

# Trigger chatter ingestion
curl -X POST https://api.your-domain.com/chatter/ingest \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Rollback Plan

If issues discovered after migration:
1. Restore original chatter JSONs from git/backup
2. Re-run migration with fixed script
3. Re-upload corrected files to R2

**Note:** Since this happens before production upload, rollback is simple file replacement.

## Open Questions

1. **Where exactly are image files stored on laptop?** Single directory or nested structure?
2. **What UU namespace UUID does the server use?** Need exact value for script.
3. **Should script generate a mapping JSON file for reference?** e.g., `old_filename_to_sid.json`
