/**
 * Chatter enrichment orchestrator
 * Coordinates all environmental data fetching and builds the complete Chatter object
 */

import type { Env } from '../../types/env';
import type { CreateChatterRequest, Chatter, ChatterData, Environment } from '../../types/chatter';
import { fetchPlaceDetails, reverseGeocode } from './google-places';
import { fetchWeather } from './google-weather';
import { fetchAirQuality } from './google-air-quality';
import { fetchPollen } from './google-pollen';
import { fetchElevation } from './google-elevation';

/**
 * Enrich a chatter with environmental data
 * @param request - The client request
 * @param env - Environment bindings
 * @param useMock - Use mock data for testing (default: false)
 * @returns Complete Chatter object with environmental data
 */
export async function enrichChatter(
	request: CreateChatterRequest,
	env: Env,
	useMock = false
): Promise<ChatterData> {
	// Extract coordinates from location_hint or place
	const coords = extractCoordinates(request);

	// Build base chatter data
	const chatterData: ChatterData = {
		kind: request.kind,
		content: request.content,
		date_posted: request.date_posted,
		title: request.title,
		tags: request.tags || [],
		images: request.images || [],
		publish: request.publish !== undefined ? request.publish : true,
		location_hint: request.location_hint,
		place: request.place,
	};

	// If no coordinates available, return chatter without environmental data
	if (!coords) {
		return chatterData;
	}

	// Fetch all environmental data in parallel
	// Use Promise.allSettled to handle partial failures gracefully
	const [weatherResult, airQualityResult, pollenResult, elevationResult, geocodingResult] =
		await Promise.allSettled([
			fetchWeather(coords.lat, coords.lng, env, useMock),
			fetchAirQuality(coords.lat, coords.lng, env, useMock),
			fetchPollen(coords.lat, coords.lng, env, useMock),
			fetchElevation(coords.lat, coords.lng, env, useMock),
			reverseGeocode(coords.lat, coords.lng, env, useMock),
		]);

	// Build environment object with successful results
	const environment: Environment = {};

	if (weatherResult.status === 'fulfilled') {
		environment.weather = weatherResult.value;
	} else {
		console.error('Weather fetch failed:', weatherResult.reason);
	}

	if (airQualityResult.status === 'fulfilled') {
		environment.air_quality = airQualityResult.value;
	} else {
		console.error('Air quality fetch failed:', airQualityResult.reason);
	}

	if (pollenResult.status === 'fulfilled') {
		environment.pollen = pollenResult.value;
	} else {
		console.error('Pollen fetch failed:', pollenResult.reason);
	}

	if (elevationResult.status === 'fulfilled') {
		environment.elevation = elevationResult.value;
	} else {
		console.error('Elevation fetch failed:', elevationResult.reason);
	}

	if (geocodingResult.status === 'fulfilled') {
		environment.geocoding = geocodingResult.value;
	} else {
		console.error('Geocoding fetch failed:', geocodingResult.reason);
	}

	// If place was provided, fetch full place details
	if (request.place?.provider_ids?.google_places) {
		try {
			const placeSnapshot = await fetchPlaceDetails(
				request.place.provider_ids.google_places,
				env,
				useMock
			);
			environment.place = placeSnapshot;
		} catch (error) {
			console.error('Place details fetch failed:', error);
			// Continue without place details
		}
	}

	// Add environment to chatter data
	chatterData.environment = environment;

	return chatterData;
}

/**
 * Extract coordinates from request (location_hint or place)
 */
function extractCoordinates(
	request: CreateChatterRequest
): { lat: number; lng: number } | null {
	if (request.location_hint) {
		return {
			lat: request.location_hint.lat,
			lng: request.location_hint.lng,
		};
	}

	if (request.place?.location) {
		return {
			lat: request.place.location.lat,
			lng: request.place.location.lng,
		};
	}

	return null;
}
