# Podcast Admin Interface Specification

## ADDED Requirements

### Requirement: Admin Access Protection
The admin interface SHALL be protected by Cloudflare Access.

#### Scenario: Access control
- **WHEN** user navigates to `/admin/podcasts/*` routes
- **THEN** Cloudflare Access challenges for authentication
- **AND** only authorized users can access admin pages

#### Scenario: Unauthorized access
- **WHEN** unauthenticated user attempts access
- **THEN** Cloudflare Access redirects to login
- **AND** returns to requested page after successful auth

### Requirement: Shows Management UI
The admin interface SHALL provide CRUD operations for podcast shows.

#### Scenario: List shows
- **WHEN** user visits `/admin/podcasts/shows`
- **THEN** display table of all shows with name, title, episode count
- **AND** provide "Create Show" button
- **AND** provide edit/delete actions per show

#### Scenario: Create show form
- **WHEN** user clicks "Create Show"
- **THEN** display form with fields: name, title, description, author, category
- **AND** validate required fields (name, title, author)
- **AND** POST to `/api/podcasts/shows` on submit
- **AND** redirect to show detail on success

#### Scenario: Edit show
- **WHEN** user clicks edit on show
- **THEN** display pre-filled form with current values
- **AND** PATCH to `/api/podcasts/shows/{id}` on submit

#### Scenario: Delete show
- **WHEN** user clicks delete on empty show
- **THEN** prompt for confirmation
- **AND** DELETE to `/api/podcasts/shows/{id}` on confirm

#### Scenario: Delete show with episodes
- **WHEN** attempting to delete show with episodes
- **THEN** show error message that episodes must be deleted first

### Requirement: Episodes Management UI
The admin interface SHALL provide CRUD operations for podcast episodes.

#### Scenario: List episodes for show
- **WHEN** user visits `/admin/podcasts/shows/{showId}/episodes`
- **THEN** display table of episodes with title, publishDate, duration, fileSize
- **AND** sort by publishDate descending (newest first)
- **AND** provide "Upload Episode" button
- **AND** provide edit/delete actions per episode

#### Scenario: Upload episode form
- **WHEN** user clicks "Upload Episode"
- **THEN** display form with file upload and fields: title, description, publishDate, showId
- **AND** validate file type (audio/mpeg, audio/mp4, audio/x-m4a)
- **AND** show upload progress during file transfer
- **AND** POST multipart/form-data to `/api/podcasts/episodes`
- **AND** redirect to episode list on success

#### Scenario: Edit episode metadata
- **WHEN** user clicks edit on episode
- **THEN** display form with current metadata (no audio re-upload)
- **AND** PATCH to `/api/podcasts/episodes/{id}` on submit
- **AND** update episode list view on success

#### Scenario: Delete episode
- **WHEN** user clicks delete on episode
- **THEN** prompt for confirmation with episode title
- **AND** DELETE to `/api/podcasts/episodes/{id}` on confirm
- **AND** remove from list on success

#### Scenario: Audio playback preview
- **WHEN** viewing episode in list
- **THEN** provide inline audio player for preview
- **AND** use `/api/podcasts/episodes/{id}/audio` as source

### Requirement: Feed URLs Management UI
The admin interface SHALL provide management for RSS feed URLs.

#### Scenario: List feed URLs
- **WHEN** user visits `/admin/podcasts/feeds`
- **THEN** display table of feeds with recipientName, showName, feedURL, createdAt
- **AND** provide "Create Feed" button
- **AND** provide copy-to-clipboard action for feed URLs
- **AND** provide delete action per feed

#### Scenario: Create feed form
- **WHEN** user clicks "Create Feed"
- **THEN** display form with fields: showId (dropdown), recipientName
- **AND** validate required fields
- **AND** POST to `/api/podcasts/feeds` on submit
- **AND** display generated feed URL on success

#### Scenario: Copy feed URL
- **WHEN** user clicks copy icon next to feed URL
- **THEN** copy full URL to clipboard
- **AND** show brief confirmation message

#### Scenario: Delete feed URL
- **WHEN** user clicks delete on feed
- **THEN** prompt for confirmation with recipient name
- **AND** DELETE to `/api/podcasts/feeds/{uuid}` on confirm
- **AND** remove from list on success

### Requirement: Admin Navigation
The admin interface SHALL provide navigation between podcast management views.

#### Scenario: Navigation menu
- **WHEN** user is on any `/admin/podcasts/*` page
- **THEN** display navigation with links to Shows, Episodes (all), and Feeds
- **AND** highlight current section

#### Scenario: Breadcrumbs
- **WHEN** user is viewing nested pages (e.g., show → episodes)
- **THEN** display breadcrumb trail
- **AND** allow navigation back to parent views

### Requirement: Error Handling
The admin interface SHALL display user-friendly error messages.

#### Scenario: API error response
- **WHEN** API request fails with error
- **THEN** display error message from API response
- **AND** preserve form data for retry

#### Scenario: Network error
- **WHEN** network request fails
- **THEN** display generic "Unable to connect" message
- **AND** provide retry button

#### Scenario: Validation errors
- **WHEN** form submission has validation errors
- **THEN** highlight invalid fields
- **AND** display inline error messages
- **AND** prevent form submission

### Requirement: Responsive Design
The admin interface SHALL be usable on desktop and tablet devices.

#### Scenario: Desktop layout
- **WHEN** viewing on desktop (>1024px width)
- **THEN** display full table layouts with all columns
- **AND** use multi-column forms

#### Scenario: Tablet layout
- **WHEN** viewing on tablet (768px-1024px width)
- **THEN** adjust table columns to essential fields
- **AND** stack form fields appropriately
