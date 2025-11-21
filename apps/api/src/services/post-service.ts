/**
 * Post service
 * Handles post creation, enrichment, and storage
 */

import type { Env } from '../types/env';
import type { CreatePostRequest, Post } from '../types/post';
import { enrichPost as enrichWithEnvironment } from './environment/enrichment';

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
 * Create and enrich a post
 * @param request - Client request
 * @param env - Environment bindings
 * @param useMock - Use mock data for testing
 * @returns Complete Post object with ID
 */
export async function createPost(
	request: CreatePostRequest,
	env: Env,
	useMock = false
): Promise<Post> {
	// Enrich post with environmental data
	const enrichedData = await enrichWithEnvironment(request, env, useMock);

	// Compute SHA256 hash of enriched post data
	const hash = await hashJSON(enrichedData);

	// Build final Post envelope
	const post: Post = {
		type: 'post',
		id: `sha256:${hash}`,
		schema_version: '1.1.0',
		data: enrichedData,
	};

	return post;
}

/**
 * Store post in R2
 * @param post - Complete Post object
 * @param env - Environment bindings
 * @returns Object key and ID
 */
export async function storePost(
	post: Post,
	env: Env
): Promise<{ objectKey: string; id: string }> {
	const hash = post.id.replace('sha256:', '');
	const objectKey = `post/sha256_${hash}.json`;

	try {
		await env.SR_JSON.put(objectKey, JSON.stringify(post, null, 2), {
			httpMetadata: {
				contentType: 'application/json',
			},
			customMetadata: {
				'sha256-hex': hash,
				'schema-version': post.schema_version || '1.1.0',
				type: post.type,
			},
		});
	} catch (error) {
		throw new Error(
			`R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}

	return {
		objectKey,
		id: post.id,
	};
}

/**
 * Create and store a post (complete operation)
 * @param request - Client request
 * @param env - Environment bindings
 * @param useMock - Use mock data for testing
 * @returns Complete Post object with storage metadata
 */
export async function createAndStorePost(
	request: CreatePostRequest,
	env: Env,
	useMock = false
): Promise<Post & { _meta: { objectKey: string } }> {
	// Create enriched post
	const post = await createPost(request, env, useMock);

	// Store in R2
	const { objectKey } = await storePost(post, env);

	// Return post with metadata
	return {
		...post,
		_meta: {
			objectKey,
		},
	};
}
