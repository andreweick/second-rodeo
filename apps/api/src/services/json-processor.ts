import { drizzle } from 'drizzle-orm/d1';
import { chatter, checkins, films, quotes, shakespeare } from '../db/schema';
import type { NewChatter, NewCheckin, NewFilm, NewQuote, NewShakespeareParagraph } from '../db/schema';

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
 * Extract category from object key path
 * e.g., /chatter/file.jsonl → "chatter"
 */
function extractCategory(objectKey: string): string | null {
	const match = objectKey.match(/^\/([^/]+)\//);
	return match ? match[1] : null;
}

/**
 * Validate and map chatter JSON to schema
 */
function validateAndMapChatter(data: unknown, objectKey: string): NewChatter {
	if (typeof data !== 'object' || data === null) {
		throw new Error('Data must be an object');
	}

	const obj = data as Record<string, unknown>;

	// Validate required fields
	if (typeof obj.id !== 'string') throw new Error('Missing or invalid field: id');
	if (typeof obj.title !== 'string') throw new Error('Missing or invalid field: title');
	if (typeof obj.date !== 'string') throw new Error('Missing or invalid field: date');
	if (typeof obj.date_posted !== 'string') throw new Error('Missing or invalid field: date_posted');
	if (typeof obj.year !== 'number') throw new Error('Missing or invalid field: year');
	if (typeof obj.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof obj.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id: obj.id,
		title: obj.title,
		date: obj.date,
		datePosted: new Date(obj.date_posted),
		year: obj.year,
		month: obj.month,
		slug: obj.slug,
		publish: typeof obj.publish === 'boolean' ? obj.publish : true,
		r2Key: objectKey,
	};
}

/**
 * Validate and map checkin JSON to schema
 */
function validateAndMapCheckin(data: unknown, objectKey: string): NewCheckin {
	if (typeof data !== 'object' || data === null) {
		throw new Error('Data must be an object');
	}

	const obj = data as Record<string, unknown>;

	// Validate required fields
	if (typeof obj.id !== 'string') throw new Error('Missing or invalid field: id');
	if (typeof obj.venue_id !== 'string') throw new Error('Missing or invalid field: venue_id');
	if (typeof obj.venue_name !== 'string') throw new Error('Missing or invalid field: venue_name');
	if (typeof obj.latitude !== 'number') throw new Error('Missing or invalid field: latitude');
	if (typeof obj.longitude !== 'number') throw new Error('Missing or invalid field: longitude');
	if (typeof obj.date !== 'string') throw new Error('Missing or invalid field: date');
	if (typeof obj.time !== 'string') throw new Error('Missing or invalid field: time');
	if (typeof obj.datetime !== 'string') throw new Error('Missing or invalid field: datetime');
	if (typeof obj.year !== 'number') throw new Error('Missing or invalid field: year');
	if (typeof obj.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof obj.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id: obj.id,
		venueId: obj.venue_id,
		venueName: obj.venue_name,
		foursquareUrl: typeof obj.foursquare_url === 'string' ? obj.foursquare_url : undefined,
		latitude: obj.latitude,
		longitude: obj.longitude,
		formattedAddress: typeof obj.formatted_address === 'string' ? obj.formatted_address : undefined,
		street: typeof obj.street === 'string' ? obj.street : undefined,
		city: typeof obj.city === 'string' ? obj.city : undefined,
		state: typeof obj.state === 'string' ? obj.state : undefined,
		postalCode: typeof obj.postal_code === 'string' ? obj.postal_code : undefined,
		country: typeof obj.country === 'string' ? obj.country : undefined,
		neighborhood: typeof obj.neighborhood === 'string' ? obj.neighborhood : undefined,
		date: obj.date,
		time: obj.time,
		datetime: new Date(obj.datetime),
		year: obj.year,
		month: obj.month,
		slug: obj.slug,
		publish: typeof obj.publish === 'boolean' ? obj.publish : true,
		r2Key: objectKey,
	};
}

/**
 * Validate and map film JSON to schema
 */
function validateAndMapFilm(data: unknown, objectKey: string): NewFilm {
	if (typeof data !== 'object' || data === null) {
		throw new Error('Data must be an object');
	}

	const obj = data as Record<string, unknown>;

	// Validate required fields
	if (typeof obj.id !== 'string') throw new Error('Missing or invalid field: id');
	if (typeof obj.title !== 'string') throw new Error('Missing or invalid field: title');
	if (typeof obj.year_watched !== 'number') throw new Error('Missing or invalid field: year_watched');
	if (typeof obj.date_watched !== 'string') throw new Error('Missing or invalid field: date_watched');
	if (typeof obj.date !== 'string') throw new Error('Missing or invalid field: date');
	if (typeof obj.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof obj.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id: obj.id,
		title: obj.title,
		year: typeof obj.year === 'number' ? obj.year : obj.year_watched, // Fallback to year_watched if year not present
		yearWatched: obj.year_watched,
		dateWatched: new Date(obj.date_watched),
		date: obj.date,
		month: obj.month,
		slug: obj.slug,
		rewatch: typeof obj.rewatch === 'boolean' ? obj.rewatch : false,
		rewatchCount: typeof obj.rewatch_count === 'number' ? obj.rewatch_count : 0,
		publish: typeof obj.publish === 'boolean' ? obj.publish : true,
		tmdbId: typeof obj.tmdb_id === 'string' ? obj.tmdb_id : undefined,
		posterUrl: typeof obj.poster_url === 'string' ? obj.poster_url : undefined,
		letterboxdId: typeof obj.letterboxd_id === 'string' ? obj.letterboxd_id : undefined,
		letterboxdUri: typeof obj.letterboxd_uri === 'string' ? obj.letterboxd_uri : undefined,
		r2Key: objectKey,
	};
}

/**
 * Validate and map quote JSON to schema
 */
function validateAndMapQuote(data: unknown, objectKey: string): NewQuote {
	if (typeof data !== 'object' || data === null) {
		throw new Error('Data must be an object');
	}

	const obj = data as Record<string, unknown>;

	// Validate required fields
	if (typeof obj.id !== 'string') throw new Error('Missing or invalid field: id');
	if (typeof obj.text !== 'string') throw new Error('Missing or invalid field: text');
	if (typeof obj.author !== 'string') throw new Error('Missing or invalid field: author');
	if (typeof obj.date !== 'string') throw new Error('Missing or invalid field: date');
	if (typeof obj.date_added !== 'string') throw new Error('Missing or invalid field: date_added');
	if (typeof obj.year !== 'number') throw new Error('Missing or invalid field: year');
	if (typeof obj.month !== 'string') throw new Error('Missing or invalid field: month');
	if (typeof obj.slug !== 'string') throw new Error('Missing or invalid field: slug');

	return {
		id: obj.id,
		text: obj.text,
		author: obj.author,
		date: obj.date,
		dateAdded: new Date(obj.date_added),
		year: obj.year,
		month: obj.month,
		slug: obj.slug,
		publish: typeof obj.publish === 'boolean' ? obj.publish : true,
		r2Key: objectKey,
	};
}

/**
 * Validate and map shakespeare JSON to schema
 */
function validateAndMapShakespeare(data: unknown, objectKey: string): NewShakespeareParagraph {
	if (typeof data !== 'object' || data === null) {
		throw new Error('Data must be an object');
	}

	const obj = data as Record<string, unknown>;

	// Validate required fields
	if (typeof obj.id !== 'string') throw new Error('Missing or invalid field: id');
	if (typeof obj.work_id !== 'string') throw new Error('Missing or invalid field: work_id');
	if (typeof obj.work_title !== 'string') throw new Error('Missing or invalid field: work_title');
	if (typeof obj.genre_code !== 'string') throw new Error('Missing or invalid field: genre_code');
	if (typeof obj.genre_name !== 'string') throw new Error('Missing or invalid field: genre_name');
	if (typeof obj.act !== 'number') throw new Error('Missing or invalid field: act');
	if (typeof obj.scene !== 'number') throw new Error('Missing or invalid field: scene');
	if (typeof obj.paragraph_id !== 'number') throw new Error('Missing or invalid field: paragraph_id');
	if (typeof obj.paragraph_num !== 'number') throw new Error('Missing or invalid field: paragraph_num');
	if (typeof obj.character_id !== 'string') throw new Error('Missing or invalid field: character_id');
	if (typeof obj.character_name !== 'string') throw new Error('Missing or invalid field: character_name');
	if (typeof obj.is_stage_direction !== 'number' && typeof obj.is_stage_direction !== 'boolean')
		throw new Error('Missing or invalid field: is_stage_direction');
	if (typeof obj.char_count !== 'number') throw new Error('Missing or invalid field: char_count');
	if (typeof obj.word_count !== 'number') throw new Error('Missing or invalid field: word_count');
	if (typeof obj.timestamp !== 'string' && typeof obj.timestamp !== 'number')
		throw new Error('Missing or invalid field: timestamp');

	return {
		id: obj.id,
		workId: obj.work_id,
		workTitle: obj.work_title,
		genreCode: obj.genre_code,
		genreName: obj.genre_name,
		act: obj.act,
		scene: obj.scene,
		paragraphId: obj.paragraph_id,
		paragraphNum: obj.paragraph_num,
		characterId: obj.character_id,
		characterName: obj.character_name,
		isStageDirection: typeof obj.is_stage_direction === 'boolean' ? obj.is_stage_direction : obj.is_stage_direction === 1,
		charCount: obj.char_count,
		wordCount: obj.word_count,
		timestamp: typeof obj.timestamp === 'number' ? new Date(obj.timestamp * 1000) : new Date(obj.timestamp),
		r2Key: objectKey,
	};
}

/**
 * Processes a JSON file from R2 and inserts into appropriate database table
 * Routes based on object key prefix: /chatter/, /checkins/, /films/, etc.
 *
 * @param objectKey - The key of the object in the R2 bucket (e.g., /chatter/sha256_xxx.jsonl)
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
	const category = extractCategory(objectKey);

	try {
		// Fetch object from R2
		const object = await bucket.get(objectKey);

		if (!object) {
			return {
				valid: false,
				objectKey,
				category: category || undefined,
				error: `Object not found: ${objectKey}`,
			};
		}

		// Read the content as text
		const text = await object.text();

		// Parse JSON
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch (parseError) {
			return {
				valid: false,
				objectKey,
				category: category || undefined,
				error: `Invalid JSON syntax: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
			};
		}

		// Basic validation - ensure it's an object
		if (typeof data !== 'object' || data === null) {
			return {
				valid: false,
				objectKey,
				category: category || undefined,
				error: 'JSON must be an object',
			};
		}

		// Check if category is supported
		if (!category) {
			return {
				valid: false,
				objectKey,
				error: 'Could not extract category from object key',
			};
		}

		// Route to appropriate table based on category
		let inserted = false;
		switch (category) {
			case 'chatter':
				const validatedChatter = validateAndMapChatter(data, objectKey);
				await orm.insert(chatter).values(validatedChatter);
				inserted = true;
				break;

			case 'checkins':
				const validatedCheckin = validateAndMapCheckin(data, objectKey);
				await orm.insert(checkins).values(validatedCheckin);
				inserted = true;
				break;

			case 'films':
				const validatedFilm = validateAndMapFilm(data, objectKey);
				await orm.insert(films).values(validatedFilm);
				inserted = true;
				break;

			case 'quotes':
				const validatedQuote = validateAndMapQuote(data, objectKey);
				await orm.insert(quotes).values(validatedQuote);
				inserted = true;
				break;

			case 'shakespert':
				// Note: directory is 'shakespert' but table is 'shakespeare'
				const validatedShakespeare = validateAndMapShakespeare(data, objectKey);
				await orm.insert(shakespeare).values(validatedShakespeare);
				inserted = true;
				break;

			case 'invalid':
				// Skip invalid files (used for testing error handling)
				return {
					valid: false,
					objectKey,
					category,
					error: 'Invalid category - skipping',
				};

			default:
				return {
					valid: false,
					objectKey,
					category,
					error: `Unsupported category: ${category}`,
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
			category: category || undefined,
			error: `Processing error: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
