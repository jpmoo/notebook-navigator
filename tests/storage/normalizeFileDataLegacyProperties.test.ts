/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
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
import { createDefaultFileData, type FileData, type PropertyItem } from '../../src/storage/IndexedDBStorage';
import { normalizeFileDataInPlace } from '../../src/storage/indexeddb/normalizeFileData';

type LegacyFileDataInput = Partial<FileData> & { preview?: string | null; customProperty?: unknown };

describe('normalizeFileDataInPlace legacy customProperty migration', () => {
    it('reads legacy customProperty into properties', () => {
        const legacyProperties: PropertyItem[] = [{ fieldKey: 'status', value: 'open', valueKind: 'string' }];
        const legacyInput: LegacyFileDataInput = {
            ...createDefaultFileData({ mtime: 1, path: 'notes/note.md' }),
            properties: undefined,
            customProperty: legacyProperties
        };

        const normalized = normalizeFileDataInPlace(legacyInput);

        expect(normalized.properties).toEqual(legacyProperties);
        expect(Object.prototype.hasOwnProperty.call(legacyInput, 'customProperty')).toBe(false);
    });

    it('prefers properties when both new and legacy fields exist', () => {
        const currentProperties: PropertyItem[] = [{ fieldKey: 'status', value: 'current', valueKind: 'string' }];
        const legacyProperties: PropertyItem[] = [{ fieldKey: 'status', value: 'legacy', valueKind: 'string' }];
        const legacyInput: LegacyFileDataInput = {
            ...createDefaultFileData({ mtime: 1, path: 'notes/note.md' }),
            properties: currentProperties,
            customProperty: legacyProperties
        };

        const normalized = normalizeFileDataInPlace(legacyInput);

        expect(normalized.properties).toEqual(currentProperties);
        expect(Object.prototype.hasOwnProperty.call(legacyInput, 'customProperty')).toBe(false);
    });
});
