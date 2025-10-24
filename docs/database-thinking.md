TITLE: Durable-First Content Architecture (Social, Check-ins, Shakespeare)
SCOPE: This summarizes our end-to-end strategy for durable storage (R2), index/query (D1 via Drizzle), hot-path caching (KV), and idempotent ingestion (Queues). It includes schemas, key design, and ingestion pseudocode.

---------------------------------------------------------------------
CORE PRINCIPLES
---------------------------------------------------------------------
1) Durable-first: R2 holds the canonical, immutable data in JSONL. If D1/KV are emptied, we can rebuild entirely from R2.
2) Indexed views: D1 stores only the fields needed for fast queries, lists, and joins. It is a “searchable index,” not the source of truth.
3) Hot-path cache: KV holds small, frequently-used summaries (“recents”) with TTL to absorb read load and reduce D1 queries.
4) Idempotency: Every record has a stable, deterministic ID (hash) so replays are safe. “INSERT … ON CONFLICT(id) DO UPDATE” everywhere.
5) Streaming ingest: JSONL enables line-by-line streaming from R2; Queues coordinate work; failures are retriable without duplication.

---------------------------------------------------------------------
SOCIAL MEDIA CONTENT
---------------------------------------------------------------------
Durable data in R2 (source of truth):
- Files: JSON Lines (JSONL), each line = one normalized post.
- Layout: r2://datasets-na/imports/social/normalized/YYYY-MM.jsonl (or batches by source/platform).
- Record shape (normalized):
  {
    "id": "sha256:...",           // canonical ID (deterministic)
    "platform": "twitter|mastodon|blog|other",
    "source_id": "original platform ID",
    "created_at": "2025-10-22T12:34:56Z",
    "slug": "post-slug",
    "title": "optional title",
    "excerpt": "short summary",
    "tags": ["meta","notes"],
    "thumb_url": "/thumbs/x.jpg",
    "r2_key": "imports/social/normalized/sha256...json", // full body lives here too if you prefer per-record JSON
    "visibility": "public|unlisted|private",
    "meta": { "...": "free-form extras" }
  }

Stable key (deterministic ID):
- id = sha256(platform | source_id | created_at | text/body)
- Using a canonical concat prevents duplicates during replay; any worker or CLI can derive the same id.

D1 as an index (Drizzle tables):
- Table soc_posts
  - id (PK, stable hash)
  - platform
  - source_id
  - created_at (UNIX millis)
  - slug (unique)
  - title (nullable)
  - excerpt (nullable)
  - thumb_url (nullable)
  - r2_key (pointer to canonical blob/object in R2)
  - visibility (public/unlisted/private)
- Table soc_post_media (optional join)
  - post_id -> soc_posts.id
  - image_id -> img_images.id (if you attach Cloudflare Images references)
  - video_id -> vid_videos.id (if you attach Stream/Mux references)

KV for hot recents:
- Keys:
  - recent:posts -> JSON array of the latest N IDs (e.g., 50)
  - post:<id> -> JSON summary (id, slug, title, excerpt, created_at), TTL ~30m
- Usage:
  1) Page/API reads KV first; if miss, fetch from D1 and repopulate.
  2) Ingest proactively warms KV to “pre-warm the cache” so user hits are fast.

Queue for ingest (ingest-social):
- Message shape: { r2Key: "imports/social/normalized/2025-10.jsonl" }
- Consumer:
  1) Streams the R2 object line-by-line (Web Streams).
  2) JSON.parse per line, validate schema (strongly recommended).
  3) UPSERT into soc_posts by id; if exists, update selected fields.
  4) KV warm: set post:<id>, update recent:posts list (dedupe, cap to N).
  5) (Optional) Create embeddings with Workers AI and upsert into Vectorize for semantic search.

Pseudocode (social ingest):
  onMessage({ r2Key }):
    obj = R2.get(r2Key)
    reader = obj.stream()
    leftover = ""
    for (chunk in reader):
      lines = (leftover + chunk).split("\n"); leftover = lines.pop()
      for (line in lines):
        if line.trim() == "": continue
        rec = JSON.parse(line)
        assert rec.id && rec.slug && rec.created_at && rec.r2_key
        DB.exec(`
          INSERT INTO soc_posts (id, platform, source_id, created_at, slug, title, excerpt, thumb_url, r2_key, visibility)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            excerpt=excluded.excerpt,
            thumb_url=excluded.thumb_url,
            slug=excluded.slug,
            visibility=excluded.visibility
        `, [rec.id, rec.platform||"blog", rec.source_id||rec.id, ts(rec.created_at),
            rec.slug, rec.title||null, rec.excerpt||null, rec.thumb_url||null, rec.r2_key, rec.visibility||"public"])

        // warm KV
        KV.put(`post:${rec.id}`, JSON.stringify(summary(rec)), { ttl: 1800 })
        ids = KV.get("recent:posts") || []
        KV.put("recent:posts", dedupe([rec.id, ...ids]).slice(0,50), { ttl: 1800 })

        // optional semantic index
        // emb = AI.embed(rec.title + "\n\n" + rec.excerpt)
        // VECTORIZE.upsert([{ id: rec.id, values: emb, metadata: { slug: rec.slug, platform: rec.platform } }])

---------------------------------------------------------------------
CHECK-INS (LOCATION) CONTENT
---------------------------------------------------------------------
Use case:
- Many small events (check-ins), time-ordered, often aggregated by place or area, and asked as: “How many times have I been here/today/this month?”

Durable data in R2:
- JSONL batches by time range: r2://datasets-na/geo/checkins-YYYY-MM.jsonl
- Record shape:
  {
    "id": "sha256:platform|source_id|ts|lat|lon|venue_id",  // stable key
    "ts": "2025-10-22T12:34:56Z",
    "venue_id": "foursquare:abc123",                       // nullable
    "lat": 37.78,
    "lon": -122.42,
    "geohash": "9q8yy2x"                                   // or compute at ingest
    "meta": { "name":"Blue Bottle Mint Plaza", ... }
  }

Why these fields:
- id: deterministic for idempotency.
- ts: time dimension for daily/monthly grouping.
- venue_id: exact venue counts; geohash: spatial bucketing independent of known venues.
- lat/lon: raw coordinates for map views.
- meta: non-index extras (kept durable in R2 or optionally mirrored to D1 as light JSON).

D1 for index/aggregations (Drizzle tables):
- geo_checkins:
  - id (PK)
  - ts (UNIX millis)
  - venue_id (nullable)
  - lat, lon (REAL)
  - geohash (TEXT)
- geo_counts_by_venue:
  - venue_id
  - day (YYYYMMDD as int or unix day)
  - n (count for that day)
- geo_counts_by_cell:
  - cell (geohash prefix, e.g., 6–7 chars)
  - day
  - n
Rationale:
- Fast O(1) answers to “how many times have I been at venue X on day D?” or “in this geohash cell on day D?”
- We pre-aggregate at ingest so runtime queries are cheap and predictable.

Queue + ingest (ingest-checkins or reuse ingest-social with type=checkin):
- Message: { r2Key: "geo/checkins-2025-10.jsonl" }
- Ingest steps:
  1) UPSERT each check-in to geo_checkins.
  2) Derive (venue_id, day) and increment geo_counts_by_venue.
  3) Derive (geohash_prefix, day) and increment geo_counts_by_cell.
  4) Optionally warm a KV key for “today’s counts” in a given region or venue.

Pseudocode (check-ins):
  for each line:
    rec = JSON.parse(line)
    day = dateToYmd(rec.ts)        // e.g., 20251022
    cell = geohashPrefix(rec.geohash, 6)

    DB.exec(`
      INSERT INTO geo_checkins (id, ts, venue_id, lat, lon, geohash)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `, [rec.id, ts(rec.ts), rec.venue_id||null, rec.lat, rec.lon, rec.geohash])

    // Upsert counts; if D1 lacks atomic upsert increments, emulate:
    DB.exec(`
      INSERT INTO geo_counts_by_venue (venue_id, day, n) VALUES (?,?,1)
      ON CONFLICT(venue_id, day) DO UPDATE SET n = n + 1
    `, [rec.venue_id||"__none__", day])

    DB.exec(`
      INSERT INTO geo_counts_by_cell (cell, day, n) VALUES (?,?,1)
      ON CONFLICT(cell, day) DO UPDATE SET n = n + 1
    `, [cell, day])

Query patterns:
- “How many times have I been here?” by venue:
  SELECT SUM(n) FROM geo_counts_by_venue WHERE venue_id=?;
- “How many times this month in this area?” (roll up by prefix + day range):
  SELECT SUM(n) FROM geo_counts_by_cell WHERE cell LIKE ? AND day BETWEEN ? AND ?;

---------------------------------------------------------------------
SHAKESPEARE (OR LARGE TEXT CORPORA)
---------------------------------------------------------------------
Use case:
- Large, relatively static text corpus; needs durable storage, indexed sections for navigation/search, optional embeddings for semantic retrieval.

Durable data in R2:
- JSONL file of sections (e.g., work/act/scene or stanza blocks).
- Example path: r2://datasets-na/shakespeare/works.jsonl
- Record shape (per section):
  {
    "id": "sha256:work|slug",       // stable section key
    "work_id": "hamlet",            // foreign key to work
    "slug": "hamlet/act-1/scene-2",
    "r2_key": "shakespeare/sections/hamlet/act-1/scene-2.json",
    "word_count": 742,
    "meta": { "speakers":["HAMLET"], ... }
  }
- The full text for the section is stored at r2_key (or inline JSON field if preferred). Immutable, durable.

D1 as an index:
- shk_works:
  - id (e.g., “shakespeare” or per play name)
  - title
  - version (for corpus releases)
- shk_sections:
  - id (PK, stable hash)
  - work_id
  - slug (unique; hierarchical path)
  - r2_key (pointer to section JSON in R2)
  - word_count
Rationale:
- Fast TOC and section lookup by slug or work (UI needs quick links).
- word_count helps with pagination or previews.
- Keep bulk text in R2; D1 stays small and fast.

Queue ingestion:
- Message: { r2Key: "shakespeare/works.jsonl" }
- Steps:
  1) UPSERT section index rows to D1 (shk_sections).
  2) (Optional) Generate embeddings and put into Vectorize for semantic search (“find the scene where …”).
  3) (Optional) KV warm: cache top entry points (like work TOCs) with TTL.

Pseudocode (shakespeare):
  for each line:
    rec = JSON.parse(line)
    DB.exec(`
      INSERT INTO shk_sections (id, work_id, slug, r2_key, word_count)
      VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, r2_key=excluded.r2_key, word_count=excluded.word_count
    `, [rec.id, rec.work_id, rec.slug, rec.r2_key, rec.word_count])

    // optionally emb = AI.embed(section_text_excerpt)
    // VECTORIZE.upsert([{ id: rec.id, values: emb, metadata: { slug: rec.slug, work: rec.work_id } }])

Typical queries:
- TOC for a work: SELECT slug FROM shk_sections WHERE work_id=? ORDER BY slug;
- Load section text: D1 -> r2_key -> fetch from R2 (or presign/serve via Worker).

---------------------------------------------------------------------
WHY THESE LAYERS?
---------------------------------------------------------------------
- R2 (durable): cheapest large storage; immutable history; easy to append/replace; perfect for backups and full rebuilds.
- D1 (index): tiny, fast, relational queries; ideal for lists, filters, date or geo rollups; low latency for SSR/API.
- KV (hot cache): high read throughput, trivial TTL-based freshness for “home page” lists, “recents”, “today counts”.
- Queues (ingestion): decouples ingest from request latency; enables backpressure, retries, partial failures without user impact.
- Embeddings & Vectorize (optional): semantic search across posts/sections; run-time query embedding + ANN lookup + D1 hydrate.

---------------------------------------------------------------------
ADMIN/OPS NOTES
---------------------------------------------------------------------
- Idempotency: Always use stable IDs and UPSERT semantics. You can re-run an entire month’s JSONL safely.
- Bootstrap: On empty D1, enqueue a full replay of JSONL manifests in R2; KV will warm as the replay progresses.
- Evolution: Add fields to JSONL freely. Only project the ones you need to D1; keep the rest in R2. Migrations are simpler.
- Access Control: Admin endpoints (e.g., /api/admin/ingest) protected with Cloudflare Access service tokens.
- Observability: Record ingest run metrics (counts, errors) into a light audit table or logs for debugging.

---------------------------------------------------------------------
SNIPPETS: STABLE KEY & UPSERT
---------------------------------------------------------------------
Stable key:
  function canonicalId(platform, source_id, created_at, text) {
    return "sha256:" + sha256(platform + "|" + source_id + "|" + created_at + "|" + text);
  }

D1 UPSERT (SQLite-style):
  INSERT INTO table (id, col1, col2, ...)
  VALUES (?, ?, ?, ...)
  ON CONFLICT(id) DO UPDATE SET col1=excluded.col1, col2=excluded.col2, ...;

KV recents (dedupe + cap):
  const ids = (await KV.get("recent:key", "json")) ?? [];
  const set = new Set([newId, ...ids]);
  await KV.put("recent:key", JSON.stringify(Array.from(set).slice(0, N)), { expirationTtl: 1800 });

---------------------------------------------------------------------
END
---------------------------------------------------------------------
