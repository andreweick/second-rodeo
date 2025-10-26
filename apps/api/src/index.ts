import type { Env } from './types/env';
import { handleHttp } from './handlers/http';
import { handleQueue } from './handlers/queue';

/**
 * Cloudflare Worker entry point
 * Exports handlers for HTTP requests and queue message processing
 */
export default {
	/**
	 * HTTP request handler
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
