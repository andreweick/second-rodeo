import { parse } from 'exifr';

/**
 * Windows-1252 to UTF-8 character mapping for bytes 0x80-0x9F
 * These are the problematic characters that differ from ISO-8859-1
 */
const WIN1252_MAP: Record<number, string> = {
	0x80: '\u20AC', // Euro sign
	0x82: '\u201A', // Single low-9 quotation mark
	0x83: '\u0192', // Latin small letter f with hook
	0x84: '\u201E', // Double low-9 quotation mark
	0x85: '\u2026', // Horizontal ellipsis
	0x86: '\u2020', // Dagger
	0x87: '\u2021', // Double dagger
	0x88: '\u02C6', // Modifier letter circumflex accent
	0x89: '\u2030', // Per mille sign
	0x8a: '\u0160', // Latin capital letter S with caron
	0x8b: '\u2039', // Single left-pointing angle quotation mark
	0x8c: '\u0152', // Latin capital ligature OE
	0x8e: '\u017D', // Latin capital letter Z with caron
	0x91: '\u2018', // Left single quotation mark
	0x92: '\u2019', // Right single quotation mark (apostrophe)
	0x93: '\u201C', // Left double quotation mark
	0x94: '\u201D', // Right double quotation mark
	0x95: '\u2022', // Bullet
	0x96: '\u2013', // En dash
	0x97: '\u2014', // Em dash
	0x98: '\u02DC', // Small tilde
	0x99: '\u2122', // Trade mark sign
	0x9a: '\u0161', // Latin small letter s with caron
	0x9b: '\u203A', // Single right-pointing angle quotation mark
	0x9c: '\u0153', // Latin small ligature oe
	0x9e: '\u017E', // Latin small letter z with caron
	0x9f: '\u0178', // Latin capital letter Y with diaeresis
};

/**
 * Image metadata extracted from the file
 */
export interface ImageMetadata {
	/** Basic file information */
	file: {
		/** Width in pixels */
		width?: number;
		/** Height in pixels */
		height?: number;
		/** File size in bytes */
		size: number;
		/** MIME type */
		mimeType: string;
		/** File format (jpeg, png, etc) */
		format?: string;
	};
	/** EXIF metadata (camera settings, GPS, timestamp) */
	exif?: {
		/** Camera make */
		make?: string;
		/** Camera model */
		model?: string;
		/** Lens model */
		lensModel?: string;
		/** Date/time original */
		dateTimeOriginal?: string;
		/** GPS latitude */
		latitude?: number;
		/** GPS longitude */
		longitude?: number;
		/** ISO speed */
		iso?: number;
		/** F-number (aperture) */
		fNumber?: number;
		/** Exposure time */
		exposureTime?: number;
		/** Focal length */
		focalLength?: number;
		/** Image orientation */
		orientation?: number;
		/** Software used */
		software?: string;
	};
	/** IPTC metadata (title, description, keywords, copyright) */
	iptc?: {
		/** Object name/title */
		objectName?: string;
		/** Caption/description */
		caption?: string;
		/** Keywords */
		keywords?: string[];
		/** Copyright notice */
		copyrightNotice?: string;
		/** Creator/photographer */
		creator?: string;
		/** Credit line */
		credit?: string;
		/** City */
		city?: string;
		/** Country */
		country?: string;
	};
	/** Color profile information */
	icc?: {
		/** Color space (sRGB, Adobe RGB, etc) */
		colorSpace?: string;
		/** Profile description */
		description?: string;
	};
}

/**
 * Extract comprehensive metadata from an image file
 * @param file - The image file to extract metadata from
 * @returns Structured metadata object
 * @throws Error if metadata extraction fails
 */
export async function extractMetadata(file: File): Promise<ImageMetadata> {
	try {
		// Convert File to ArrayBuffer for exifr
		const buffer = await file.arrayBuffer();

		// Extract all metadata using exifr
		// Parse EXIF, IPTC, ICC, and get image dimensions
		const data = await parse(buffer, {
			exif: true,
			iptc: true,
			icc: true,
			xmp: false, // Disable XMP for now to reduce bundle size
			tiff: true,
			gps: true,
		});

		// Build structured metadata response
		const metadata: ImageMetadata = {
			file: {
				size: file.size,
				mimeType: file.type,
				width: data?.ImageWidth || data?.ExifImageWidth,
				height: data?.ImageHeight || data?.ExifImageHeight,
				format: getFormatFromMimeType(file.type),
			},
		};

		// Extract EXIF data if present
		if (data) {
			metadata.exif = {
				make: data.Make,
				model: data.Model,
				lensModel: data.LensModel,
				dateTimeOriginal: data.DateTimeOriginal,
				latitude: data.latitude,
				longitude: data.longitude,
				iso: data.ISO,
				fNumber: data.FNumber,
				exposureTime: data.ExposureTime,
				focalLength: data.FocalLength,
				orientation: data.Orientation,
				software: data.Software,
			};

			// Extract IPTC data if present
			// Apply Windows-1252 to UTF-8 decoding to fix mojibake from exifr
			if (data.ObjectName || data.Caption || data.Keywords || data.CopyrightNotice) {
				// Handle keywords - can be array or string
				let keywords: string[] | undefined;
				if (data.Keywords) {
					if (Array.isArray(data.Keywords)) {
						keywords = data.Keywords.map((kw: string) => decodeIptcString(kw) || kw);
					} else if (typeof data.Keywords === 'string') {
						keywords = [decodeIptcString(data.Keywords) || data.Keywords];
					}
				}

				metadata.iptc = {
					objectName: decodeIptcString(data.ObjectName),
					caption: decodeIptcString(data.Caption || data['Caption-Abstract']),
					keywords: keywords,
					copyrightNotice: decodeIptcString(data.CopyrightNotice || data.Copyright),
					creator: decodeIptcString(data.Creator || data['By-line']),
					credit: decodeIptcString(data.Credit),
					city: decodeIptcString(data.City),
					country: decodeIptcString(data.Country || data['Country-PrimaryLocationName']),
				};
			}

			// Extract ICC color profile if present
			if (data.ProfileDescription || data.ColorSpaceData) {
				metadata.icc = {
					description: data.ProfileDescription,
					colorSpace: data.ColorSpaceData,
				};
			}
		}

		return metadata;
	} catch (error) {
		throw new Error(`Failed to extract image metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Get image format from MIME type
 */
function getFormatFromMimeType(mimeType: string): string | undefined {
	const match = mimeType.match(/^image\/(.+)$/);
	return match ? match[1] : undefined;
}

/**
 * Decode IPTC string from Windows-1252 to UTF-8
 * exifr reads IPTC as Latin1 but doesn't convert to UTF-8, causing mojibake
 * This function reconstructs UTF-8 byte sequences and maps Windows-1252 characters
 */
function decodeIptcString(value: string | undefined): string | undefined {
	if (!value) return value;

	try {
		// First, convert the string back to raw bytes
		// Each character code represents a byte value
		const bytes: number[] = [];
		for (let i = 0; i < value.length; i++) {
			bytes.push(value.charCodeAt(i) & 0xff);
		}

		// Now decode the bytes as UTF-8, falling back to Windows-1252 for invalid sequences
		let decoded = '';
		let i = 0;
		while (i < bytes.length) {
			const byte = bytes[i];

			// ASCII (0x00-0x7F)
			if (byte < 0x80) {
				decoded += String.fromCharCode(byte);
				i++;
			}
			// UTF-8 multi-byte sequence starting with 0xE2 (common for punctuation)
			else if (byte === 0xe2 && i + 2 < bytes.length && bytes[i + 1] === 0x80) {
				const byte3 = bytes[i + 2];
				// Common UTF-8 punctuation in E2 80 XX range
				const utf8Char = String.fromCharCode(0xe2) + String.fromCharCode(0x80) + String.fromCharCode(byte3);
				try {
					decoded += decodeURIComponent(escape(utf8Char));
					i += 3;
				} catch {
					// If UTF-8 decode fails, treat as Windows-1252
					decoded += WIN1252_MAP[byte] || String.fromCharCode(byte);
					i++;
				}
			}
			// Windows-1252 special characters (0x80-0x9F)
			else if (byte >= 0x80 && byte <= 0x9f) {
				decoded += WIN1252_MAP[byte] || String.fromCharCode(byte);
				i++;
			}
			// ISO-8859-1 characters (0xA0-0xFF)
			else {
				decoded += String.fromCharCode(byte);
				i++;
			}
		}

		// Clean up line endings
		decoded = decoded
			.replace(/\r\n/g, '\n') // Normalize Windows line endings
			.replace(/\r/g, '\n') // Normalize Mac line endings
			.trim();

		return decoded;
	} catch (error) {
		// If decoding fails, log error and return original value
		console.error('IPTC decoding error:', error);
		return value;
	}
}
