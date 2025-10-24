TITLE: Raindrop Mirror & Index System (Cloudflare Durable-First Architecture)

SCOPE:
This specification defines the ingestion, storage, and indexing design for mirroring Raindrop.io bookmarks
into a Cloudflare-native stack using R2 (durable store), D1 (disposable index via Drizzle ORM), KV (state and cursor),
and Queues (rate-limited ingestion scheduling).  The project is implemented in TypeScript with Astro.js + Drizzle ORM.

---------------------------------------------------------------------
CLOUD SERVICES OVERVIEW
---------------------------------------------------------------------
- **R2** → canonical durable storage for all bookmark data and permanent copies.
- **D1** → minimal, disposable relational index (id, metadata, tags, FTS).
- **KV** → state store for ingestion cursors and “next run” scheduling.
- **Queue** → orchestrates fetch batches (50 items per batch), rate-limited to one batch/hour.
- **Cron Trigger** → 24-hour collector that resumes ingestion for new or updated bookmarks.

---------------------------------------------------------------------
DATA FLOW OVERVIEW
---------------------------------------------------------------------
1. **Initial ingest job** starts from the earliest date (oldest Raindrop).
2. Queue pulls 50 items via Raindrop API (`/raindrops/0?perpage=50&page=N`).
3. For each item:
   - Download metadata (JSON).
   - Fetch permanent copy via `GET /raindrop/{id}/cache` (follow 307 redirect).
   - Mirror permanent copy and metadata into R2.
   - Extract plaintext and store as `{id}/plain.txt` in R2.
   - Upsert minimal record and tags into D1.
   - Feed text into FTS5 (contentless) index for search.
4. Store the “last processed updated_at” timestamp in KV (`kv:raindrop:last_cursor`).
5. After each 50-item batch, enqueue a new job in 60 min to continue.
6. When no new items remain, schedule the next run for +24 h to check for new or changed bookmarks.

---------------------------------------------------------------------
R2 STORAGE LAYOUT
---------------------------------------------------------------------
r2://raindrops/
  {id}/raw.json          → full Raindrop object (API output)
  {id}/permacopy.html    → permanent copy (HTML snapshot or PDF)
  {id}/plain.txt         → extracted text
  {id}/meta.json         → { sha256, content_type, content_length, fetched_at }
  {id}/chunks.jsonl      → text chunks for RAG embedding
r2://manifests/YYYY-MM.jsonl → append-only list of {id, updated_at, tags, domain, title, excerpt}

---------------------------------------------------------------------
D1 DATABASE (Drizzle ORM)
---------------------------------------------------------------------
tables.raindrops:
  id INTEGER PRIMARY KEY,
  link TEXT NOT NULL,
  title TEXT,
  excerpt TEXT,
  domain TEXT,
  created_at TEXT,
  updated_at TEXT
indexes:
  idx_raindrops_updated (updated_at DESC),
  idx_raindrops_domain (domain)

tables.tags:
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL

tables.raindrop_tags:
  raindrop_id INTEGER REFERENCES raindrops(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (raindrop_id, tag_id)

virtual.raindrop_fts (FTS5, contentless):
  title, excerpt, body, tags_txt, domain
  tokenize='unicode61 remove_diacritics 2', content=''

tables.raindrop_text_state:
  raindrop_id INTEGER PRIMARY KEY REFERENCES raindrops(id) ON DELETE CASCADE,
  text_sha256 TEXT NOT NULL,
  word_count INTEGER,
  indexed_at TEXT

tables.rag_state:
  chunk_key TEXT PRIMARY KEY,
  raindrop_id INTEGER REFERENCES raindrops(id) ON DELETE CASCADE,
  text_sha256 TEXT NOT NULL,
  model TEXT NOT NULL,
  embedded_at TEXT

---------------------------------------------------------------------
KV STORAGE
---------------------------------------------------------------------
kv:raindrop:last_cursor  → ISO timestamp of last processed “updated_at”
kv:raindrop:schedule     → ISO timestamp for next scheduled batch (hourly or daily)

---------------------------------------------------------------------
QUEUE BEHAVIOR
---------------------------------------------------------------------
Queue name: `raindrop-ingest`
Message shape: `{ "page": N, "cursor": "2025-01-01T00:00:00Z" }`

Consumer logic:
  1. Fetch 50 items (sorted ascending by updated_at).
  2. Process each item as described in DATA FLOW.
  3. Update KV cursor to latest updated_at.
  4. If exactly 50 items processed → enqueue next batch job in 60 min.
     Else (fewer than 50) → enqueue next job for +24 h.

---------------------------------------------------------------------
CRON TRIGGER
---------------------------------------------------------------------
Crons: 24-hour cadence (e.g., “15 5 * * *”)
Behavior:
  - Reads `kv:raindrop:last_cursor`.
  - Enqueues a single queue message `{ page: 0, cursor }`.
  - Queue resumes ingestion loop as above.

---------------------------------------------------------------------
FTS5 INDEXING (CONTENTLESS)
---------------------------------------------------------------------
During ingest or rebuild:
  DELETE FROM raindrop_fts WHERE rowid = id;
  INSERT INTO raindrop_fts(rowid,title,excerpt,body,tags_txt,domain)
  VALUES (?,?,?,?,?,?);
Tokenizes text but does not persist it.
Can be fully rebuilt from R2 plain.txt + meta.json at any time.

---------------------------------------------------------------------
REINFLATE PROCEDURE (DISPOSABLE D1)
---------------------------------------------------------------------
If D1 is dropped or reset:
  1. Stream manifest JSONL(s) from R2.
  2. Re-INSERT metadata into `raindrops` and `tags` tables.
  3. For each id:
     - Load `{id}/meta.json` → compare sha256.
     - Stream `{id}/plain.txt` → rebuild `raindrop_fts`.
     - Update `raindrop_text_state`.
  4. Re-create RAG embeddings from `{id}/chunks.jsonl` if needed.
Result: identical search/index state, no lost data.

---------------------------------------------------------------------
RAG EMBEDDINGS (OPTIONAL)
---------------------------------------------------------------------
Chunk each plain.txt (~800 tokens, 100 overlap).
Write chunks.jsonl → [{"k":"rd-<id>-c00","t":"…","s":"sha256…"}, …]
For each chunk:
  - If new hash or new model, embed with Workers AI and upsert to Vectorize.
  - Record in rag_state for deduplication.

---------------------------------------------------------------------
RATE LIMIT & POLITENESS
---------------------------------------------------------------------
- ~6–10 requests/min average (sleep + jitter between items).
- 50 items per batch, 60 min gap between batches.
- 24-hour cron ensures polite refresh of new/updated items only.

---------------------------------------------------------------------
GOAL
---------------------------------------------------------------------
R2 = durable, rebuildable truth  
D1 = small, disposable, FTS + tag index  
KV = cursor + schedule  
Queue = hourly paced ingestion  
Cron = daily trigger for new content

System can be wiped and fully “re-inflated” from R2 without loss of data.
