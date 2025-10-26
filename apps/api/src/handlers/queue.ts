import type { Env } from '../types/env';
import { processJsonFromR2 } from '../services/json-processor';

/**
 * Message body structure expected from the queue
 */
export interface QueueMessageBody {
	objectKey: string;
}

/**
 * Handles queue message batches
 * Cloudflare calls this automatically when messages are ready to process
 */
export async function handleQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
	console.log(`Processing batch of ${batch.messages.length} messages from queue: ${batch.queue}`);

	for (const message of batch.messages) {
		try {
			// Validate message structure
			if (
				!message.body ||
				typeof message.body !== 'object' ||
				!('objectKey' in message.body) ||
				typeof message.body.objectKey !== 'string'
			) {
				console.error(`Message ${message.id} has invalid structure:`, message.body);
				continue;
			}

			const { objectKey } = message.body;
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
