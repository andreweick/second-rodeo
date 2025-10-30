# Proposal: Bulk Checkins Ingestion with Schema Optimization

## Why

Enable bulk ingestion of 2,607 checkin records from pre-processed JSON files in `r2-staging/checkins/` into the Second Rodeo archive. The checkins table currently stores 11 redundant fields (venue name, address components, date/time strings) that can be removed to follow the hot/cold storage architecture, reducing D1 storage by ~530KB (~73% reduction).

This completes the checkins ingestion flow by adding the missing bulk trigger endpoint while optimizing for minimal D1 footprint and leveraging geospatial queries (lat/long) instead of text-based location filtering.

## What Changes

- **BREAKING**: Update checkins table schema to remove 11 redundant fields (venueName, address components, date, time)
- Add HTTP endpoint `POST /checkins/ingest` to trigger bulk ingestion from R2
- List all objects with R2 prefix `checkins/` and queue them for processing
- Update checkins validator to exclude removed fields from D1 insert
- Generate Drizzle migration for schema changes
- Support idempotent re-ingestion via existing UNIQUE constraint on `slug` field

## Impact

**Affected specs:**
- New capability: `checkins-ingestion` (bulk data import from R2 to D1)

**Affected code:**
- `apps/api/src/db/schema.ts` - Remove 11 fields from checkins table
- `apps/api/src/services/json-processor.ts` - Update validateAndMapCheckin to exclude removed fields
- `apps/api/src/handlers/http.ts` - Add `/checkins/ingest` endpoint
- `apps/api/migrations/` - New migration file for schema changes

**Storage architecture:**
- D1: ~200KB for 2,607 checkin records (metadata only: id, venueId, lat/long, datetime, year, month, slug, publish, r2Key)
- R2: ~1.5MB for full JSON files with venueName, address details, foursquare URL
- Pattern: Query D1 for filtering/navigation by location/time, fetch from R2 for display details
- Savings: 73% reduction in D1 storage (from ~730KB to ~200KB)

**User workflow:**
1. Upload files to R2 via rclone: `rclone copy r2-staging/checkins/ r2:sr-json/checkins/`
2. Apply schema migration (removes 11 columns)
3. Call authenticated endpoint: `POST /checkins/ingest`
4. Endpoint lists R2 objects and queues 2,607 messages
5. Queue processes files using updated validator, inserts minimal metadata to D1
6. Query D1 for filtering (by lat/long bounding box, datetime, venueId), fetch full JSON from R2 for display

**Breaking changes:**
- **BREAKING**: Checkins table removes `venueName`, `foursquareUrl`, `formattedAddress`, `street`, `city`, `state`, `postalCode`, `country`, `neighborhood`, `date`, `time` fields
- List views must use venueId or fetch from R2 for venue name/address
- Location filtering shifts from city/state text to lat/long bounding box queries
- Existing checkins table will be migrated (columns dropped, no data loss in R2)
