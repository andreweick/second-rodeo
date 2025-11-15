/**
 * Environment bindings for the Cloudflare Worker
 */
export interface Env {
	/**
	 * D1 Database binding
	 */
	DB: D1Database;

	/**
	 * R2 bucket for JSON files
	 */
	SR_JSON: R2Bucket;

	/**
	 * R2 bucket for artifacts
	 */
	SR_ARTIFACT: R2Bucket;

	/**
	 * Queue for processing JSON files
	 */
	JSON_QUEUE: Queue;

	/**
	 * Auth token from Secrets Store
	 */
	AUTH_TOKEN: {
		get(): Promise<string>;
	};

	/**
	 * Cloudflare Media token from Secrets Store
	 */
	CLOUDFLARE_MEDIA_TOKEN: {
		get(): Promise<string>;
	};

	/**
	 * Static assets from the Astro blog
	 */
	ASSETS: Fetcher;
}
