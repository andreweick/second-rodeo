import type { Env } from '../types/env';
import { extractMetadata, type ImageMetadata } from './metadata-extractor';

/**
 * Allowed image MIME types
 */
const ALLOWED_IMAGE_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
];

/**
 * Error class for image upload validation failures
 */
export class ImageUploadError extends Error {
	constructor(message: string, public statusCode: number = 400) {
		super(message);
		this.name = 'ImageUploadError';
	}
}

/**
 * Combined response with R2 storage data and extracted metadata
 */
export interface ImageUploadResponse {
	objectKey: string;
	metadata: ImageMetadata;
	uploadedAt: string;
}

/**
 * Generate SHA-256 hash of file content
 */
async function hashFile(file: File): Promise<string> {
	const buffer = await file.arrayBuffer();
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get file extension from MIME type
 */
function getExtension(mimeType: string): string {
	const extensions: Record<string, string> = {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/gif': 'gif',
		'image/webp': 'webp',
	};
	return extensions[mimeType] || 'bin';
}

/**
 * Uploads an image to R2 bucket with metadata extraction
 * @param request - HTTP request containing multipart/form-data with image file
 * @param env - Environment bindings
 * @returns Response with R2 object key, metadata, and upload timestamp
 * @throws ImageUploadError if validation fails, metadata extraction fails, or upload errors
 */
export async function uploadImage(request: Request, env: Env): Promise<Response> {
	// Parse multipart form data
	const formData = await request.formData();
	const file = formData.get('file');

	// Validate file exists
	if (!file || !(file instanceof File)) {
		throw new ImageUploadError('No file provided in request', 400);
	}

	// Validate file type
	if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
		throw new ImageUploadError(
			`Invalid file type: ${file.type}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
			400
		);
	}

	// Extract metadata from the image file
	// This happens BEFORE upload - if it fails, the upload is aborted
	let metadata: ImageMetadata;
	try {
		metadata = await extractMetadata(file);
	} catch (error) {
		throw new ImageUploadError(
			`Metadata extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			400
		);
	}

	// Generate hash-based object key
	const hash = await hashFile(file);
	const extension = getExtension(file.type);
	const objectKey = `${hash}.${extension}`;

	// Upload to R2
	try {
		const fileBuffer = await file.arrayBuffer();
		await env.SR_ARTIFACT.put(objectKey, fileBuffer, {
			httpMetadata: {
				contentType: file.type,
			},
		});
	} catch (error) {
		throw new ImageUploadError(
			`R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			500
		);
	}

	// Build response with object key, metadata, and timestamp
	const uploadedAt = new Date().toISOString();
	const response: ImageUploadResponse = {
		objectKey,
		metadata,
		uploadedAt,
	};

	// Return response
	return new Response(JSON.stringify(response), {
		status: 201,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}
