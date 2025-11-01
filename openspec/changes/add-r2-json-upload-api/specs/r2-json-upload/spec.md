# R2 JSON Upload Capability

## ADDED Requirements

### Requirement: JSON Envelope Format

The system SHALL wrap uploaded JSON content in a standardized envelope containing type, id, and data fields.

#### Scenario: Server wraps client data

- **WHEN** client POSTs JSON to /upload with type and data fields
- **THEN** server SHALL compute SHA-256 hash of the data object
- **AND** server SHALL create wrapped JSON: `{type, id: "sha256:{hash}", data}`
- **AND** server SHALL store wrapped JSON to R2

#### Scenario: Hash computation

- **WHEN** computing content hash
- **THEN** server SHALL hash only the data object (not entire envelope)
- **AND** hash SHALL be SHA-256 in hex encoding (64 characters)
- **AND** id field SHALL have format `sha256:{hex_hash}`

### Requirement: Upload Endpoint

The system SHALL provide an authenticated HTTP endpoint to upload JSON content to R2 storage.

#### Scenario: Successful upload

- **WHEN** authenticated POST request to /upload with valid JSON
- **THEN** server SHALL validate type is non-empty string
- **AND** server SHALL validate data field exists
- **AND** server SHALL compute hash, wrap, and store to R2
- **AND** server SHALL return 200 with objectKey and id
- **AND** response format SHALL be `{objectKey: "{type}/sha256_{hash}.json", id: "sha256:{hash}"}`

#### Scenario: Authentication required

- **WHEN** POST /upload without valid AUTH_TOKEN
- **THEN** server SHALL return 401 Unauthorized

#### Scenario: Missing type field

- **WHEN** POST /upload without type field
- **THEN** server SHALL return 400 Bad Request
- **AND** error message SHALL indicate missing type

#### Scenario: Missing data field

- **WHEN** POST /upload without data field
- **THEN** server SHALL return 400 Bad Request
- **AND** error message SHALL indicate missing data

#### Scenario: Invalid JSON

- **WHEN** POST /upload with malformed JSON
- **THEN** server SHALL return 400 Bad Request
- **AND** error message SHALL indicate JSON parse error

#### Scenario: R2 storage failure

- **WHEN** R2 put operation fails
- **THEN** server SHALL return 500 Internal Server Error
- **AND** error message SHALL indicate storage failure

### Requirement: R2 Object Storage

The system SHALL store wrapped JSON to R2 with deterministic paths and integrity metadata.

#### Scenario: Object key format

- **WHEN** storing wrapped JSON to R2
- **THEN** object key SHALL be `{type}/sha256_{hash}.json`
- **AND** {hash} SHALL match the hex hash in id field
- **AND** {type} SHALL match the type field from request

#### Scenario: Metadata storage

- **WHEN** storing object to R2
- **THEN** server SHALL set custom metadata `x-amz-meta-sha256` with hex hash value
- **AND** metadata SHALL allow hash verification without downloading object

#### Scenario: Content-Type header

- **WHEN** storing object to R2
- **THEN** server SHALL set Content-Type to `application/json`

### Requirement: Type Validation

The system SHALL accept any non-empty string as a valid type without validation against an allowed list.

#### Scenario: Accept any type

- **WHEN** client uploads with type not in predefined list
- **THEN** server SHALL accept and process the upload
- **AND** server SHALL create R2 path with provided type

#### Scenario: Type format

- **WHEN** validating type field
- **THEN** server SHALL only require type is non-empty string
- **AND** server SHALL NOT enforce character restrictions
- **AND** server SHALL NOT validate against allowed type list

### Requirement: Deterministic Hashing

The system SHALL produce identical hashes for identical data payloads to enable deduplication.

#### Scenario: Same data produces same hash

- **WHEN** same data object uploaded multiple times
- **THEN** computed hash SHALL be identical
- **AND** objectKey SHALL be identical
- **AND** R2 object SHALL be overwritten (idempotent)

#### Scenario: Hash verification

- **WHEN** verifying stored object integrity
- **THEN** re-computing SHA-256 of data field SHALL match id hash
- **AND** x-amz-meta-sha256 SHALL match id hash

### Requirement: Error Handling

The system SHALL provide clear error messages for upload failures.

#### Scenario: Validation errors return details

- **WHEN** request validation fails
- **THEN** response SHALL include error field with descriptive message
- **AND** HTTP status code SHALL indicate error type (400, 401, 500)

#### Scenario: R2 errors are logged

- **WHEN** R2 operation fails
- **THEN** server SHALL log detailed error with objectKey
- **AND** response SHALL return generic error message (no internal details exposed)
