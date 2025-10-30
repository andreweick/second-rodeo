# Design: Films Hot/Cold Storage

## Context

The films corpus consists of 2,659 movie viewing records, each containing:
- Metadata: id, year, yearWatched, dateWatched, month, slug, rewatch, rewatchCount, publish
- Display data: title (~40 bytes), posterUrl (~80 bytes)
- Redundant data: date string (~10 bytes), letterboxdUri (~35 bytes - derivable from letterboxdId)
- External IDs: tmdbId, letterboxdId

The current schema stores all fields in D1, resulting in ~530KB database size. By following the hot/cold storage pattern and deriving URLs, we can reduce D1 to ~90KB while maintaining all functionality.

## Goals / Non-Goals

**Goals:**
- Ingest 2,659 film viewing records from R2 staging
- Minimize D1 storage cost (target: <100KB for films data)
- Enable fast temporal filtering by dateWatched, yearWatched, month
- Enable rewatch filtering and sorting
- Support display by fetching from R2 on-demand
- Follow existing ingestion patterns (R2 → Queue → D1)

**Non-Goals:**
- Search functionality - deferred to phase2-films-vectorize proposal
- Query/display API endpoints - deferred to future proposal
- Automated file upload (user uploads via rclone manually)
- Director/genre/cast filtering - use TMDB API if needed

## Decisions

### Decision 1: Remove Display Fields from D1

**Choice:** Store only queryable metadata in D1, fetch display data from R2

**Architecture:**
```
User request for film details
   ↓
Query D1 for dateWatched, year, etc.
   ↓
Fetch full details from R2 (title, poster, etc.)
```

**Rationale:**
- D1 savings: ~170KB (title, date, posterUrl, letterboxdUri)
- Query performance unaffected (temporal filters use dateWatched, year, month)
- R2 fetch latency acceptable for display (~20ms)
- Matches pattern from chatter/checkins/shakespeare ingestion

**Alternatives considered:**
- Keep title for search: Wait for phase2-films-vectorize for semantic search
- FTS5 for title search: Deferred to vectorize proposal for better UX

### Decision 2: Remove Date String and Derive from Timestamp

**Choice:** Store only dateWatched timestamp, derive YYYY-MM-DD when needed

**Derivation:**
```typescript
const date = new Date(dateWatched).toISOString().split('T')[0]; // YYYY-MM-DD
```

**Rationale:**
- Timestamp is source of truth for all temporal queries
- Date string is derivable with zero latency
- Saves ~10 bytes × 2,659 = 26KB
- Matches optimization pattern from chatter/checkins

### Decision 3: Remove Poster URL and Derive from TMDB or R2

**Choice:** Fetch posterUrl from R2 JSON or derive from TMDB

**Derivation options:**
```typescript
// Option 1: Fetch from R2 (complete)
const json = await r2.get(`films/${filmId}.json`);
const posterUrl = json.poster_url;

// Option 2: Derive from TMDB (fast, uses CDN)
const posterUrl = `https://image.tmdb.org/t/p/w500/${tmdb_poster_path}`;
```

**Rationale:**
- Poster URL rarely changes after ingestion
- TMDB CDN URLs are fast (~20ms with edge caching)
- Saves ~80 bytes × 2,659 = 213KB
- Can batch TMDB API calls for multiple films if needed

### Decision 4: Remove Letterboxd URI and Derive from ID

**Choice:** Derive Letterboxd URI from letterboxdId

**Derivation:**
```typescript
const letterboxdUri = `https://boxd.it/${letterboxdId}`;
```

**Rationale:**
- Letterboxd uses short IDs (e.g., "SO6tz") for stable URLs
- Derivation is instant and deterministic
- Saves ~35 bytes × 2,659 = 93KB
- No API call needed, no latency

### Decision 5: Bulk Queue Ingestion Pattern

**Choice:** Follow existing pattern: R2 list → Queue → Process

**Endpoint:** `POST /films/ingest`

**Flow:**
```
1. List R2 objects with prefix films/
2. Send one queue message per file (objectKey)
3. Queue consumer:
   a. Fetch JSON from R2
   b. Validate required fields
   c. Insert to D1 (without removed fields)
4. Return count of queued messages
```

**Rationale:**
- Proven pattern from shakespeare/chatter/checkins
- Idempotent: UNIQUE constraint on slug handles duplicates
- Resilient: Queue retries on failures
- Simple: Single ingestion flow

**Alternatives considered:**
- Direct insertion (no queue): Timeout risk for 2,659 records
- Batch inserts: More complex, queue pattern already works

## Risks / Trade-offs

### Risk: Breaking Change for Existing Queries

- **Impact:** Any code querying films.title will break
- **Mitigation:** No frontend exists yet, API is new, low risk
- **Migration:** Update queries to fetch from R2 or wait for phase2-films-vectorize

### Trade-off: R2 Fetch Latency for Display

- **Impact:** ~20ms per film when displaying title/poster
- **Mitigation:** Acceptable for detail views, can add edge caching
- **Future:** phase2-films-vectorize will enable search without R2 fetch

### Trade-off: No Title Search in Phase 1

- **Impact:** Users must browse chronologically or by year/month
- **Mitigation:** phase2-films-vectorize proposal adds semantic search
- **Future:** Vectorize will provide better search than FTS5 would

## Migration Plan

**Phase 1: Upload to R2**
```bash
rclone copy r2-staging/films/ r2:sr-json/films/ --transfers=50
# Verify count
rclone ls r2:sr-json/films/ | wc -l  # Should be 2,659
```

**Phase 2: Apply Schema Migration**
```bash
# Update schema.ts and validator
just migrate        # Generate migration
just migrate-local  # Apply to local D1
# Test locally with sample data
wrangler d1 migrations apply app_db  # Production
```

**Phase 3: Trigger Ingestion**
```bash
curl -X POST https://api.your-domain.com/films/ingest \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Phase 4: Verify**
```bash
# Check D1 counts
wrangler d1 execute app_db --command "SELECT COUNT(*) FROM films"
# Expected: 2,659

# Verify schema (no removed fields)
wrangler d1 execute app_db --command "PRAGMA table_info(films)"

# Test R2 fetch
curl https://api.your-domain.com/films/{slug}
```

**Rollback Plan:**
- Drizzle down() migration adds 4 columns back
- Re-run ingestion with old validator to populate fields
- Re-deploy previous worker version

## Open Questions

None - design is complete and ready for implementation.
