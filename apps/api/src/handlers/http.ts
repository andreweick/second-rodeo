import type { Env } from '../types/env';
import { uploadImage, ImageUploadError } from '../services/image-upload';
import { uploadJSON, JsonUploadError } from '../services/json-upload';

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

	if (url.pathname === '/health') {
		return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
			headers: { 'content-type': 'application/json; charset=utf-8' },
		});
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

	if (url.pathname === '/upload' && request.method === 'POST') {
		// Validate authentication
		if (!(await validateAuth(request, env))) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}

		// Upload JSON content
		try {
			const response = await uploadJSON(request, env);
			return response;
		} catch (error) {
			if (error instanceof JsonUploadError) {
				return new Response(JSON.stringify({ error: error.message }), {
					status: error.statusCode,
					headers: { 'content-type': 'application/json; charset=utf-8' },
				});
			}

			// Unexpected error
			console.error('JSON upload error:', error);
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}
	}

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

	return new Response('ok');
}
