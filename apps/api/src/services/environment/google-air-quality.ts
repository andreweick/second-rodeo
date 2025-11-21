/**
 * Google Air Quality API service
 * Fetches current air quality index and pollutant levels
 */

import type { Env } from '../../types/env';
import type { ApiSnapshot_AirQuality, AirQualitySummary } from '../../types/chatter';
import mockAirQuality from '../../../test/fixtures/environment/mock-air-quality.json';

/**
 * Fetch air quality data from Google Air Quality API
 */
export async function fetchAirQuality(
	lat: number,
	lng: number,
	env: Env,
	useMock = false
): Promise<ApiSnapshot_AirQuality> {
	if (useMock) {
		return mockAirQuality as ApiSnapshot_AirQuality;
	}

	const apiKey = await env.GOOGLE_PLACES_API.get();
	if (!apiKey) {
		throw new Error('Google Places API key not configured');
	}

	const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			location: {
				latitude: lat,
				longitude: lng,
			},
			universalAqi: true,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Google Air Quality API error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();

	// Transform to our normalized format
	const summary: AirQualitySummary = {
		timestamp: new Date().toISOString(),
		aqi: data.indexes?.[0]?.aqi || undefined,
		aqi_scale: 'US EPA',
		aqi_category: data.indexes?.[0]?.category || undefined,
		dominant_pollutant: data.indexes?.[0]?.dominantPollutant || undefined,
		// Note: Google API may not return individual pollutant concentrations
		// These would need to be extracted from data.pollutants if available
	};

	return {
		captured_at: new Date().toISOString(),
		provider: {
			name: 'google',
			product: 'air_quality',
			version: 'v1',
		},
		summary,
		full: data,
	};
}
