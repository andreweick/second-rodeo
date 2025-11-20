# Proposal: Image Ingest Phase 3 - Full-Text Search

## Why

Phase 2 established D1 indexing with basic queries (date, camera, location). Phase 3 adds full-text search capabilities using SQLite FTS5 to enable searching photos by captions, titles, keywords, locations, and other text fields extracted from IPTC metadata.

Key goals:
- Enable text-based photo discovery (e.g., "sunset beach", "birthday party")
- Search across IPTC fields (title, caption, keywords) and camera metadata
- Provide ranked search results with relevance scoring
- Integrate with existing async indexing pipeline from Phase 2

## What Changes

### New Capabilities
- **FTS5 Virtual Table**: SQLite full-text search index on photo text fields
- **Text Search Queries**: Search across captions, titles, keywords, creator, location names, camera info
- **Relevance Ranking**: FTS5 automatic relevance scoring for search results
- **Porter Stemming**: English word stemming for better search matches (e.g., "running" matches "run")

### Modified Components
- `apps/api/src/services/photo-indexer.ts` - Add FTS5 upsert alongside D1 upsert

### New Components
- SQL migration for FTS5 virtual table (manual, separate from Drizzle)
- `apps/api/src/services/photo-search.ts` - Text search service (optional)

### Dependencies
- Use existing: SQLite FTS5 (built into D1), Drizzle ORM (for main table)

## Impact

### Affected Specs
- **MODIFIED**: `image-ingest` capability (Phase 3 requirements)

### Affected Code
- Database migrations (add FTS5 virtual table)
- `apps/api/src/services/photo-indexer.ts` - Add FTS5 upsert
- `apps/api/src/services/photo-search.ts` - Search queries (optional)

### Non-Breaking
This phase extends Phase 2 without breaking changes. Search is additive functionality.

### Future Phases
This proposal is part 3 of 4:
- **Phase 1** (complete): Upload core with SHA256 hashing, content-addressed IDs, R2 storage
- **Phase 2** (complete): D1 async indexing for queries and deduplication
- **Phase 3** (this): Full-text search with FTS5
- **Phase 4**: OpenAPI documentation

Phase 4 will document all endpoints including search.
