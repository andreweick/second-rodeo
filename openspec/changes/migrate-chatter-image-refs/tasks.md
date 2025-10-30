# Tasks: Migrate Chatter Image References to Stable IDs

## 1. Identify Server SID Algorithm Details

- [ ] 1.1 Locate server-side SID generation code (check `apps/api/src/services/image-upload.ts` or similar)
- [ ] 1.2 Extract exact namespace UUID value used for UUIDv5 generation
- [ ] 1.3 Document exact input string format: `sha256 + dateTimeOriginal + make + model`
- [ ] 1.4 Document fallback values for missing EXIF fields

## 2. Create Migration Script

- [ ] 2.1 Create `tools/migration/migrate_chatter_images.py` with CLI argument parsing
- [ ] 2.2 Implement image file discovery (recursive search in `--images-dir`)
- [ ] 2.3 Implement SHA256 hash computation for image files
- [ ] 2.4 Implement EXIF metadata extraction using `exifread` or `Pillow`
- [ ] 2.5 Implement SID generation matching server algorithm exactly
- [ ] 2.6 Implement chatter JSON parsing and updating logic
- [ ] 2.7 Implement `image_metadata` object creation with original filenames
- [ ] 2.8 Add `--dry-run` flag for testing without modifying files
- [ ] 2.9 Add logging for warnings (missing images, EXIF failures) and errors
- [ ] 2.10 Add `--filter` parameter to process single chatter file for testing

## 3. Verify SID Algorithm Match

- [ ] 3.1 Select one test image referenced in chatter (e.g., `2024-11-21-74c9cff9-0.jpg`)
- [ ] 3.2 Run script in dry-run mode to compute SID locally
- [ ] 3.3 Upload same image via image ingest API endpoint: `POST /images`
- [ ] 3.4 Compare SID returned by server with script-computed SID
- [ ] 3.5 If mismatch, debug and fix script algorithm (check namespace UUID, input format, EXIF parsing)
- [ ] 3.6 Repeat test with image that has no EXIF data (verify fallback logic)

## 4. Run Migration on All Chatter Files

- [ ] 4.1 Run script with `--dry-run` on all chatter files to see summary
- [ ] 4.2 Review dry-run output for expected number of updates (~142 files)
- [ ] 4.3 Run script without `--dry-run` to update chatter JSONs in place
- [ ] 4.4 Save migration log output to file for review
- [ ] 4.5 Review warnings and errors in log
- [ ] 4.6 Manually inspect a few updated chatter JSON files to verify structure
- [ ] 4.7 Verify `images` arrays now contain SIDs (e.g., `sid_abc123`)
- [ ] 4.8 Verify `image_metadata` objects contain original filenames

## 5. Update Chatter Validator (Optional Server Change)

- [ ] 5.1 Open `apps/api/src/services/json-processor.ts`
- [ ] 5.2 Locate `validateAndMapChatter` function
- [ ] 5.3 Add optional `image_metadata` field acceptance (no validation needed, pass-through)
- [ ] 5.4 Test validator with sample chatter JSON containing `image_metadata`
- [ ] 5.5 Ensure validator doesn't reject valid chatter with new field

## 6. Verification and Cleanup

- [ ] 6.1 Commit updated chatter JSON files to git (or backup originals first)
- [ ] 6.2 Generate summary report: number of chatter files updated, images processed, warnings/errors
- [ ] 6.3 Document any manual fixups needed for images that couldn't be found
- [ ] 6.4 Prepare for upload: images first (via API), then chatter JSONs (via bulk ingestion)

## 7. Optional: Generate Mapping Reference File

- [ ] 7.1 Add script option to output `old_filename_to_sid.json` mapping file
- [ ] 7.2 Generate mapping for reference and debugging purposes
- [ ] 7.3 Save mapping file outside of r2-staging for historical records
