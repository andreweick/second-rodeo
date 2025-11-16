# Podcast RSS Feed Specification

## ADDED Requirements

### Requirement: RSS Feed URL Management
The system SHALL store unguessable RSS feed URLs in Workers KV with metadata.

#### Scenario: Create new feed URL
- **WHEN** authenticated POST to `/api/podcasts/feeds` with showId and recipientName
- **THEN** generate UUID v4 as feed ID
- **AND** store in KV with key `podcast:feed:{uuid}` → {showId, recipientName, createdAt}
- **AND** return feed URL `https://domain.com/rss/podcast/{uuid}.xml`

#### Scenario: List feed URLs
- **WHEN** authenticated GET to `/api/podcasts/feeds`
- **THEN** return all feed IDs with metadata (uuid, showId, recipientName, createdAt)
- **AND** include full RSS URL for each feed

#### Scenario: Delete feed URL
- **WHEN** authenticated DELETE to `/api/podcasts/feeds/{uuid}`
- **THEN** remove from Workers KV
- **AND** return 204 No Content
- **AND** feed URL becomes 404 for future requests

#### Scenario: Feed URL collision
- **WHEN** UUID collision detected (extremely rare)
- **THEN** regenerate new UUID and retry

### Requirement: RSS Feed Generation
The system SHALL generate valid podcast RSS XML conforming to Apple Podcasts and RSS 2.0 standards.

#### Scenario: Generate RSS feed
- **WHEN** GET request to `/rss/podcast/{uuid}.xml`
- **THEN** lookup showId from KV using uuid
- **AND** fetch episodes from D1 for that show ordered by publishDate descending
- **AND** generate RSS 2.0 XML with iTunes podcast tags
- **AND** return with Content-Type `application/rss+xml`

#### Scenario: Feed not found
- **WHEN** GET request with invalid or deleted uuid
- **THEN** return 404 Not Found

#### Scenario: Empty show
- **WHEN** show has zero episodes
- **THEN** return valid RSS with channel metadata but no items

### Requirement: RSS Channel Metadata
The system SHALL populate RSS channel elements from show record.

#### Scenario: Channel elements
- **WHEN** generating RSS feed
- **THEN** include `<title>` from show.title
- **AND** include `<description>` from show.description
- **AND** include `<itunes:author>` from show.author
- **AND** include `<language>en-us` (default)
- **AND** include `<link>` to feed URL
- **AND** set `<lastBuildDate>` to current timestamp

#### Scenario: iTunes-specific tags
- **WHEN** generating RSS feed
- **THEN** include `<itunes:explicit>false` (default)
- **AND** include `<itunes:type>episodic` (default)
- **AND** include `<itunes:category>` if configured in show

### Requirement: RSS Episode Items
The system SHALL populate episode items with metadata and audio enclosures.

#### Scenario: Episode item structure
- **WHEN** including episode in RSS feed
- **THEN** include `<title>` from episode.title
- **AND** include `<description>` from episode.description
- **AND** include `<pubDate>` from episode.publishDate in RFC 2822 format
- **AND** include `<guid>` as episode.id (isPermaLink=false)

#### Scenario: Audio enclosure
- **WHEN** including episode in RSS feed
- **THEN** include `<enclosure>` with url to audio file
- **AND** set enclosure `url` as `https://domain.com/api/podcasts/episodes/{id}/audio`
- **AND** set enclosure `length` from episode.fileSize
- **AND** set enclosure `type` from episode.mimeType

#### Scenario: iTunes episode tags
- **WHEN** including episode in RSS feed
- **THEN** include `<itunes:duration>` from episode.duration in seconds
- **AND** include `<itunes:explicit>false` (default)
- **AND** include `<itunes:episodeType>full` (default)

### Requirement: Audio File Serving
The system SHALL serve audio files via episode-specific URLs without exposing R2 keys.

#### Scenario: Serve episode audio
- **WHEN** GET request to `/api/podcasts/episodes/{id}/audio`
- **THEN** lookup episode in D1 to get r2Key
- **AND** stream audio from R2 using r2Key
- **AND** set appropriate Content-Type and Content-Length headers
- **AND** support HTTP range requests for seeking

#### Scenario: Audio not found
- **WHEN** episode ID invalid or audio file missing from R2
- **THEN** return 404 Not Found

#### Scenario: Range request support
- **WHEN** client sends Range header for partial content
- **THEN** return 206 Partial Content with requested byte range
- **AND** set Content-Range header appropriately

### Requirement: Anti-Indexing
The system SHALL prevent search engine and AI crawler indexing of RSS feeds.

#### Scenario: Robots meta tag
- **WHEN** serving RSS XML
- **THEN** include `<?xml-stylesheet>` with noindex directive if applicable to XML
- **AND** rely on robots.txt disallow rules for `/rss/podcast/*`

#### Scenario: No sitemap inclusion
- **WHEN** feed URLs are generated
- **THEN** never include feed URLs in sitemaps
- **AND** never link to feeds from public pages
