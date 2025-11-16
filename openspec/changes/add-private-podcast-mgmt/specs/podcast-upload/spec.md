# Podcast Upload Specification

## ADDED Requirements

### Requirement: Episode Upload
The system SHALL provide an authenticated API endpoint to upload podcast audio files with metadata.

#### Scenario: Successful episode upload
- **WHEN** authenticated user POSTs audio file with metadata (title, description, publishDate, showId)
- **THEN** audio file stored in R2 bucket `sr-podcast` with unguessable key
- **AND** episode record created in D1 `podcast_episodes` table
- **AND** JSON metadata written to `sr-json/podcasts/{episodeId}.json`
- **AND** response includes episode ID and R2 key

#### Scenario: Missing required fields
- **WHEN** upload request missing title or showId
- **THEN** return 400 Bad Request with validation errors

#### Scenario: Invalid audio format
- **WHEN** uploaded file is not audio/mpeg, audio/mp4, or audio/x-m4a
- **THEN** return 400 Bad Request with unsupported format error

#### Scenario: Unauthenticated upload attempt
- **WHEN** request lacks valid AUTH_TOKEN
- **THEN** return 401 Unauthorized

### Requirement: Episode Metadata Update
The system SHALL allow updating episode metadata without re-uploading audio.

#### Scenario: Update episode details
- **WHEN** authenticated PATCH request to `/api/podcasts/episodes/{id}` with new metadata
- **THEN** update D1 record and R2 JSON file
- **AND** preserve original audio file and R2 key
- **AND** update `updatedAt` timestamp

#### Scenario: Update non-existent episode
- **WHEN** PATCH request for invalid episode ID
- **THEN** return 404 Not Found

### Requirement: Episode Deletion
The system SHALL support hard deletion of podcast episodes.

#### Scenario: Delete episode
- **WHEN** authenticated DELETE request to `/api/podcasts/episodes/{id}`
- **THEN** remove episode from D1 table
- **AND** delete audio file from R2
- **AND** delete JSON metadata from R2
- **AND** return 204 No Content

#### Scenario: Delete episode in use
- **WHEN** deleting episode referenced by active RSS feeds
- **THEN** remove episode (feed will exclude it on next generation)

### Requirement: Episode Listing
The system SHALL provide paginated episode listing per show.

#### Scenario: List episodes for show
- **WHEN** authenticated GET request to `/api/podcasts/shows/{showId}/episodes`
- **THEN** return episodes ordered by publishDate descending
- **AND** include episode metadata (id, title, description, publishDate, duration, fileSize)
- **AND** support pagination via offset/limit query parameters

#### Scenario: List all episodes
- **WHEN** authenticated GET request to `/api/podcasts/episodes` without showId filter
- **THEN** return all episodes across all shows

### Requirement: Show Management
The system SHALL support creating and managing podcast shows.

#### Scenario: Create show
- **WHEN** authenticated POST to `/api/podcasts/shows` with name, title, description, author
- **THEN** create show record in D1 `podcast_shows` table
- **AND** return show ID and metadata

#### Scenario: List shows
- **WHEN** authenticated GET request to `/api/podcasts/shows`
- **THEN** return all shows with episode counts

#### Scenario: Delete show
- **WHEN** authenticated DELETE request to `/api/podcasts/shows/{id}`
- **THEN** return 400 if show has episodes
- **AND** return 204 if show is empty

### Requirement: Audio File Storage
The system SHALL store audio files in R2 with unguessable keys and metadata headers.

#### Scenario: Generate storage key
- **WHEN** uploading new episode
- **THEN** generate R2 key as `podcasts/{showId}/{uuid}.{ext}`
- **AND** ensure UUID v4 for unpredictability

#### Scenario: Store custom metadata
- **WHEN** writing audio to R2
- **THEN** set custom metadata headers (episodeId, showId, uploadedAt, contentType)
- **AND** set appropriate Content-Type for audio format
