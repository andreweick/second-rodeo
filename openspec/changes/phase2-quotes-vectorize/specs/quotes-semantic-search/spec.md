# Quotes Semantic Search Capability

## ADDED Requirements

### Requirement: Vectorize Integration

The system SHALL integrate Cloudflare Vectorize for semantic quote text search to enable thematic and conceptual queries.

#### Scenario: Embedding generation during ingestion

- **WHEN** a new quote is ingested via queue (post-phase1 deployment)
- **THEN** the system SHALL generate a 768-dimensional embedding vector from the quote text
- **AND** the system SHALL upsert the vector to Vectorize index with metadata: quote_id, author, year, slug
- **AND** the system SHALL continue D1 insert as normal (phase1 flow unchanged)

#### Scenario: Vectorize index configuration

- **WHEN** setting up quotes semantic search
- **THEN** a Vectorize index SHALL be created or reused for quote embeddings
- **AND** the index SHALL use 768 dimensions
- **AND** the index SHALL store metadata fields: quote_id, author, year, slug
- **AND** the index MAY be shared with films index or separate

#### Scenario: Backfill existing quotes

- **WHEN** POST /quotes/vectorize/backfill is called
- **THEN** the system SHALL query D1 for all existing quotes
- **AND** for each quote, fetch text from R2, generate embedding, upsert to Vectorize
- **AND** the system SHALL handle existing vectors idempotently
- **AND** return count of quotes processed

### Requirement: Semantic Search Query Patterns

The system SHALL support semantic search queries that understand themes, concepts, and philosophical ideas beyond exact text matching.

#### Scenario: Thematic search

- **WHEN** user searches "quotes about courage"
- **THEN** Vectorize SHALL return quotes thematically related to courage
- **AND** results MAY include words like "bravery", "valor", "fearless" even without "courage"

#### Scenario: Philosophical concept search

- **WHEN** user searches "stoic philosophy"
- **THEN** Vectorize SHALL find quotes embodying stoic themes
- **AND** return results from stoic authors or matching philosophical content

#### Scenario: Paraphrase matching

- **WHEN** user searches "that quote about madmen and blind"
- **THEN** Vectorize SHALL find "when madmen lead the blind"
- **AND** handle natural language paraphrasing

#### Scenario: Search result ranking

- **WHEN** Vectorize returns multiple matching quotes
- **THEN** results SHALL be ranked by vector similarity score
- **AND** top N results SHALL be returned (configurable, default 10)
- **AND** similarity threshold MAY be applied to filter low-confidence matches

### Requirement: Search Endpoint

The system SHALL provide an HTTP endpoint for semantic quote search.

#### Scenario: Successful search

- **WHEN** GET /quotes/search?q=leadership is called
- **THEN** the system SHALL generate embedding from query "leadership"
- **AND** query Vectorize with topK parameter
- **AND** return JSON with quote IDs, authors, similarity scores
- **AND** include date metadata from D1

#### Scenario: Author-scoped semantic search

- **WHEN** GET /quotes/search?q=power&author=Shakespeare is called
- **THEN** Vectorize SHALL return candidate quote IDs for "power"
- **AND** D1 query SHALL filter by author field
- **AND** results SHALL match both semantic similarity and author constraint

#### Scenario: No results

- **WHEN** Vectorize returns no matches above threshold
- **THEN** the system SHALL return empty results array
- **AND** response status SHALL be 200 OK

### Requirement: Idempotent Vectorize Operations

The system SHALL support idempotent embedding generation and vector upsert.

#### Scenario: Backfill re-run

- **WHEN** /quotes/vectorize/backfill is called multiple times
- **THEN** existing vectors SHALL be updated (upsert)
- **AND** no duplicate vectors SHALL be created
- **AND** final Vectorize state SHALL contain exactly one vector per quote

#### Scenario: Queue re-processing

- **WHEN** a quote queue message is re-processed with embedding generation
- **THEN** Vectorize upsert SHALL update existing vector
- **AND** D1 insert SHALL follow phase1 idempotency (UNIQUE constraint)
