# Tasks: Image Ingest Phase 3 - Full-Text Search

## 1. FTS5 Virtual Table Schema

### 1.1 Migration
- [ ] 1.1.1 Create SQL migration file (manual, not Drizzle) for FTS5 virtual table
- [ ] 1.1.2 Define FTS5 table structure:
  ```sql
  CREATE VIRTUAL TABLE photos_fts USING fts5(
    sid UNINDEXED,      -- Join key only
    title,              -- IPTC objectName
    caption,            -- IPTC caption
    keywords,           -- IPTC keywords (space-separated)
    creator,            -- IPTC creator
    city,               -- IPTC city
    country,            -- IPTC country
    camera_make,        -- EXIF make
    camera_model,       -- EXIF model
    tokenize='porter'   -- English stemming
  );
  ```
- [ ] 1.1.3 Apply migration locally: `just migrate-local`
- [ ] 1.1.4 Verify FTS5 table with `just db` (sqlite3 console)

## 2. Photo Indexer Updates

### 2.1 FTS5 Indexing Logic
- [ ] 2.1.1 Update `apps/api/src/services/photo-indexer.ts`
- [ ] 2.1.2 Add function `upsertPhotoFTS(sid, iptc, exif, db)` for FTS5 upsert
- [ ] 2.1.3 Build FTS5 record from IPTC and EXIF data:
  - [ ] Extract title from IPTC objectName
  - [ ] Extract caption from IPTC caption
  - [ ] Join keywords array into space-separated string
  - [ ] Extract creator, city, country from IPTC
  - [ ] Extract camera_make and camera_model from EXIF
- [ ] 2.1.4 Execute FTS5 upsert with `INSERT OR REPLACE INTO photos_fts`
- [ ] 2.1.5 Call FTS5 upsert in same transaction as D1 photos table upsert
- [ ] 2.1.6 Handle missing text fields gracefully (empty strings or NULL)
- [ ] 2.1.7 Add error handling for FTS5 upsert

### 2.2 Transaction Management
- [ ] 2.2.1 Wrap both photos and photos_fts upserts in single transaction
- [ ] 2.2.2 Rollback both on error (atomic indexing)
- [ ] 2.2.3 Update error logging to include FTS5 context

## 3. Text Search Service

### 3.1 Search Query Functions
- [ ] 3.1.1 Create `apps/api/src/services/photo-search.ts` (optional, or inline in handlers)
- [ ] 3.1.2 Implement `searchPhotos(query: string, options)`:
  ```typescript
  SELECT p.* FROM photos p
  JOIN photos_fts fts ON p.sid = fts.sid
  WHERE photos_fts MATCH ?
  ORDER BY rank
  LIMIT ? OFFSET ?
  ```
- [ ] 3.1.3 Handle FTS5 query syntax (AND, OR, quotes, prefix matching)
- [ ] 3.1.4 Add pagination (limit, offset)
- [ ] 3.1.5 Combine text search with filters (date range, camera, etc.)
- [ ] 3.1.6 Write unit tests for search queries

### 3.2 Search Query Parsing
- [ ] 3.2.1 Sanitize user input for FTS5 MATCH query
- [ ] 3.2.2 Handle special characters and quotes
- [ ] 3.2.3 Support basic query syntax:
  - [ ] Multiple words: "sunset beach" (AND by default)
  - [ ] Quoted phrases: '"golden hour"' (exact match)
  - [ ] Prefix matching: "calif*" (matches California)
  - [ ] OR operator: "cat OR dog"
- [ ] 3.2.4 Add error handling for invalid FTS5 syntax

## 4. Testing

### 4.1 Unit Tests
- [ ] 4.1.1 Test FTS5 upsert (mock data, verify FTS record)
- [ ] 4.1.2 Test text search queries (various search terms)
- [ ] 4.1.3 Test FTS5 query parsing (sanitization, special chars)
- [ ] 4.1.4 Test search with filters (text + date range, text + camera)
- [ ] 4.1.5 Test ranking (verify relevance order)

### 4.2 Integration Tests
- [ ] 4.2.1 Test full flow: upload → queue → D1 + FTS5 upsert
- [ ] 4.2.2 Test search across different text fields (title, caption, keywords)
- [ ] 4.2.3 Test stemming (search "running" matches "run")
- [ ] 4.2.4 Test phrase search (quoted exact match)
- [ ] 4.2.5 Test prefix matching (wildcards)
- [ ] 4.2.6 Test search result ranking

### 4.3 Manual Testing
- [ ] 4.3.1 Upload test images with IPTC metadata (varied captions/keywords)
- [ ] 4.3.2 Query FTS5 table directly with `just db`
- [ ] 4.3.3 Test search queries via API or direct SQL
- [ ] 4.3.4 Verify search results and ranking
- [ ] 4.3.5 Test edge cases (empty fields, missing IPTC, special chars)

## 5. Rebuild Script Update

### 5.1 FTS5 Rebuild Support
- [ ] 5.1.1 Update rebuild script to include FTS5 table
- [ ] 5.1.2 When rebuilding D1, also rebuild photos_fts
- [ ] 5.1.3 Test rebuild script with sample data

## 6. Deployment Preparation
- [ ] 6.1 Run type check: `just ts-check`
- [ ] 6.2 Run all tests: `just test`
- [ ] 6.3 Test locally end-to-end (upload → index → search)
- [ ] 6.4 Apply migrations to production D1: `just migrate-prod`
- [ ] 6.5 Deploy Worker: `just deploy-api`
- [ ] 6.6 Smoke test production search
- [ ] 6.7 Upload test images with rich IPTC metadata
- [ ] 6.8 Verify FTS5 indexing works in production
- [ ] 6.9 Test various search queries

## Notes
- Complete tasks sequentially within each section
- Phase 3 does NOT include OpenAPI docs (Phase 4)
- FTS5 upserts must be in same transaction as D1 photos table (atomic)
- FTS5 cannot be managed by Drizzle - use raw SQL
- Run `just ts-check` frequently to catch type errors early
- Test FTS5 query syntax carefully (sanitization is critical)
