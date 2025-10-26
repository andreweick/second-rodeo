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
	 * Cloudflare Account ID for Images API
	 */
	CLOUDFLARE_ACCOUNT_ID: string;

	/**
	 * Cloudflare Media API token (secret)
	 */
	CLOUDFLARE_MEDIA_TOKEN: string;

	/**
	 * Authentication token for API endpoints (secret)
	 */
	AUTH_TOKEN: string;
}
