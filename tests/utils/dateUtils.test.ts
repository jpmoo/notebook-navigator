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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getLanguageMock } = vi.hoisted(() => ({
    getLanguageMock: vi.fn(() => 'en')
}));

vi.mock('obsidian', () => ({
    getLanguage: getLanguageMock
}));

import { DateUtils } from '../../src/utils/dateUtils';

describe('DateUtils.parseFrontmatterDate', () => {
    beforeEach(() => {
        getLanguageMock.mockReturnValue('en');
    });

    afterEach(() => {
        getLanguageMock.mockReturnValue('en');
        getLanguageMock.mockClear();
    });

    it.each(['zh', 'zh-CN', 'zh_CN'])('parses Chinese meridiem markers in frontmatter values (%s)', locale => {
        getLanguageMock.mockReturnValue(locale);

        const timestamp = DateUtils.parseFrontmatterDate('2025年11月1日 下午03:24', 'yyyy年M月d日 a hh:mm');

        expect(timestamp).toBeDefined();
        if (timestamp === undefined) {
            throw new Error('Expected timestamp to be defined');
        }

        expect(new Date(timestamp).getHours()).toBe(15);
    });

    it.each(['zh', 'zh-CN', 'zh_CN'])('parses Chinese morning marker as morning hours (%s)', locale => {
        getLanguageMock.mockReturnValue(locale);

        const timestamp = DateUtils.parseFrontmatterDate('2025年11月1日 上午03:24', 'yyyy年M月d日 a hh:mm');

        expect(timestamp).toBeDefined();
        if (timestamp === undefined) {
            throw new Error('Expected timestamp to be defined');
        }

        expect(new Date(timestamp).getHours()).toBe(3);
    });
});
