# Chatter Ingestion Capability - Image Reference Migration

## ADDED Requirements

### Requirement: Image Metadata Preservation

The system SHALL accept and preserve an optional `image_metadata` field in chatter JSON files to maintain historical records of original image filenames after migration to stable IDs.

#### Scenario: Chatter with image metadata

- **WHEN** a chatter JSON contains both `images` array with SIDs and `image_metadata` object
- **THEN** the system SHALL store the complete JSON in R2 including `image_metadata`
- **AND** the system SHALL NOT validate or index `image_metadata` to D1 (R2-only field)

#### Scenario: Image metadata structure

- **WHEN** `image_metadata` field is present
- **THEN** it SHALL be an object with SID keys mapping to metadata objects
- **AND** each metadata object MAY contain `original_filename` string field
- **AND** validator SHALL accept any structure (no strict validation required)

#### Scenario: Optional image metadata

- **WHEN** a chatter JSON has `images` array but no `image_metadata` field
- **THEN** validation SHALL succeed (field is optional)
- **AND** processing SHALL continue normally

#### Scenario: Historical reference preservation

- **WHEN** chatter is retrieved from R2 for display
- **THEN** `image_metadata` SHALL be available in the JSON response
- **AND** client MAY use original filenames for debugging or historical display

## MODIFIED Requirements

### Requirement: Full content in R2

The system SHALL store complete chatter JSON in R2 including all fields such as title, date, content, tags, images, and optional image_metadata.

#### Scenario: Full content in R2

- **WHEN** a chatter post is ingested
- **THEN** R2 SHALL store complete JSON with all fields including title, date, content, tags, images
- **AND** R2 SHALL also store optional `image_metadata` field if present
- **AND** the R2 object key SHALL match the file path pattern `chatter/{sha256_hash}.json` or `/chatter/{sha256_hash}.json`

#### Scenario: Title retrieval from R2

- **WHEN** displaying a chatter post list
- **THEN** the system MAY use slug for display
- **OR** the system MAY fetch title from R2 JSON for richer display
