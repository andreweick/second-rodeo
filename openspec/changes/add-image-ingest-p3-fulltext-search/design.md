# Design: Image Ingest Phase 3 - Full-Text Search

## Context

Phase 2 established D1 indexing with basic queries (date, camera, location). Phase 3 adds full-text search capabilities to enable text-based photo discovery. Users need to find photos by captions, titles, keywords, and location names extracted from IPTC metadata.

Key constraints:
- FTS5 is SQLite built-in (no additional dependencies)
- Cannot use Drizzle ORM for FTS5 (raw SQL required)
- Must integrate with existing async indexing pipeline
- Search performance critical for UX

## Goals / Non-Goals

### Goals
- Enable text-based photo discovery
- Search across IPTC and EXIF text fields
- Provide relevance-ranked results
- Support common search patterns (phrases, prefix matching)
- Integrate seamlessly with Phase 2 indexing

### Non-Goals
- Advanced query language (boolean logic beyond AND/OR)
- Multi-language tokenization (English only for MVP)
- Fuzzy matching / typo tolerance
- Search result highlighting (can add later)

## Decisions

### 1. FTS5 Virtual Table Schema

**Decision:** Use SQLite FTS5 with porter stemming for English text search

**Schema:**
```sql
CREATE VIRTUAL TABLE photos_fts USING fts5(
  id UNINDEXED,       -- Join key only, not searchable (format: "sha256:...")
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

**Rationale:**
- **FTS5 Performance:** SQLite's built-in full-text search, fast and battle-tested
- **Porter Stemming:** "running" matches "run", "photography" matches "photograph"
- **ID UNINDEXED:** Used only for joining with photos table, not searched (saves index space)
- **Text Fields Only:** Camera make/model included for searches like "Canon 5D"
- **Space-Separated Keywords:** IPTC keywords array joined with spaces for FTS5

**Field Selection:**
- **Included:** title, caption, keywords (high-value searchable text)
- **Included:** creator, city, country (location and attribution search)
- **Included:** camera_make, camera_model (equipment search)
- **Excluded:** Numeric EXIF (aperture, ISO) - use D1 structured queries
- **Excluded:** GPS coordinates - use D1 location queries

### 2. FTS5 Indexing in Queue Consumer

**Decision:** Upsert both D1 photos and photos_fts in same transaction

**Flow:**
```typescript
async function indexPhotoToD1(id: string, r2Key: string, env: Env) {
  const json = await fetchJSONFromR2(r2Key, env);

  await env.DB.batch([
    // Upsert D1 photos table (Phase 2)
    db.insert(photos).values(photoData).onConflictDoUpdate(...),

    // Upsert FTS5 photos_fts table (Phase 3)
    db.run(sql`
      INSERT INTO photos_fts (id, title, caption, keywords, creator, city, country, camera_make, camera_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rowid) DO UPDATE SET
        title = excluded.title,
        caption = excluded.caption,
        -- ... all fields
    `, [id, title, caption, keywords, ...])
  ]);
}
```

**Rationale:**
- **Atomic:** Both tables updated together or both fail (consistency)
- **Single Transaction:** Efficient, ensures D1 and FTS5 stay in sync
- **Idempotent:** Upsert pattern safe for queue retries
- **Raw SQL for FTS5:** Drizzle doesn't support FTS5, use `db.run()` or `db.batch()`

**Field Preparation:**
```typescript
const ftsData = {
  id: json.id,
  title: json.iptc?.objectName || '',
  caption: json.iptc?.caption || '',
  keywords: (json.iptc?.keywords || []).join(' '), // Array → space-separated
  creator: json.iptc?.creator || '',
  city: json.iptc?.city || '',
  country: json.iptc?.country || '',
  camera_make: json.exif?.make || '',
  camera_model: json.exif?.model || ''
};
```

### 3. Search Query API

**Decision:** Basic text search with optional filters

**Query Pattern:**
```sql
SELECT p.* FROM photos p
JOIN photos_fts fts ON p.id = fts.id
WHERE photos_fts MATCH ?
ORDER BY rank
LIMIT ? OFFSET ?
```

**FTS5 MATCH Syntax:**
- **Multiple words:** `"sunset beach"` → AND by default
- **Quoted phrases:** `'"golden hour"'` → exact phrase match
- **Prefix matching:** `"calif*"` → matches California, Californian
- **OR operator:** `"cat OR dog"` → either term
- **Column filter:** `"title:vacation"` → search only title field

**Drizzle Implementation:**
```typescript
async function searchPhotos(query: string, options: SearchOptions) {
  const result = await db
    .select()
    .from(photos)
    .innerJoin(photosFts, eq(photos.id, photosFts.id))
    .where(sql`photos_fts MATCH ${query}`)
    .orderBy(sql`rank`) // FTS5 relevance score
    .limit(options.limit || 50)
    .offset(options.offset || 0);

  return result;
}
```

**Combined Filters:**
```typescript
// Text search + date range
WHERE photos_fts MATCH ? AND p.taken_at BETWEEN ? AND ?

// Text search + camera
WHERE photos_fts MATCH ? AND p.camera_make = ?
```

### 4. Query Sanitization

**Decision:** Sanitize user input to prevent FTS5 syntax errors

**Issues:**
- Unmatched quotes: `"sunset` → syntax error
- Special chars: `beach!@#` → may cause issues
- Reserved tokens: `AND OR NOT` → need proper handling

**Sanitization Strategy:**
```typescript
function sanitizeFTS5Query(userInput: string): string {
  // Remove or escape special FTS5 chars
  let sanitized = userInput
    .replace(/[^\w\s"*-]/g, ' ') // Keep alphanumeric, quotes, wildcards, hyphens
    .trim();

  // Balance quotes
  const quoteCount = (sanitized.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    sanitized = sanitized.replace(/"/g, ''); // Remove all quotes if unbalanced
  }

  return sanitized;
}
```

**Validation:**
```typescript
try {
  await searchPhotos(sanitizedQuery, options);
} catch (err) {
  if (err.message.includes('fts5')) {
    throw new Error('Invalid search query syntax');
  }
  throw err;
}
```

### 5. Relevance Ranking

**Decision:** Use FTS5 automatic ranking with `ORDER BY rank`

**FTS5 Ranking:**
- **BM25 Algorithm:** Industry-standard relevance scoring
- **Term Frequency:** More mentions = higher rank
- **Inverse Document Frequency:** Rare terms weighted higher
- **Field Length:** Shorter documents with matches ranked higher

**Rationale:**
- **Automatic:** No manual tuning needed
- **Battle-Tested:** BM25 used by major search engines
- **Good Defaults:** Works well for photo captions/keywords

**Custom Weights (Optional):**
```sql
-- Weight title 3x, caption 2x, keywords 1x
CREATE VIRTUAL TABLE photos_fts USING fts5(
  id UNINDEXED,
  title,        -- implicit weight 1.0
  caption,
  keywords,
  tokenize='porter',
  rank='bm25(3.0, 2.0, 1.0)'  -- title, caption, keywords
);
```

Not needed for MVP, can add later if relevance issues arise.

### 6. Integration with Existing Queries

**Decision:** Search can be combined with D1 structured filters

**Example Queries:**
```typescript
// Text search + date range
searchPhotos("sunset", {
  dateRange: { start: '2024-01-01', end: '2024-12-31' }
});

// Text search + camera
searchPhotos("landscape", {
  camera: { make: 'Canon', model: '5D Mark IV' }
});

// Text search + location
searchPhotos("beach", {
  location: { lat: 37.7749, lon: -122.4194, radiusKm: 50 }
});
```

**Implementation:**
```typescript
let query = db
  .select()
  .from(photos)
  .innerJoin(photosFts, eq(photos.id, photosFts.id))
  .where(sql`photos_fts MATCH ${searchTerm}`);

if (options.dateRange) {
  query = query.where(between(photos.takenAt, start, end));
}

if (options.camera) {
  query = query.where(and(
    eq(photos.cameraMake, options.camera.make),
    eq(photos.cameraModel, options.camera.model)
  ));
}

return query.orderBy(sql`rank`);
```

### 7. Rebuild Support

**Decision:** Rebuild script updates both D1 and FTS5

**Rebuild Algorithm:**
```typescript
async function rebuildPhotosD1(env: Env) {
  const bucket = env.SR_JSON;
  const list = await bucket.list({ prefix: 'photos/' });

  // Clear tables (optional)
  await env.DB.run(sql`DELETE FROM photos`);
  await env.DB.run(sql`DELETE FROM photos_fts`);

  for (const item of list.objects) {
    const json = await bucket.get(item.key);
    const data = await json.json();

    // Reindex both tables
    await indexPhotoToD1(data.id, item.key, env);
  }
}
```

**Rationale:**
- **Consistent Rebuild:** Both tables rebuilt together
- **Same Logic:** Reuses existing indexPhotoToD1 function
- **Idempotent:** Can run multiple times safely

## Risks / Trade-offs

### Risk: FTS5 Query Syntax Errors
**Impact:** Invalid user input causes query failures

**Mitigation:**
- Sanitize user input (remove special chars, balance quotes)
- Try-catch around FTS5 queries
- Return user-friendly error messages
- Test with various inputs (edge cases)

**Likelihood:** Medium, acceptable with sanitization

### Risk: FTS5 Index Size
**Impact:** FTS5 index could grow large for 50k photos

**Mitigation:**
- FTS5 indexes only text fields (~200 bytes per photo)
- 50k × 200 bytes = 10MB (negligible)
- D1 has 10GB limit (plenty of headroom)

**Likelihood:** Not a concern for MVP

### Trade-off: English-Only Stemming
**Impact:** Porter stemming works poorly for non-English text

**Mitigation:**
- MVP constraint (single-user archive likely English-heavy)
- Can add multi-language tokenizers later (unicode61, trigram)
- Non-English text still searchable (exact matches work)

**Accepted:** English-only is sufficient for MVP

### Trade-off: No Fuzzy Matching
**Impact:** Typos don't match (e.g., "sunsett" doesn't match "sunset")

**Mitigation:**
- Prefix matching helps: "sunse*" matches "sunset"
- Can add Levenshtein distance later if needed
- Most users will see autocomplete suggestions (future web app feature)

**Accepted:** Exact matching is MVP scope

## Migration Plan

### Phase 3 Implementation (This Proposal)
1. Create FTS5 virtual table migration
2. Update photo indexer to upsert FTS5
3. Implement search query functions
4. Add query sanitization
5. Test with rich IPTC metadata samples

### Handoff to Phase 4
- Search functionality proven
- Phase 4 adds OpenAPI docs for search endpoints

### Rollback Plan
If Phase 3 has critical issues:
1. Drop FTS5 virtual table
2. Revert photo indexer to Phase 2 (D1 only)
3. Phase 2 queries still work (structured filters)
4. Search unavailable but core functionality intact

## Open Questions

1. **Custom FTS5 Ranking Weights:** Should we weight title higher than caption?
   **Recommendation:** Use default BM25 for MVP, tune later if needed.

2. **Search Result Snippets:** Should search results include highlighted snippets?
   **Recommendation:** Defer to web app Phase 4+ (FTS5 supports `snippet()` function).

3. **Search Analytics:** Track popular search terms?
   **Recommendation:** Defer to future analytics phase.
