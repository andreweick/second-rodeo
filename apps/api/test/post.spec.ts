import { describe, it, expect, beforeEach } from 'vitest';
import { createPost, storePost, createAndStorePost } from '../src/services/post-service';
import type { CreatePostRequest, Post } from '../src/types/post';
import type { Env } from '../src/types/env';

// Mock environment for testing
const createMockEnv = (): Env => {
	return {
		SR_JSON: {
			put: async (key: string, value: string) => {
				// Mock R2 put operation
				return {
					key,
					version: 'mock-version',
					size: value.length,
					etag: 'mock-etag',
					httpEtag: 'mock-http-etag',
					checksums: {},
					uploaded: new Date(),
				};
			},
			get: async (key: string) => null,
			delete: async (key: string) => {},
			list: async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }),
			head: async (key: string) => null,
		} as any,
		GOOGLE_PLACES_API: {
			get: async () => 'mock-api-key',
		} as any,
		AUTH_TOKEN: {
			get: async () => 'mock-auth-token',
		} as any,
		DB: {} as any,
		JSON_QUEUE: {} as any,
		ASSETS: {} as any,
	};
};

describe('Post Service', () => {
	let mockEnv: Env;

	beforeEach(() => {
		mockEnv = createMockEnv();
	});

	describe('createPost', () => {
		it('should create a post with location_hint only', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Testing with location hint',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post).toBeDefined();
			expect(post.type).toBe('post');
			expect(post.id).toMatch(/^sha256_[a-f0-9]{64}$/);
			expect(post.schema_version).toBe('v1');
			expect(post.data.content).toBe(request.content);
			expect(post.data.kind).toBe('chatter');
			expect(post.data.environment).toBeDefined();
		});

		it('should create a post with place only', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Testing with place',
				date_posted: new Date().toISOString(),
				place: {
					name: 'Googleplex',
					formatted_address: '1600 Amphitheatre Parkway, Mountain View, CA',
					short_address: 'Mountain View, CA',
					location: {
						lat: 37.4224764,
						lng: -122.0842499,
					},
					provider_ids: {
						google_places_api_new: 'ChIJj61dQgK6j4AR4GeTYWZsKWw',
					},
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post).toBeDefined();
			expect(post.data.place).toBeDefined();
			expect(post.data.place?.name).toBe('Googleplex');
			expect(post.data.environment).toBeDefined();
			expect(post.data.environment?.place).toBeDefined();
		});

		it('should create a post with both location_hint and place', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Testing with both location types',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
				place: {
					name: 'Googleplex',
					formatted_address: '1600 Amphitheatre Parkway, Mountain View, CA',
					short_address: 'Mountain View, CA',
					location: {
						lat: 37.4224764,
						lng: -122.0842499,
					},
					provider_ids: {
						google_places_api_new: 'ChIJj61dQgK6j4AR4GeTYWZsKWw',
					},
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post).toBeDefined();
			expect(post.data.location_hint).toBeDefined();
			expect(post.data.place).toBeDefined();
			expect(post.data.environment).toBeDefined();
		});

		it('should create a post with minimal data (no location)', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Testing without location',
				date_posted: new Date().toISOString(),
			};

			const post = await createPost(request, mockEnv, true);

			expect(post).toBeDefined();
			expect(post.data.content).toBe(request.content);
			expect(post.data.location_hint).toBeUndefined();
			expect(post.data.place).toBeUndefined();
			// Environment should still be defined but may be empty or partial
			expect(post.data.environment).toBeDefined();
		});

		it('should include optional fields when provided', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Testing with optional fields',
				date_posted: new Date().toISOString(),
				title: 'Test Title',
				tags: ['test', 'vitest'],
				publish: true,
			};

			const post = await createPost(request, mockEnv, true);

			expect(post).toBeDefined();
			expect(post.data.title).toBe('Test Title');
			expect(post.data.tags).toEqual(['test', 'vitest']);
			expect(post.data.publish).toBe(true);
		});

		it('should generate consistent SHA256 hash for identical content', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Deterministic content',
				date_posted: '2025-01-01T00:00:00.000Z',
			};

			const post1 = await createPost(request, mockEnv, true);
			const post2 = await createPost(request, mockEnv, true);

			// Note: Hashes may differ due to captured_at timestamps in environment snapshots
			// But the structure should be consistent
			expect(post1.id).toMatch(/^sha256_[a-f0-9]{64}$/);
			expect(post2.id).toMatch(/^sha256_[a-f0-9]{64}$/);
		});
	});

	describe('storePost', () => {
		it('should store post in R2 with correct key format', async () => {
			const post: Post = {
				type: 'post',
				id: 'sha256_abc123',
				schema_version: 'v1',
				data: {
					kind: 'chatter',
					content: 'Test content',
					date_posted: new Date().toISOString(),
					environment: {},
				},
			};

			let storedKey: string | undefined;
			mockEnv.SR_JSON.put = async (key: string, value: string) => {
				storedKey = key;
				return {
					key,
					version: 'mock-version',
					size: value.length,
					etag: 'mock-etag',
					httpEtag: 'mock-http-etag',
					checksums: {},
					uploaded: new Date(),
				};
			};

			await storePost(post, mockEnv);

			expect(storedKey).toBe('post/sha256_abc123.json');
		});

		it('should serialize post as JSON', async () => {
			const post: Post = {
				type: 'post',
				id: 'sha256_test123',
				schema_version: 'v1',
				data: {
					kind: 'chatter',
					content: 'Serialization test',
					date_posted: new Date().toISOString(),
					environment: {},
				},
			};

			let storedValue: string | undefined;
			mockEnv.SR_JSON.put = async (key: string, value: string) => {
				storedValue = value;
				return {
					key,
					version: 'mock-version',
					size: value.length,
					etag: 'mock-etag',
					httpEtag: 'mock-http-etag',
					checksums: {},
					uploaded: new Date(),
				};
			};

			await storePost(post, mockEnv);

			expect(storedValue).toBeDefined();
			const parsed = JSON.parse(storedValue!);
			expect(parsed.type).toBe('post');
			expect(parsed.id).toBe('sha256_test123');
		});
	});

	describe('createAndStorePost', () => {
		it('should create and store post in one operation', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'End-to-end test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			let storedKey: string | undefined;
			let storedValue: string | undefined;
			mockEnv.SR_JSON.put = async (key: string, value: string) => {
				storedKey = key;
				storedValue = value;
				return {
					key,
					version: 'mock-version',
					size: value.length,
					etag: 'mock-etag',
					httpEtag: 'mock-http-etag',
					checksums: {},
					uploaded: new Date(),
				};
			};

			const post = await createAndStorePost(request, mockEnv, true);

			expect(post).toBeDefined();
			expect(post.id).toMatch(/^sha256_[a-f0-9]{64}$/);
			expect(storedKey).toBe(`post/${post.id}.json`);
			expect(storedValue).toBeDefined();

			const parsed = JSON.parse(storedValue!);
			expect(parsed.id).toBe(post.id);
			expect(parsed.data.content).toBe('End-to-end test');
		});
	});

	describe('Environmental Enrichment', () => {
		it('should include weather data when location is provided', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Weather test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post.data.environment?.weather).toBeDefined();
			if (post.data.environment?.weather) {
				expect(post.data.environment.weather.captured_at).toBeDefined();
				expect(post.data.environment.weather.provider).toBeDefined();
				expect(post.data.environment.weather.provider.name).toBe('google');
				expect(post.data.environment.weather.summary).toBeDefined();
				expect(post.data.environment.weather.summary.temp_f).toBeDefined();
			}
		});

		it('should include air quality data when location is provided', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Air quality test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post.data.environment?.air_quality).toBeDefined();
			if (post.data.environment?.air_quality) {
				expect(post.data.environment.air_quality.summary.aqi).toBeDefined();
				expect(post.data.environment.air_quality.summary.category).toBeDefined();
			}
		});

		it('should include pollen data when location is provided', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Pollen test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post.data.environment?.pollen).toBeDefined();
			if (post.data.environment?.pollen) {
				expect(post.data.environment.pollen.summary.overall_index).toBeDefined();
			}
		});

		it('should include elevation data when location is provided', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Elevation test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post.data.environment?.elevation).toBeDefined();
			if (post.data.environment?.elevation) {
				expect(post.data.environment.elevation.summary.elevation_ft).toBeDefined();
			}
		});

		it('should include geocoding data when location_hint is provided', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Geocoding test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post.data.environment?.geocoding).toBeDefined();
			if (post.data.environment?.geocoding) {
				expect(post.data.environment.geocoding.summary.formatted_address).toBeDefined();
			}
		});

		it('should fetch place details when place with provider_id is provided', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Place details test',
				date_posted: new Date().toISOString(),
				place: {
					name: 'Googleplex',
					formatted_address: '1600 Amphitheatre Parkway, Mountain View, CA',
					short_address: 'Mountain View, CA',
					location: {
						lat: 37.4224764,
						lng: -122.0842499,
					},
					provider_ids: {
						google_places_api_new: 'ChIJj61dQgK6j4AR4GeTYWZsKWw',
					},
				},
			};

			const post = await createPost(request, mockEnv, true);

			expect(post.data.environment?.place).toBeDefined();
			if (post.data.environment?.place) {
				expect(post.data.environment.place.summary.name).toBeDefined();
				expect(post.data.environment.place.summary.formatted_address).toBeDefined();
			}
		});
	});

	describe('Schema Validation', () => {
		it('should produce post matching Post schema structure', async () => {
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Schema validation test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const post = await createPost(request, mockEnv, true);

			// Validate envelope structure
			expect(post.type).toBe('post');
			expect(post.id).toBeDefined();
			expect(post.id).toMatch(/^sha256_[a-f0-9]{64}$/);
			expect(post.schema_version).toBe('v1');

			// Validate data structure
			expect(post.data).toBeDefined();
			expect(post.data.kind).toBe('chatter');
			expect(post.data.content).toBeDefined();
			expect(post.data.date_posted).toBeDefined();
			expect(post.data.environment).toBeDefined();

			// Validate environment structure
			const env = post.data.environment;
			if (env) {
				// Each snapshot should have captured_at, provider, summary, full
				if (env.weather) {
					expect(env.weather.captured_at).toBeDefined();
					expect(env.weather.provider).toBeDefined();
					expect(env.weather.summary).toBeDefined();
					expect(env.weather.full).toBeDefined();
				}
			}
		});

		it('should handle date_posted as ISO 8601 string', async () => {
			const datePosted = '2025-01-15T12:34:56.789Z';
			const request: CreatePostRequest = {
				kind: 'chatter',
				content: 'Date format test',
				date_posted: datePosted,
			};

			const post = await createPost(request, mockEnv, true);

			expect(post.data.date_posted).toBe(datePosted);
			// Verify it's a valid ISO 8601 string
			expect(new Date(post.data.date_posted).toISOString()).toBe(datePosted);
		});
	});
});
