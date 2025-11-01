# Quotes Ingestion Capability

## ADDED Requirements

### Requirement: Hot/Cold Storage Schema

The system SHALL maintain quote data using a hot/cold storage architecture where D1 stores minimal metadata for temporal and author filtering and R2 stores complete quote text.

#### Scenario: Minimal metadata storage in D1

- **WHEN** a quote is ingested from wrapped JSON
- **THEN** D1 SHALL store only: id, author, dateAdded, year, month, slug, publish, r2Key, createdAt, updatedAt
- **AND** D1 SHALL NOT store: text, date

#### Scenario: Full content in R2

- **WHEN** a quote is ingested
- **THEN** R2 SHALL store complete wrapped JSON with type, id, and data containing all fields including text, date, tags
- **AND** the R2 object key SHALL match the file path pattern `quotes/sha256_{hash}.json`

#### Scenario: Quote text retrieval from R2

- **WHEN** displaying quote text
- **THEN** the system SHALL fetch text from R2 JSON data object
- **OR** the system MAY use author/slug as fallback identifiers

### Requirement: Bulk Quotes Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to trigger bulk ingestion of all quote files from R2.

#### Scenario: Successful bulk ingestion trigger

- **WHEN** an authenticated POST request is made to /quotes/ingest
- **THEN** the system SHALL list all objects with R2 prefix `quotes/`
- **AND** the system SHALL send one queue message per quote file
- **AND** the response SHALL return JSON with count of messages queued

#### Scenario: Authentication required

- **WHEN** POST /quotes/ingest is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: R2 listing failure

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error message
- **AND** no queue messages SHALL be sent

### Requirement: Quotes Queue Processing

The system SHALL process quote queue messages by validating wrapped JSON structure and inserting to D1.

#### Scenario: Valid quote ingestion from wrapped JSON

- **WHEN** a queue message with objectKey `quotes/sha256_{hash}.json` is received
- **THEN** the system SHALL fetch wrapped JSON from R2
- **AND** unwrap to extract type, id, and data fields
- **AND** validate type equals "quotes"
- **AND** validate required fields in data: author, date_added, year, month, slug
- **AND** validate text field exists in data (for R2 completeness)
- **AND** insert record to quotes table with only: id (from envelope), author, dateAdded, year, month, slug, publish, r2Key
- **AND** mark message as successfully processed

#### Scenario: Missing required field in data

- **WHEN** a quote JSON data object is missing a required field
- **THEN** the system SHALL log validation error with field name
- **AND** NOT insert record to D1
- **AND** mark message as failed

#### Scenario: Duplicate quote slug

- **WHEN** a quote with existing slug is processed
- **THEN** the system SHALL allow SQLite UNIQUE constraint on slug to prevent duplicate in D1
- **AND** log the duplicate attempt
- **AND** continue processing other messages

### Requirement: Idempotent Ingestion

The system SHALL support idempotent re-ingestion of quotes data without causing data corruption or duplicates.

#### Scenario: Re-running full ingestion

- **WHEN** /quotes/ingest is called multiple times
- **THEN** each call SHALL queue all quote messages again
- **AND** queue processing SHALL handle duplicate slugs gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly one record per unique quote slug

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** quote ids SHALL be deterministic (computed by upload API from data hash)
- **AND** re-ingestion SHALL result in same id and slug values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for quotes data to enable predictable storage and retrieval.

#### Scenario: Quote file naming

- **WHEN** storing or retrieving quote JSON
- **THEN** R2 key format SHALL be `quotes/sha256_{hash}.json`
- **AND** {hash} SHALL match the id field in the envelope (without `sha256:` prefix)

### Requirement: Temporal Query Optimization

The system SHALL structure D1 schema to enable fast temporal filtering queries on quote metadata without scanning date strings or text.

#### Scenario: Filter by date added timestamp

- **WHEN** querying quotes added in a specific date range
- **THEN** query SHALL use dateAdded timestamp field
- **AND** NOT require date string field

#### Scenario: Filter by year and month

- **WHEN** querying quotes added in a specific year or month
- **THEN** query SHALL use year and month fields (indexed)
- **AND** return list of quotes without fetching text

#### Scenario: Filter by author

- **WHEN** querying quotes by a specific author
- **THEN** query SHALL use author field
- **AND** support filtering like "Shakespeare quotes about power"

#### Scenario: Derive date string from timestamp

- **WHEN** displaying a quote date
- **THEN** the system SHALL derive YYYY-MM-DD format from dateAdded timestamp
- **OR** fetch date string from R2 JSON if needed
