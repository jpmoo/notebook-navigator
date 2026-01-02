/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from 'vitest';
import { getImageDimensionsFromBuffer } from '../../src/services/content/thumbnail/imageDimensions';

describe('getImageDimensionsFromBuffer', () => {
    it('parses PNG dimensions', () => {
        const bytes = new Uint8Array(24);
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
        bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
        bytes.set([0x49, 0x48, 0x44, 0x52], 12);
        bytes.set([0x00, 0x00, 0x01, 0x2c], 16);
        bytes.set([0x00, 0x00, 0x00, 0xc8], 20);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/png')).toEqual({ width: 300, height: 200 });
    });

    it('normalizes PNG mime type aliases', () => {
        const bytes = new Uint8Array(24);
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
        bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
        bytes.set([0x49, 0x48, 0x44, 0x52], 12);
        bytes.set([0x00, 0x00, 0x01, 0x2c], 16);
        bytes.set([0x00, 0x00, 0x00, 0xc8], 20);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/x-png')).toEqual({ width: 300, height: 200 });
        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/apng')).toEqual({ width: 300, height: 200 });
    });

    it('parses GIF dimensions', () => {
        const bytes = new Uint8Array(10);
        bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
        bytes.set([0x40, 0x01], 6);
        bytes.set([0xf0, 0x00], 8);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/gif')).toEqual({ width: 320, height: 240 });
    });

    it('parses JPEG SOF dimensions', () => {
        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0xff, 0xd9]);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/jpeg')).toEqual({ width: 300, height: 200 });
    });

    it('normalizes JPEG mime type aliases', () => {
        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0xff, 0xd9]);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/jpg')).toEqual({ width: 300, height: 200 });
        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/pjpeg')).toEqual({ width: 300, height: 200 });
    });

    it('parses WebP VP8X dimensions', () => {
        const bytes = new Uint8Array(30);
        bytes.set([0x52, 0x49, 0x46, 0x46], 0);
        bytes.set([0x57, 0x45, 0x42, 0x50], 8);
        bytes.set([0x56, 0x50, 0x38, 0x58], 12);
        bytes.set([0x0a, 0x00, 0x00, 0x00], 16);
        bytes.set([0x2b, 0x01, 0x00], 24);
        bytes.set([0xc7, 0x00, 0x00], 27);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/webp')).toEqual({ width: 300, height: 200 });
    });

    it('normalizes WebP mime type aliases', () => {
        const bytes = new Uint8Array(30);
        bytes.set([0x52, 0x49, 0x46, 0x46], 0);
        bytes.set([0x57, 0x45, 0x42, 0x50], 8);
        bytes.set([0x56, 0x50, 0x38, 0x58], 12);
        bytes.set([0x0a, 0x00, 0x00, 0x00], 16);
        bytes.set([0x2b, 0x01, 0x00], 24);
        bytes.set([0xc7, 0x00, 0x00], 27);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/x-webp')).toEqual({ width: 300, height: 200 });
    });

    it('falls back to signature detection when mime type is wrong', () => {
        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0xff, 0xd9]);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/webp')).toEqual({ width: 300, height: 200 });
    });

    it('parses "fried" PNG dimensions with a leading CgBI chunk', () => {
        const bytes = new Uint8Array(48);
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);

        // CgBI chunk
        bytes.set([0x00, 0x00, 0x00, 0x04], 8);
        bytes.set([0x43, 0x67, 0x42, 0x49], 12);

        // IHDR chunk after CgBI
        bytes.set([0x00, 0x00, 0x00, 0x0d], 24);
        bytes.set([0x49, 0x48, 0x44, 0x52], 28);
        bytes.set([0x00, 0x00, 0x01, 0x2c], 32);
        bytes.set([0x00, 0x00, 0x00, 0xc8], 36);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/png')).toEqual({ width: 300, height: 200 });
    });

    it('parses BMP dimensions', () => {
        const bytes = new Uint8Array(26);
        bytes.set([0x42, 0x4d], 0);
        bytes.set([0x28, 0x00, 0x00, 0x00], 14);
        bytes.set([0x2c, 0x01, 0x00, 0x00], 18);
        bytes.set([0xc8, 0x00, 0x00, 0x00], 22);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/bmp')).toEqual({ width: 300, height: 200 });
    });

    it('normalizes BMP mime type aliases', () => {
        const bytes = new Uint8Array(26);
        bytes.set([0x42, 0x4d], 0);
        bytes.set([0x28, 0x00, 0x00, 0x00], 14);
        bytes.set([0x2c, 0x01, 0x00, 0x00], 18);
        bytes.set([0xc8, 0x00, 0x00, 0x00], 22);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/x-ms-bmp')).toEqual({ width: 300, height: 200 });
        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/x-bmp')).toEqual({ width: 300, height: 200 });
    });

    it('parses AVIF ispe dimensions', () => {
        const bytes = new Uint8Array(20);
        bytes.set([0x00, 0x00, 0x00, 0x14], 0);
        bytes.set([0x69, 0x73, 0x70, 0x65], 4);
        bytes.set([0x00, 0x00, 0x01, 0x2c], 12);
        bytes.set([0x00, 0x00, 0x00, 0xc8], 16);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/avif')).toEqual({ width: 300, height: 200 });
    });

    it('parses HEIC/HEIF dimensions with an ispe box and clap crop right', () => {
        const bytes = new Uint8Array(64);

        // meta box (full box, includes 4 bytes version/flags)
        bytes.set([0x00, 0x00, 0x00, 0x40], 0);
        bytes.set([0x6d, 0x65, 0x74, 0x61], 4);

        // iprp box
        bytes.set([0x00, 0x00, 0x00, 0x34], 12);
        bytes.set([0x69, 0x70, 0x72, 0x70], 16);

        // ipco box
        bytes.set([0x00, 0x00, 0x00, 0x2c], 20);
        bytes.set([0x69, 0x70, 0x63, 0x6f], 24);

        // ispe box (full box)
        bytes.set([0x00, 0x00, 0x00, 0x14], 28);
        bytes.set([0x69, 0x73, 0x70, 0x65], 32);
        bytes.set([0x00, 0x00, 0x00, 0x7c], 40); // width = 124
        bytes.set([0x00, 0x00, 0x01, 0xc8], 44); // height = 456

        // clap box (full box)
        bytes.set([0x00, 0x00, 0x00, 0x10], 48);
        bytes.set([0x63, 0x6c, 0x61, 0x70], 52);
        bytes.set([0x00, 0x00, 0x00, 0x01], 60); // cropRight = 1

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/heic')).toEqual({ width: 123, height: 456 });
        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/heif')).toEqual({ width: 123, height: 456 });
    });

    it('selects the largest HEIC/HEIF ispe dimensions when multiple boxes are present', () => {
        const bytes = new Uint8Array(84);

        // meta box (full box, includes 4 bytes version/flags)
        bytes.set([0x00, 0x00, 0x00, 0x54], 0);
        bytes.set([0x6d, 0x65, 0x74, 0x61], 4);

        // iprp box
        bytes.set([0x00, 0x00, 0x00, 0x48], 12);
        bytes.set([0x69, 0x70, 0x72, 0x70], 16);

        // ipco box
        bytes.set([0x00, 0x00, 0x00, 0x40], 20);
        bytes.set([0x69, 0x70, 0x63, 0x6f], 24);

        // ispe box #1 (full box, 10x10)
        bytes.set([0x00, 0x00, 0x00, 0x14], 28);
        bytes.set([0x69, 0x73, 0x70, 0x65], 32);
        bytes.set([0x00, 0x00, 0x00, 0x0a], 40);
        bytes.set([0x00, 0x00, 0x00, 0x0a], 44);

        // clap box applied by the HEIF handler (cropRight = 1)
        bytes.set([0x00, 0x00, 0x00, 0x10], 48);
        bytes.set([0x63, 0x6c, 0x61, 0x70], 52);
        bytes.set([0x00, 0x00, 0x00, 0x01], 60);

        // ispe box #2 (full box, 124x456)
        bytes.set([0x00, 0x00, 0x00, 0x14], 64);
        bytes.set([0x69, 0x73, 0x70, 0x65], 68);
        bytes.set([0x00, 0x00, 0x00, 0x7c], 76);
        bytes.set([0x00, 0x00, 0x01, 0xc8], 80);

        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/heic')).toEqual({ width: 123, height: 456 });
    });

    it('returns null for unknown mime types', () => {
        const bytes = new Uint8Array([0x00, 0x01, 0x02]);
        expect(getImageDimensionsFromBuffer(bytes.buffer, 'image/tiff')).toBeNull();
    });
});
