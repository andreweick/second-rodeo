import { drizzle } from 'drizzle-orm/d1';
import { chatter, checkins, films, quotes, shakespeare, topten } from '../db/schema';
import type { NewChatter, NewCheckin, NewFilm, NewQuote, NewShakespeareParagraph, NewTopTen } from '../db/schema';

/**
 * Result of JSON processing
 */
export interface ValidationResult {
	valid: boolean;
	objectKey: string;
	category?: string;
	inserted?: boolean;
	error?: string;
}

/**
 * Wrapped JSON format from R2
 */
interface WrappedJson {
	type: string;
	id?: string;
	data: Record<string, unknown>;
}

/**
 * Validate and map chatter JSON to schema
 * Expects wrapped JSON: {type: "chatter", id: "...", data: {...}}
 */
function validateAndMapChatter(data: Record<string, unknown>, objectKey: string, recordId?: string): NewChatter {
	// Validate required fields from data object
	const id = recordId || (typeof data.id === 'string' ? data.id : undefined);
	if (!id) throw new Error('Missing id field (must be in top-level or data object)');
	if (typeof data.date_posted !== 'string') throw new Error('Missing or invalid field: date_posted');
	if (typeof data.year !== 'number') throw new Error('Missing or invalid field: year');
	if (typeof data.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof data.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id,
		datePosted: new Date(data.date_posted),
		year: data.year,
		month: data.month,
		slug: data.slug,
		publish: typeof data.publish === 'boolean' ? data.publish : true,
		r2Key: objectKey,
	};
}

/**
 * Validate and map checkin JSON to schema
 * Expects wrapped JSON: {type: "checkins", id: "...", data: {...}}
 */
function validateAndMapCheckin(data: Record<string, unknown>, objectKey: string, recordId?: string): NewCheckin {
	// Validate required fields from data object
	const id = recordId || (typeof data.id === 'string' ? data.id : undefined);
	if (!id) throw new Error('Missing id field (must be in top-level or data object)');
	if (typeof data.venue_id !== 'string') throw new Error('Missing or invalid field: venue_id');
	if (typeof data.latitude !== 'number') throw new Error('Missing or invalid field: latitude');
	if (typeof data.longitude !== 'number') throw new Error('Missing or invalid field: longitude');
	if (typeof data.datetime !== 'string') throw new Error('Missing or invalid field: datetime');
	if (typeof data.year !== 'number') throw new Error('Missing or invalid field: year');
	if (typeof data.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof data.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id,
		venueId: data.venue_id,
		latitude: data.latitude,
		longitude: data.longitude,
		datetime: new Date(data.datetime),
		year: data.year,
		month: data.month,
		slug: data.slug,
		publish: typeof data.publish === 'boolean' ? data.publish : true,
		r2Key: objectKey,
	};
}

/**
 * Validate and map film JSON to schema
 * Expects wrapped JSON: {type: "films", id: "...", data: {...}}
 */
function validateAndMapFilm(data: Record<string, unknown>, objectKey: string, recordId?: string): NewFilm {
	// Validate required fields from data object
	const id = recordId || (typeof data.id === 'string' ? data.id : undefined);
	if (!id) throw new Error('Missing id field (must be in top-level or data object)');
	if (typeof data.year_watched !== 'number') throw new Error('Missing or invalid field: year_watched');
	if (typeof data.date_watched !== 'string') throw new Error('Missing or invalid field: date_watched');
	if (typeof data.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof data.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id,
		yearWatched: data.year_watched,
		dateWatched: new Date(data.date_watched),
		month: data.month,
		slug: data.slug,
		rewatch: typeof data.rewatch === 'boolean' ? data.rewatch : false,
		publish: typeof data.publish === 'boolean' ? data.publish : true,
		tmdbId: typeof data.tmdb_id === 'string' ? data.tmdb_id : undefined,
		letterboxdId: typeof data.letterboxd_id === 'string' ? data.letterboxd_id : undefined,
		r2Key: objectKey,
	};
}

/**
 * Validate and map quote JSON to schema
 * Expects wrapped JSON: {type: "quotes", id: "...", data: {...}}
 */
function validateAndMapQuote(data: Record<string, unknown>, objectKey: string, recordId?: string): NewQuote {
	// Validate required fields from data object
	const id = recordId || (typeof data.id === 'string' ? data.id : undefined);
	if (!id) throw new Error('Missing id field (must be in top-level or data object)');
	if (typeof data.author !== 'string') throw new Error('Missing or invalid field: author');
	if (typeof data.date_added !== 'string') throw new Error('Missing or invalid field: date_added');
	if (typeof data.year !== 'number') throw new Error('Missing or invalid field: year');
	if (typeof data.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof data.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id,
		author: data.author,
		dateAdded: new Date(data.date_added),
		year: data.year,
		month: data.month,
		slug: data.slug,
		publish: typeof data.publish === 'boolean' ? data.publish : true,
		r2Key: objectKey,
	};
}

/**
 * Validate and map shakespeare JSON to schema
 * Expects wrapped JSON: {type: "shakespeare", id: "...", data: {...}}
 */
function validateAndMapShakespeare(data: Record<string, unknown>, objectKey: string, recordId?: string): NewShakespeareParagraph {
	// Validate required fields from data object
	const id = recordId || (typeof data.id === 'string' ? data.id : undefined);
	if (!id) throw new Error('Missing id field (must be in top-level or data object)');
	if (typeof data.work_id !== 'string') throw new Error('Missing or invalid field: work_id');
	if (typeof data.act !== 'number') throw new Error('Missing or invalid field: act');
	if (typeof data.scene !== 'number') throw new Error('Missing or invalid field: scene');
	if (typeof data.character_id !== 'string') throw new Error('Missing or invalid field: character_id');
	if (typeof data.word_count !== 'number') throw new Error('Missing or invalid field: word_count');
	if (typeof data.timestamp !== 'string' && typeof data.timestamp !== 'number')
		throw new Error('Missing or invalid field: timestamp');

	return {
		id,
		workId: data.work_id,
		act: data.act,
		scene: data.scene,
		characterId: data.character_id,
		wordCount: data.word_count,
		timestamp: typeof data.timestamp === 'number' ? new Date(data.timestamp * 1000) : new Date(data.timestamp),
		r2Key: objectKey,
	};
}

/**
 * Validate and map topten JSON to schema
 * Expects wrapped JSON: {type: "topten", id: "...", data: {...}}
 */
function validateAndMapTopTen(data: Record<string, unknown>, objectKey: string, recordId?: string): NewTopTen {
	// Validate required fields from data object
	const id = recordId || (typeof data.id === 'string' ? data.id : undefined);
	if (!id) throw new Error('Missing id field (must be in top-level or data object)');
	if (typeof data.show !== 'string') throw new Error('Missing or invalid field: show');
	if (typeof data.date !== 'string') throw new Error('Missing or invalid field: date');
	if (typeof data.timestamp !== 'string' && typeof data.timestamp !== 'number')
		throw new Error('Missing or invalid field: timestamp');
	if (typeof data.year !== 'number') throw new Error('Missing or invalid field: year');
	if (typeof data.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof data.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id,
		show: data.show,
		date: data.date,
		timestamp: typeof data.timestamp === 'number' ? new Date(data.timestamp * 1000) : new Date(data.timestamp),
		year: data.year,
		month: data.month,
		slug: data.slug,
		r2Key: objectKey,
	};
}

/**
 * Processes a JSON file from R2 and inserts into appropriate database table
 * Routes based on type field in wrapped JSON: {type: "chatter", data: {...}}
 *
 * @param objectKey - The key of the object in the R2 bucket (e.g., sha256_xxx.json)
 * @param bucket - The R2 bucket to read from
 * @param db - The D1 database to insert into
 * @returns Validation result with processing status
 */
export async function processJsonFromR2(
	objectKey: string,
	bucket: R2Bucket,
	db: D1Database
): Promise<ValidationResult> {
	const orm = drizzle(db);

	try {
		// Fetch object from R2
		const object = await bucket.get(objectKey);

		if (!object) {
			return {
				valid: false,
				objectKey,
				error: `Object not found: ${objectKey}`,
			};
		}

		// Read the content as text
		const text = await object.text();

		// Parse JSON
		let parsedData: unknown;
		try {
			parsedData = JSON.parse(text);
		} catch (parseError) {
			return {
				valid: false,
				objectKey,
				error: `Invalid JSON syntax: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
			};
		}

		// Validate wrapped JSON structure
		if (typeof parsedData !== 'object' || parsedData === null) {
			return {
				valid: false,
				objectKey,
				error: 'JSON must be an object',
			};
		}

		const wrapped = parsedData as Partial<WrappedJson>;

		// Validate type field exists
		if (!wrapped.type || typeof wrapped.type !== 'string') {
			return {
				valid: false,
				objectKey,
				error: 'Missing or invalid "type" field in wrapped JSON',
			};
		}

		// Validate data field exists
		if (!wrapped.data || typeof wrapped.data !== 'object') {
			return {
				valid: false,
				objectKey,
				error: 'Missing or invalid "data" field in wrapped JSON',
			};
		}

		const category = wrapped.type;
		const data = wrapped.data;
		// Use top-level id if present, otherwise fall back to data.id
		const recordId = wrapped.id || (typeof data.id === 'string' ? data.id : undefined);

		// Route to appropriate table based on type field
		let inserted = false;
		switch (category) {
			case 'chatter':
				const validatedChatter = validateAndMapChatter(data, objectKey, recordId);
				await orm.insert(chatter).values(validatedChatter).onConflictDoNothing();
				inserted = true;
				break;

			case 'checkins':
				const validatedCheckin = validateAndMapCheckin(data, objectKey, recordId);
				await orm.insert(checkins).values(validatedCheckin).onConflictDoNothing();
				inserted = true;
				break;

			case 'films':
				const validatedFilm = validateAndMapFilm(data, objectKey, recordId);
				await orm.insert(films).values(validatedFilm).onConflictDoNothing();
				inserted = true;
				break;

			case 'quotes':
				const validatedQuote = validateAndMapQuote(data, objectKey, recordId);
				await orm.insert(quotes).values(validatedQuote).onConflictDoNothing();
				inserted = true;
				break;

			case 'shakespeare':
				const validatedShakespeare = validateAndMapShakespeare(data, objectKey, recordId);
				await orm.insert(shakespeare).values(validatedShakespeare).onConflictDoNothing();
				inserted = true;
				break;

			case 'topten':
				const validatedTopTen = validateAndMapTopTen(data, objectKey, recordId);
				await orm.insert(topten).values(validatedTopTen).onConflictDoNothing();
				inserted = true;
				break;

			default:
				return {
					valid: false,
					objectKey,
					category,
					error: `Unsupported content type: ${category}`,
				};
		}

		return {
			valid: true,
			objectKey,
			category,
			inserted,
		};
	} catch (error) {
		return {
			valid: false,
			objectKey,
			error: `Processing error: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
