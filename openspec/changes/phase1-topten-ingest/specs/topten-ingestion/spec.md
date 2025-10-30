# Top Ten Lists Ingestion

## MODIFIED Requirements

### Requirement: Top Ten Lists Schema

The system SHALL store top ten list metadata in D1 using a minimal hot/cold storage schema.

#### Scenario: Minimal metadata stored in D1

- **WHEN** a top ten list is ingested
- **THEN** D1 SHALL store only: id, show, date, title, r2Key, createdAt, updatedAt
- **AND** D1 SHALL NOT store: items array, timestamp, year, month, slug, item_count, source_url, data_quality

#### Scenario: Full content stored in R2

- **WHEN** a top ten list is ingested
- **THEN** R2 SHALL store complete JSON with all fields including items array, timestamp, year, month, slug, item_count, source_url, and data_quality
- **AND** the R2 object key SHALL match the r2Key field in D1

#### Scenario: Year and month derivable from date

- **WHEN** querying for lists by year
- **THEN** the system SHALL use SQLite date function: `WHERE strftime('%Y', date) = '1990'`
- **AND** NOT require a separate year column

#### Scenario: Month filtering using date functions

- **WHEN** querying for lists by year-month
- **THEN** the system SHALL use SQLite date function: `WHERE strftime('%Y-%m', date) = '1990-05'`
- **AND** NOT require a separate month column

## ADDED Requirements

### Requirement: Hot/Cold Storage Architecture

The system SHALL maintain top ten list data using a hot/cold storage architecture where D1 stores minimal metadata for filtering and R2 stores complete content.

#### Scenario: D1 enables filtering without R2 fetch

- **WHEN** listing top ten lists with filters
- **THEN** D1 SHALL provide id, show, date, and title for display
- **AND** no R2 fetch SHALL be required for list views

#### Scenario: R2 fetch required for full content

- **WHEN** displaying a specific top ten list
- **THEN** the system SHALL fetch the complete JSON from R2 using r2Key
- **AND** the JSON SHALL include the items array and all metadata

#### Scenario: Fast filtering by show

- **WHEN** filtering lists by show name
- **THEN** D1 query SHALL use: `WHERE show = 'Late Night with David Letterman'`
- **AND** return results without R2 fetches

### Requirement: Bulk Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to trigger bulk ingestion of all top ten list files from R2.

#### Scenario: Authenticated bulk ingestion

- **WHEN** an authenticated POST request is made to /topten/ingest
- **THEN** the system SHALL list all objects with R2 prefix `sr-json/topten/`
- **AND** filter for .json files only
- **AND** send one queue message per file
- **AND** return JSON with count of messages queued

#### Scenario: Authentication required

- **WHEN** POST /topten/ingest is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: R2 listing error handling

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error message
- **AND** no queue messages SHALL be sent

### Requirement: Queue Message Processing

The system SHALL process top ten list queue messages by validating JSON structure and inserting minimal metadata to D1.

#### Scenario: Successful ingestion

- **WHEN** a queue message with objectKey `sr-json/topten/sha256_{hash}.json` is received
- **THEN** the system SHALL fetch JSON from R2
- **AND** validate required fields: id, show, date, title
- **AND** insert record to topten table with r2Key set to objectKey
- **AND** mark message as successfully processed

#### Scenario: Missing required field

- **WHEN** a list JSON is missing a required field (id, show, date, or title)
- **THEN** the system SHALL log validation error with field name
- **AND** NOT insert record to D1
- **AND** mark message as failed

#### Scenario: Duplicate ID handling

- **WHEN** a list with existing id is processed
- **THEN** the system SHALL attempt INSERT
- **AND** SQLite UNIQUE constraint SHALL prevent duplicate
- **AND** the system SHALL log the duplicate attempt
- **AND** continue processing other messages

#### Scenario: R2 fetch failure

- **WHEN** fetching JSON from R2 fails
- **THEN** the system SHALL log error with objectKey
- **AND** mark message as failed for retry

### Requirement: Idempotent Re-Ingestion

The system SHALL support idempotent re-ingestion of top ten lists without causing data corruption or duplicates.

#### Scenario: Safe re-ingestion

- **WHEN** /topten/ingest is called multiple times
- **THEN** each call SHALL queue all messages again
- **AND** queue processing SHALL handle duplicate ids gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly 1,199 list records

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** list ids SHALL be deterministic (content-based SHA256)
- **AND** re-ingestion SHALL result in same id values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for top ten list data to enable predictable storage and retrieval.

#### Scenario: Flat file structure

- **WHEN** storing or retrieving list JSON
- **THEN** R2 key format SHALL be `sr-json/topten/sha256_{hash}.json`
- **AND** {hash} SHALL match the id field in the JSON (without 'sha256:' prefix)

#### Scenario: Direct path computation

- **WHEN** computing R2 path from list id
- **THEN** the system SHALL use: `sr-json/topten/${id.replace('sha256:', 'sha256_')}.json`
- **AND** no additional lookups SHALL be required

### Requirement: Filtering Query Optimization

The system SHALL structure D1 schema and queries to enable fast filtering on top ten list metadata without scanning large fields or fetching from R2.

#### Scenario: Filter by date range

- **WHEN** querying lists for a specific date range
- **THEN** query SHALL use: `WHERE date >= '1990-01-01' AND date < '1991-01-01'`
- **AND** NOT require R2 fetches
- **AND** return results in under 100ms for 1,199 records

#### Scenario: Filter by year using date function

- **WHEN** querying all lists for a specific year
- **THEN** query SHALL use: `WHERE strftime('%Y', date) = '1990'`
- **OR** use range query: `WHERE date >= '1990-01-01' AND date < '1991-01-01'`

#### Scenario: Sort by date

- **WHEN** sorting lists chronologically
- **THEN** query SHALL use: `ORDER BY date DESC`
- **AND** return sorted results without R2 fetches

### Requirement: Validation Logic

The system SHALL validate top ten list JSON structure before inserting to D1 to ensure data integrity.

#### Scenario: Required field validation

- **WHEN** validating list JSON
- **THEN** the system SHALL require fields: id, show, date, title
- **AND** throw error if any required field is missing

#### Scenario: Field type validation

- **WHEN** validating field types
- **THEN** id SHALL be string starting with 'sha256:'
- **AND** show SHALL be non-empty string
- **AND** date SHALL be string in YYYY-MM-DD format
- **AND** title SHALL be non-empty string

#### Scenario: Optional field handling

- **WHEN** validating list JSON
- **THEN** items, source_url, and data_quality SHALL be optional
- **AND** missing optional fields SHALL NOT cause validation failure

### Requirement: Test Coverage

The system SHALL provide comprehensive test coverage for top ten list ingestion functionality.

#### Scenario: Unit tests for validation

- **WHEN** running unit tests
- **THEN** tests SHALL verify valid JSON passes validation
- **AND** tests SHALL verify missing required fields throw errors
- **AND** tests SHALL verify field type validation
- **AND** tests SHALL verify camelCase field mapping

#### Scenario: Integration tests for HTTP endpoint

- **WHEN** running integration tests
- **THEN** tests SHALL verify authentication requirement
- **AND** tests SHALL verify R2 listing and message queueing
- **AND** tests SHALL verify response format
- **AND** tests SHALL verify error handling

#### Scenario: Integration tests for queue processing

- **WHEN** running integration tests
- **THEN** tests SHALL verify successful insertion to D1
- **AND** tests SHALL verify duplicate ID handling
- **AND** tests SHALL verify validation error handling
- **AND** tests SHALL verify R2 fetch failure handling
