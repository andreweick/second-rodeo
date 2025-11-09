# bulk-ingestion Specification

## Purpose

Provides authenticated HTTP endpoints to trigger paginated bulk ingestion or single-file ingestion of JSON content from R2 into D1 database via queue processing. The bulk ingestion endpoint uses self-paginating queue messages to process large R2 buckets without blocking or requiring multiple client requests.

## Requirements

### Requirement: Bulk Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to trigger paginated bulk ingestion of all R2 objects via queue processing with automatic self-pagination.

#### Scenario: Successful bulk ingestion initiation

- **WHEN** an authenticated POST request is made to /ingest/all
- **THEN** the system SHALL list up to 1000 objects from SR_JSON bucket
- **AND** the system SHALL queue file ingestion messages in batches of 100 using sendBatch()
- **AND** if more than 1000 objects exist, the system SHALL queue a pagination message with the cursor
- **AND** the response SHALL return 200 OK with JSON containing: `success: true`, `queued` (count), `hasMore` (boolean)
- **AND** the response message SHALL indicate "Pagination will continue automatically" if hasMore is true

#### Scenario: Self-paginating queue processing

- **WHEN** a queue message with type "pagination" is processed
- **THEN** the queue handler SHALL extract the cursor from the message body
- **AND** SHALL make an authenticated internal HTTP request to /ingest/all?cursor={cursor}
- **AND** the internal request SHALL use AUTH_TOKEN from Secrets Store
- **AND** the internal request SHALL trigger the next page of ingestion

#### Scenario: Pagination with cursor parameter

- **WHEN** POST /ingest/all?cursor={value} is called
- **THEN** the system SHALL list the next page of up to 1000 objects starting from cursor
- **AND** SHALL queue messages for all objects on this page
- **AND** SHALL queue another pagination message if hasMore is true
- **AND** the process SHALL repeat until all objects are queued

#### Scenario: Authentication required

- **WHEN** POST /ingest/all is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: R2 listing failure

- **WHEN** R2 list operation fails during bulk ingestion
- **THEN** the system SHALL return 500 status with error details
- **AND** no queue messages SHALL be sent

#### Scenario: Complete ingestion with single curl

- **WHEN** client calls POST /ingest/all once without cursor
- **THEN** the system SHALL automatically process all pages via pagination messages
- **AND** client SHALL NOT need to make additional requests
- **AND** queue SHALL handle pagination internally until all 50K+ files are queued

### Requirement: Single File Ingestion Endpoint

The system SHALL provide an authenticated HTTP endpoint to queue a specific R2 object for ingestion by its object key.

#### Scenario: Successful single file ingestion

- **WHEN** an authenticated POST request is made to /ingest/{objectKey}
- **THEN** the system SHALL extract objectKey from URL path (after /ingest/ prefix)
- **AND** the system SHALL send a queue message with body: `{objectKey: "{objectKey}"}`
- **AND** the response SHALL return 200 OK with JSON containing: `success: true`, `objectKey`, `message`

#### Scenario: Missing object key

- **WHEN** POST /ingest/ is called with empty objectKey
- **THEN** the system SHALL return 400 Bad Request
- **AND** error message SHALL indicate "Object key is required"

#### Scenario: Authentication required

- **WHEN** POST /ingest/{objectKey} is called without valid AUTH_TOKEN
- **THEN** the system SHALL return 401 Unauthorized status

#### Scenario: Queue send failure

- **WHEN** queue send operation fails
- **THEN** the system SHALL return 500 status with error details
- **AND** the error SHALL include the objectKey that failed

### Requirement: Queue Message Format

The system SHALL support two queue message types: file ingestion messages and pagination continuation messages.

#### Scenario: File ingestion message format

- **WHEN** queuing a file for ingestion
- **THEN** message body SHALL be: `{objectKey: "type/sha256_hash.json"}`
- **AND** message SHALL NOT include a type field
- **AND** queue handler SHALL process file from R2 and insert to D1

#### Scenario: Pagination message format

- **WHEN** queuing next pagination page
- **THEN** message body SHALL be: `{type: "pagination", cursor: "opaque_cursor_string"}`
- **AND** queue handler SHALL detect type="pagination"
- **AND** SHALL make internal HTTP request to trigger next page

#### Scenario: Queue message validation

- **WHEN** queue handler receives a message
- **THEN** SHALL validate message body is an object
- **AND** if body has type="pagination", SHALL process as pagination message
- **AND** if body has objectKey field, SHALL process as file ingestion
- **AND** if neither format matches, SHALL log error and skip message

### Requirement: Batch Size Limits

The system SHALL respect Cloudflare Queue batch size limits for reliable message delivery.

#### Scenario: R2 list page size

- **WHEN** listing objects from R2
- **THEN** the system SHALL use limit of 1000 objects per page
- **AND** SHALL use cursor-based pagination for additional pages

#### Scenario: Queue batch size

- **WHEN** sending messages to queue
- **THEN** the system SHALL split file messages into batches of 100
- **AND** SHALL call sendBatch() once per batch
- **AND** batches SHALL NOT exceed 100 messages (Cloudflare Queue limit)

#### Scenario: Queue consumer batch processing

- **WHEN** queue consumer receives a batch
- **THEN** batch MAY contain up to 100 messages
- **AND** consumer SHALL process each message sequentially
- **AND** SHALL continue processing remaining messages if one fails

### Requirement: Idempotent Ingestion

The system SHALL support idempotent re-ingestion without causing data corruption or duplicates.

#### Scenario: Re-running bulk ingestion

- **WHEN** /ingest/all is called multiple times
- **THEN** each call SHALL queue all objects again
- **AND** queue processing SHALL use onConflictDoNothing() for D1 inserts
- **AND** final D1 state SHALL contain exactly one record per unique content id
- **AND** no errors SHALL be raised for duplicate ingestion attempts

#### Scenario: Self-pagination idempotency

- **WHEN** pagination messages are processed multiple times
- **THEN** each SHALL trigger another page of file queuing
- **AND** duplicate file ingestion messages SHALL be handled gracefully by D1 constraints
- **AND** system SHALL NOT enter infinite pagination loops

### Requirement: Error Handling

The system SHALL provide clear error messages and continue processing on partial failures.

#### Scenario: Queue handler error logging

- **WHEN** processing a message fails
- **THEN** the system SHALL log error with message id and objectKey
- **AND** SHALL continue processing remaining messages in batch
- **AND** SHALL NOT throw exceptions that stop batch processing

#### Scenario: Pagination request failure

- **WHEN** internal pagination HTTP request fails
- **THEN** the system SHALL log error with status code and response text
- **AND** pagination message SHALL NOT be requeued (logged as failure)

#### Scenario: Invalid message structure

- **WHEN** queue message has invalid structure (missing objectKey and not pagination)
- **THEN** the system SHALL log error with message id and body
- **AND** SHALL skip the invalid message
- **AND** SHALL continue processing other messages

### Requirement: Authentication via Secrets Store

The system SHALL use Cloudflare Secrets Store for AUTH_TOKEN validation and internal requests.

#### Scenario: External request authentication

- **WHEN** validating external requests to /ingest endpoints
- **THEN** the system SHALL call await env.AUTH_TOKEN.get()
- **AND** SHALL compare bearer token from Authorization header
- **AND** SHALL return 401 if tokens do not match

#### Scenario: Internal pagination request authentication

- **WHEN** queue handler makes internal pagination request
- **THEN** the system SHALL call await env.AUTH_TOKEN.get()
- **AND** SHALL include token in Authorization: Bearer {token} header
- **AND** SHALL use hardcoded API URL: https://api.missionfocus.workers.dev/ingest/all
