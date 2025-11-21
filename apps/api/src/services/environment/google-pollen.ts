/**
 * Google Pollen API service
 * Fetches pollen forecast data
 */

import type { Env } from '../../types/env';
import type { ApiSnapshot_Pollen, PollenSummary } from '../../types/chatter';
import mockPollen from '../../../test/fixtures/environment/mock-pollen.json';

/**
 * Fetch pollen data from Google Pollen API
 */
export async function fetchPollen(
	lat: number,
	lng: number,
	env: Env,
	useMock = false
): Promise<ApiSnapshot_Pollen> {
	if (useMock) {
		return mockPollen as ApiSnapshot_Pollen;
	}

	const apiKey = await env.GOOGLE_PLACES_API.get();
	if (!apiKey) {
		throw new Error('Google Places API key not configured');
	}

	const url = `https://pollen.googleapis.com/v1/forecast:lookup?location.latitude=${lat}&location.longitude=${lng}&days=1&key=${apiKey}`;

	const response = await fetch(url);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Google Pollen API error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();

	// Extract pollen data from today's forecast
	const dailyInfo = data.dailyInfo?.[0];
	const pollenTypes = dailyInfo?.pollenTypeInfo || [];

	// Find tree, grass, weed pollen
	const treePollen = pollenTypes.find((p: any) => p.code === 'TREE');
	const grassPollen = pollenTypes.find((p: any) => p.code === 'GRASS');
	const weedPollen = pollenTypes.find((p: any) => p.code === 'WEED');

	// Overall index (use tree if available, or first type)
	const overallPollen = pollenTypes[0];

	const summary: PollenSummary = {
		date: dailyInfo?.date || new Date().toISOString().split('T')[0],
		index_overall: overallPollen?.indexInfo?.value || undefined,
		index_category: overallPollen?.indexInfo?.category || undefined,
		tree_index: treePollen?.indexInfo?.value || null,
		tree_category: treePollen?.indexInfo?.category || null,
		grass_index: grassPollen?.indexInfo?.value || null,
		grass_category: grassPollen?.indexInfo?.category || null,
		weed_index: weedPollen?.indexInfo?.value || null,
		weed_category: weedPollen?.indexInfo?.category || null,
	};

	return {
		captured_at: new Date().toISOString(),
		provider: {
			name: 'google',
			product: 'pollen',
			version: 'v1',
		},
		summary,
		full: data,
	};
}
