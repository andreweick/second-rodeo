# Spec: Image Ingest Phase 3

## ADDED Requirements

### Requirement: Full-Text Search with FTS5
The system SHALL provide full-text search on photo captions, titles, keywords, and locations using SQLite FTS5 virtual table.

#### Scenario: FTS5 virtual table created
- **WHEN** database schema is initialized
- **THEN** `photos_fts` FTS5 virtual table exists with tokenize='porter'

#### Scenario: Searchable text fields
- **WHEN** FTS5 table is populated
- **THEN** it includes fields: title, caption, keywords (space-separated), creator, city, country, camera_make, camera_model

#### Scenario: SID as join key only
- **WHEN** FTS5 table is created
- **THEN** `sid` field is marked UNINDEXED (used only for joining, not searching)

#### Scenario: Text search query
- **WHEN** user searches for "sunset beach"
- **THEN** query is `SELECT p.* FROM photos p JOIN photos_fts fts ON p.sid = fts.sid WHERE photos_fts MATCH 'sunset beach' ORDER BY rank`

#### Scenario: FTS5 ranking
- **WHEN** search matches multiple photos
- **THEN** results are ordered by FTS5 relevance ranking using BM25 algorithm

#### Scenario: Upsert to FTS5 on indexing
- **WHEN** queue consumer indexes a photo
- **THEN** both `photos` table and `photos_fts` table are updated in same transaction

### Requirement: Search Query Syntax
The system SHALL support common FTS5 query syntax including multiple words, quoted phrases, prefix matching, and boolean operators.

#### Scenario: Multiple words search
- **WHEN** user searches for "sunset beach"
- **THEN** FTS5 treats as AND by default (matches photos with both terms)

#### Scenario: Quoted phrase search
- **WHEN** user searches for '"golden hour"'
- **THEN** FTS5 matches exact phrase in any text field

#### Scenario: Prefix matching
- **WHEN** user searches for "calif*"
- **THEN** FTS5 matches "California", "Californian", etc.

#### Scenario: OR operator
- **WHEN** user searches for "cat OR dog"
- **THEN** FTS5 matches photos with either term

#### Scenario: Column-specific search
- **WHEN** user searches for "title:vacation"
- **THEN** FTS5 searches only the title field

### Requirement: Porter Stemming
The system SHALL use Porter stemming for English text to enable searches that match word variations.

#### Scenario: Stemming matches variations
- **WHEN** user searches for "running"
- **THEN** FTS5 also matches "run", "runs", "runner" (stemmed forms)

#### Scenario: Photography terms stemmed
- **WHEN** user searches for "photography"
- **THEN** FTS5 also matches "photograph", "photographer", "photographic"

### Requirement: Query Sanitization
The system SHALL sanitize user search input to prevent FTS5 syntax errors and security issues.

#### Scenario: Unbalanced quotes removed
- **WHEN** user input contains unmatched quotes (e.g., `"sunset`)
- **THEN** system removes all quotes to prevent syntax error

#### Scenario: Special characters filtered
- **WHEN** user input contains special characters (e.g., `beach!@#`)
- **THEN** system removes or escapes non-alphanumeric chars except quotes, wildcards, hyphens

#### Scenario: FTS5 syntax error caught
- **WHEN** FTS5 query fails with syntax error despite sanitization
- **THEN** system returns 400 Bad Request with "Invalid search query syntax" message

### Requirement: Combined Search and Filters
The system SHALL support combining text search with structured filters from Phase 2 (date, camera, location, source).

#### Scenario: Text search with date range
- **WHEN** user searches for "sunset" within a date range
- **THEN** query combines FTS5 MATCH with `WHERE taken_at BETWEEN ? AND ?`

#### Scenario: Text search with camera filter
- **WHEN** user searches for "landscape" filtered by camera make/model
- **THEN** query combines FTS5 MATCH with `WHERE camera_make = ? AND camera_model = ?`

#### Scenario: Text search with location filter
- **WHEN** user searches for "beach" near a location
- **THEN** query combines FTS5 MATCH with GPS bounding box filter

#### Scenario: Ranking preserved with filters
- **WHEN** combined filters are applied
- **THEN** results still ordered by FTS5 relevance rank

### Requirement: Pagination for Search Results
The system SHALL support pagination for search results using LIMIT and OFFSET.

#### Scenario: First page of results
- **WHEN** user searches without pagination params
- **THEN** query returns first 50 results (default limit)

#### Scenario: Next page of results
- **WHEN** user requests page 2 (offset 50, limit 50)
- **THEN** query returns results 51-100 ordered by rank

### Requirement: Atomic FTS5 and D1 Updates
The system SHALL update both D1 photos table and FTS5 virtual table in a single transaction to maintain consistency.

#### Scenario: Both tables updated together
- **WHEN** queue consumer indexes a photo
- **THEN** D1 photos table and photos_fts table are both upserted in same transaction

#### Scenario: Rollback on failure
- **WHEN** FTS5 upsert fails
- **THEN** D1 photos table upsert is also rolled back (atomic operation)

#### Scenario: FTS5 and D1 stay in sync
- **WHEN** D1 photos table is queried
- **THEN** FTS5 photos_fts table has matching records (no orphaned entries)

## MODIFIED Requirements

### Requirement: Rebuildable D1 Index
The system SHALL treat D1 as a rebuildable cache, with R2 JSON as the authoritative source of truth.

#### Scenario: D1 and FTS5 rebuilt from R2
- **WHEN** D1 database is corrupted or needs reset
- **THEN** full index (both photos and photos_fts tables) can be rebuilt by scanning sr-json bucket and reprocessing all JSON files

#### Scenario: R2 JSON is immutable truth
- **WHEN** conflict exists between D1/FTS5 and R2
- **THEN** R2 JSON is authoritative, D1 and FTS5 are updated to match

#### Scenario: Rebuild script updates both tables
- **WHEN** rebuild script runs
- **THEN** it updates both D1 photos table and photos_fts table using same indexing logic

#### Scenario: Disaster recovery
- **WHEN** D1 database is lost
- **THEN** no data loss occurs; all metadata can be restored from sr-json bucket including text search capability
