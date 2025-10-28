/// <reference types="./env.d.ts" />
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import * as metadataExtractor from '../src/services/metadata-extractor';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Image Upload Handler', () => {
	// Mock R2 bucket
	let mockR2Put: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Set up test environment variables
		env.AUTH_TOKEN = 'test-auth-token';

		// Mock R2 bucket put method
		mockR2Put = vi.fn().mockResolvedValue(undefined);
		env.SR_ARTIFACT = {
			put: mockR2Put,
		} as any;

		// Mock metadata extraction to return fake metadata
		vi.spyOn(metadataExtractor, 'extractMetadata').mockResolvedValue({
			file: {
				width: 1920,
				height: 1080,
				size: 1024,
				mimeType: 'image/jpeg',
				format: 'jpeg',
			},
			exif: {
				make: 'Canon',
				model: 'EOS R5',
			},
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should successfully upload an image with valid authentication', async () => {
		// Create a test image file
		const formData = new FormData();
		const imageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		formData.append('file', imageBlob, 'test.jpg');

		const request = new IncomingRequest('http://example.com/images', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
			},
			body: formData,
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		// Verify response
		expect(response.status).toBe(201);
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');

		const data = (await response.json()) as any;

		// Response has objectKey, metadata, and uploadedAt fields
		expect(data.objectKey).toBeDefined();
		expect(typeof data.objectKey).toBe('string');
		expect(data.objectKey).toMatch(/^[a-f0-9]{64}\.jpg$/); // SHA-256 hash + .jpg extension

		// Verify metadata was extracted
		expect(data.metadata).toBeDefined();
		expect(data.metadata.file).toBeDefined();
		expect(data.metadata.file.size).toBeDefined();
		expect(data.metadata.file.mimeType).toBe('image/jpeg');

		// Verify uploadedAt timestamp
		expect(data.uploadedAt).toBeDefined();
		expect(typeof data.uploadedAt).toBe('string');
		expect(new Date(data.uploadedAt).toISOString()).toBe(data.uploadedAt);

		// Verify R2 put was called correctly
		expect(mockR2Put).toHaveBeenCalledTimes(1);
		const [objectKey, fileBuffer, options] = mockR2Put.mock.calls[0];
		expect(objectKey).toMatch(/^[a-f0-9]{64}\.jpg$/);
		expect(fileBuffer).toBeInstanceOf(ArrayBuffer);
		expect(options.httpMetadata.contentType).toBe('image/jpeg');
	});

	it('should reject request with missing authentication', async () => {
		const formData = new FormData();
		const imageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		formData.append('file', imageBlob, 'test.jpg');

		const request = new IncomingRequest('http://example.com/images', {
			method: 'POST',
			body: formData,
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const data = (await response.json()) as any;
		expect(data.error).toBe('Unauthorized');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should reject request with invalid authentication token', async () => {
		const formData = new FormData();
		const imageBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		formData.append('file', imageBlob, 'test.jpg');

		const request = new IncomingRequest('http://example.com/images', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer wrong-token',
			},
			body: formData,
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const data = (await response.json()) as any;
		expect(data.error).toBe('Unauthorized');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should reject request with invalid file type', async () => {
		const formData = new FormData();
		const textBlob = new Blob(['not an image'], { type: 'text/plain' });
		formData.append('file', textBlob, 'test.txt');

		const request = new IncomingRequest('http://example.com/images', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
			},
			body: formData,
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toContain('Invalid file type');
		expect(data.error).toContain('text/plain');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should reject request with missing file', async () => {
		const formData = new FormData();
		// No file appended

		const request = new IncomingRequest('http://example.com/images', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
			},
			body: formData,
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBe('No file provided in request');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should accept valid image types (jpeg, png, gif, webp)', async () => {
		const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
		const expectedExtensions = ['jpg', 'png', 'gif', 'webp'];

		for (let i = 0; i < validTypes.length; i++) {
			const mimeType = validTypes[i];
			const expectedExt = expectedExtensions[i];

			const formData = new FormData();
			const imageBlob = new Blob(['fake-image-data'], { type: mimeType });
			formData.append('file', imageBlob, `test.${expectedExt}`);

			const request = new IncomingRequest('http://example.com/images', {
				method: 'POST',
				headers: {
					Authorization: 'Bearer test-auth-token',
				},
				body: formData,
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);

			const data = (await response.json()) as any;
			expect(data.objectKey).toMatch(new RegExp(`^[a-f0-9]{64}\\.${expectedExt}$`));
		}

		// Verify R2 put was called for each valid type
		expect(mockR2Put).toHaveBeenCalledTimes(validTypes.length);
	});
});
