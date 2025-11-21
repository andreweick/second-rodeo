/**
 * Google Elevation API service
 * Fetches elevation data for coordinates
 */

import type { Env } from '../../types/env';
import type { ApiSnapshot_Elevation, ElevationSummary } from '../../types/post';
import mockElevation from '../../../test/fixtures/environment/mock-elevation.json';

/**
 * Fetch elevation data from Google Elevation API
 */
export async function fetchElevation(
	lat: number,
	lng: number,
	env: Env,
	useMock = false
): Promise<ApiSnapshot_Elevation> {
	if (useMock) {
		return mockElevation as ApiSnapshot_Elevation;
	}

	const apiKey = await env.GOOGLE_PLACES_API.get();
	if (!apiKey) {
		throw new Error('Google Places API key not configured');
	}

	const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lng}&key=${apiKey}`;

	const response = await fetch(url);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Google Elevation API error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();

	if (!data.results || data.results.length === 0) {
		throw new Error('No elevation results found');
	}

	const result = data.results[0];
	const elevationMeters = result.elevation;

	// Convert to feet
	const elevationFeet = Math.round(elevationMeters * 3.28084);

	const summary: ElevationSummary = {
		lat,
		lng,
		elevation_ft: elevationFeet,
	};

	return {
		captured_at: new Date().toISOString(),
		provider: {
			name: 'google',
			product: 'elevation',
			version: 'v1',
		},
		summary,
		full: data,
	};
}
