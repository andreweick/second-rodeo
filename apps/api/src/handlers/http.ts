import type { Env } from '../types/env';
import { uploadImage, ImageUploadError } from '../services/image-upload';
import { connectD1, schema } from '../db/client';
import { sql } from 'drizzle-orm';

/**
 * Validates authentication token from request headers
 */
async function validateAuth(request: Request, env: Env): Promise<boolean> {
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.replace('Bearer ', '');

	if (!token) {
		return false;
	}

	const authToken = await env.AUTH_TOKEN.get();
	return token === authToken;
}

/**
 * Handles HTTP requests to the worker
 */
export async function handleHttp(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);

	// Handle API routes first
	if (url.pathname === '/health') {
		return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
			headers: { 'content-type': 'application/json; charset=utf-8' },
		});
	}

	if (url.pathname === '/api/token' && request.method === 'OPTIONS') {
		// Handle CORS preflight
		return new Response(null, {
			headers: {
				'access-control-allow-origin': '*',
				'access-control-allow-methods': 'GET, OPTIONS',
				'access-control-allow-headers': 'Content-Type',
			},
		});
	}

	if (url.pathname === '/api/token' && request.method === 'GET') {
		// This route should be protected by Cloudflare Access
		// If the request reaches here, the user is authenticated via Zero Trust
		try {
			const authToken = await env.AUTH_TOKEN.get();
			const googlePlacesApiKey = await env.GOOGLE_PLACES_API.get();
			return new Response(JSON.stringify({ authToken, googlePlacesApiKey }), {
				status: 200,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'access-control-allow-origin': '*',
				},
			});
		} catch (error) {
			console.error('Token retrieval error:', error);
			return new Response(
				JSON.stringify({
					error: 'Failed to retrieve tokens',
					details: error instanceof Error ? error.message : String(error),
				}),
				{
					status: 500,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'access-control-allow-origin': '*',
					},
				}
			);
		}
	}

	if (url.pathname === '/api/topten/random' && request.method === 'GET') {
		try {
			// Connect to D1 database
			const db = connectD1(env.DB);

			// Query for a random topten record
			const result = await db
				.select()
				.from(schema.topten)
				.orderBy(sql`RANDOM()`)
				.limit(1);

			if (result.length === 0) {
				return new Response(JSON.stringify({ error: 'No topten lists found' }), {
					status: 404,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'access-control-allow-origin': '*',
					},
				});
			}

			const toptenRecord = result[0];

			// Fetch full JSON from R2
			const r2Object = await env.SR_JSON.get(toptenRecord.r2Key);

			if (!r2Object) {
				return new Response(JSON.stringify({ error: 'TopTen data not found in storage' }), {
					status: 404,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'access-control-allow-origin': '*',
					},
				});
			}

			const fullData = await r2Object.json();

			// Return combined metadata and full data
			return new Response(JSON.stringify(fullData), {
				status: 200,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'access-control-allow-origin': '*',
				},
			});
		} catch (error) {
			console.error('TopTen random fetch error:', error);
			return new Response(
				JSON.stringify({
					error: 'Failed to fetch random topten',
					details: error instanceof Error ? error.message : String(error),
				}),
				{
					status: 500,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'access-control-allow-origin': '*',
					},
				}
			);
		}
	}

	if (url.pathname === '/images' && request.method === 'POST') {
		// Validate authentication
		if (!(await validateAuth(request, env))) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}

		// Upload image with metadata extraction
		try {
			const response = await uploadImage(request, env);
			return response;
		} catch (error) {
			if (error instanceof ImageUploadError) {
				return new Response(JSON.stringify({ error: error.message }), {
					status: error.statusCode,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			}

			// Unexpected error
			console.error('Image upload error:', error);
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}
	}

	// Note: /upload endpoint has been replaced by /posts (handled by chanfana router)

	if (url.pathname === '/ingest/all' && request.method === 'POST') {
		// Validate authentication
		if (!(await validateAuth(request, env))) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}

		try {
			// Get cursor from query params for pagination
			const cursor = url.searchParams.get('cursor') || undefined;

			// List one page of objects (1000 max)
			const r2ListLimit = 1000;
			const queueBatchLimit = 100; // Queue sendBatch limit

			const listed = await env.SR_JSON.list({
				cursor,
				limit: r2ListLimit,
			});

			// Split into chunks of 100 (queue batch limit)
			const allMessages = listed.objects.map((obj) => ({
				body: { objectKey: obj.key },
			}));

			// Send in batches of 100
			let queued = 0;
			for (let i = 0; i < allMessages.length; i += queueBatchLimit) {
				const batch = allMessages.slice(i, i + queueBatchLimit);
				await env.JSON_QUEUE.sendBatch(batch);
				queued += batch.length;
			}

			// If more pages exist, send pagination message to trigger next page
			if (listed.truncated && listed.cursor) {
				await env.JSON_QUEUE.send({
					type: 'pagination',
					cursor: listed.cursor,
				});
			}

			return new Response(
				JSON.stringify({
					success: true,
					queued,
					hasMore: listed.truncated,
					message: listed.truncated
						? `Queued ${queued} files. Pagination will continue automatically.`
						: `Queued ${queued} files. Ingestion complete.`,
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				}
			);
		} catch (error) {
			console.error('Bulk ingestion error:', error);
			return new Response(
				JSON.stringify({
					error: 'Failed to queue files for ingestion',
					details: error instanceof Error ? error.message : String(error),
				}),
				{
					status: 500,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				}
			);
		}
	}

	if (url.pathname.startsWith('/ingest/') && request.method === 'POST') {
		// Validate authentication
		if (!(await validateAuth(request, env))) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}

		// Extract object key from path
		const objectKey = url.pathname.substring('/ingest/'.length);

		if (!objectKey) {
			return new Response(JSON.stringify({ error: 'Object key is required' }), {
				status: 400,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}

		try {
			// Queue the specific file for processing
			await env.JSON_QUEUE.send({ objectKey });

			return new Response(
				JSON.stringify({
					success: true,
					objectKey,
					message: `Queued ${objectKey} for ingestion`,
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				}
			);
		} catch (error) {
			console.error('Single file ingestion error:', error);
			return new Response(
				JSON.stringify({
					error: 'Failed to queue file for ingestion',
					details: error instanceof Error ? error.message : String(error),
				}),
				{
					status: 500,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				}
			);
		}
	}

	// All other routes: serve static assets from the blog
	// The ASSETS binding automatically handles 404s and proper content types
	return env.ASSETS.fetch(request);
}
