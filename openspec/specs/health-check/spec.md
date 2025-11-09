# health-check Specification

## Purpose

Provides a simple unauthenticated HTTP endpoint to verify the API worker is running and responsive.

## Requirements

### Requirement: Health Check Endpoint

The system SHALL provide an unauthenticated HTTP endpoint to verify service availability.

#### Scenario: Successful health check

- **WHEN** a GET request is made to /health
- **THEN** the system SHALL return 200 OK status
- **AND** response SHALL contain JSON with `ok: true` field
- **AND** response SHALL contain JSON with `ts` field set to current Unix timestamp in milliseconds
- **AND** Content-Type SHALL be `application/json; charset=utf-8`

#### Scenario: No authentication required

- **WHEN** /health endpoint is called without Authorization header
- **THEN** the system SHALL return successful response
- **AND** SHALL NOT require AUTH_TOKEN validation

#### Scenario: Response format

- **WHEN** /health returns successfully
- **THEN** response body SHALL match format: `{"ok": true, "ts": 1234567890123}`
- **AND** ts value SHALL be current server time in milliseconds since Unix epoch
