import { connectD1 } from './db/client';

export default {
	async fetch(request: Request, env: { DB: D1Database }): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/health') {
			return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
				headers: { 'content-type': 'application/json; charset=utf-8' },
			});
		}

		return new Response('ok');
	},
} satisfies ExportedHandler<{ DB: D1Database }>;
