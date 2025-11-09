import type { Env } from '../types/env';
import { processJsonFromR2 } from '../services/json-processor';

/**
 * Message body structure expected from the queue
 */
export type QueueMessageBody =
	| {
			objectKey: string;
	  }
	| {
			type: 'pagination';
			cursor: string;
	  };

/**
 * Handles queue message batches
 * Cloudflare calls this automatically when messages are ready to process
 */
export async function handleQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
	console.log(`Processing batch of ${batch.messages.length} messages from queue: ${batch.queue}`);

	for (const message of batch.messages) {
		try {
			// Validate message structure
			if (!message.body || typeof message.body !== 'object') {
				console.error(`Message ${message.id} has invalid structure:`, message.body);
				continue;
			}

			const body = message.body as QueueMessageBody;

			// Check if this is a pagination message
			if ('type' in body && body.type === 'pagination') {
				console.log(`Processing pagination message ${message.id} with cursor`);

				// Get auth token to call our own endpoint
				const authToken = await env.AUTH_TOKEN.get();

				// Trigger next page of ingestion
				const response = await fetch(`https://api.missionfocus.workers.dev/ingest/all?cursor=${body.cursor}`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				});

				if (!response.ok) {
					console.error(`Pagination request failed: ${response.status} ${await response.text()}`);
				} else {
					console.log(`Pagination request successful`);
				}
				continue;
			}

			// Otherwise, it's a file ingestion message
			if (!('objectKey' in body) || typeof body.objectKey !== 'string') {
				console.error(`Message ${message.id} missing objectKey:`, message.body);
				continue;
			}

			const { objectKey } = body;
			console.log(`Processing message ${message.id} for object: ${objectKey}`);

			// Process the JSON file from R2 and record to database
			const result = await processJsonFromR2(objectKey, env.SR_JSON, env.DB);

			console.log(`Successfully processed ${objectKey}:`, result);
		} catch (error) {
			console.error(`Error processing message ${message.id}:`, error);
			// In production, you might want to track failed messages
			// For now, we continue processing other messages in the batch
		}
	}

	console.log(`Finished processing batch of ${batch.messages.length} messages`);
}
