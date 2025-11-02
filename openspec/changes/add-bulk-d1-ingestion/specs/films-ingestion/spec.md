# Films Ingestion Capability

## ADDED Requirements

### Requirement: Hot/Cold Storage Schema

The system SHALL maintain film viewing data using a hot/cold storage architecture where D1 stores minimal metadata for temporal filtering and R2 stores complete film details.

#### Scenario: Minimal metadata storage in D1

- **WHEN** a film viewing record is ingested from wrapped JSON
- **THEN** D1 SHALL store only: id, year, yearWatched, dateWatched, month, slug, rewatch, rewatchCount, publish, tmdbId, letterboxdId, r2Key, createdAt, updatedAt
- **AND** D1 SHALL NOT store: title, date, posterUrl, letterboxdUri

#### Scenario: Full content in R2

- **WHEN** a film viewing record is ingested
- **THEN** R2 SHALL store complete wrapped JSON with type, id, and data containing all fields including title, date, posterUrl, letterboxdUri
- **AND** the R2 object key SHALL match the file path pattern `sha256_{hash}.json`

#### Scenario: Title retrieval from R2

- **WHEN** displaying film titles
- **THEN** the system SHALL fetch title from R2 JSON data object
- **OR** the system MAY use slug as a fallback identifier

### Requirement: Films Ingestion Endpoints

The system SHALL provide authenticated HTTP endpoints to trigger bulk or single-file ingestion of films data from R2.

#### Scenario: Successful bulk ingestion

- **WHEN** an authenticated POST request is made to /ingest/films/all
- **THEN** the system SHALL list all objects in SR_JSON bucket
- **AND** the system SHALL read each object's envelope to filter by type "films"
- **AND** the system SHALL send one queue message per film file
- **AND** the response SHALL return JSON with count of messages queued

#### Scenario: Successful single-file ingestion

- **WHEN** an authenticated POST request is made to /ingest/films/{objectKey}
- **THEN** the system SHALL send a queue message for the specified objectKey
- **AND** the response SHALL return JSON with queued: 1 and the objectKey

#### Scenario: Authentication required

- **WHEN** POST /ingest/films/* is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: Invalid type parameter

- **WHEN** POST /ingest/{invalidType}/all is called
- **THEN** the system SHALL return 400 Bad Request with error message
- **AND** no queue messages SHALL be sent

#### Scenario: R2 listing failure

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error message
- **AND** no queue messages SHALL be sent

### Requirement: Films Queue Processing

The system SHALL process film queue messages by validating wrapped JSON structure and inserting to D1.

#### Scenario: Valid film ingestion from wrapped JSON

- **WHEN** a queue message with objectKey `sha256_{hash}.json` is received
- **THEN** the system SHALL fetch wrapped JSON from R2
- **AND** unwrap to extract type, id, and data fields
- **AND** validate type equals "films"
- **AND** validate required fields in data: year, year_watched, date_watched, month, slug
- **AND** insert record to films table with only: id (from envelope), year, yearWatched, dateWatched, month, slug, rewatch, rewatchCount, publish, tmdbId, letterboxdId, r2Key
- **AND** mark message as successfully processed

#### Scenario: Missing required field in data

- **WHEN** a film JSON data object is missing a required field
- **THEN** the system SHALL log validation error with field name
- **AND** NOT insert record to D1
- **AND** mark message as failed

#### Scenario: Duplicate film slug

- **WHEN** a film with existing slug is processed
- **THEN** the system SHALL allow SQLite UNIQUE constraint on slug to prevent duplicate in D1
- **AND** log the duplicate attempt
- **AND** continue processing other messages

### Requirement: Idempotent Ingestion

The system SHALL support idempotent re-ingestion of films data without causing data corruption or duplicates.

#### Scenario: Re-running full ingestion

- **WHEN** /films/ingest is called multiple times
- **THEN** each call SHALL queue all film messages again
- **AND** queue processing SHALL handle duplicate slugs gracefully via UNIQUE constraint
- **AND** final D1 state SHALL contain exactly one record per unique film slug

#### Scenario: Deterministic IDs

- **WHEN** the same source data is processed
- **THEN** film ids SHALL be deterministic (computed by upload API from data hash)
- **AND** re-ingestion SHALL result in same id and slug values

### Requirement: R2 Object Key Format

The system SHALL use consistent R2 object key formats for films data to enable predictable storage and retrieval.

#### Scenario: Film file naming

- **WHEN** storing or retrieving film JSON
- **THEN** R2 key format SHALL be `sha256_{hash}.json` (content-addressable at bucket root)
- **AND** {hash} SHALL match the id field in the envelope (without `sha256:` prefix)
- **AND** content type SHALL be determined by envelope `type` field, not object key path

### Requirement: Derived URL Generation

The system SHALL derive external URLs from stored IDs instead of storing full URL strings in D1.

#### Scenario: Letterboxd URI derivation

- **WHEN** displaying a Letterboxd link
- **THEN** the system SHALL derive URI as `https://boxd.it/{letterboxdId}`
- **AND** NOT store full letterboxdUri in D1

#### Scenario: TMDB poster URL derivation

- **WHEN** displaying a film poster
- **THEN** the system MAY fetch poster_url from R2 JSON data object
- **OR** the system MAY derive URL from TMDB API using tmdbId

### Requirement: Temporal Query Optimization

The system SHALL structure D1 schema to enable fast temporal filtering queries on film viewing metadata without scanning date/time strings or titles.

#### Scenario: Filter by watch timestamp

- **WHEN** querying films watched in a specific date range
- **THEN** query SHALL use dateWatched timestamp field
- **AND** NOT require date string field

#### Scenario: Filter by year watched

- **WHEN** querying films watched in a specific year
- **THEN** query SHALL use yearWatched field (indexed)
- **AND** return list of films without fetching titles

#### Scenario: Filter by release year

- **WHEN** querying films released in a specific year
- **THEN** query SHALL use year field
- **AND** support filtering like "2023 releases I watched"

#### Scenario: Filter by rewatches

- **WHEN** querying films that were rewatched
- **THEN** query SHALL use rewatch boolean field
- **AND** support sorting by rewatchCount for most-rewatched films

#### Scenario: Derive date string from timestamp

- **WHEN** displaying a film watch date
- **THEN** the system SHALL derive YYYY-MM-DD format from dateWatched timestamp
- **OR** fetch date string from R2 JSON if needed
