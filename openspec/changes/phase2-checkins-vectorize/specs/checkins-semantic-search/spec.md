# Checkins Semantic Search Capability

## ADDED Requirements

### Requirement: Vectorize Integration for Venue Search

The system SHALL integrate Cloudflare Vectorize for semantic venue name search.

#### Scenario: Embedding generation

- **WHEN** a checkin is ingested via queue (post-phase1)
- **THEN** the system SHALL generate 768-dim embedding from venueName
- **AND** upsert to Vectorize with metadata: checkin_id, venueId, lat, long, datetime

#### Scenario: Backfill existing checkins

- **WHEN** POST /checkins/vectorize/backfill is called
- **THEN** the system SHALL process all 2,607 existing checkins
- **AND** generate embeddings from venue names

### Requirement: Semantic Venue Search

The system SHALL support semantic search for venue types and locations.

#### Scenario: Venue type search

- **WHEN** user searches "coffee shops"
- **THEN** Vectorize SHALL return venues semantically related to coffee shops
- **AND** results MAY be filtered by lat/long bounding box in D1

#### Scenario: Location-scoped search

- **WHEN** user searches with lat/long bounds
- **THEN** semantic results SHALL be filtered by geographic location
- **AND** results SHALL include distance from center point
