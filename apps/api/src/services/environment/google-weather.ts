/**
 * Google Weather API service
 * Fetches current weather conditions
 */

import type { Env } from '../../types/env';
import type { ApiSnapshot_Weather, WeatherSummary } from '../../types/post';
import mockWeather from '../../../test/fixtures/environment/mock-weather.json';

/**
 * Fetch weather data from Google Weather API
 */
export async function fetchWeather(
	lat: number,
	lng: number,
	env: Env,
	useMock = false
): Promise<ApiSnapshot_Weather> {
	if (useMock) {
		return mockWeather as ApiSnapshot_Weather;
	}

	const apiKey = await env.GOOGLE_PLACES_API.get();
	if (!apiKey) {
		throw new Error('Google Places API key not configured');
	}

	const url = `https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=${lat}&location.longitude=${lng}&key=${apiKey}`;

	const response = await fetch(url);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Google Weather API error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();

	// Transform to our normalized format (US units)
	const summary: WeatherSummary = {
		timestamp: new Date().toISOString(),
		temp_f: data.temperature?.degrees || undefined,
		condition_text: data.weatherCondition?.description?.text || undefined,
		// Google Weather API returns limited fields; map what's available
		// Many fields may not be present in the response
	};

	return {
		captured_at: new Date().toISOString(),
		provider: {
			name: 'google',
			product: 'weather',
			version: 'v1',
		},
		summary,
		full: data,
	};
}
