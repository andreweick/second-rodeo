/// <reference types="./env.d.ts" />
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock exifr module before importing extractMetadata
vi.mock('exifr', () => ({
	parse: vi.fn(),
}));

import { extractMetadata } from '../src/services/metadata-extractor';
import { parse } from 'exifr';

const mockParse = vi.mocked(parse);

describe('Metadata Extractor - IPTC Keywords Handling', () => {
	beforeEach(() => {
		mockParse.mockReset();
	});

	it('should handle keywords as an array', async () => {
		const mockData = {
			ImageWidth: 1920,
			ImageHeight: 1080,
			Keywords: ['landscape', 'sunset', 'beach'],
		};

		mockParse.mockResolvedValue(mockData);

		const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

		const result = await extractMetadata(file);

		expect(result.iptc).toBeDefined();
		expect(result.iptc?.keywords).toBeInstanceOf(Array);
		expect(result.iptc?.keywords).toHaveLength(3);
		expect(result.iptc?.keywords).toEqual(['landscape', 'sunset', 'beach']);
	});

	it('should handle keywords as a single string', async () => {
		const mockData = {
			ImageWidth: 1920,
			ImageHeight: 1080,
			Keywords: 'landscape',
		};

		mockParse.mockResolvedValue(mockData);

		const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

		const result = await extractMetadata(file);

		expect(result.iptc).toBeDefined();
		expect(result.iptc?.keywords).toBeInstanceOf(Array);
		expect(result.iptc?.keywords).toHaveLength(1);
		expect(result.iptc?.keywords).toEqual(['landscape']);
	});

	it('should handle keywords as undefined', async () => {
		const mockData = {
			ImageWidth: 1920,
			ImageHeight: 1080,
			ObjectName: 'Test Image',
			// No Keywords field
		};

		mockParse.mockResolvedValue(mockData);

		const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

		const result = await extractMetadata(file);

		expect(result.iptc).toBeDefined();
		expect(result.iptc?.keywords).toBeUndefined();
	});

	it('should decode Windows-1252 encoded keywords (array)', async () => {
		// Simulating mojibake: Windows-1252 byte 0x92 (right single quote)
		// gets treated as character U+0092 by exifr
		// We create the mojibake string using character codes
		const mojibake1 = 'photographer' + String.fromCharCode(0x92) + 's'; // photographer's with win1252 byte 0x92
		const mojibake2 = 'nature' + String.fromCharCode(0x92) + 's beauty'; // nature's beauty

		const mockData = {
			ImageWidth: 1920,
			ImageHeight: 1080,
			Keywords: [mojibake1, mojibake2],
		};

		mockParse.mockResolvedValue(mockData);

		const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

		const result = await extractMetadata(file);

		expect(result.iptc).toBeDefined();
		expect(result.iptc?.keywords).toBeInstanceOf(Array);
		expect(result.iptc?.keywords).toHaveLength(2);
		// The decoding should fix the mojibake to proper apostrophes (U+2019 right single quote)
		expect(result.iptc?.keywords?.[0]).toBe('photographer' + String.fromCharCode(0x2019) + 's');
		expect(result.iptc?.keywords?.[1]).toBe('nature' + String.fromCharCode(0x2019) + 's beauty');
	});

	it('should decode Windows-1252 encoded keywords (string)', async () => {
		// Simulating mojibake: Windows-1252 byte 0x92 (right single quote)
		// gets treated as character U+0092 by exifr
		const mojibake = 'photographer' + String.fromCharCode(0x92) + 's';

		const mockData = {
			ImageWidth: 1920,
			ImageHeight: 1080,
			Keywords: mojibake,
		};

		mockParse.mockResolvedValue(mockData);

		const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

		const result = await extractMetadata(file);

		expect(result.iptc).toBeDefined();
		expect(result.iptc?.keywords).toBeInstanceOf(Array);
		expect(result.iptc?.keywords).toHaveLength(1);
		// The decoding should fix the mojibake to proper apostrophe (U+2019 right single quote)
		expect(result.iptc?.keywords?.[0]).toBe('photographer' + String.fromCharCode(0x2019) + 's');
	});

	it('should normalize line endings in IPTC caption', async () => {
		const mockData = {
			ImageWidth: 1920,
			ImageHeight: 1080,
			Caption: 'Line 1\rLine 2\r\rLine 3',
		};

		mockParse.mockResolvedValue(mockData);

		const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

		const result = await extractMetadata(file);

		expect(result.iptc).toBeDefined();
		expect(result.iptc?.caption).toBeDefined();
		// \r should be converted to \n
		expect(result.iptc?.caption).toContain('\n');
		expect(result.iptc?.caption).not.toContain('\r');
	});

	it('should handle IPTC data with no keywords field at all', async () => {
		const mockData = {
			ImageWidth: 1920,
			ImageHeight: 1080,
			Caption: 'A beautiful sunset',
			ObjectName: 'Sunset Photo',
		};

		mockParse.mockResolvedValue(mockData);

		const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
		const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

		const result = await extractMetadata(file);

		expect(result.iptc).toBeDefined();
		expect(result.iptc?.caption).toBe('A beautiful sunset');
		expect(result.iptc?.objectName).toBe('Sunset Photo');
		expect(result.iptc?.keywords).toBeUndefined();
	});
});
