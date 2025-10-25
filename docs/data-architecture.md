# Data Architecture: Durable-First R2 + D1 Index

## Overview

This document describes the data storage architecture for all content types in the system. The architecture follows a durable-first pattern where R2 is the source of truth and D1 provides a lightweight, queryable index.

---

## Part 1: General Strategy

### Core Architecture

**R2 (Source of Truth)**
- One JSONL file per record: `{datatype}/sha256_{HASH}.jsonl`
- Each file contains a single JSON object (one line)
- Files are immutable and deterministically named
- Exception: Shakespeare works contain multiple lines (one per paragraph)

**D1 (Queryable Index)**
- Lightweight relational database via Drizzle ORM
- Stores only fields needed for queries, filters, sorts, and joins
- Can be completely rebuilt from R2 if lost
- Never stores large content (full text, arrays, binary data)

**Queues (Ingestion)**
- Processes R2 files and populates D1
- Idempotent: replaying the same file produces the same result
- Uses stable hash-based IDs for conflict resolution

**External Storage**
- **Cloudflare Images**: For photographs and memes (variants handled automatically)
- **Cloudflare Stream**: For personal videos (transcoding, adaptive streaming)
- **R2 Artifacts Bucket**: For binary files (audio, bookmark permacopy/plain text)

### Decision Framework: D1 vs R2

**Store in D1 when:**
- Field is used for filtering (`WHERE date > ?`)
- Field is used for sorting (`ORDER BY created_at DESC`)
- Field is used for joins (foreign keys, relationships)
- Field is small and frequently accessed (titles, dates, IDs)
- Field enables fast lookups (tags via junction table)

**Keep in R2 only when:**
- Field is large (full content, article body, long text)
- Field is rarely queried (metadata, EXIF, extended attributes)
- Field is an array or complex object (items in a top-10 list)
- Field is binary data (audio files, HTML snapshots)
- Field is only shown in detail views, not lists

**Always in D1:**
- `id` - Stable hash-based primary key
- `r2_key` - Path to the record in R2 (for fetching full content)
- Date/timestamp fields - For time-based queries and filtering
- Foreign keys - For relationships and joins

### Stable ID Generation

All records use deterministic IDs:

```
id = sha256(platform | source_id | created_at | content_hash)
filename = sha256_{hash}.jsonl
```

This ensures:
- Replaying ingestion is idempotent (no duplicates)
- Multiple workers can process independently
- IDs are consistent across rebuilds

### Ingestion Pattern (Pseudocode)

```javascript
// Queue consumer
onMessage({ r2Key }) {
  const obj = await R2.get(r2Key)
  const text = await obj.text()
  const record = JSON.parse(text)

  // Upsert to D1 (idempotent)
  await db.insert(table).values({
    id: record.id,
    field1: record.field1,
    // ... only indexed fields
    r2_key: r2Key
  }).onConflictDoUpdate({
    target: table.id,
    set: { field1: record.field1, ... }
  })
}
```

---

## Part 2: Data Type Catalog

### 1. Chatter (Social Posts)

**R2 Path**: `chatter/sha256_{HASH}.jsonl`

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "title": "Post title",
  "content": "Full post body",
  "date": "2008-09-13",
  "date_posted": "2008-09-13T10:16:51Z",
  "year": 2008,
  "month": "2008-09",
  "slug": "2008-09-13-post-slug",
  "tags": ["chatter", "twitter"],
  "images": [],
  "publish": true
}
```

**D1 Indexed Fields**:
- `id` (PK) - Stable identifier
- `title` - For display in lists and search
- `date` - For chronological filtering (`WHERE date BETWEEN ? AND ?`)
- `date_posted` - For precise sorting (`ORDER BY date_posted DESC`)
- `year`, `month` - For grouping and aggregation
- `slug` - For URL lookups (`WHERE slug = ?`)
- `tags` - Via junction table for tag filtering
- `publish` - For filtering published vs draft content
- `r2_key` - Pointer to full record

**R2 Only**:
- `content` - Full post body (large, only shown in detail view)
- `images` - Array of image references

**Typical Queries**:
- List posts from a month: `WHERE year = 2008 AND month = '2008-09' ORDER BY date_posted DESC`
- Find by slug: `WHERE slug = ?`
- Filter by tag: `JOIN tags WHERE tag.name = 'twitter'`
- Recent posts: `WHERE publish = true ORDER BY date_posted DESC LIMIT 50`

---

### 2. Quotes

**R2 Path**: `quotes/sha256_{HASH}.jsonl`

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "text": "The quote text",
  "author": "Author Name",
  "date": "2012-09-06",
  "date_added": "2012-09-06T00:00:00Z",
  "year": 2012,
  "month": "2012-09",
  "slug": "2012-09-06-quote-slug",
  "tags": ["quote", "dayone"],
  "publish": true
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `text` - Quote content (small enough to index for search)
- `author` - For filtering by author
- `date`, `date_added` - For chronological queries
- `year`, `month` - For grouping
- `slug` - For URL lookups
- `tags` - Via junction table
- `publish` - For filtering
- `r2_key`

**R2 Only**:
- None (all fields are small and queryable)

**Typical Queries**:
- Random quote: `ORDER BY RANDOM() LIMIT 1`
- Quotes by author: `WHERE author = 'Shakespeare'`
- Recent quotes: `WHERE publish = true ORDER BY date DESC LIMIT 10`

---

### 3. Shakespeare (Works)

**R2 Path**: `works/sha256_{HASH_OF_WORK_ID}.jsonl`

**JSONL Schema** (one line per paragraph):
```json
{
  "id": "sha256:...",
  "work_id": "12night",
  "work_title": "Twelfth Night",
  "long_title": "Twelfth Night, Or What You Will",
  "genre_code": "c",
  "genre_name": "Comedy",
  "act": 1,
  "scene": 1,
  "paragraph_id": 892502,
  "paragraph_num": 1,
  "character_id": "ORSINO",
  "character_name": "Orsino",
  "is_stage_direction": false,
  "text": "The dialogue text",
  "text_phonetic": "...",
  "text_stem": "...",
  "char_count": 646,
  "word_count": 114,
  "timestamp": "1599-01-01T00:00:00Z"
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `work_id` - For filtering by work (`WHERE work_id = '12night'`)
- `work_title` - For display
- `genre_code`, `genre_name` - For genre filtering
- `act`, `scene` - For navigation (`WHERE work_id = ? AND act = ? AND scene = ?`)
- `paragraph_num` - For ordering within scenes
- `character_id`, `character_name` - For character-based queries
- `is_stage_direction` - For filtering stage directions
- `word_count` - For analytics
- `r2_key`

**R2 Only**:
- `text` - Full dialogue (can be large, only shown in reading view)
- `text_phonetic`, `text_stem` - Preprocessing artifacts (use for search/embeddings if needed)
- `long_title` - Extended metadata

**Typical Queries**:
- Table of contents: `SELECT DISTINCT act, scene FROM paragraphs WHERE work_id = ? ORDER BY act, scene`
- Scene content: `WHERE work_id = ? AND act = ? AND scene = ? ORDER BY paragraph_num`
- Character lines: `WHERE work_id = ? AND character_id = ? AND is_stage_direction = false`

---

### 4. Check-ins

**R2 Path**: `checkins/sha256_{HASH}.jsonl`

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "ts": "2025-10-22T12:34:56Z",
  "venue_id": "foursquare:abc123",
  "lat": 37.78,
  "lon": -122.42,
  "meta": {
    "name": "Blue Bottle Mint Plaza",
    "category": "Coffee Shop"
  }
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `ts` - For chronological queries
- `venue_id` - For venue aggregation
- `lat`, `lon` - For spatial queries (future: geohash)
- `r2_key`

**R2 Only**:
- `meta` - Extended venue metadata (name, category, address, etc.)

**Typical Queries**:
- Check-ins at venue: `WHERE venue_id = ?`
- Check-ins in time range: `WHERE ts BETWEEN ? AND ?`
- All venues visited: `SELECT DISTINCT venue_id, COUNT(*) GROUP BY venue_id`

**Note**: Future enhancement could add geohash indexing for spatial queries.

---

### 5. Films

**R2 Path**: `films/sha256_{HASH}.jsonl`

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "title": "The Power of the Dog",
  "year": 2023,
  "date_watched": "2023-09-28T00:00:00Z",
  "rewatch": false,
  "publish": true,
  "tmdb_id": "600583",
  "poster_url": "https://image.tmdb.org/t/p/w500/kEy48iCzGnp0ao1cZbNeWR6yIhC.jpg"
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `title` - For display and search
- `year` - For filtering by year
- `date_watched` - For sorting by watch date
- `rewatch` - For filtering first-time vs rewatches
- `publish` - For filtering
- `tmdb_id` - For TMDB API lookups and joins
- `r2_key`

**R2 Only**:
- `poster_url` - Large URL, only needed for display

**Typical Queries**:
- Films watched in year: `WHERE YEAR(date_watched) = 2023 ORDER BY date_watched DESC`
- First-time watches: `WHERE rewatch = false`
- Films by year: `WHERE year = 2023`

---

### 6. Top Ten Lists

**R2 Path**: `topten/sha256_{HASH}.jsonl`

**JSONL Schema**:
```json
{
  "date": "June 17, 1987",
  "title": "Bernhard Goetz's Top 10 Pickup Lines",
  "items": [
    "10. Item ten...",
    "9. Item nine...",
    "..."
  ],
  "year": 1987,
  "show": "Late Night with David Letterman",
  "url": "http://www.mudslide.net/TopTen/lnwd1987.html"
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `title` - For display and search
- `date` - For chronological ordering
- `year` - For filtering by year
- `show` - For filtering by show
- `r2_key`

**R2 Only**:
- `items` - Array of list items (large, only shown in detail view)
- `url` - Source URL (metadata)

**Typical Queries**:
- Lists from year: `WHERE year = 1987 ORDER BY date`
- Lists by show: `WHERE show = 'Late Night with David Letterman'`
- Recent lists: `ORDER BY date DESC LIMIT 20`

---

### 7. Photographs

**R2 Path**: `photos/sha256_{HASH}.jsonl`

**External Storage**: Cloudflare Images (variants handled automatically)

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "original_name": "IMG_1234.jpg",
  "cf_image_id": "cloudflare-assigned-hash",
  "date_taken": "2023-06-15T14:30:00Z",
  "caption": "Sunset at the beach",
  "lat": 37.78,
  "lon": -122.42,
  "tags": ["vacation", "sunset"],
  "publish": true
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `original_name` - For reference
- `cf_image_id` - For Cloudflare Images API
- `date_taken` - For chronological queries
- `caption` - For search and display
- `lat`, `lon` - For location-based queries
- `tags` - Via junction table
- `publish` - For filtering
- `r2_key`

**R2 Only**:
- Full EXIF data (if captured)

**External Storage**:
- Image file in Cloudflare Images (variants: thumbnail, medium, large)

**Typical Queries**:
- Photos from trip: `WHERE date_taken BETWEEN ? AND ?`
- Photos at location: `WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`
- Tagged photos: `JOIN tags WHERE tag.name = 'vacation'`

---

### 8. Personal Videos

**R2 Path**: `videos/sha256_{HASH}.jsonl`

**External Storage**: Cloudflare Stream

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "original_name": "birthday_2023.mp4",
  "cf_stream_id": "cloudflare-stream-id",
  "title": "Birthday Party 2023",
  "description": "Family birthday celebration",
  "date_recorded": "2023-06-15T14:30:00Z",
  "duration": 180,
  "publish": true
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `original_name` - For reference
- `cf_stream_id` - For Cloudflare Stream API
- `title` - For display and search
- `description` - For search
- `date_recorded` - For chronological queries
- `duration` - For filtering by length
- `publish` - For filtering
- `r2_key`

**R2 Only**:
- Extended metadata (codec, resolution, bitrate)

**External Storage**:
- Video file in Cloudflare Stream (transcoding, adaptive bitrates)

**Typical Queries**:
- Videos from year: `WHERE YEAR(date_recorded) = 2023 ORDER BY date_recorded DESC`
- Short videos: `WHERE duration < 60`
- Search by title: `WHERE title LIKE '%birthday%'`

---

### 9. Memes

**R2 Path**: `memes/sha256_{HASH}.jsonl`

**External Storage**: Cloudflare Images (supports animated GIFs)

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "original_name": "funny_meme.gif",
  "cf_image_id": "cloudflare-assigned-hash",
  "title": "Distracted Boyfriend",
  "date_saved": "2023-06-15T14:30:00Z",
  "tags": ["programming", "tech"],
  "source_url": "https://example.com/meme.gif",
  "publish": true
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `original_name` - For reference
- `cf_image_id` - For Cloudflare Images API
- `title` - For display and search
- `date_saved` - For chronological queries
- `tags` - Via junction table
- `source_url` - For attribution
- `publish` - For filtering
- `r2_key`

**R2 Only**:
- None (all fields are small)

**External Storage**:
- Image/GIF file in Cloudflare Images

**Typical Queries**:
- Recent memes: `WHERE publish = true ORDER BY date_saved DESC LIMIT 50`
- Memes by tag: `JOIN tags WHERE tag.name = 'programming'`
- Find by title: `WHERE title LIKE '%distracted%'`

---

### 10. Audio

**R2 Path**: `audio/sha256_{HASH}.jsonl`

**External Storage**: R2 artifacts bucket/prefix (`artifacts/audio/{HASH}.wav`)

**JSONL Schema**:
```json
{
  "id": "sha256:...",
  "original_name": "interview_2023.wav",
  "description": "Interview with John Doe",
  "date_recorded": "2023-06-15T14:30:00Z",
  "duration": 3600,
  "artifact_key": "artifacts/audio/sha256_abc123.wav",
  "publish": true
}
```

**D1 Indexed Fields**:
- `id` (PK)
- `original_name` - For reference
- `description` - For search
- `date_recorded` - For chronological queries
- `duration` - For filtering by length
- `artifact_key` - Path to audio file in R2
- `publish` - For filtering
- `r2_key`

**R2 Only**:
- Format metadata (sample rate, bitrate, channels)

**External Storage**:
- Audio file at `artifact_key` in R2 artifacts bucket

**Typical Queries**:
- Recordings from year: `WHERE YEAR(date_recorded) = 2023`
- Long recordings: `WHERE duration > 1800`
- Search: `WHERE description LIKE '%interview%'`

---

### 11. Bookmarks (Raindrop.io)

**R2 Path**: `bookmarks/sha256_{HASH}.jsonl`

**External Storage**: R2 artifacts bucket/prefix for permacopy and plain text

**JSONL Schema**:
```json
{
  "id": "raindrop-id",
  "link": "https://example.com/article",
  "title": "Article Title",
  "excerpt": "Brief description",
  "domain": "example.com",
  "created_at": "2023-06-15T14:30:00Z",
  "updated_at": "2023-06-15T14:30:00Z",
  "tags": ["tech", "programming"],
  "cover": "https://example.com/image.jpg",
  "media": [...],
  "...": "full Raindrop.io API response"
}
```

Full API schema: https://developer.raindrop.io/v1/raindrops

**D1 Indexed Fields**:
- `id` (PK) - Raindrop.io ID
- `link` - For deduplication and lookup
- `title` - For display and search
- `excerpt` - For preview
- `domain` - For grouping by source
- `created_at`, `updated_at` - For chronological queries
- `tags` - Via junction table
- `r2_key`

**R2 Only**:
- `cover` - Cover image URL
- `media` - Array of media objects
- Full Raindrop.io metadata (collections, highlights, annotations, etc.)

**External Storage** (artifacts):
- `artifacts/bookmarks/{id}/permacopy.html` - Permanent HTML snapshot
- `artifacts/bookmarks/{id}/plain.txt` - Extracted plain text
- `artifacts/bookmarks/{id}/chunks.jsonl` - Text chunks for embeddings

**Typical Queries**:
- Bookmarks from domain: `WHERE domain = 'example.com'`
- Recent bookmarks: `ORDER BY created_at DESC LIMIT 50`
- Search by tag: `JOIN tags WHERE tag.name = 'tech'`
- Updated bookmarks: `WHERE updated_at > ? ORDER BY updated_at DESC`

**Special Features**:
- FTS5 full-text search on title, excerpt, and plain text
- RAG embeddings for semantic search (stored in Vectorize)

---

## Part 3: Embeddings & Semantic Search

### Architecture

**Vectorize** (separate from D1):
- Stores embeddings generated by Workers AI
- Enables semantic similarity search
- Metadata includes: `{id, data_type, slug}`

### Ingestion Pattern

```javascript
// Generate embedding
const text = `${record.title}\n\n${record.excerpt || record.text}`
const embedding = await AI.run('@cf/baai/bge-base-en-v1.5', {
  text: [text]
})

// Upsert to Vectorize
await VECTORIZE.upsert([{
  id: record.id,
  values: embedding.data[0],
  metadata: {
    data_type: 'quotes',
    slug: record.slug,
    date: record.date
  }
}])
```

### Query Pattern

```javascript
// 1. Embed user query
const queryEmbedding = await AI.run('@cf/baai/bge-base-en-v1.5', {
  text: [userQuery]
})

// 2. Find similar items
const matches = await VECTORIZE.query(queryEmbedding.data[0], {
  topK: 10,
  filter: { data_type: 'quotes' }
})

// 3. Hydrate from D1
const ids = matches.map(m => m.id)
const records = await db.select().from(quotes).where(inArray(quotes.id, ids))

// 4. Optionally fetch full content from R2
const fullContent = await R2.get(record.r2_key)
```

---

## Summary

### Key Principles

1. **R2 is truth**: Never delete from R2; D1 can be rebuilt
2. **D1 is minimal**: Only fields needed for queries
3. **Idempotent ingestion**: Stable IDs enable safe replays
4. **External services**: Use Cloudflare Images/Stream for media
5. **Embeddings separate**: Vectorize for semantic search, not D1

### Benefits

- **Durable**: Complete rebuild from R2 if D1 is lost
- **Scalable**: D1 stays small and fast
- **Flexible**: Add new data types without migration
- **Cost-effective**: R2 for bulk storage, D1 for active queries
- **Future-proof**: JSONL format easy to process and transform
