# Design: Quotes Hot/Cold Storage

## Context

The quotes corpus consists of 32 literary/philosophical quotes, each containing:
- Metadata: id, author, dateAdded, year, month, slug, publish
- Content: text (~100 bytes on average)
- Redundant data: date string (~10 bytes - derivable from dateAdded)

The current schema stores all fields in D1, resulting in ~4.5KB database size. By following the hot/cold storage pattern, we can reduce D1 to ~1KB while maintaining all functionality.

## Goals / Non-Goals

**Goals:**
- Ingest 32 quote records from R2 staging
- Minimize D1 storage (target: <2KB for quotes data)
- Enable fast author and temporal filtering
- Support display by fetching from R2 on-demand
- Follow existing ingestion patterns (R2 → Queue → D1)

**Non-Goals:**
- Search functionality - deferred to phase2-quotes-vectorize proposal
- Tag-based filtering in D1 - tags stored in R2, fetch when needed
- Query/display API endpoints - deferred to future proposal
- Automated file upload (user uploads via rclone manually)

## Decisions

### Decision 1: Remove Text from D1

**Choice:** Store only queryable metadata in D1, fetch quote text from R2

**Architecture:**
```
User request for quote details
   ↓
Query D1 for author, dateAdded, etc.
   ↓
Fetch full details from R2 (text, tags, etc.)
```

**Rationale:**
- D1 savings: ~3.5KB (text field removal)
- Query performance unaffected (filters use author, date fields)
- R2 fetch latency acceptable for display (~20ms)
- Matches pattern from films/chatter/checkins

**Alternatives considered:**
- Keep text for FTS5 search: Wait for phase2-quotes-vectorize for better semantic search
- Store text excerpt: Adds complexity, phase2 provides better solution

### Decision 2: Remove Date String and Derive from Timestamp

**Choice:** Store only dateAdded timestamp, derive YYYY-MM-DD when needed

**Derivation:**
```typescript
const date = new Date(dateAdded).toISOString().split('T')[0]; // YYYY-MM-DD
```

**Rationale:**
- Timestamp is source of truth for all temporal queries
- Date string is derivable with zero latency
- Saves ~10 bytes × 32 = 320 bytes
- Matches optimization pattern from other content types

### Decision 3: Bulk Queue Ingestion Pattern

**Choice:** Follow existing pattern: R2 list → Queue → Process

**Endpoint:** `POST /quotes/ingest`

**Flow:**
```
1. List R2 objects with prefix quotes/
2. Send one queue message per file (objectKey)
3. Queue consumer:
   a. Fetch JSON from R2
   b. Validate required fields
   c. Insert to D1 (without removed fields)
4. Return count of queued messages
```

**Rationale:**
- Proven pattern from shakespeare/chatter/checkins/films
- Idempotent: UNIQUE constraint on slug handles duplicates
- Resilient: Queue retries on failures
- Simple: Single ingestion flow

**Alternatives considered:**
- Direct insertion (no queue): Pattern already established, keep consistent
- Batch inserts: Unnecessary for 32 records

## Risks / Trade-offs

### Risk: Breaking Change for Existing Queries

- **Impact:** Any code querying quotes.text will break
- **Mitigation:** No frontend exists yet, API is new, low risk
- **Migration:** Update queries to fetch from R2 or wait for phase2-quotes-vectorize

### Trade-off: R2 Fetch Latency for Display

- **Impact:** ~20ms per quote when displaying text
- **Mitigation:** Acceptable for detail views, can add edge caching
- **Future:** phase2-quotes-vectorize will enable search without R2 fetch

### Trade-off: No Text Search in Phase 1

- **Impact:** Users must browse by author or chronologically
- **Mitigation:** phase2-quotes-vectorize proposal adds semantic search
- **Future:** Vectorize will provide thematic search ("quotes about courage")

## Migration Plan

**Phase 1: Upload to R2**
```bash
rclone copy r2-staging/quotes/ r2:sr-json/quotes/ --transfers=50
# Verify count
rclone ls r2:sr-json/quotes/ | wc -l  # Should be 32
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
curl -X POST https://api.your-domain.com/quotes/ingest \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Phase 4: Verify**
```bash
# Check D1 counts
wrangler d1 execute app_db --command "SELECT COUNT(*) FROM quotes"
# Expected: 32

# Verify schema (no removed fields)
wrangler d1 execute app_db --command "PRAGMA table_info(quotes)"

# Test R2 fetch
curl https://api.your-domain.com/quotes/{slug}
```

**Rollback Plan:**
- Drizzle down() migration adds 2 columns back
- Re-run ingestion with old validator to populate fields
- Re-deploy previous worker version

## Open Questions

None - design is complete and ready for implementation.
