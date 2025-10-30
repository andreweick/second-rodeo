# Design: Chatter Hot/Cold Storage Optimization

## Context

The chatter corpus consists of 8,006 social media post records, each containing:
- Metadata: id, date_posted, year, month, slug, publish
- Display data: title (~50 bytes), date string (~10 bytes)
- Content data: content text, tags array, images array

The current schema stores `title` and `date` in D1, resulting in ~640KB database size. By following the hot/cold storage pattern more strictly (per shakespeare ingestion), we can reduce D1 to ~160KB while maintaining all data in R2.

## Goals / Non-Goals

**Goals:**
- Ingest 8,006 chatter posts from R2 staging
- Minimize D1 storage cost (target: <200KB for chatter data)
- Enable fast filtering by datePosted, year, month, publish status
- Support future display by fetching from R2 on-demand
- Follow existing ingestion patterns (R2 → Queue → D1)

**Non-Goals:**
- Full-text search (FTS) - deferred to future proposal
- Query/display API endpoints - deferred to future proposal
- Automated file upload (user uploads via rclone manually)
- Tag relationship management - keep simple for now

## Decisions

### Decision 1: Remove Title and Date from D1

**Choice:** Store only essential queryable metadata in D1, move title and date to R2-only

**Fields in D1 (hot):**
```
id, datePosted, year, month, slug, publish, r2Key, createdAt, updatedAt
```

**Fields in R2 only (cold):**
```
title, date, content, tags[], images[]
```

**Rationale:**
- D1 size reduced from ~640KB to ~160KB (75% reduction)
- Metadata sufficient for all filtering/navigation queries
- Title and date fetched only when user views full post (~20ms latency)
- Matches shakespeare ingestion pattern for consistency
- `slug` is already descriptive enough for list views
- `date` is redundant with `datePosted` timestamp

**Alternatives considered:**
- Keep title in D1: Simple but wastes ~400KB, defeats hot/cold architecture
- Keep date in D1: Redundant with datePosted, adds 80KB unnecessarily
- Remove slug: Too aggressive, slug is useful for URL routing and UNIQUE constraint

### Decision 2: Reuse Existing Validator Pattern

**Choice:** Update existing validateAndMapChatter function to exclude title and date

**Current validator location:** `apps/api/src/services/json-processor.ts`

**Changes needed:**
```typescript
// Remove these from D1 insert:
// title: obj.title,
// date: obj.date,

// Keep these for R2 validation only (ensure they exist in JSON):
if (typeof obj.title !== 'string') throw new Error('Missing or invalid field: title');
if (typeof obj.date !== 'string') throw new Error('Missing or invalid field: date');
```

**Rationale:**
- Validator already exists and works for chatter processing
- Just need to remove fields from return object
- Continue validating JSON has all fields (ensures R2 data quality)
- Minimal code change, low risk

**Alternatives considered:**
- Create new validator: Unnecessary duplication
- Skip title/date validation: Risky, might allow bad JSON into R2

### Decision 3: Bulk Queue Ingestion Endpoint

**Choice:** Single endpoint that queues all 8,006 files at once

**Endpoint:** `POST /chatter/ingest`

**Flow:**
```
1. List R2 objects with prefix chatter/
2. Send one queue message per file (objectKey)
3. Queue consumer processes via existing json-processor
4. Return count of queued messages
```

**Rationale:**
- Simple implementation, follows shakespeare ingestion pattern exactly
- Cloudflare Queues handle batching automatically
- Idempotent - can re-run if ingestion fails partway through
- No progress tracking needed for one-time bulk operation

**Alternatives considered:**
- Batched ingestion with status tracking: Complex, unnecessary for one-time operation
- Direct insertion (no queue): Loses async processing benefits, timeout risk

### Decision 4: Schema Migration Strategy

**Migration:**
```sql
-- Drop columns (data preserved in R2)
ALTER TABLE chatter DROP COLUMN title;
ALTER TABLE chatter DROP COLUMN date;
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

### Risk: List View Performance

- **Impact:** Displaying chatter lists without title requires either using slug or fetching R2
- **Mitigation:** Use slug for list views (already descriptive: "2025-05-14-pope-leo-seen-here...")
- **Future:** Add caching layer if R2 fetches become bottleneck

### Risk: Breaking Change for Existing Queries

- **Impact:** Any code querying chatter.title or chatter.date will break
- **Mitigation:** No frontend exists yet, API is new, low risk
- **Migration:** Update any existing queries to use datePosted or fetch from R2

### Risk: Large Queue Backlog

- **Impact:** 8,006 messages takes time to process
- **Mitigation:** Cloudflare Queues designed for this scale, batches messages
- **Monitoring:** Log progress, estimate completion time (likely ~5-15 minutes)

### Trade-off: R2 Fetch Latency

- **Impact:** ~20ms per chatter post when displaying full content
- **Mitigation:** Acceptable for detail views, list views use D1 only
- **Future:** Add edge caching for frequently accessed posts

## Migration Plan

**Phase 1: Upload to R2**
```bash
rclone copy r2-staging/chatter/ r2:sr-json/chatter/ --transfers=50
# Verify count
rclone ls r2:sr-json/chatter/ | wc -l  # Should be 8,006
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
curl -X POST https://api.your-domain.com/chatter/ingest \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Phase 4: Verify**
```bash
# Check D1 counts
wrangler d1 execute app_db --command "SELECT COUNT(*) FROM chatter"
# Expected: 8,006

# Verify schema (no title/date columns)
wrangler d1 execute app_db --command "PRAGMA table_info(chatter)"

# Test R2 fetch
curl https://api.your-domain.com/chatter/{slug}
```

**Rollback Plan:**
- Drizzle down() migration adds title and date columns back
- Re-run ingestion with old validator to populate fields
- Delete R2 files: `rclone delete r2:sr-json/chatter/`
- Re-deploy previous worker version

## Open Questions

None - design is complete and ready for implementation.
