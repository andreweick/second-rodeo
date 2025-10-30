# Shakespeare Semantic Search Capability

## ADDED Requirements

### Requirement: Vectorize Integration

The system SHALL integrate Cloudflare Vectorize for semantic Shakespeare text search to enable thematic queries across Early Modern English.

#### Scenario: Embedding generation during ingestion

- **WHEN** a new shakespeare paragraph is ingested via queue (post-phase1 deployment)
- **THEN** the system SHALL generate a 768-dimensional embedding vector from the paragraph text
- **AND** the system SHALL upsert the vector to Vectorize index with metadata: paragraph_id, work_id, act, scene, character_id
- **AND** the system SHALL continue D1 insert as normal (phase1 flow unchanged)

#### Scenario: Vectorize index configuration

- **WHEN** setting up shakespeare semantic search
- **THEN** a Vectorize index named `shakespeare-texts` SHALL be created
- **AND** the index SHALL use 768 dimensions
- **AND** the index SHALL store metadata fields: paragraph_id, work_id, act, scene, character_id

#### Scenario: Backfill existing paragraphs

- **WHEN** POST /shakespeare/vectorize/backfill is called
- **THEN** the system SHALL query D1 for all existing shakespeare paragraphs
- **AND** for each paragraph, fetch text from R2, generate embedding, upsert to Vectorize
- **AND** the system SHALL handle existing vectors idempotently
- **AND** return count of paragraphs processed
- **AND** process all 35,629 paragraphs (may take 30-60 minutes)

### Requirement: Semantic Search Query Patterns

The system SHALL support semantic search queries that understand themes, literary concepts, and Early Modern English.

#### Scenario: Thematic search

- **WHEN** user searches "mortality in Hamlet"
- **THEN** Vectorize SHALL return paragraphs thematically related to death/dying
- **AND** D1 query SHALL filter by work_id for Hamlet
- **AND** results SHALL include relevant passages

#### Scenario: Scene-level thematic search

- **WHEN** user searches "betrayal scenes in Julius Caesar"
- **THEN** Vectorize SHALL find paragraphs about betrayal
- **AND** D1 query SHALL filter by work_id for Julius Caesar
- **AND** results MAY be grouped by act/scene

#### Scenario: Paraphrase matching

- **WHEN** user searches "that speech about madmen and blind"
- **THEN** Vectorize SHALL find the matching passage
- **AND** handle natural language paraphrasing

#### Scenario: Character-scoped search

- **WHEN** user searches semantically with character_id filter
- **THEN** Vectorize SHALL return candidate paragraph IDs
- **AND** D1 query SHALL filter by character_id field
- **AND** results SHALL match both semantic similarity and character constraint

#### Scenario: Search result ranking

- **WHEN** Vectorize returns multiple matching paragraphs
- **THEN** results SHALL be ranked by vector similarity score
- **AND** top N results SHALL be returned (configurable, default 20)
- **AND** similarity threshold MAY be applied to filter low-confidence matches

### Requirement: Search Endpoint

The system SHALL provide an HTTP endpoint for semantic Shakespeare text search.

#### Scenario: Successful search

- **WHEN** GET /shakespeare/search?q=mortality+in+Hamlet is called
- **THEN** the system SHALL generate embedding from query
- **AND** query Vectorize with topK parameter
- **AND** return JSON with paragraph IDs, work info, similarity scores
- **AND** include act/scene/character metadata from D1

#### Scenario: Work-scoped search

- **WHEN** GET /shakespeare/search?q=betrayal&work_id=julius-caesar is called
- **THEN** Vectorize SHALL return candidate paragraph IDs
- **AND** D1 query SHALL filter by work_id
- **AND** results SHALL match both semantic similarity and work constraint

#### Scenario: No results

- **WHEN** Vectorize returns no matches above threshold
- **THEN** the system SHALL return empty results array
- **AND** response status SHALL be 200 OK

### Requirement: Idempotent Vectorize Operations

The system SHALL support idempotent embedding generation and vector upsert for large datasets.

#### Scenario: Backfill re-run

- **WHEN** /shakespeare/vectorize/backfill is called multiple times
- **THEN** existing vectors SHALL be updated (upsert)
- **AND** no duplicate vectors SHALL be created
- **AND** final Vectorize state SHALL contain exactly one vector per paragraph

#### Scenario: Queue re-processing

- **WHEN** a shakespeare queue message is re-processed with embedding generation
- **THEN** Vectorize upsert SHALL update existing vector
- **AND** D1 insert SHALL follow phase1 idempotency (UNIQUE constraint)
