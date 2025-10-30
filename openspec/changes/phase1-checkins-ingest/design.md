# Design: Checkins Hot/Cold Storage with Geospatial Optimization

## Context

The checkins corpus consists of 2,607 location-based check-in records, each containing:
- Metadata: id, venue_id, datetime, year, month, slug, publish
- Geospatial data: latitude, longitude
- Display data: venueName (~30 bytes), foursquareUrl (~60 bytes)
- Address data: formattedAddress, street, city, state, postalCode, country, neighborhood (~160 bytes total)
- Redundant time data: date string (~10 bytes), time string (~10 bytes)

The current schema stores all fields in D1, resulting in ~730KB database size. By following the hot/cold storage pattern and leveraging geospatial queries, we can reduce D1 to ~200KB while maintaining all data in R2.

## Goals / Non-Goals

**Goals:**
- Ingest 2,607 checkin records from R2 staging
- Minimize D1 storage cost (target: <250KB for checkins data)
- Enable fast geospatial filtering by lat/long bounding box
- Enable fast temporal filtering by datetime, year, month
- Enable venue grouping by venueId
- Support future display by fetching from R2 on-demand
- Follow existing ingestion patterns (R2 → Queue → D1)

**Non-Goals:**
- Full-text search on venue names or addresses - deferred to future proposal
- Query/display API endpoints - deferred to future proposal
- Automated file upload (user uploads via rclone manually)
- Venue normalization or deduplication - keep simple
- City/state/country text filtering - use geospatial instead

## Decisions

### Decision 1: Remove Address and Name Fields from D1

**Choice:** Store only geospatial coordinates in D1, move all address text to R2-only

**Fields in D1 (hot):**
```
id, venueId, latitude, longitude, datetime,
year, month, slug, publish, r2Key, createdAt, updatedAt
```

**Fields in R2 only (cold):**
```
venueName, foursquareUrl, formattedAddress, street,
city, state, postalCode, country, neighborhood, date, time
```

**Rationale:**
- D1 size reduced from ~730KB to ~200KB (73% reduction)
- Geospatial queries (lat/long bounding box) more efficient than text matching on city/state
- VenueId sufficient for grouping without venue name
- Address details fetched only when user views checkin (~20ms latency)
- Matches shakespeare/chatter ingestion pattern for consistency
- `date` and `time` are redundant with `datetime` timestamp

**Alternatives considered:**
- Keep city/state for text filtering: Wastes ~40 bytes/record, less precise than geospatial
- Keep venueName for list display: Wastes ~30 bytes/record, venueId sufficient for grouping
- Remove venueId: Too aggressive, useful for finding repeat visits

### Decision 2: Geospatial Query Strategy

**Choice:** Use latitude/longitude bounding box queries instead of city/state text filtering

**Query examples:**
```sql
-- Checkins near Las Vegas (bounding box)
SELECT * FROM checkins
WHERE latitude BETWEEN 36.0 AND 36.3
  AND longitude BETWEEN -115.3 AND -115.0
ORDER BY datetime DESC;

-- All checkins at a venue
SELECT * FROM checkins
WHERE venueId = '4d49c401f53c8cfadedf1b47'
ORDER BY datetime DESC;

-- Checkins in a year
SELECT * FROM checkins
WHERE year = 2011
ORDER BY datetime DESC;
```

**Rationale:**
- Lat/long queries more precise than city text matching
- Supports radius searches and proximity sorting
- No need to store redundant city/state/country text
- Common pattern in location-based applications

**Alternatives considered:**
- Keep city for filtering: Less flexible, wastes storage, city boundaries imprecise
- Use external geocoding API: Adds latency and dependencies

### Decision 3: Remove Date/Time Strings

**Choice:** Store only datetime timestamp, derive date/time strings when needed

**Derivation:**
```typescript
// Frontend or API can derive:
const date = datetime.toISOString().split('T')[0]; // YYYY-MM-DD
const time = datetime.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
```

**Rationale:**
- Timestamp is source of truth for all temporal queries
- Date/time strings are derivable, no need to store
- Saves ~20 bytes per record (2,607 × 20 = 52KB)
- Matches optimization pattern from chatter ingestion

**Alternatives considered:**
- Keep date for convenience: Redundant, trivial to derive
- Keep time for granular filtering: Timestamp already provides this

### Decision 4: Bulk Queue Ingestion Endpoint

**Choice:** Single endpoint that queues all 2,607 files at once

**Endpoint:** `POST /checkins/ingest`

**Flow:**
```
1. List R2 objects with prefix checkins/
2. Send one queue message per file (objectKey)
3. Queue consumer processes via existing json-processor
4. Return count of queued messages
```

**Rationale:**
- Simple implementation, follows shakespeare/chatter ingestion pattern exactly
- Cloudflare Queues handle batching automatically
- Idempotent - can re-run if ingestion fails partway through
- No progress tracking needed for one-time bulk operation

**Alternatives considered:**
- Batched ingestion with status tracking: Complex, unnecessary for one-time operation
- Direct insertion (no queue): Loses async processing benefits, timeout risk

### Decision 5: Schema Migration Strategy

**Migration:**
```sql
-- Drop 11 columns (data preserved in R2)
ALTER TABLE checkins DROP COLUMN venue_name;
ALTER TABLE checkins DROP COLUMN foursquare_url;
ALTER TABLE checkins DROP COLUMN formatted_address;
ALTER TABLE checkins DROP COLUMN street;
ALTER TABLE checkins DROP COLUMN city;
ALTER TABLE checkins DROP COLUMN state;
ALTER TABLE checkins DROP COLUMN postal_code;
ALTER TABLE checkins DROP COLUMN country;
ALTER TABLE checkins DROP COLUMN neighborhood;
ALTER TABLE checkins DROP COLUMN date;
ALTER TABLE checkins DROP COLUMN time;
```

**Drizzle migration:**
- Generate via `just migrate`
- Apply locally via `just migrate-local`
- Apply production via `wrangler d1 migrations apply app_db`

**Safety:**
- No data loss: All data already in R2 JSON files
- Reversible: Can add columns back and re-ingest if needed
- Test locally first before production deployment

## Risks / Trade-offs

### Risk: Geospatial Query Learning Curve

- **Impact:** Developers need to use bounding box queries instead of city text
- **Mitigation:** Document common query patterns, provide examples
- **Future:** Add helper functions for common locations

### Risk: List View Performance

- **Impact:** Displaying venue names requires fetching R2 or grouping by venueId
- **Mitigation:** Group by venueId first, fetch names in batch if needed
- **Future:** Add venue lookup table if grouping becomes common

### Risk: Breaking Change for Existing Queries

- **Impact:** Any code querying checkins.city or checkins.venueName will break
- **Mitigation:** No frontend exists yet, API is new, low risk
- **Migration:** Update any existing queries to use lat/long or fetch from R2

### Risk: Large Queue Backlog

- **Impact:** 2,607 messages takes time to process
- **Mitigation:** Cloudflare Queues designed for this scale, batches messages
- **Monitoring:** Log progress, estimate completion time (likely ~3-10 minutes)

### Trade-off: R2 Fetch Latency

- **Impact:** ~20ms per checkin when displaying full venue/address details
- **Mitigation:** Acceptable for detail views, list views use D1 only
- **Future:** Add edge caching for frequently accessed checkins

### Trade-off: Geospatial Precision

- **Impact:** Bounding box queries require coordinate knowledge
- **Mitigation:** Standard pattern in geospatial apps, libraries available
- **Future:** Add common location presets (cities, regions)

## Migration Plan

**Phase 1: Upload to R2**
```bash
rclone copy r2-staging/checkins/ r2:sr-json/checkins/ --transfers=50
# Verify count
rclone ls r2:sr-json/checkins/ | wc -l  # Should be 2,607
```

**Phase 2: Apply Schema Migration**
```bash
# Update schema.ts and validator
just migrate        # Generate migration
just migrate-local  # Apply to local D1
# Test locally with sample data
wrangler deploy --dry-run
wrangler d1 migrations apply app_db  # Production
```

**Phase 3: Trigger Ingestion**
```bash
curl -X POST https://api.your-domain.com/checkins/ingest \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Phase 4: Verify**
```bash
# Check D1 counts
wrangler d1 execute app_db --command "SELECT COUNT(*) FROM checkins"
# Expected: 2,607

# Verify schema (no removed fields)
wrangler d1 execute app_db --command "PRAGMA table_info(checkins)"

# Test geospatial query
wrangler d1 execute app_db --command "
  SELECT COUNT(*) FROM checkins
  WHERE latitude BETWEEN 36.0 AND 36.3
    AND longitude BETWEEN -115.3 AND -115.0
"

# Test R2 fetch
curl https://api.your-domain.com/checkins/{slug}
```

**Rollback Plan:**
- Drizzle down() migration adds 11 columns back
- Re-run ingestion with old validator to populate fields
- Delete R2 files: `rclone delete r2:sr-json/checkins/`
- Re-deploy previous worker version

## Open Questions

None - design is complete and ready for implementation.
