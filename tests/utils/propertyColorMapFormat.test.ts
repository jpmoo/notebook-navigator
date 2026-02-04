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

import { describe, it, expect } from 'vitest';
import {
    normalizePropertyColorMapKey,
    parsePropertyColorMapText,
    serializePropertyColorMapRecord
} from '../../src/utils/propertyColorMapFormat';

describe('propertyColorMapFormat', () => {
    it('parses single-quoted keys', () => {
        const result = parsePropertyColorMapText("'Due date'=#ff0000", normalizePropertyColorMapKey);
        expect(result.invalidLines).toEqual([]);
        expect(Object.entries(result.map)).toEqual([['due date', '#ff0000']]);
    });

    it('parses double-quoted keys', () => {
        const result = parsePropertyColorMapText('"Due date"=#ff0000', normalizePropertyColorMapKey);
        expect(result.invalidLines).toEqual([]);
        expect(Object.entries(result.map)).toEqual([['due date', '#ff0000']]);
    });

    it('unescapes quotes inside quoted keys', () => {
        const singleQuoted = parsePropertyColorMapText("'Due\\'s'=#ff0000", normalizePropertyColorMapKey);
        expect(singleQuoted.invalidLines).toEqual([]);
        expect(Object.entries(singleQuoted.map)).toEqual([["due's", '#ff0000']]);

        const doubleQuoted = parsePropertyColorMapText('"a\\"b"=#ff0000', normalizePropertyColorMapKey);
        expect(doubleQuoted.invalidLines).toEqual([]);
        expect(Object.entries(doubleQuoted.map)).toEqual([['a"b', '#ff0000']]);
    });

    it('roundtrips serialized keys with spaces', () => {
        const serialized = serializePropertyColorMapRecord({ 'due date': '#ff0000' });
        const parsed = parsePropertyColorMapText(serialized, normalizePropertyColorMapKey);

        expect(parsed.invalidLines).toEqual([]);
        expect(Object.entries(parsed.map)).toEqual([['due date', '#ff0000']]);
    });
});
