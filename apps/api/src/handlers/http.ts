import type { Env } from '../types/env';

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

	return new Response('ok');
}
