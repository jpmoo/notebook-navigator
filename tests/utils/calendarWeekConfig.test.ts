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
import { describe, expect, test } from 'vitest';
import { getWeek } from 'date-fns';
import { getCalendarWeekConfig, getDateFnsLocale } from '../../src/utils/dateFnsLocale';

describe('getCalendarWeekConfig', () => {
    test('en-US: week starts on Sunday and week 1 contains Jan 1', () => {
        const config = getCalendarWeekConfig('en-us');
        expect(config.weekStartsOn).toBe(0);
        expect(config.firstWeekContainsDate).toBe(1);

        const date = new Date(2023, 0, 1, 12);
        expect(getWeek(date, config)).toBe(1);
    });

    test('en-AU: week starts on Monday and ISO week numbering', () => {
        expect(getDateFnsLocale('en-au').code).toBe('en-AU');

        const config = getCalendarWeekConfig('en-au');
        expect(config.weekStartsOn).toBe(1);
        expect(config.firstWeekContainsDate).toBe(4);

        const date = new Date(2023, 0, 1, 12);
        expect(getWeek(date, config)).toBe(52);
    });

    test('sv: week starts on Monday and ISO week numbering', () => {
        const config = getCalendarWeekConfig('sv');
        expect(config.weekStartsOn).toBe(1);
        expect(config.firstWeekContainsDate).toBe(4);

        const date = new Date(2023, 0, 1, 12);
        expect(getWeek(date, config)).toBe(52);
    });

    test('sr-Latn: resolves to date-fns srLatn locale export', () => {
        expect(getDateFnsLocale('sr-latn').code).toBe('sr-Latn');
    });

    test('be-tarask: resolves to date-fns beTarask locale export', () => {
        expect(getDateFnsLocale('be-tarask').code).toBe('be-tarask');
    });

    test('no-NO: falls back to nb locale', () => {
        expect(getDateFnsLocale('no-no').code).toBe('nb');
    });
});
