import type { Env } from './types/env';
import { handleHttp } from './handlers/http';
import { handleQueue } from './handlers/queue';
import { createRouter } from './router';
import { getPwaHtml } from './routes/pwa';

/**
 * Cloudflare Worker entry point
 * Exports handlers for HTTP requests and queue message processing
 */
export default {
	/**
	 * HTTP request handler
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Serve PWA page directly (handle with or without trailing slash)
		if (url.pathname === '/api/pwa' || url.pathname === '/api/pwa/') {
			return new Response(getPwaHtml(), {
				headers: {
					'content-type': 'text/html; charset=utf-8',
				},
			});
		}

		// Route API paths through chanfana/hono
		if (url.pathname.startsWith('/api/posts') || url.pathname === '/openapi.json' || url.pathname === '/docs') {
			const router = createRouter();
			return router.fetch(request, env, ctx);
		}

		// Existing routes: /health, /api/token, /images, /ingest, static assets
		return handleHttp(request, env);
	},

	/**
	 * Queue message batch handler
	 * Cloudflare calls this automatically when messages are ready to process
	 */
	async queue(batch: MessageBatch, env: Env): Promise<void> {
		await handleQueue(batch, env);
	},
} satisfies ExportedHandler<Env>;
