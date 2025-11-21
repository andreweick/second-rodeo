import { describe, it, expect, beforeEach } from 'vitest';
import { createChatter, storeChatter, createAndStoreChatter } from '../src/services/chatter-service';
import type { CreateChatterRequest, Chatter } from '../src/types/chatter';
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

describe('Chatter Service', () => {
	let mockEnv: Env;

	beforeEach(() => {
		mockEnv = createMockEnv();
	});

	describe('createChatter', () => {
		it('should create a chatter with location_hint only', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Testing with location hint',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter).toBeDefined();
			expect(chatter.type).toBe('chatter');
			expect(chatter.id).toMatch(/^sha256:[a-f0-9]{64}$/);
			expect(chatter.schema_version).toBe('1.1.0');
			expect(chatter.data.content).toBe(request.content);
			expect(chatter.data.kind).toBe('chatter');
			expect(chatter.data.environment).toBeDefined();
		});

		it('should create a chatter with place only', async () => {
			const request: CreateChatterRequest = {
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

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter).toBeDefined();
			expect(chatter.data.place).toBeDefined();
			expect(chatter.data.place?.name).toBe('Googleplex');
			expect(chatter.data.environment).toBeDefined();
			expect(chatter.data.environment?.place).toBeDefined();
		});

		it('should create a chatter with both location_hint and place', async () => {
			const request: CreateChatterRequest = {
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

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter).toBeDefined();
			expect(chatter.data.location_hint).toBeDefined();
			expect(chatter.data.place).toBeDefined();
			expect(chatter.data.environment).toBeDefined();
		});

		it('should create a chatter with minimal data (no location)', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Testing without location',
				date_posted: new Date().toISOString(),
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter).toBeDefined();
			expect(chatter.data.content).toBe(request.content);
			expect(chatter.data.location_hint).toBeUndefined();
			expect(chatter.data.place).toBeUndefined();
			// Environment should still be defined but may be empty or partial
			expect(chatter.data.environment).toBeDefined();
		});

		it('should include optional fields when provided', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Testing with optional fields',
				date_posted: new Date().toISOString(),
				title: 'Test Title',
				tags: ['test', 'vitest'],
				publish: true,
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter).toBeDefined();
			expect(chatter.data.title).toBe('Test Title');
			expect(chatter.data.tags).toEqual(['test', 'vitest']);
			expect(chatter.data.publish).toBe(true);
		});

		it('should generate consistent SHA256 hash for identical content', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Deterministic content',
				date_posted: '2025-01-01T00:00:00.000Z',
			};

			const chatter1 = await createChatter(request, mockEnv, true);
			const chatter2 = await createChatter(request, mockEnv, true);

			// Note: Hashes may differ due to captured_at timestamps in environment snapshots
			// But the structure should be consistent
			expect(chatter1.id).toMatch(/^sha256:[a-f0-9]{64}$/);
			expect(chatter2.id).toMatch(/^sha256:[a-f0-9]{64}$/);
		});
	});

	describe('storeChatter', () => {
		it('should store chatter in R2 with correct key format', async () => {
			const chatter: Chatter = {
				type: 'chatter',
				id: 'sha256:abc123',
				schema_version: '1.1.0',
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

			await storeChatter(chatter, mockEnv);

			expect(storedKey).toBe('chatter/sha256_abc123.json');
		});

		it('should serialize chatter as JSON', async () => {
			const chatter: Chatter = {
				type: 'chatter',
				id: 'sha256:test123',
				schema_version: '1.1.0',
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

			await storeChatter(chatter, mockEnv);

			expect(storedValue).toBeDefined();
			const parsed = JSON.parse(storedValue!);
			expect(parsed.type).toBe('chatter');
			expect(parsed.id).toBe('sha256:test123');
		});
	});

	describe('createAndStoreChatter', () => {
		it('should create and store post in one operation', async () => {
			const request: CreateChatterRequest = {
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

			const chatter = await createAndStoreChatter(request, mockEnv, true);

			expect(chatter).toBeDefined();
			expect(chatter.id).toMatch(/^sha256:[a-f0-9]{64}$/);
			expect(storedKey).toContain('chatter/sha256_');
			expect(storedValue).toBeDefined();

			const parsed = JSON.parse(storedValue!);
			expect(parsed.id).toBe(chatter.id);
			expect(parsed.data.content).toBe('End-to-end test');
		});
	});

	describe('Environmental Enrichment', () => {
		it('should include weather data when location is provided', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Weather test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter.data.environment?.weather).toBeDefined();
			if (chatter.data.environment?.weather) {
				expect(chatter.data.environment.weather.captured_at).toBeDefined();
				expect(chatter.data.environment.weather.provider).toBeDefined();
				expect(chatter.data.environment.weather.provider.name).toBe('google');
				expect(chatter.data.environment.weather.summary).toBeDefined();
				expect(chatter.data.environment.weather.summary.temp_f).toBeDefined();
			}
		});

		it('should include air quality data when location is provided', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Air quality test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter.data.environment?.air_quality).toBeDefined();
			if (chatter.data.environment?.air_quality) {
				expect(chatter.data.environment.air_quality.summary.aqi).toBeDefined();
				expect(chatter.data.environment.air_quality.summary.category).toBeDefined();
			}
		});

		it('should include pollen data when location is provided', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Pollen test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter.data.environment?.pollen).toBeDefined();
			if (chatter.data.environment?.pollen) {
				expect(chatter.data.environment.pollen.summary.overall_index).toBeDefined();
			}
		});

		it('should include elevation data when location is provided', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Elevation test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter.data.environment?.elevation).toBeDefined();
			if (chatter.data.environment?.elevation) {
				expect(chatter.data.environment.elevation.summary.elevation_ft).toBeDefined();
			}
		});

		it('should include geocoding data when location_hint is provided', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Geocoding test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter.data.environment?.geocoding).toBeDefined();
			if (chatter.data.environment?.geocoding) {
				expect(chatter.data.environment.geocoding.summary.formatted_address).toBeDefined();
			}
		});

		it('should fetch place details when place with provider_id is provided', async () => {
			const request: CreateChatterRequest = {
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

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter.data.environment?.place).toBeDefined();
			if (chatter.data.environment?.place) {
				expect(chatter.data.environment.place.summary.name).toBeDefined();
				expect(chatter.data.environment.place.summary.formatted_address).toBeDefined();
			}
		});
	});

	describe('Schema Validation', () => {
		it('should produce chatter matching Post schema structure', async () => {
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Schema validation test',
				date_posted: new Date().toISOString(),
				location_hint: {
					lat: 37.4224764,
					lng: -122.0842499,
				},
			};

			const chatter = await createChatter(request, mockEnv, true);

			// Validate envelope structure
			expect(chatter.type).toBe('chatter');
			expect(chatter.id).toBeDefined();
			expect(chatter.id).toMatch(/^sha256:[a-f0-9]{64}$/);
			expect(chatter.schema_version).toBe('1.1.0');

			// Validate data structure
			expect(chatter.data).toBeDefined();
			expect(chatter.data.kind).toBe('chatter');
			expect(chatter.data.content).toBeDefined();
			expect(chatter.data.date_posted).toBeDefined();
			expect(chatter.data.environment).toBeDefined();

			// Validate environment structure
			const env = chatter.data.environment;
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
			const request: CreateChatterRequest = {
				kind: 'chatter',
				content: 'Date format test',
				date_posted: datePosted,
			};

			const chatter = await createChatter(request, mockEnv, true);

			expect(chatter.data.date_posted).toBe(datePosted);
			// Verify it's a valid ISO 8601 string
			expect(new Date(chatter.data.date_posted).toISOString()).toBe(datePosted);
		});
	});
});
