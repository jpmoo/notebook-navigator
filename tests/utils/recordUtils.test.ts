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
import { ensureRecord, sanitizeRecord, isStringRecordValue } from '../../src/utils/recordUtils';

describe('sanitizeRecord', () => {
    it('returns a null-prototype object while preserving own entries', () => {
        const record = { valid: 'ok', constructor: 'icon' };

        const sanitized = sanitizeRecord(record);

        expect(Object.getPrototypeOf(sanitized)).toBeNull();
        expect(sanitized.valid).toBe('ok');
        expect(sanitized.constructor).toBe('icon');
    });

    it('drops inherited properties from the prototype chain', () => {
        const prototype = { inherited: 'skip' };
        const record = Object.create(prototype);
        record.own = 'keep';

        const sanitized = sanitizeRecord(record);

        expect(sanitized).toEqual({ own: 'keep' });
        expect('inherited' in sanitized).toBe(false);
    });

    it('applies validators to filter out invalid values', () => {
        const record = { good: 'yes', bad: 123 as unknown as string };

        const sanitized = sanitizeRecord(record, isStringRecordValue);

        expect(sanitized).toEqual({ good: 'yes' });
    });
});

describe('ensureRecord', () => {
    it('creates a null-prototype record when input is undefined', () => {
        const ensured = ensureRecord<string>(undefined);

        expect(Object.getPrototypeOf(ensured)).toBeNull();
    });

    it('sanitizes objects with prototypes by rebuilding entries only', () => {
        const proto = { inherited: 'skip' };
        const record = Object.create(proto);
        record.own = 'keep';

        const ensured = ensureRecord(record);

        expect(Object.getPrototypeOf(ensured)).toBeNull();
        expect(ensured).toEqual({ own: 'keep' });
    });

    it('removes invalid values when validate is provided', () => {
        const record = Object.create(null) as Record<string, unknown>;
        record.valid = 'ok';
        record.invalid = 42;

        const ensured = ensureRecord(record, isStringRecordValue);

        expect(ensured).toEqual({ valid: 'ok' });
        expect(Object.prototype.hasOwnProperty.call(ensured, 'invalid')).toBe(false);
    });
});
