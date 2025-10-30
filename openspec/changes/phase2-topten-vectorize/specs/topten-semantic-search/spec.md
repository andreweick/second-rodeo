# Top Ten Lists Semantic Search Capability

## ADDED Requirements

### Requirement: Vectorize Integration for List Search

The system SHALL integrate Cloudflare Vectorize for semantic top ten list search.

#### Scenario: Embedding generation

- **WHEN** a topten list is ingested via queue (post-phase1)
- **THEN** the system SHALL generate 768-dim embedding from title
- **AND** upsert to Vectorize with metadata: list_id, timestamp

#### Scenario: Backfill existing lists

- **WHEN** POST /topten/vectorize/backfill is called
- **THEN** the system SHALL process all 1,199 existing lists
- **AND** generate embeddings from titles

### Requirement: Semantic List Search

The system SHALL support semantic search for list topics and themes.

#### Scenario: Topic search

- **WHEN** user searches "sci-fi movies"
- **THEN** Vectorize SHALL return lists semantically related to science fiction films
- **AND** results SHALL be ranked by similarity

#### Scenario: Thematic discovery

- **WHEN** user searches by theme or concept
- **THEN** Vectorize SHALL find conceptually similar lists
- **AND** support cross-category discovery
