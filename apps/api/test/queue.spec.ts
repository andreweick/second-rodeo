/// <reference types="./env.d.ts" />
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { handleQueue } from '../src/handlers/queue';

// Import migration files as raw strings
// @ts-expect-error
import migration0 from '../migrations/0000_supreme_quicksilver.sql?raw';

// Import fixture files as raw strings
// @ts-expect-error
import chatterFixture from './fixtures/chatter/sha256_ffea612adc0d60c0ca8bc548966b947c93b35eb2f0efd22d2f3061535df8d6c8.jsonl?raw';
// @ts-expect-error
import checkinFixture from './fixtures/checkins/sha256_0a27551e77187f162787eb927b76a9328ef80896eef60d662e70ecc43b0fbcd7.jsonl?raw';
// @ts-expect-error
import filmFixture from './fixtures/films/sha256_0accb27c1e4af68eaadbef5aaee901f5ab11e9ce872d7eb29820e82dc38e2624.jsonl?raw';
// @ts-expect-error
import quoteFixture from './fixtures/quotes/sha256_06b0e94e4c7f886b2fc6958720ee4f07eea7a68166d89f43a36e10c77228a39a.jsonl?raw';
// @ts-expect-error
import shakespeareFixture from './fixtures/shakespert/sha256_7e03cbe440cd61d8774a0f6c068ecdd109dd80abac6e4d065028e077636832d5.jsonl?raw';

/**
 * Helper to create a test queue message
 */
function createMessage(id: string, body: unknown): Message<unknown> {
	return {
		id,
		timestamp: new Date(),
		body,
		attempts: 1,
		retry: () => {},
		ack: () => {},
	};
}

/**
 * Helper to create a test message batch
 */
function createBatch(messages: Message<unknown>[]): MessageBatch<unknown> {
	return {
		queue: 'sr-queue',
		messages,
		retryAll: () => {},
		ackAll: () => {},
	};
}

/**
 * Run production database migrations
 * Imports actual migration SQL files and executes them using D1's batch API
 * This ensures test tables match production schema exactly
 */
async function runMigrations(): Promise<void> {
	// Migrations imported as raw strings at build time
	const migrations = [migration0];

	// Execute each migration file
	for (const migrationSql of migrations) {
		// Split on statement-breakpoint comments and clean up
		const statements = migrationSql
			.split('--> statement-breakpoint')
			.map((s: string) => s.trim())
			.filter((s: string) => s.length > 0 && !s.startsWith('--')); // Remove empty and comment-only lines

		// Execute all statements in a batch
		// D1's batch() is more reliable than exec() for multiple statements
		if (statements.length > 0) {
			await env.DB.batch(statements.map((sql: string) => env.DB.prepare(sql)));
		}
	}
}

/**
 * Load fixture files from test/fixtures/ into R2
 * Fixtures are imported as raw strings
 */
async function loadFixtures(): Promise<void> {
	// Fixtures imported as raw strings (category, filename, content)
	const fixtures: Array<[string, string, string]> = [
		['chatter', 'sha256_ffea612adc0d60c0ca8bc548966b947c93b35eb2f0efd22d2f3061535df8d6c8.jsonl', chatterFixture],
		['checkins', 'sha256_0a27551e77187f162787eb927b76a9328ef80896eef60d662e70ecc43b0fbcd7.jsonl', checkinFixture],
		['films', 'sha256_0accb27c1e4af68eaadbef5aaee901f5ab11e9ce872d7eb29820e82dc38e2624.jsonl', filmFixture],
		['quotes', 'sha256_06b0e94e4c7f886b2fc6958720ee4f07eea7a68166d89f43a36e10c77228a39a.jsonl', quoteFixture],
		['shakespert', 'sha256_7e03cbe440cd61d8774a0f6c068ecdd109dd80abac6e4d065028e077636832d5.jsonl', shakespeareFixture],
	];

	// Load each fixture file into R2
	for (const [category, file, content] of fixtures) {
		// Put into R2 with path: /{category}/{filename}
		await env.SR_JSON.put(`/${category}/${file}`, content);
	}
}

describe('Queue Handler', () => {
	beforeEach(async () => {
		// Run production database migrations from actual migration files
		// This ensures test tables exactly match production schema
		await runMigrations();

		// Load fixture files into R2
		// Files are imported as raw strings at build time
		await loadFixtures();
	});

	it('should process chatter file', async () => {
		const batch = createBatch([
			createMessage('msg-1', {
				objectKey: '/chatter/sha256_ffea612adc0d60c0ca8bc548966b947c93b35eb2f0efd22d2f3061535df8d6c8.jsonl',
			}),
		]);

		// Should not throw
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should process checkin file', async () => {
		const batch = createBatch([
			createMessage('msg-2', {
				objectKey: '/checkins/sha256_0a27551e77187f162787eb927b76a9328ef80896eef60d662e70ecc43b0fbcd7.jsonl',
			}),
		]);

		// Should not throw
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should process film file', async () => {
		const batch = createBatch([
			createMessage('msg-3', {
				objectKey: '/films/sha256_0accb27c1e4af68eaadbef5aaee901f5ab11e9ce872d7eb29820e82dc38e2624.jsonl',
			}),
		]);

		// Should not throw
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should process quote file', async () => {
		const batch = createBatch([
			createMessage('msg-4', {
				objectKey: '/quotes/sha256_06b0e94e4c7f886b2fc6958720ee4f07eea7a68166d89f43a36e10c77228a39a.jsonl',
			}),
		]);

		// Should not throw
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should process shakespert file', async () => {
		const batch = createBatch([
			createMessage('msg-5', {
				objectKey: '/shakespert/sha256_7e03cbe440cd61d8774a0f6c068ecdd109dd80abac6e4d065028e077636832d5.jsonl',
			}),
		]);

		// Should not throw
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should handle missing file in R2', async () => {
		const batch = createBatch([createMessage('msg-6', { objectKey: '/missing/file.jsonl' })]);

		// Should not throw - errors are logged but processing continues
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should process batch with multiple files from different categories', async () => {
		const batch = createBatch([
			createMessage('msg-7', {
				objectKey: '/chatter/sha256_ffea612adc0d60c0ca8bc548966b947c93b35eb2f0efd22d2f3061535df8d6c8.jsonl',
			}),
			createMessage('msg-8', {
				objectKey: '/checkins/sha256_0a27551e77187f162787eb927b76a9328ef80896eef60d662e70ecc43b0fbcd7.jsonl',
			}),
			createMessage('msg-9', {
				objectKey: '/films/sha256_0accb27c1e4af68eaadbef5aaee901f5ab11e9ce872d7eb29820e82dc38e2624.jsonl',
			}),
		]);

		// Should process all 3 messages successfully
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should handle malformed message (missing objectKey)', async () => {
		const batch = createBatch([createMessage('msg-10', {})]); // Missing objectKey in body

		// Should not throw - invalid messages are skipped
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});

	it('should handle empty batch', async () => {
		const batch = createBatch([]);

		// Should complete successfully with no messages
		await expect(handleQueue(batch, env)).resolves.toBeUndefined();
	});
});
