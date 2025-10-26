import type { Env } from '../types/env';

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
 * Uploads an image to Cloudflare Images
 * @param request - HTTP request containing multipart/form-data with image file
 * @param env - Environment bindings
 * @returns Cloudflare Images API response
 * @throws ImageUploadError if validation fails or upload errors
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

	// Prepare upload to Cloudflare Images
	const uploadFormData = new FormData();
	uploadFormData.append('file', file);

	const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/images/v1`;

	// Upload to Cloudflare Images
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.CLOUDFLARE_MEDIA_TOKEN}`,
		},
		body: uploadFormData,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new ImageUploadError(
			`Cloudflare Images API error: ${response.status} ${errorText}`,
			response.status
		);
	}

	return response;
}
