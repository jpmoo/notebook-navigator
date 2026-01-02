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

export type RasterDimensions = { width: number; height: number };

export function normalizeImageMimeType(mimeType: string): string {
    const normalized = mimeType.trim().toLowerCase();

    switch (normalized) {
        case 'image/jpg':
        case 'image/pjpeg':
            return 'image/jpeg';
        case 'image/x-webp':
            return 'image/webp';
        case 'image/x-png':
        case 'image/apng':
            return 'image/png';
        case 'image/x-ms-bmp':
        case 'image/x-bmp':
            return 'image/bmp';
        case 'image/svg':
            return 'image/svg+xml';
        default:
            return normalized;
    }
}

type DetectedImageMimeType =
    | 'image/png'
    | 'image/gif'
    | 'image/jpeg'
    | 'image/webp'
    | 'image/bmp'
    | 'image/avif'
    | 'image/heic'
    | 'image/heif';

export function detectImageMimeTypeFromBuffer(buffer: ArrayBuffer): DetectedImageMimeType | null {
    const bytes = new Uint8Array(buffer);

    // ISO Base Media File Format (AVIF/HEIF/HEIC)
    // - 4 bytes: box size (BE)
    // - 4 bytes: 'ftyp'
    // - 4 bytes: major brand
    // - 4 bytes: minor version
    // - N*4 bytes: compatible brands
    if (bytes.length >= 16 && matchesAscii(bytes, 4, 'ftyp')) {
        const view = new DataView(buffer);
        const size32 = view.getUint32(0, false);
        let headerSize = 8;
        let boxSize = size32;

        if (size32 === 0) {
            boxSize = bytes.length;
        } else if (size32 === 1) {
            if (bytes.length < 24 || typeof view.getBigUint64 !== 'function') {
                return null;
            }
            const size64 = view.getBigUint64(8, false);
            if (size64 > BigInt(bytes.length) || size64 < BigInt(24)) {
                return null;
            }
            boxSize = Number(size64);
            headerSize = 16;
        }

        if (boxSize < headerSize + 8 || boxSize > bytes.length) {
            return null;
        }

        {
            const majorBrand = asciiSlice(bytes, headerSize, headerSize + 4);
            const brands = new Set<string>([majorBrand]);

            for (let offset = headerSize + 8; offset + 4 <= boxSize; offset += 4) {
                brands.add(asciiSlice(bytes, offset, offset + 4));
            }

            // Prefer AVIF when any AVIF brand is present.
            if (brands.has('avif') || brands.has('avis')) {
                return 'image/avif';
            }

            if (brands.has('heic') || brands.has('heix') || brands.has('hevc') || brands.has('hevx')) {
                return 'image/heic';
            }

            if (brands.has('mif1') || brands.has('msf1')) {
                return 'image/heif';
            }
        }
    }

    if (bytes.length < 2) {
        return null;
    }

    switch (bytes[0]) {
        case 0x89: {
            const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
            return bytes.length >= 8 && matchesBytes(bytes, 0, signature) ? 'image/png' : null;
        }
        case 0x47:
            return bytes.length >= 6 && matchesAscii(bytes, 0, 'GIF') ? 'image/gif' : null;
        case 0xff:
            return bytes.length >= 3 && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg' : null;
        case 0x42:
            return bytes[1] === 0x4d ? 'image/bmp' : null;
        case 0x52:
            // WebP begins with RIFF....WEBP and the first chunk starts with 'VP8'
            return bytes.length >= 16 && matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP') && matchesAscii(bytes, 12, 'VP8')
                ? 'image/webp'
                : null;
        default:
            return null;
    }
}

// Extracts image dimensions from a buffer by parsing format-specific headers.
// Returns null for unsupported formats or malformed data.
export function getImageDimensionsFromBuffer(buffer: ArrayBuffer, mimeType: string): RasterDimensions | null {
    const normalizedMimeType = normalizeImageMimeType(mimeType);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    const initial = getImageDimensionsFromView(bytes, view, normalizedMimeType);
    if (initial) {
        return initial;
    }

    const detectedMimeType = detectImageMimeTypeFromBuffer(buffer);
    if (!detectedMimeType || detectedMimeType === normalizedMimeType) {
        return null;
    }

    return getImageDimensionsFromView(bytes, view, detectedMimeType);
}

function getImageDimensionsFromView(bytes: Uint8Array, view: DataView, mimeType: string): RasterDimensions | null {
    switch (mimeType) {
        case 'image/png':
            return getPngDimensions(bytes, view);
        case 'image/gif':
            return getGifDimensions(bytes, view);
        case 'image/jpeg':
            return getJpegDimensions(bytes, view);
        case 'image/webp':
            return getWebpDimensions(bytes, view);
        case 'image/bmp':
            return getBmpDimensions(bytes, view);
        case 'image/avif':
        case 'image/heic':
        case 'image/heif':
            return getAvifDimensions(bytes, view);
        default:
            return null;
    }
}

// Checks if byte values at offset match the expected pattern
function matchesBytes(bytes: Uint8Array, offset: number, pattern: number[]): boolean {
    if (offset < 0 || offset + pattern.length > bytes.length) {
        return false;
    }
    for (let i = 0; i < pattern.length; i += 1) {
        if (bytes[offset + i] !== pattern[i]) {
            return false;
        }
    }
    return true;
}

// Checks if bytes at offset match an ASCII string pattern
function matchesAscii(bytes: Uint8Array, offset: number, pattern: string): boolean {
    if (offset < 0 || offset + pattern.length > bytes.length) {
        return false;
    }
    for (let i = 0; i < pattern.length; i += 1) {
        if (bytes[offset + i] !== pattern.charCodeAt(i)) {
            return false;
        }
    }
    return true;
}

function asciiSlice(bytes: Uint8Array, start: number, end: number): string {
    if (start < 0 || end < start || end > bytes.length) {
        return '';
    }

    let value = '';
    for (let i = start; i < end; i += 1) {
        value += String.fromCharCode(bytes[i]);
    }
    return value;
}

// Parses PNG dimensions from the IHDR chunk (bytes 16-23 after signature)
function getPngDimensions(bytes: Uint8Array, view: DataView): RasterDimensions | null {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || !matchesBytes(bytes, 0, signature)) {
        return null;
    }

    // Some PNGs (notably iOS-optimized "fried" PNGs) include a leading CgBI chunk.
    // In that case the IHDR chunk appears after the CgBI chunk rather than at offset 12.
    const firstChunkTypeOffset = 12;
    let ihdrChunkStart = 8;

    if (matchesAscii(bytes, firstChunkTypeOffset, 'CgBI')) {
        if (bytes.length < 24) {
            return null;
        }

        const cgbiLength = view.getUint32(8, false);
        const nextChunkStart = 8 + 12 + cgbiLength;
        if (nextChunkStart + 24 > bytes.length) {
            return null;
        }

        ihdrChunkStart = nextChunkStart;
    }

    if (!matchesAscii(bytes, ihdrChunkStart + 4, 'IHDR')) {
        return null;
    }

    const width = view.getUint32(ihdrChunkStart + 8, false);
    const height = view.getUint32(ihdrChunkStart + 12, false);
    if (width <= 0 || height <= 0) {
        return null;
    }
    return { width, height };
}

// Parses GIF dimensions from the logical screen descriptor (bytes 6-9)
function getGifDimensions(bytes: Uint8Array, view: DataView): RasterDimensions | null {
    if (bytes.length < 10 || !matchesAscii(bytes, 0, 'GIF')) {
        return null;
    }

    if (bytes[3] !== 0x38 || (bytes[4] !== 0x37 && bytes[4] !== 0x39) || bytes[5] !== 0x61) {
        return null;
    }

    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    if (width <= 0 || height <= 0) {
        return null;
    }
    return { width, height };
}

// Parses JPEG dimensions by scanning for a Start of Frame (SOF) marker
function getJpegDimensions(bytes: Uint8Array, view: DataView): RasterDimensions | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return null;
    }

    // SOF markers (0xC0-0xCF except 0xC4, 0xC8, 0xCC) contain frame dimensions
    const isSofMarker = (marker: number) =>
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

    let offset = 2;
    while (offset + 3 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }

        while (offset < bytes.length && bytes[offset] === 0xff) {
            offset += 1;
        }
        if (offset >= bytes.length) {
            return null;
        }

        const marker = bytes[offset];
        offset += 1;

        if (marker === 0xd9 || marker === 0xda) {
            break;
        }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            continue;
        }

        if (offset + 1 >= bytes.length) {
            return null;
        }
        const segmentLength = view.getUint16(offset, false);
        if (segmentLength < 2) {
            return null;
        }
        const segmentEnd = offset + segmentLength;
        const segmentDataStart = offset + 2;
        if (segmentEnd > bytes.length) {
            return null;
        }

        if (isSofMarker(marker)) {
            if (segmentDataStart + 5 > segmentEnd) {
                return null;
            }
            const height = view.getUint16(segmentDataStart + 1, false);
            const width = view.getUint16(segmentDataStart + 3, false);
            if (width <= 0 || height <= 0) {
                return null;
            }
            return { width, height };
        }

        offset = segmentEnd;
    }

    return null;
}

// Parses WebP dimensions from VP8, VP8L (lossless), or VP8X (extended) chunks
function getWebpDimensions(bytes: Uint8Array, view: DataView): RasterDimensions | null {
    if (bytes.length < 20 || !matchesAscii(bytes, 0, 'RIFF') || !matchesAscii(bytes, 8, 'WEBP')) {
        return null;
    }

    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const chunkType = asciiSlice(bytes, offset, offset + 4);
        const chunkSize = view.getUint32(offset + 4, true);
        const chunkDataStart = offset + 8;

        if (chunkDataStart < offset) {
            return null;
        }

        const chunkEnd = chunkDataStart + chunkSize;
        if (chunkEnd > bytes.length) {
            return null;
        }

        // VP8 lossy format stores dimensions after a 3-byte frame tag signature
        if (chunkType === 'VP8 ') {
            if (chunkDataStart + 10 > chunkEnd) {
                return null;
            }
            if (bytes[chunkDataStart + 3] !== 0x9d || bytes[chunkDataStart + 4] !== 0x01 || bytes[chunkDataStart + 5] !== 0x2a) {
                return null;
            }
            const width = view.getUint16(chunkDataStart + 6, true) & 0x3fff;
            const height = view.getUint16(chunkDataStart + 8, true) & 0x3fff;
            if (width <= 0 || height <= 0) {
                return null;
            }
            return { width, height };
        }

        // VP8L lossless format packs width and height into a 32-bit value after a signature byte
        if (chunkType === 'VP8L') {
            if (chunkDataStart + 5 > chunkEnd) {
                return null;
            }
            if (bytes[chunkDataStart] !== 0x2f) {
                return null;
            }
            const packed = view.getUint32(chunkDataStart + 1, true);
            const width = (packed & 0x3fff) + 1;
            const height = ((packed >> 14) & 0x3fff) + 1;
            if (width <= 0 || height <= 0) {
                return null;
            }
            return { width, height };
        }

        // VP8X extended format stores canvas dimensions as 24-bit values
        if (chunkType === 'VP8X') {
            if (chunkDataStart + 10 > chunkEnd) {
                return null;
            }
            const widthMinusOne = bytes[chunkDataStart + 4] | (bytes[chunkDataStart + 5] << 8) | (bytes[chunkDataStart + 6] << 16);
            const heightMinusOne = bytes[chunkDataStart + 7] | (bytes[chunkDataStart + 8] << 8) | (bytes[chunkDataStart + 9] << 16);
            const width = widthMinusOne + 1;
            const height = heightMinusOne + 1;
            if (width <= 0 || height <= 0) {
                return null;
            }
            return { width, height };
        }

        // Chunks are padded to even sizes.
        const paddedChunkSize = chunkSize + (chunkSize % 2);
        const nextOffset = chunkDataStart + paddedChunkSize;
        if (nextOffset <= offset) {
            return null;
        }
        offset = nextOffset;
    }

    return null;
}

// Parses BMP dimensions from the DIB header, supporting BITMAPCOREHEADER and BITMAPINFOHEADER formats
function getBmpDimensions(bytes: Uint8Array, view: DataView): RasterDimensions | null {
    if (bytes.length < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
        return null;
    }

    const dibHeaderSize = view.getUint32(14, true);
    // BITMAPCOREHEADER (OS/2 1.x) uses 16-bit dimensions
    if (dibHeaderSize === 12) {
        const width = view.getUint16(18, true);
        const height = view.getUint16(20, true);
        if (width <= 0 || height <= 0) {
            return null;
        }
        return { width, height };
    }

    // BITMAPINFOHEADER and later formats use signed 32-bit dimensions (height can be negative)
    if (dibHeaderSize >= 40) {
        const width = Math.abs(view.getInt32(18, true));
        const height = Math.abs(view.getInt32(22, true));
        if (width <= 0 || height <= 0) {
            return null;
        }
        return { width, height };
    }

    return null;
}

// Parses AVIF dimensions by scanning ISO base media file format boxes for the 'ispe' property
function getAvifDimensions(bytes: Uint8Array, view: DataView): RasterDimensions | null {
    const bufferLength = bytes.length;
    const maxScanBytes = 512 * 1024;
    const scanLimit = Math.min(bufferLength, maxScanBytes);
    const maxBoxes = 2000;
    const maxDepth = 32;
    let boxesScanned = 0;

    const getLargerDimensions = (current: RasterDimensions | null, candidate: RasterDimensions | null): RasterDimensions | null => {
        if (!candidate) {
            return current;
        }
        if (!current) {
            return candidate;
        }

        const candidateArea = candidate.width * candidate.height;
        const currentArea = current.width * current.height;
        return candidateArea > currentArea ? candidate : current;
    };

    const readIspeBoxDimensions = (payloadStart: number, payloadEnd: number): RasterDimensions | null => {
        if (payloadStart + 12 > payloadEnd) {
            return null;
        }

        const width = view.getUint32(payloadStart + 4, false);
        const height = view.getUint32(payloadStart + 8, false);
        if (width <= 0 || height <= 0) {
            return null;
        }
        return { width, height };
    };

    const readClapCropRight = (payloadStart: number, payloadEnd: number): number | null => {
        // Matches the `image-size` HEIF handler which reads a crop value at offset +12 from box start.
        if (payloadStart + 8 > payloadEnd) {
            return null;
        }

        const cropRight = view.getUint32(payloadStart + 4, false);
        return cropRight;
    };

    const parseIpcoDimensions = (start: number, end: number): RasterDimensions | null => {
        type IspeBox = { offset: number; end: number; dimensions: RasterDimensions };
        type ClapBox = { offset: number; cropRight: number };

        const ispeBoxes: IspeBox[] = [];
        const clapBoxes: ClapBox[] = [];

        let cursor = start;
        while (cursor + 8 <= end && cursor + 8 <= scanLimit) {
            if (boxesScanned >= maxBoxes) {
                break;
            }
            boxesScanned += 1;

            const size32 = view.getUint32(cursor, false);
            const typeOffset = cursor + 4;
            let headerSize = 8;
            let boxSize = size32;

            if (size32 === 1) {
                if (cursor + 16 > scanLimit || typeof view.getBigUint64 !== 'function') {
                    break;
                }
                const size64 = view.getBigUint64(cursor + 8, false);
                if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) {
                    break;
                }
                boxSize = Number(size64);
                headerSize = 16;
            } else if (size32 === 0) {
                boxSize = end - cursor;
            }

            if (boxSize < headerSize) {
                break;
            }

            const declaredEnd = cursor + boxSize;
            if (declaredEnd <= cursor) {
                break;
            }

            const boxEnd = Math.min(declaredEnd, end, scanLimit);
            const payloadStart = cursor + headerSize;
            const payloadEnd = boxEnd;
            const type = asciiSlice(bytes, typeOffset, typeOffset + 4);

            if (type === 'ispe') {
                const dimensions = readIspeBoxDimensions(payloadStart, payloadEnd);
                if (dimensions) {
                    ispeBoxes.push({ offset: cursor, end: declaredEnd, dimensions });
                }
            } else if (type === 'clap') {
                const cropRight = readClapCropRight(payloadStart, payloadEnd);
                if (cropRight !== null) {
                    clapBoxes.push({ offset: cursor, cropRight });
                }
            }

            cursor = declaredEnd;
        }

        if (ispeBoxes.length === 0) {
            return null;
        }

        let best: RasterDimensions | null = null;
        let currentOffset = start;
        let clapIndex = 0;

        for (const ispeBox of ispeBoxes) {
            if (ispeBox.offset < currentOffset) {
                continue;
            }

            while (clapIndex < clapBoxes.length && clapBoxes[clapIndex].offset < currentOffset) {
                clapIndex += 1;
            }

            let width = ispeBox.dimensions.width;
            const height = ispeBox.dimensions.height;

            const clap = clapBoxes[clapIndex];
            if (clap) {
                width -= clap.cropRight;
            }

            const candidate: RasterDimensions | null = width > 0 && height > 0 ? { width, height } : null;
            best = getLargerDimensions(best, candidate);
            currentOffset = ispeBox.end;
        }

        return best;
    };

    // Recursively scans ISOBMFF boxes to find the 'ispe' (image spatial extents) property
    const scanBoxes = (start: number, end: number, depth: number): RasterDimensions | null => {
        if (depth > maxDepth) {
            return null;
        }

        let best: RasterDimensions | null = null;
        let cursor = start;
        while (cursor + 8 <= end && cursor + 8 <= scanLimit) {
            if (boxesScanned >= maxBoxes) {
                return best;
            }
            boxesScanned += 1;

            const size32 = view.getUint32(cursor, false);
            const typeOffset = cursor + 4;
            let headerSize = 8;
            let boxSize = size32;

            if (size32 === 1) {
                if (cursor + 16 > scanLimit || typeof view.getBigUint64 !== 'function') {
                    break;
                }
                const size64 = view.getBigUint64(cursor + 8, false);
                if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) {
                    return best;
                }
                boxSize = Number(size64);
                headerSize = 16;
            } else if (size32 === 0) {
                boxSize = end - cursor;
            }

            if (boxSize < headerSize) {
                return best;
            }

            const declaredEnd = cursor + boxSize;
            const boxLimitEnd = Math.min(declaredEnd, end, scanLimit);
            const payloadStart = cursor + headerSize;
            const payloadEnd = boxLimitEnd;

            if (matchesAscii(bytes, typeOffset, 'ipco')) {
                best = getLargerDimensions(best, parseIpcoDimensions(payloadStart, payloadEnd));
            } else if (matchesAscii(bytes, typeOffset, 'ispe')) {
                best = getLargerDimensions(best, readIspeBoxDimensions(payloadStart, payloadEnd));
            }

            if (matchesAscii(bytes, typeOffset, 'meta')) {
                const metaChildrenStart = payloadStart + 4;
                if (metaChildrenStart < payloadEnd) {
                    const found = scanBoxes(metaChildrenStart, payloadEnd, depth + 1);
                    if (found) {
                        best = getLargerDimensions(best, found);
                    }
                }
            } else if (matchesAscii(bytes, typeOffset, 'iprp')) {
                if (payloadStart < payloadEnd) {
                    const found = scanBoxes(payloadStart, payloadEnd, depth + 1);
                    if (found) {
                        best = getLargerDimensions(best, found);
                    }
                }
            }

            if (declaredEnd <= cursor) {
                return best;
            }
            cursor = declaredEnd;
        }
        return best;
    };

    if (bufferLength < 16) {
        return null;
    }

    return scanBoxes(0, bufferLength, 0);
}
