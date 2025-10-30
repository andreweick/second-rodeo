# Shakespeare Ingestion Capability

## ADDED Requirements

### Requirement: Hot/Cold Storage Schema

The system SHALL maintain Shakespeare corpus data using a hot/cold storage architecture where D1 stores minimal metadata for filtering and R2 stores complete text content.

#### Scenario: Minimal metadata storage in D1

- **WHEN** a Shakespeare paragraph is ingested
- **THEN** D1 SHALL store only: id, work_id, act, scene, paragraph_num, character_id, is_stage_direction, word_count, timestamp, r2_key
- **AND** D1 SHALL NOT store: text, text_phonetic, text_stem, work_title, genre_code, genre_name, character_name

#### Scenario: Full content in R2

- **WHEN** a Shakespeare paragraph is ingested
- **THEN** R2 SHALL store complete JSON with all fields including text, text_phonetic, text_stem, and work metadata
- **AND** the R2 object key SHALL match the paragraph id field

#### Scenario: Works table population

- **WHEN** the manifest is ingested
- **THEN** D1 SHALL populate shakespeare_works table with 43 work records
- **AND** each record SHALL include: work_id, title, long_title, short_title, genre_code, genre_name, year, total_paragraphs, total_words, total_characters, stage_direction_count

### Requirement: Bulk Paragraph Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to trigger bulk ingestion of all Shakespeare paragraph files from R2.

#### Scenario: Successful bulk ingestion trigger

- **WHEN** an authenticated POST request is made to /shakespeare/ingest
- **THEN** the system SHALL list all objects with R2 prefix `shakespeare/paragraphs/`
- **AND** the system SHALL send one queue message per paragraph file
- **AND** the response SHALL return JSON with count of messages queued

#### Scenario: Authentication required

- **WHEN** POST /shakespeare/ingest is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: R2 listing failure

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error message
- **AND** no queue messages SHALL be sent

### Requirement: Works Manifest Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to ingest the Shakespeare works manifest from R2.

#### Scenario: Successful manifest ingestion

- **WHEN** an authenticated POST request is made to /shakespeare/ingest/works
- **THEN** the system SHALL fetch manifest.jsonl from R2 path `shakespeare/manifest.jsonl`
- **AND** the system SHALL parse each line as a separate work record
- **AND** the system SHALL queue one message per work
- **AND** the response SHALL return count of works queued (43)

#### Scenario: JSONL parsing

- **WHEN** processing manifest.jsonl
- **THEN** each line SHALL be parsed as independent JSON object
- **AND** blank lines SHALL be skipped
- **AND** parsing errors SHALL be logged but not halt processing

### Requirement: Paragraph Queue Processing

The system SHALL process Shakespeare paragraph queue messages by validating JSON structure and inserting minimal metadata to D1.

#### Scenario: Valid paragraph ingestion

- **WHEN** a queue message with objectKey `/shakespeare/paragraphs/{id}.json` is received
- **THEN** the system SHALL fetch JSON from R2
- **AND** validate required fields: id, work_id, act, scene, paragraph_num, character_id, is_stage_direction, word_count, timestamp
- **AND** insert record to shakespeare table with r2_key set to objectKey
- **AND** mark message as successfully processed

#### Scenario: Missing required field

- **WHEN** a paragraph JSON is missing a required field
- **THEN** the system SHALL log validation error with field name
- **AND** NOT insert record to D1
- **AND** mark message as failed

#### Scenario: Duplicate paragraph id

- **WHEN** a paragraph with existing id is processed
- **THEN** the system SHALL perform INSERT and allow SQLite UNIQUE constraint to prevent duplicate
- **AND** log the duplicate attempt
- **AND** continue processing other messages

### Requirement: Works Queue Processing

The system SHALL process Shakespeare works queue messages by validating manifest records and inserting to shakespeare_works table.

#### Scenario: Valid work ingestion

- **WHEN** a queue message for a manifest work record is received
- **THEN** the system SHALL validate required fields: work_id, title, long_title, genre_code, genre_name, total_paragraphs, total_words, total_characters, stage_direction_count
- **AND** insert record to shakespeare_works table
- **AND** mark message as successfully processed

#### Scenario: Optional year field

- **WHEN** a work record has year as null or 0
- **THEN** the system SHALL accept the record and store year as NULL in D1

### Requirement: Idempotent Ingestion

The system SHALL support idempotent re-ingestion of Shakespeare data without causing data corruption or duplicates.

#### Scenario: Re-running full ingestion

- **WHEN** /shakespeare/ingest is called multiple times
- **THEN** each call SHALL queue all 35,629 messages again
- **AND** queue processing SHALL handle duplicate ids gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly 35,629 paragraph records

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** paragraph ids SHALL be deterministic (content-based SHA256)
- **AND** re-ingestion SHALL result in same id values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for Shakespeare data to enable predictable storage and retrieval.

#### Scenario: Paragraph file naming

- **WHEN** storing or retrieving paragraph JSON
- **THEN** R2 key format SHALL be `shakespeare/paragraphs/{sha256_hash}.json`
- **AND** {sha256_hash} SHALL match the id field in the JSON

#### Scenario: Manifest file location

- **WHEN** storing or retrieving the works manifest
- **THEN** R2 key SHALL be `shakespeare/manifest.jsonl`

### Requirement: Vectorize Semantic Search Integration

The system SHALL integrate Cloudflare Vectorize for semantic Shakespeare text search to enable natural language queries across Early Modern English without storing paragraph text in D1.

#### Scenario: Embedding generation during ingestion

- **WHEN** a Shakespeare paragraph is ingested via queue
- **THEN** the system SHALL generate a 768-dimensional embedding vector from the paragraph text
- **AND** the system SHALL upsert the vector to Vectorize index with metadata: paragraph_id, work_id, act, scene, character_id
- **AND** the system SHALL insert metadata to D1 without storing text fields

#### Scenario: Semantic paragraph search

- **WHEN** a user searches for "mortality in Hamlet"
- **THEN** the system SHALL generate an embedding vector from the query
- **AND** the system SHALL query Vectorize with topK=20 to find semantically similar paragraphs
- **AND** the system SHALL return paragraph IDs ranked by similarity
- **AND** the system SHALL fetch metadata from D1 using returned IDs

#### Scenario: Vectorize index configuration

- **WHEN** setting up the Shakespeare ingestion system
- **THEN** a Vectorize index SHALL be created for Shakespeare paragraph embeddings
- **AND** the index SHALL use 768 dimensions
- **AND** the index SHALL store metadata fields: paragraph_id, work_id, act, scene, character_id
- **AND** the index SHALL be named `shakespeare-texts`

#### Scenario: Work-scoped semantic search

- **WHEN** searching within a specific work (e.g., "betrayal in Julius Caesar")
- **THEN** Vectorize SHALL return candidate paragraph IDs for "betrayal"
- **AND** D1 query SHALL filter by work_id for "Julius Caesar"
- **AND** results SHALL match both semantic similarity and work constraint

#### Scenario: Character-scoped semantic search

- **WHEN** searching for character themes (e.g., "Hamlet's speeches about madness")
- **THEN** Vectorize SHALL return candidate paragraph IDs for "madness"
- **AND** D1 query SHALL filter by character_id for "Hamlet"
- **AND** results SHALL match both semantic similarity and character constraint

### Requirement: Semantic Search Query Patterns

The system SHALL support semantic search queries that understand Early Modern English themes, concepts, and literary devices beyond exact text matching.

#### Scenario: Thematic search

- **WHEN** user searches "quotes about mortality in Hamlet"
- **THEN** Vectorize SHALL return paragraphs thematically related to death and mortality
- **AND** results MAY use words like "death", "grave", "mortality", "perish" even without exact match
- **AND** results SHALL be filtered to Hamlet work_id

#### Scenario: Conceptual search across works

- **WHEN** user searches "poetic descriptions of nature"
- **THEN** Vectorize SHALL find paragraphs with nature imagery across all works
- **AND** handle Early Modern English vocabulary and spelling variations
- **AND** return results from multiple works

#### Scenario: Paraphrase matching

- **WHEN** user searches "that speech about madmen and blind"
- **THEN** Vectorize SHALL find "when madmen lead the blind" from King Lear
- **AND** handle natural language paraphrasing
- **AND** match conceptual similarity despite different wording

#### Scenario: Scene-level search

- **WHEN** user searches "betrayal scenes in Julius Caesar"
- **THEN** Vectorize SHALL find paragraphs about betrayal
- **AND** D1 query SHALL group by act and scene
- **AND** results SHALL show entire scene context

#### Scenario: Search result ranking

- **WHEN** Vectorize returns multiple matching paragraphs
- **THEN** results SHALL be ranked by vector similarity score
- **AND** top 20 results SHALL be returned by default
- **AND** similarity threshold MAY be applied to filter low-confidence matches

### Requirement: Query Performance Optimization

The system SHALL structure D1 schema to enable fast filtering queries on Shakespeare metadata without scanning text fields.

#### Scenario: Filter by work

- **WHEN** querying paragraphs for a specific work
- **THEN** query SHALL use work_id field (indexed)
- **AND** NOT require R2 fetches

#### Scenario: Filter by character

- **WHEN** querying all speeches by a character
- **THEN** query SHALL use character_id field
- **AND** return list of paragraph ids without text content

#### Scenario: Navigate by structure

- **WHEN** querying paragraphs by act and scene
- **THEN** query SHALL use act, scene, paragraph_num fields for ordering
- **AND** support efficient range queries for context retrieval
