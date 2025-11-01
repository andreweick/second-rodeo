import type { Env } from '../types/env';

/**
 * Error class for JSON upload validation failures
 */
export class JsonUploadError extends Error {
	constructor(message: string, public statusCode: number = 400) {
		super(message);
		this.name = 'JsonUploadError';
	}
}

/**
 * Request body for JSON upload
 */
export interface JsonUploadRequest {
	type: string;
	data: Record<string, any>;
}

/**
 * Response for successful JSON upload
 */
export interface JsonUploadResponse {
	objectKey: string;
	id: string;
}

/**
 * Wrapped JSON envelope stored in R2
 */
interface JsonEnvelope {
	type: string;
	id: string;
	data: Record<string, any>;
}

/**
 * Serialize object to canonical JSON with stable key ordering
 */
function canonicalJSON(obj: any): string {
	if (obj === null || typeof obj !== 'object') {
		return JSON.stringify(obj);
	}

	if (Array.isArray(obj)) {
		return '[' + obj.map(item => canonicalJSON(item)).join(',') + ']';
	}

	const keys = Object.keys(obj).sort();
	const pairs = keys.map(key => `"${key}":${canonicalJSON(obj[key])}`);
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
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Uploads JSON content to R2 bucket with content-addressable storage
 * @param request - HTTP request containing JSON with type and data fields
 * @param env - Environment bindings
 * @returns Response with object key and computed ID
 * @throws JsonUploadError if validation fails or upload errors
 */
export async function uploadJSON(request: Request, env: Env): Promise<Response> {
	// Parse request body
	let body: JsonUploadRequest;
	try {
		body = await request.json();
	} catch (error) {
		throw new JsonUploadError('Invalid JSON in request body', 400);
	}

	// Validate required fields
	if (!body.type || typeof body.type !== 'string') {
		throw new JsonUploadError('Missing or invalid "type" field', 400);
	}

	if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
		throw new JsonUploadError('Missing or invalid "data" field (must be an object)', 400);
	}

	// Compute hash of data
	const hash = await hashJSON(body.data);
	const id = `sha256:${hash}`;

	// Build wrapped envelope
	const envelope: JsonEnvelope = {
		type: body.type,
		id,
		data: body.data,
	};

	// Generate object key
	const objectKey = `sha256_${hash}.json`;

	// Upload to R2
	try {
		const envelopeJSON = JSON.stringify(envelope);
		await env.SR_JSON.put(objectKey, envelopeJSON, {
			httpMetadata: {
				contentType: 'application/json',
			},
			customMetadata: {
				'sha256-hex': hash,
			},
		});
	} catch (error) {
		throw new JsonUploadError(
			`R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			500
		);
	}

	// Build response
	const response: JsonUploadResponse = {
		objectKey,
		id,
	};

	// Return response
	return new Response(JSON.stringify(response), {
		status: 201,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}
