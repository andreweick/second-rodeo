# Chatter Ingestion Capability

## ADDED Requirements

### Requirement: Hot/Cold Storage Schema

The system SHALL maintain chatter data using a hot/cold storage architecture where D1 stores minimal metadata for filtering and R2 stores complete content.

#### Scenario: Minimal metadata storage in D1

- **WHEN** a chatter post is ingested
- **THEN** D1 SHALL store only: id, datePosted, year, month, slug, publish, r2Key, createdAt, updatedAt
- **AND** D1 SHALL NOT store: title, date, content, tags array, images array

#### Scenario: Full content in R2

- **WHEN** a chatter post is ingested
- **THEN** R2 SHALL store complete JSON with all fields including title, date, content, tags, images
- **AND** the R2 object key SHALL match the file path pattern `chatter/{sha256_hash}.json` or `/chatter/{sha256_hash}.json`

#### Scenario: Title retrieval from R2

- **WHEN** displaying a chatter post list
- **THEN** the system MAY use slug for display
- **OR** the system MAY fetch title from R2 JSON for richer display

### Requirement: Bulk Chatter Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to trigger bulk ingestion of all chatter files from R2.

#### Scenario: Successful bulk ingestion trigger

- **WHEN** an authenticated POST request is made to /chatter/ingest
- **THEN** the system SHALL list all objects with R2 prefix `chatter/`
- **AND** the system SHALL send one queue message per chatter file
- **AND** the response SHALL return JSON with count of messages queued

#### Scenario: Authentication required

- **WHEN** POST /chatter/ingest is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: R2 listing failure

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error message
- **AND** no queue messages SHALL be sent

### Requirement: Chatter Queue Processing

The system SHALL process chatter queue messages by validating JSON structure and inserting minimal metadata to D1.

#### Scenario: Valid chatter ingestion

- **WHEN** a queue message with objectKey `/chatter/{sha256_hash}.json` is received
- **THEN** the system SHALL fetch JSON from R2
- **AND** validate required fields in JSON: id, date_posted, year, month, slug
- **AND** insert record to chatter table with only: id, datePosted, year, month, slug, publish, r2Key
- **AND** mark message as successfully processed

#### Scenario: Missing required field

- **WHEN** a chatter JSON is missing a required field
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

- **WHEN** /chatter/ingest is called multiple times
- **THEN** each call SHALL queue all chatter messages again
- **AND** queue processing SHALL handle duplicate slugs gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly one record per unique chatter slug

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** chatter ids SHALL be deterministic (content-based SHA256)
- **AND** re-ingestion SHALL result in same id and slug values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for chatter data to enable predictable storage and retrieval.

#### Scenario: Chatter file naming

- **WHEN** storing or retrieving chatter JSON
- **THEN** R2 key format SHALL be `chatter/{sha256_hash}.json` or `/chatter/{sha256_hash}.json`
- **AND** {sha256_hash} SHALL match the id field in the JSON (which includes the `sha256:` prefix)

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
