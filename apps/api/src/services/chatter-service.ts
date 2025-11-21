/**
 * Chatter service
 * Handles chatter creation, enrichment, and storage
 */

import type { Env } from '../types/env';
import type { CreateChatterRequest, Chatter } from '../types/chatter';
import { enrichChatter as enrichWithEnvironment } from './environment/enrichment';

/**
 * Serialize object to canonical JSON with stable key ordering
 */
function canonicalJSON(obj: any): string {
	if (obj === null || typeof obj !== 'object') {
		return JSON.stringify(obj);
	}

	if (Array.isArray(obj)) {
		return '[' + obj.map((item) => canonicalJSON(item)).join(',') + ']';
	}

	const keys = Object.keys(obj).sort();
	const pairs = keys.map((key) => `"${key}":${canonicalJSON(obj[key])}`);
	return '{' + pairs.join(',') + '}';
}

/**
 * Compute SHA-256 hash of JSON data
 */
async function hashJSON(data: Record<string, any>): Promise<string> {
	const canonical = canonicalJSON(data);
	const encoder = new TextEncoder();
	const buffer = encoder.encode(canonical);
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create and enrich a chatter
 * @param request - Client request
 * @param env - Environment bindings
 * @param useMock - Use mock data for testing
 * @returns Complete Chatter object with ID
 */
export async function createChatter(
	request: CreateChatterRequest,
	env: Env,
	useMock = false
): Promise<Chatter> {
	// Enrich chatter with environmental data
	const enrichedData = await enrichWithEnvironment(request, env, useMock);

	// Compute SHA256 hash of enriched chatter data
	const hash = await hashJSON(enrichedData);

	// Build final Chatter envelope
	const chatter: Chatter = {
		type: 'chatter',
		id: `sha256:${hash}`,
		schema_version: '1.1.0',
		data: enrichedData,
	};

	return chatter;
}

/**
 * Store chatter in R2
 * @param chatter - Complete Chatter object
 * @param env - Environment bindings
 * @returns Object key and ID
 */
export async function storeChatter(
	chatter: Chatter,
	env: Env
): Promise<{ objectKey: string; id: string }> {
	const hash = chatter.id.replace('sha256:', '');
	const objectKey = `chatter/sha256_${hash}.json`;

	try {
		await env.SR_JSON.put(objectKey, JSON.stringify(chatter, null, 2), {
			httpMetadata: {
				contentType: 'application/json',
			},
			customMetadata: {
				'sha256-hex': hash,
				'schema-version': chatter.schema_version || '1.1.0',
				type: chatter.type,
			},
		});
	} catch (error) {
		throw new Error(
			`R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}

	return {
		objectKey,
		id: chatter.id,
	};
}

/**
 * Create and store a chatter (complete operation)
 * @param request - Client request
 * @param env - Environment bindings
 * @param useMock - Use mock data for testing
 * @returns Complete Chatter object with storage metadata
 */
export async function createAndStoreChatter(
	request: CreateChatterRequest,
	env: Env,
	useMock = false
): Promise<Chatter & { _meta: { objectKey: string } }> {
	// Create enriched chatter
	const chatter = await createChatter(request, env, useMock);

	// Store in R2
	const { objectKey } = await storeChatter(chatter, env);

	// Return chatter with metadata
	return {
		...chatter,
		_meta: {
			objectKey,
		},
	};
}
