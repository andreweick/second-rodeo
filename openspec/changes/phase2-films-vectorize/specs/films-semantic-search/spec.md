# Films Semantic Search Capability

## ADDED Requirements

### Requirement: Vectorize Integration

The system SHALL integrate Cloudflare Vectorize for semantic film title search to enable natural language queries.

#### Scenario: Embedding generation during ingestion

- **WHEN** a new film is ingested via queue (post-phase1 deployment)
- **THEN** the system SHALL generate a 768-dimensional embedding vector from the film title
- **AND** the system SHALL upsert the vector to Vectorize index with metadata: film_id, title, year, slug
- **AND** the system SHALL continue D1 insert as normal (phase1 flow unchanged)

#### Scenario: Vectorize index configuration

- **WHEN** setting up films semantic search
- **THEN** a Vectorize index named `films-titles` SHALL be created
- **AND** the index SHALL use 768 dimensions
- **AND** the index SHALL store metadata fields: film_id, title, year, slug

#### Scenario: Backfill existing films

- **WHEN** POST /films/vectorize/backfill is called
- **THEN** the system SHALL query D1 for all existing films
- **AND** for each film, fetch title from R2, generate embedding, upsert to Vectorize
- **AND** the system SHALL handle existing vectors idempotently
- **AND** return count of films processed

### Requirement: Semantic Search Queries

The system SHALL support semantic search queries that understand natural language and context beyond exact title matching.

#### Scenario: Natural language search

- **WHEN** user searches "when did I watch that movie about dreams"
- **THEN** Vectorize SHALL return films with similar semantic meaning (e.g., "Inception")
- **AND** D1 query SHALL return watch dates for matched films

#### Scenario: Typo tolerance

- **WHEN** user searches "incepshun" (typo)
- **THEN** Vectorize SHALL find "Inception" based on semantic similarity
- **AND** return results despite misspelling

#### Scenario: Multi-term search

- **WHEN** user searches "Christopher Nolan sci-fi"
- **THEN** Vectorize SHALL find films semantically related to the query
- **AND** results MAY be filtered by director or genre in subsequent D1 query

#### Scenario: Search result ranking

- **WHEN** Vectorize returns multiple matching films
- **THEN** results SHALL be ranked by vector similarity score
- **AND** top N results SHALL be returned (configurable, default 10)
- **AND** similarity threshold MAY be applied to filter low-confidence matches

### Requirement: Search Endpoint

The system SHALL provide an HTTP endpoint for semantic film title search.

#### Scenario: Successful search

- **WHEN** GET /films/search?q=inception is called
- **THEN** the system SHALL generate embedding from query "inception"
- **AND** query Vectorize with topK parameter
- **AND** return JSON with film IDs, titles, similarity scores
- **AND** include watch dates from D1 metadata

#### Scenario: Search with limit

- **WHEN** GET /films/search?q=nolan&limit=5 is called
- **THEN** the system SHALL return at most 5 results
- **AND** results SHALL be ordered by similarity score descending

#### Scenario: No results

- **WHEN** Vectorize returns no matches above threshold
- **THEN** the system SHALL return empty results array
- **AND** response status SHALL be 200 OK

### Requirement: Idempotent Vectorize Operations

The system SHALL support idempotent embedding generation and vector upsert.

#### Scenario: Backfill re-run

- **WHEN** /films/vectorize/backfill is called multiple times
- **THEN** existing vectors SHALL be updated (upsert)
- **AND** no duplicate vectors SHALL be created
- **AND** final Vectorize state SHALL contain exactly one vector per film

#### Scenario: Queue re-processing

- **WHEN** a film queue message is re-processed with embedding generation
- **THEN** Vectorize upsert SHALL update existing vector
- **AND** D1 insert SHALL follow phase1 idempotency (UNIQUE constraint)
