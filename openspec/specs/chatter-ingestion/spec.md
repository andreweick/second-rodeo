# chatter-ingestion Specification

## Purpose
TBD - created by archiving change add-bulk-d1-ingestion. Update Purpose after archive.
## Requirements
### Requirement: Hot/Cold Storage Schema

The system SHALL maintain chatter data using a hot/cold storage architecture where D1 stores minimal metadata for filtering and R2 stores complete content.

#### Scenario: Minimal metadata storage in D1

- **WHEN** a chatter post is ingested from wrapped JSON
- **THEN** D1 SHALL store only: id, datePosted, year, month, slug, publish, r2Key, createdAt, updatedAt
- **AND** D1 SHALL NOT store: title, date, content, tags array, images array

#### Scenario: Full content in R2

- **WHEN** a chatter post is ingested
- **THEN** R2 SHALL store complete wrapped JSON with type, id, and data containing all fields including title, date, content, tags, images
- **AND** the R2 object key SHALL match the file path pattern `sha256_{hash}.json`

#### Scenario: Title retrieval from R2

- **WHEN** displaying a chatter post list
- **THEN** the system MAY use slug for display
- **OR** the system MAY fetch title from R2 JSON data object for richer display

### Requirement: Chatter Ingestion Endpoints

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

### Requirement: Chatter Queue Processing

The system SHALL process queue messages by validating wrapped JSON structure, routing by type field, and inserting minimal metadata to D1.

#### Scenario: Valid chatter ingestion from wrapped JSON

- **WHEN** a queue message with objectKey `sha256_{hash}.json` is received
- **THEN** the system SHALL fetch wrapped JSON from R2
- **AND** unwrap to extract type, id, and data fields
- **AND** route to chatter validator when type equals "chatter"
- **AND** validate required fields in data: date_posted, year, month, slug
- **AND** validate optional display fields exist in data: title, date
- **AND** insert record to chatter table with only: id (from envelope), datePosted, year, month, slug, publish, r2Key
- **AND** mark message as successfully processed

#### Scenario: Missing required field in data

- **WHEN** a chatter JSON data object is missing a required field
- **THEN** the system SHALL log validation error with field name
- **AND** NOT insert record to D1
- **AND** mark message as failed

#### Scenario: Duplicate chatter slug

- **WHEN** a chatter post with existing slug is processed
- **THEN** the system SHALL allow SQLite UNIQUE constraint on slug to prevent duplicate
- **AND** log the duplicate attempt
- **AND** continue processing other messages

### Requirement: Idempotent Ingestion

The system SHALL support idempotent re-ingestion of chatter data without causing data corruption or duplicates.

#### Scenario: Re-running full ingestion

- **WHEN** /ingest/all is called multiple times
- **THEN** each call SHALL queue all messages again (including all content types)
- **AND** queue processing SHALL handle duplicate slugs gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly one record per unique chatter slug

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** chatter ids SHALL be deterministic (computed by upload API from data hash)
- **AND** re-ingestion SHALL result in same id and slug values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for chatter data to enable predictable storage and retrieval.

#### Scenario: Chatter file naming

- **WHEN** storing or retrieving chatter JSON
- **THEN** R2 key format SHALL be `sha256_{hash}.json` (content-addressable at bucket root)
- **AND** {hash} SHALL match the id field in the envelope (without `sha256:` prefix)
- **AND** content type SHALL be determined by envelope `type` field, not object key path

### Requirement: Query Performance Optimization

The system SHALL structure D1 schema to enable fast filtering queries on chatter metadata without scanning content or title fields.

#### Scenario: Filter by timestamp

- **WHEN** querying chatter posts for a specific date range
- **THEN** query SHALL use datePosted timestamp field
- **AND** NOT require R2 fetches

#### Scenario: Filter by year and month

- **WHEN** querying chatter posts by year or month
- **THEN** query SHALL use year and month fields (indexed)
- **AND** return list of posts without fetching full content from R2

#### Scenario: Filter by publish status

- **WHEN** querying only published chatter posts
- **THEN** query SHALL use publish boolean field
- **AND** exclude unpublished drafts efficiently

#### Scenario: Sort by date

- **WHEN** sorting chatter posts chronologically
- **THEN** query SHALL use datePosted field for efficient ordering
- **AND** derive YYYY-MM-DD format from datePosted when needed

