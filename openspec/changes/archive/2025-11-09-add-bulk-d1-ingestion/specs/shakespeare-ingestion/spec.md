# Shakespeare Ingestion Capability

## ADDED Requirements

### Requirement: Hot/Cold Storage Schema

The system SHALL maintain Shakespeare corpus data using a hot/cold storage architecture where D1 stores minimal metadata for filtering and R2 stores complete text content.

#### Scenario: Minimal metadata storage in D1

- **WHEN** a Shakespeare paragraph is ingested from wrapped JSON
- **THEN** D1 SHALL store only: id, workId, act, scene, paragraphNum, characterId, isStageDirection, wordCount, timestamp, r2Key
- **AND** D1 SHALL NOT store: text, textPhonetic, textStem, workTitle, genreCode, genreName, characterName

#### Scenario: Full content in R2

- **WHEN** a Shakespeare paragraph is ingested
- **THEN** R2 SHALL store complete wrapped JSON with type, id, and data containing all fields including text, text_phonetic, text_stem, and work metadata
- **AND** the R2 object key SHALL match the file path pattern `shakespeare/paragraphs/sha256_{hash}.json`

### Requirement: Shakespeare Ingestion Endpoints

The system SHALL provide authenticated HTTP endpoints to trigger bulk or single-file ingestion of all content types from R2.

#### Scenario: Successful bulk ingestion

- **WHEN** an authenticated POST request is made to /ingest/all
- **THEN** the system SHALL list all objects in SR_JSON bucket using pagination
- **AND** the system SHALL use sendBatch() to queue up to 1000 messages per page
- **AND** the system SHALL iterate through all pages until cursor is undefined
- **AND** the response SHALL return JSON with total count of messages queued

#### Scenario: Successful single-file ingestion

- **WHEN** an authenticated POST request is made to /ingest/{objectKey}
- **THEN** the system SHALL send a queue message for the specified objectKey
- **AND** the response SHALL return JSON with queued: 1 and the objectKey

#### Scenario: Authentication required

- **WHEN** POST /ingest/* is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: R2 listing failure

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error message
- **AND** no queue messages SHALL be sent

#### Scenario: Pagination handling

- **WHEN** R2 bucket contains more than 1000 objects
- **THEN** the system SHALL use cursor-based pagination
- **AND** the system SHALL process all pages within Worker timeout limits (< 30 seconds)

### Requirement: Paragraph Queue Processing

The system SHALL process queue messages by validating wrapped JSON structure, routing by type field, and inserting minimal metadata to D1.

#### Scenario: Valid paragraph ingestion from wrapped JSON

- **WHEN** a queue message with objectKey `sha256_{hash}.json` is received
- **THEN** the system SHALL fetch wrapped JSON from R2
- **AND** unwrap to extract type, id, and data fields
- **AND** route to shakespeare validator when type equals "shakespeare" or "shakespert" (handle typo)
- **AND** validate required fields in data: work_id, act, scene, paragraph_num, character_id, is_stage_direction, word_count, timestamp
- **AND** insert record to shakespeare table with: id (from envelope), workId, act, scene, paragraphNum, characterId, isStageDirection, wordCount, timestamp, r2Key
- **AND** mark message as successfully processed

#### Scenario: Missing required field in data

- **WHEN** a paragraph JSON data object is missing a required field
- **THEN** the system SHALL log validation error with field name
- **AND** NOT insert record to D1
- **AND** mark message as failed

#### Scenario: Duplicate paragraph id

- **WHEN** a paragraph with existing id is processed
- **THEN** the system SHALL allow SQLite UNIQUE constraint to prevent duplicate
- **AND** log the duplicate attempt
- **AND** continue processing other messages

### Requirement: Idempotent Ingestion

The system SHALL support idempotent re-ingestion of Shakespeare data without causing data corruption or duplicates.

#### Scenario: Re-running full ingestion

- **WHEN** /ingest/all is called multiple times
- **THEN** each call SHALL queue all messages again (including all content types)
- **AND** queue processing SHALL handle duplicate ids gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly 35,629 paragraph records

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** paragraph ids SHALL be deterministic (computed by upload API from data hash)
- **AND** re-ingestion SHALL result in same id values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for Shakespeare data to enable predictable storage and retrieval.

#### Scenario: Paragraph file naming

- **WHEN** storing or retrieving paragraph JSON
- **THEN** R2 key format SHALL be `sha256_{hash}.json` (content-addressable at bucket root)
- **AND** {hash} SHALL match the id field in the envelope (without `sha256:` prefix)
- **AND** content type SHALL be determined by envelope `type` field, not object key path

### Requirement: Query Performance Optimization

The system SHALL structure D1 schema to enable fast filtering queries on Shakespeare metadata without scanning text fields.

#### Scenario: Filter by work

- **WHEN** querying paragraphs for a specific work
- **THEN** query SHALL use workId field (indexed)
- **AND** NOT require R2 fetches

#### Scenario: Filter by character

- **WHEN** querying all speeches by a character
- **THEN** query SHALL use characterId field
- **AND** return list of paragraph ids without text content

#### Scenario: Navigate by structure

- **WHEN** querying paragraphs by act and scene
- **THEN** query SHALL use act, scene, paragraphNum fields for ordering
- **AND** support efficient range queries for context retrieval
