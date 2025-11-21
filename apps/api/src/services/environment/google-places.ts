/**
 * Google Places API service
 * Handles place details and reverse geocoding
 */

import type { Env } from '../../types/env';
import type {
	ApiSnapshot_Place,
	ApiSnapshot_Geocoding,
	PlaceSummary,
	GeocodingSummary,
} from '../../types/post';
import mockPlace from '../../../test/fixtures/environment/mock-place.json';
import mockGeocoding from '../../../test/fixtures/environment/mock-geocoding.json';

/**
 * Fetch place details from Google Places API (New)
 */
export async function fetchPlaceDetails(
	placeId: string,
	env: Env,
	useMock = false
): Promise<ApiSnapshot_Place> {
	if (useMock) {
		return mockPlace as ApiSnapshot_Place;
	}

	const apiKey = await env.GOOGLE_PLACES_API.get();
	if (!apiKey) {
		throw new Error('Google Places API key not configured');
	}

	const url = `https://places.googleapis.com/v1/places/${placeId}`;

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'X-Goog-Api-Key': apiKey,
			'X-Goog-FieldMask':
				'id,displayName,formattedAddress,location,addressComponents,types,rating,userRatingCount,priceLevel,websiteUri,internationalPhoneNumber',
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Google Places API error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();

	// Transform to our normalized format
	const summary: PlaceSummary = {
		name: data.displayName?.text || 'Unknown Place',
		formatted_address: data.formattedAddress || '',
		short_address: extractShortAddress(data.formattedAddress || ''),
		lat: data.location?.latitude || 0,
		lng: data.location?.longitude || 0,
		place_id: data.id || placeId,
		maps_url: `https://www.google.com/maps/place/?q=place_id:${data.id || placeId}`,
		website_url: data.websiteUri || null,
		phone: data.internationalPhoneNumber || null,
		types: data.types || [],
		rating: data.rating || null,
		user_rating_count: data.userRatingCount || null,
		price_level: data.priceLevel || null,
		provider_ids: {
			google_places: data.id || placeId,
		},
	};

	return {
		captured_at: new Date().toISOString(),
		provider: {
			name: 'google',
			product: 'places',
			version: 'v1',
		},
		summary,
		full: data,
	};
}

/**
 * Reverse geocode coordinates to get address details
 */
export async function reverseGeocode(
	lat: number,
	lng: number,
	env: Env,
	useMock = false
): Promise<ApiSnapshot_Geocoding> {
	if (useMock) {
		return mockGeocoding as ApiSnapshot_Geocoding;
	}

	const apiKey = await env.GOOGLE_PLACES_API.get();
	if (!apiKey) {
		throw new Error('Google Places API key not configured');
	}

	const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

	const response = await fetch(url);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Google Geocoding API error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();

	if (!data.results || data.results.length === 0) {
		throw new Error('No geocoding results found');
	}

	const result = data.results[0];

	// Parse address components
	const components = parseAddressComponents(result.address_components || []);

	const summary: GeocodingSummary = {
		lat,
		lng,
		formatted_address: result.formatted_address || '',
		country_code: components.country_code,
		country_name: components.country_name,
		region_code: components.region_code,
		region_name: components.region_name,
		locality: components.locality,
		postal_code: components.postal_code,
		neighborhood: components.neighborhood,
		street_name: components.street_name,
		street_number: components.street_number,
	};

	return {
		captured_at: new Date().toISOString(),
		provider: {
			name: 'google',
			product: 'geocoding',
			version: 'v1',
		},
		summary,
		full: data,
	};
}

/**
 * Extract short address from full formatted address
 * e.g. "66 Mint St, San Francisco, CA 94103, USA" -> "66 Mint St"
 */
function extractShortAddress(formattedAddress: string): string {
	const parts = formattedAddress.split(',');
	return parts[0]?.trim() || formattedAddress;
}

/**
 * Parse Google address components into normalized structure
 */
function parseAddressComponents(components: any[]): {
	country_code: string;
	country_name: string;
	region_code: string;
	region_name: string;
	locality: string;
	postal_code: string;
	neighborhood: string | null;
	street_name: string | null;
	street_number: string | null;
} {
	let country_code = '';
	let country_name = '';
	let region_code = '';
	let region_name = '';
	let locality = '';
	let postal_code = '';
	let neighborhood: string | null = null;
	let street_name: string | null = null;
	let street_number: string | null = null;

	for (const component of components) {
		const types = component.types || [];

		if (types.includes('street_number')) {
			street_number = component.long_name;
		} else if (types.includes('route')) {
			street_name = component.long_name;
		} else if (types.includes('neighborhood')) {
			neighborhood = component.long_name;
		} else if (types.includes('locality')) {
			locality = component.long_name;
		} else if (types.includes('administrative_area_level_1')) {
			region_name = component.long_name;
			region_code = component.short_name;
		} else if (types.includes('country')) {
			country_name = component.long_name;
			country_code = component.short_name;
		} else if (types.includes('postal_code')) {
			postal_code = component.long_name;
		}
	}

	return {
		country_code,
		country_name,
		region_code,
		region_name,
		locality,
		postal_code,
		neighborhood,
		street_name,
		street_number,
	};
}
