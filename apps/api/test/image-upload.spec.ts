/// <reference types="./env.d.ts" />
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Image Upload Handler', () => {
	// Mock fetch globally for Cloudflare Images API calls
	let originalFetch: typeof fetch;
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		mockFetch = vi.fn();
		globalThis.fetch = mockFetch as any;

		// Set up test environment variables
		env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id';
		env.CLOUDFLARE_MEDIA_TOKEN = 'test-images-token';
		env.AUTH_TOKEN = 'test-auth-token';
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('should successfully upload an image with valid authentication', async () => {
		// Mock successful Cloudflare Images API response
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					success: true,
					result: {
						id: 'test-image-id',
						filename: 'test.jpg',
						uploaded: '2025-10-26T00:00:00.000Z',
						variants: ['https://imagedelivery.net/test-hash/test-image-id/public'],
					},
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			)
		);

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
		expect(data.success).toBe(true);
		expect(data.result.id).toBe('test-image-id');

		// Verify Cloudflare Images API was called correctly
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/test-account-id/images/v1');
		expect(options.method).toBe('POST');
		expect(options.headers.Authorization).toBe('Bearer test-images-token');
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

		// Verify Cloudflare Images API was not called
		expect(mockFetch).not.toHaveBeenCalled();
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

		// Verify Cloudflare Images API was not called
		expect(mockFetch).not.toHaveBeenCalled();
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

		// Verify Cloudflare Images API was not called
		expect(mockFetch).not.toHaveBeenCalled();
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

		// Verify Cloudflare Images API was not called
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('should accept valid image types (jpeg, png, gif, webp)', async () => {
		const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

		for (const mimeType of validTypes) {
			// Mock successful response for each type
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ success: true, result: { id: 'test-id' } }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			);

			const formData = new FormData();
			const imageBlob = new Blob(['fake-image-data'], { type: mimeType });
			formData.append('file', imageBlob, `test.${mimeType.split('/')[1]}`);

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
		}

		// Verify API was called for each valid type
		expect(mockFetch).toHaveBeenCalledTimes(validTypes.length);
	});
});
