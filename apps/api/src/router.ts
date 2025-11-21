/**
 * Chanfana router setup
 * Configures OpenAPI router with API metadata and endpoints
 */

import { Hono } from 'hono';
import { fromHono } from 'chanfana';
import { ChatterCreate } from './routes/chatters';
import type { Env } from './types/env';

/**
 * Create and configure the OpenAPI router
 */
export function createRouter() {
	const app = new Hono<{ Bindings: Env }>();

	const openapi = fromHono(app, {
		schema: {
			info: {
				title: 'Videlicet Post API',
				version: '1.1.0',
				summary: 'API for creating and retrieving chatter posts with environmental context.',
				description:
					'This API allows clients (e.g. mobile apps / PWA) to create chatter posts and retrieve them once enriched with environmental context (place, geocoding, elevation, weather, air quality, pollen).',
			},
			servers: [
				{
					url: 'https://secondrodeo.eick.us',
					description: 'Production',
				},
			],
		},
	});

	// Register POST /api/chatters endpoint
	openapi.post('/api/chatters', ChatterCreate);

	return openapi;
}
