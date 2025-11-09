/// <reference types="./env.d.ts" />
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('JSON Upload Handler', () => {
	// Mock R2 bucket
	let mockR2Put: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Mock auth token from Secrets Store
		env.AUTH_TOKEN = {
			get: vi.fn().mockResolvedValue('test-auth-token'),
		} as any;

		// Mock R2 bucket put method
		mockR2Put = vi.fn().mockResolvedValue(undefined);
		env.SR_JSON = {
			put: mockR2Put,
		} as any;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should successfully upload JSON with valid authentication', async () => {
		const requestBody = {
			type: 'chatter',
			data: {
				title: 'Test Post',
				content: 'This is a test post',
			},
		};

		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		// Verify response
		expect(response.status).toBe(201);
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');

		const data = (await response.json()) as any;

		// Response has objectKey and id fields
		expect(data.objectKey).toBeDefined();
		expect(typeof data.objectKey).toBe('string');
		expect(data.objectKey).toMatch(/^chatter\/sha256_[a-f0-9]{64}\.json$/);

		expect(data.id).toBeDefined();
		expect(typeof data.id).toBe('string');
		expect(data.id).toMatch(/^sha256:[a-f0-9]{64}$/);

		// Verify R2 put was called correctly
		expect(mockR2Put).toHaveBeenCalledTimes(1);
		const [objectKey, content, options] = mockR2Put.mock.calls[0];
		expect(objectKey).toMatch(/^chatter\/sha256_[a-f0-9]{64}\.json$/);
		expect(typeof content).toBe('string');

		// Verify the envelope structure
		const envelope = JSON.parse(content);
		expect(envelope.type).toBe('chatter');
		expect(envelope.id).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(envelope.data).toEqual(requestBody.data);

		// Verify HTTP metadata
		expect(options.httpMetadata.contentType).toBe('application/json');

		// Verify custom metadata contains hash
		expect(options.customMetadata['sha256-hex']).toMatch(/^[a-f0-9]{64}$/);
	});

	it('should compute consistent hash for same data regardless of key order', async () => {
		// Two objects with same data but different key order
		const requestBody1 = {
			type: 'test',
			data: {
				a: 1,
				b: 2,
				c: 3,
			},
		};

		const requestBody2 = {
			type: 'test',
			data: {
				c: 3,
				a: 1,
				b: 2,
			},
		};

		// First request
		const request1 = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody1),
		});

		const ctx1 = createExecutionContext();
		const response1 = await worker.fetch(request1, env, ctx1);
		await waitOnExecutionContext(ctx1);
		const data1 = (await response1.json()) as any;

		// Second request
		const request2 = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody2),
		});

		const ctx2 = createExecutionContext();
		const response2 = await worker.fetch(request2, env, ctx2);
		await waitOnExecutionContext(ctx2);
		const data2 = (await response2.json()) as any;

		// Same hash and object key should be generated
		expect(data1.id).toBe(data2.id);
		expect(data1.objectKey).toBe(data2.objectKey);
	});

	it('should reject request with missing authentication', async () => {
		const requestBody = {
			type: 'test',
			data: { foo: 'bar' },
		};

		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
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
		const requestBody = {
			type: 'test',
			data: { foo: 'bar' },
		};

		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer wrong-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
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

	it('should reject request with invalid JSON', async () => {
		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: 'not valid json{',
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBe('Invalid JSON in request body');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should reject request with missing type field', async () => {
		const requestBody = {
			data: { foo: 'bar' },
		};

		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBe('Missing or invalid "type" field');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should reject request with invalid type field (non-string)', async () => {
		const requestBody = {
			type: 123,
			data: { foo: 'bar' },
		};

		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBe('Missing or invalid "type" field');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should reject request with missing data field', async () => {
		const requestBody = {
			type: 'test',
		};

		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBe('Missing or invalid "data" field (must be an object)');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should reject request with data as array instead of object', async () => {
		const requestBody = {
			type: 'test',
			data: [1, 2, 3],
		};

		const request = new IncomingRequest('http://example.com/upload', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-auth-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBe('Missing or invalid "data" field (must be an object)');

		// Verify R2 put was not called
		expect(mockR2Put).not.toHaveBeenCalled();
	});

	it('should accept any type string (future-proof)', async () => {
		const types = ['chatter', 'checkins', 'films', 'quotes', 'shakespeare', 'topten', 'new-type'];

		for (const type of types) {
			const requestBody = {
				type,
				data: { content: 'test' },
			};

			const request = new IncomingRequest('http://example.com/upload', {
				method: 'POST',
				headers: {
					Authorization: 'Bearer test-auth-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);

			const data = (await response.json()) as any;
			expect(data.objectKey).toBeDefined();
			expect(data.id).toBeDefined();
		}

		// Verify R2 put was called for each type
		expect(mockR2Put).toHaveBeenCalledTimes(types.length);
	});
});
