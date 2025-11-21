/**
 * POST /chatters endpoint
 * Create a new chatter with environmental enrichment
 */

import { type Context } from 'hono';
import { OpenAPIRoute, Str } from 'chanfana';
import type { Env } from '../types/env';
import type { CreateChatterRequest } from '../types/chatter';
import { createAndStoreChatter } from '../services/chatter-service';
import CreateChatterRequestSchema from '../schemas/create-chatter-request.schema.json';

export type AppContext = Context<{ Bindings: Env }>;

/**
 * Validate authentication token from request headers
 */
async function validateAuth(c: AppContext): Promise<boolean> {
	const authHeader = c.req.header('Authorization');
	const token = authHeader?.replace('Bearer ', '');

	if (!token) {
		return false;
	}

	const authToken = await c.env.AUTH_TOKEN.get();
	return token === authToken;
}

export class ChatterCreate extends OpenAPIRoute {
	schema = {
		tags: ['Chatters'],
		summary: 'Create a new chatter',
		description:
			'Create a new chatter. The client sends the basic data (kind = chatter, content, date_posted, optional place). The server enriches the chatter with environmental data and returns the enriched document.',
		request: {
			body: {
				content: {
					'application/json': {
						schema: CreateChatterRequestSchema,
					},
				},
			},
		},
		responses: {
			'201': {
				description: 'Chatter created successfully',
				content: {
					'application/json': {
						schema: {
							type: 'object',
							properties: {
								type: { type: 'string', enum: ['chatter'] },
								id: { type: 'string', description: 'SHA256-based content ID' },
								schema_version: { type: 'string' },
								data: {
									type: 'object',
									properties: {
										kind: { type: 'string', enum: ['chatter'] },
										content: { type: 'string' },
										date_posted: { type: 'string', format: 'date-time' },
										title: { type: 'string' },
										tags: { type: 'array', items: { type: 'string' } },
										images: { type: 'array', items: { type: 'string' } },
										publish: { type: 'boolean' },
										location_hint: {
											type: 'object',
											properties: {
												lat: { type: 'number' },
												lng: { type: 'number' },
											},
										},
										place: {
											type: 'object',
											description: 'Place information if this is a check-in',
										},
										environment: {
											type: 'object',
											description: 'Environmental context: weather, air quality, pollen, elevation, geocoding, place details',
											properties: {
												weather: { type: 'object', description: 'Weather snapshot' },
												air_quality: { type: 'object', description: 'Air quality snapshot' },
												pollen: { type: 'object', description: 'Pollen forecast snapshot' },
												elevation: { type: 'object', description: 'Elevation data snapshot' },
												geocoding: { type: 'object', description: 'Reverse geocoding snapshot' },
												place: { type: 'object', description: 'Place details snapshot' },
											},
										},
									},
								},
							},
						},
					},
				},
			},
			'400': {
				description: 'Invalid request payload',
				content: {
					'application/json': {
						schema: {
							type: 'object',
							properties: {
								error: Str({ description: 'Error message' }),
							},
						},
					},
				},
			},
			'401': {
				description: 'Unauthorized - invalid or missing auth token',
				content: {
					'application/json': {
						schema: {
							type: 'object',
							properties: {
								error: Str({ description: 'Error message' }),
							},
						},
					},
				},
			},
			'500': {
				description: 'Server error',
				content: {
					'application/json': {
						schema: {
							type: 'object',
							properties: {
								error: Str({ description: 'Error message' }),
							},
						},
					},
				},
			},
		},
		security: [
			{
				bearerAuth: [],
			},
		],
	};

	async handle(c: AppContext) {
		try {
			// Validate authentication
			const isAuthorized = await validateAuth(c);
			if (!isAuthorized) {
				return c.json(
					{ error: 'Unauthorized' },
					{
						status: 401,
					}
				);
			}

			// Get request body
			const body = await c.req.json<CreateChatterRequest>();

			// Create and store chatter with environmental enrichment
			const chatter = await createAndStoreChatter(body, c.env);

			// Return enriched chatter
			return c.json(chatter, {
				status: 201,
			});
		} catch (error) {
			console.error('Chatter creation error:', error);

			return c.json(
				{
					error: 'Failed to create chatter',
					details: error instanceof Error ? error.message : String(error),
				},
				{
					status: 500,
				}
			);
		}
	}
}
