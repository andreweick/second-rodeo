# Checkins Ingestion Capability

## ADDED Requirements

### Requirement: Hot/Cold Storage Schema

The system SHALL maintain checkins data using a hot/cold storage architecture where D1 stores minimal metadata for geospatial and temporal filtering and R2 stores complete venue and address details.

#### Scenario: Minimal metadata storage in D1

- **WHEN** a checkin is ingested from wrapped JSON
- **THEN** D1 SHALL store only: id, venueId, latitude, longitude, datetime, year, month, slug, publish, r2Key, createdAt, updatedAt
- **AND** D1 SHALL NOT store: venueName, foursquareUrl, formattedAddress, street, city, state, postalCode, country, neighborhood, date, time

#### Scenario: Full content in R2

- **WHEN** a checkin is ingested
- **THEN** R2 SHALL store complete wrapped JSON with type, id, and data containing all fields including venueName, address components, foursquareUrl
- **AND** the R2 object key SHALL match the file path pattern `checkins/sha256_{hash}.json`

#### Scenario: Venue name retrieval from R2

- **WHEN** displaying a checkin list
- **THEN** the system MAY group by venueId without fetching names
- **OR** the system MAY fetch venueName and address from R2 JSON data object for richer display

### Requirement: Bulk Checkins Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to trigger bulk ingestion of all checkin files from R2.

#### Scenario: Successful bulk ingestion trigger

- **WHEN** an authenticated POST request is made to /checkins/ingest
- **THEN** the system SHALL list all objects with R2 prefix `checkins/`
- **AND** the system SHALL send one queue message per checkin file
- **AND** the response SHALL return JSON with count of messages queued

#### Scenario: Authentication required

- **WHEN** POST /checkins/ingest is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: R2 listing failure

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error message
- **AND** no queue messages SHALL be sent

### Requirement: Checkins Queue Processing

The system SHALL process checkin queue messages by validating wrapped JSON structure and inserting minimal metadata to D1.

#### Scenario: Valid checkin ingestion from wrapped JSON

- **WHEN** a queue message with objectKey `checkins/sha256_{hash}.json` is received
- **THEN** the system SHALL fetch wrapped JSON from R2
- **AND** unwrap to extract type, id, and data fields
- **AND** validate type equals "checkins"
- **AND** validate required fields in data: venue_id, latitude, longitude, datetime, year, month, slug
- **AND** insert record to checkins table with only: id (from envelope), venueId, latitude, longitude, datetime, year, month, slug, publish, r2Key
- **AND** mark message as successfully processed

#### Scenario: Missing required field in data

- **WHEN** a checkin JSON data object is missing a required field
- **THEN** the system SHALL log validation error with field name
- **AND** NOT insert record to D1
- **AND** mark message as failed

#### Scenario: Duplicate checkin slug

- **WHEN** a checkin with existing slug is processed
- **THEN** the system SHALL allow SQLite UNIQUE constraint on slug to prevent duplicate
- **AND** log the duplicate attempt
- **AND** continue processing other messages

### Requirement: Idempotent Ingestion

The system SHALL support idempotent re-ingestion of checkins data without causing data corruption or duplicates.

#### Scenario: Re-running full ingestion

- **WHEN** /checkins/ingest is called multiple times
- **THEN** each call SHALL queue all checkin messages again
- **AND** queue processing SHALL handle duplicate slugs gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly one record per unique checkin slug

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** checkin ids SHALL be deterministic (computed by upload API from data hash)
- **AND** re-ingestion SHALL result in same id and slug values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for checkins data to enable predictable storage and retrieval.

#### Scenario: Checkin file naming

- **WHEN** storing or retrieving checkin JSON
- **THEN** R2 key format SHALL be `checkins/sha256_{hash}.json`
- **AND** {hash} SHALL match the id field in the envelope (without `sha256:` prefix)

### Requirement: Geospatial Query Optimization

The system SHALL structure D1 schema to enable efficient geospatial queries using latitude and longitude coordinates instead of text-based location fields.

#### Scenario: Filter by bounding box

- **WHEN** querying checkins within a geographic area
- **THEN** query SHALL use latitude and longitude fields with bounding box coordinates
- **AND** NOT require city, state, or country text fields

#### Scenario: Filter by venue

- **WHEN** querying all checkins at a specific venue
- **THEN** query SHALL use venueId field
- **AND** return list of checkins without fetching venue name from R2

#### Scenario: Sort by location distance

- **WHEN** sorting checkins by proximity to a point
- **THEN** query SHALL calculate distance using latitude and longitude fields
- **AND** derive city/state/country from R2 only when displaying details

### Requirement: Temporal Query Optimization

The system SHALL structure D1 schema to enable fast temporal filtering queries on checkins metadata without scanning date/time strings.

#### Scenario: Filter by timestamp

- **WHEN** querying checkins for a specific date range
- **THEN** query SHALL use datetime timestamp field
- **AND** NOT require date or time string fields

#### Scenario: Filter by year and month

- **WHEN** querying checkins by year or month
- **THEN** query SHALL use year and month fields (indexed)
- **AND** return list of checkins without fetching full details from R2

#### Scenario: Filter by publish status

- **WHEN** querying only published checkins
- **THEN** query SHALL use publish boolean field
- **AND** exclude unpublished records efficiently

#### Scenario: Derive date string from timestamp

- **WHEN** displaying a checkin date
- **THEN** the system SHALL derive YYYY-MM-DD format from datetime timestamp
- **OR** fetch date string from R2 JSON if needed
