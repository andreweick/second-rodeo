import type { Env } from '../types/env';
import { uploadImage, ImageUploadError } from '../services/image-upload';

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
		const authHeader = request.headers.get('Authorization');
		const token = authHeader?.replace('Bearer ', '');

		if (!token || token !== env.AUTH_TOKEN) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}

		// Upload image
		try {
			const cfResponse = await uploadImage(request, env);
			const responseBody = await cfResponse.text();

			return new Response(responseBody, {
				status: 201,
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
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

	return new Response('ok');
}
