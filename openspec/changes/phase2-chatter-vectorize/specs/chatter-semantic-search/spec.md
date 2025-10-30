# Chatter Semantic Search Capability

## ADDED Requirements

### Requirement: Vectorize Integration for Chatter Posts

The system SHALL integrate Cloudflare Vectorize for semantic chatter post search.

#### Scenario: Embedding generation

- **WHEN** a chatter post is ingested via queue (post-phase1)
- **THEN** the system SHALL generate 768-dim embedding from title+content
- **AND** upsert to Vectorize with metadata: post_id, year, month, slug

#### Scenario: Backfill existing posts

- **WHEN** POST /chatter/vectorize/backfill is called
- **THEN** the system SHALL process all 8,006 existing posts
- **AND** generate embeddings and upsert to Vectorize

### Requirement: Semantic Search for Posts

The system SHALL support semantic topic-based search for chatter posts.

#### Scenario: Topic search

- **WHEN** user searches "posts about technology"
- **THEN** Vectorize SHALL return semantically related posts
- **AND** results SHALL be ranked by similarity

#### Scenario: Temporal filtering

- **WHEN** user searches with year/month filters
- **THEN** semantic results SHALL be filtered by D1 date metadata
