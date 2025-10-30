# Design: Shakespeare Hot/Cold Storage Architecture

## Context

The Shakespeare corpus consists of 35,629 paragraph records, each containing:
- Metadata: work_id, act, scene, character_id, word counts, etc.
- Text data: full text (~300-3000 chars), phonetic text, stemmed text

Storing all fields in D1 would result in ~5-10MB database size. By following the hot/cold storage pattern (per `openspec/project.md`), we can reduce D1 to ~500KB while maintaining all data in R2.

## Goals / Non-Goals

**Goals:**
- Ingest 35,629 Shakespeare paragraphs + 43 works metadata
- Minimize D1 storage cost (<1MB total for Shakespeare data)
- Enable fast filtering by work, character, act/scene, word count
- Support future text display by fetching from R2 on-demand
- Follow existing ingestion patterns (R2 → Queue → D1)

**Non-Goals:**
- Search functionality - deferred to phase2-shakespeare-vectorize proposal
- Query/display API endpoints - deferred to future proposal
- Automated file upload (user uploads via rclone manually)
- Works relationship management (foreign keys, joins) - keep simple

## Decisions

### Decision 1: Hot/Cold Storage Split

**Choice:** Store only essential metadata in D1, keep text in R2

**Fields in D1 (hot):**
```
id, work_id, act, scene, paragraph_num,
character_id, is_stage_direction, word_count, timestamp, r2_key
```

**Fields in R2 only (cold):**
```
text, text_phonetic, text_stem,
work_title, long_title, genre_code, genre_name, character_name
```

**Rationale:**
- D1 size reduced from ~10MB to ~500KB
- Metadata sufficient for all filtering/navigation queries
- Text fetched only when user actually views a paragraph (~20ms latency)
- Matches project architecture pattern for cost optimization

**Alternatives considered:**
- Store text in D1 with FTS5: 10MB+, expensive, wait for phase2-shakespeare-vectorize for better search
- Store work_title in every row: Redundant, add shakespeare_works table instead

### Decision 2: Separate shakespeare_works Table

**Choice:** Create dedicated table for 43 works with full metadata

**Fields:**
```
work_id (PK), title, long_title, short_title,
genre_code, genre_name, year,
total_paragraphs, total_words, total_characters, stage_direction_count
```

**Rationale:**
- Eliminates redundancy (43 works vs 35,629 paragraphs)
- Enables work-level queries without scanning paragraphs
- Clean separation: structural metadata (D1) vs text (R2)
- Supports future features (work summaries, genre browsing)

### Decision 3: Dual Ingestion Endpoints

**Choice:** Separate endpoints for works manifest and paragraphs

**Endpoints:**
- `POST /shakespeare/ingest/works` - Ingests manifest.jsonl (43 works)
- `POST /shakespeare/ingest` - Ingests paragraphs/*.json (35,629 files)

**Workflow:**
```
1. Upload to R2:
   - shakespeare/paragraphs/*.json (35,629 files)
   - shakespeare/manifest.jsonl (43 lines)

2. Trigger works ingestion first:
   POST /shakespeare/ingest/works
   → Parses JSONL → Queues 43 works → Inserts to shakespeare_works

3. Trigger paragraphs ingestion:
   POST /shakespeare/ingest
   → Lists R2 → Queues 35,629 messages → Inserts to shakespeare
```

**Rationale:**
- Works table populated before paragraphs (logical dependency)
- JSONL format optimal for manifest (small, line-oriented)
- Individual JSON files optimal for paragraphs (parallelizable)
- Follows project pattern: one queue message per item

### Decision 4: Fix Typo in Queue Category

**Choice:** Rename `shakespert` → `shakespeare` in json-processor.ts

**Impact:**
- Breaking change to queue message format
- Must be coordinated with any existing queue messages

**Migration:**
- Update switch case in processJsonFromR2()
- Deploy before triggering any shakespeare ingestion

### Decision 5: R2 Key Format

**Choice:** Use structured paths with IDs

**Format:**
- Paragraphs: `shakespeare/paragraphs/{id}.json`
- Manifest: `shakespeare/manifest.jsonl`

**Rationale:**
- Predictable, content-addressable
- Supports R2 prefix listing
- Matches pattern from other content types

## Risks / Trade-offs

### Risk: Breaking Change for Existing Queries

- **Impact:** Any code querying shakespeare.text or shakespeare.work_title will break
- **Mitigation:** No frontend exists yet, API is new, low risk
- **Migration:** Update queries to fetch from R2 or join with shakespeare_works

### Trade-off: R2 Fetch Latency for Display

- **Impact:** ~20-30ms per paragraph when displaying text
- **Mitigation:** Acceptable for reading interface, can batch fetch scenes
- **Future:** phase2-shakespeare-vectorize will enable search without R2 fetch

### Trade-off: No Text Search in Phase 1

- **Impact:** Users must browse by work/act/scene structure
- **Mitigation:** phase2-shakespeare-vectorize proposal adds semantic search
- **Future:** Vectorize will provide thematic search across Early Modern English

### Risk: Large Queue Processing Time

- **Impact:** 35,629 messages may take 30-60 minutes to process
- **Mitigation:** Queue is async, acceptable for one-time ingestion
- **Monitoring:** Check queue depth and D1 counts during ingestion

## Migration Plan

**Phase 1: Upload to R2**
```bash
rclone copy wip/shakespeare2/r2-staging/*.json r2:sr-json/shakespeare/paragraphs/ --transfers=50
rclone copy wip/shakespeare2/r2-staging/manifest.jsonl r2:sr-json/shakespeare/
# Verify count
rclone ls r2:sr-json/shakespeare/paragraphs/ | wc -l  # Should be 35,629
```

**Phase 2: Apply Schema Migration**
```bash
# Update schema.ts: shakespeare table + shakespeare_works table
# Update json-processor.ts: fix typo, add validation
just migrate        # Generate migration
just migrate-local  # Apply to local D1
# Test locally with sample data
wrangler d1 migrations apply app_db  # Production
```

**Phase 3: Trigger Ingestion**
```bash
# Works first (dependency)
curl -X POST https://api.your-domain.com/shakespeare/ingest/works \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Then paragraphs
curl -X POST https://api.your-domain.com/shakespeare/ingest \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Phase 4: Verify**
```bash
# Check D1 counts
wrangler d1 execute app_db --command "SELECT COUNT(*) FROM shakespeare"
# Expected: 35,629

wrangler d1 execute app_db --command "SELECT COUNT(*) FROM shakespeare_works"
# Expected: 43

# Verify schema (no text fields)
wrangler d1 execute app_db --command "PRAGMA table_info(shakespeare)"

# Test R2 fetch
curl https://api.your-domain.com/shakespeare/paragraphs/{id}
```

**Rollback Plan:**
- Drizzle down() migration restores text fields
- Re-run ingestion with old validator to populate fields
- Delete shakespeare_works table if needed
- Re-deploy previous worker version

## Open Questions

None - design is complete and ready for implementation.
