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

import { describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import {
    buildManualSortOrderAssignments,
    getManualSortPropertyCoverage,
    hasDenseManualSortOrder,
    isManualSortValueEqual,
    isValidManualSortPropertyKey,
    orderManualSortFiles,
    partitionManualSortFiles,
    writeManualSortOrder
} from '../../src/utils/manualSort';
import { createTestTFile } from './createTestTFile';

function createFile(path: string, frontmatter: Record<string, unknown>): TFile & { frontmatter: Record<string, unknown> } {
    return Object.assign(createTestTFile(path), { frontmatter });
}

function createApp(files: readonly (TFile & { frontmatter: Record<string, unknown> })[], processFrontMatter: ReturnType<typeof vi.fn>) {
    const frontmatterByPath = new Map(files.map(file => [file.path, file.frontmatter]));
    return {
        metadataCache: {
            getFileCache: (file: TFile) => ({ frontmatter: frontmatterByPath.get(file.path) })
        },
        fileManager: { processFrontMatter }
    } as unknown as App;
}

describe('manual sort helpers', () => {
    it('builds numeric assignments for markdown files only', () => {
        const files = [
            { path: 'notes/one.md', extension: 'md' },
            { path: 'assets/file.pdf', extension: 'pdf' },
            { path: 'notes/two.md', extension: 'md' }
        ];

        expect(buildManualSortOrderAssignments(files)).toEqual([
            { path: 'notes/one.md', value: 1 },
            { path: 'notes/two.md', value: 2 }
        ]);
    });

    it('partitions manual sort files with markdown files first', () => {
        const files = [
            { path: 'notes/one.md', extension: 'md' },
            { path: 'assets/file.pdf', extension: 'pdf' },
            { path: 'notes/two.md', extension: 'md' }
        ];

        expect(partitionManualSortFiles(files)).toEqual({
            markdown: [files[0], files[2]],
            nonMarkdown: [files[1]]
        });
        expect(orderManualSortFiles(files)).toEqual([files[0], files[2], files[1]]);
    });

    it('validates property keys used for manual sort', () => {
        expect(isValidManualSortPropertyKey('index')).toBe(true);
        expect(isValidManualSortPropertyKey('  index  ')).toBe(true);
        expect(isValidManualSortPropertyKey('')).toBe(false);
        expect(isValidManualSortPropertyKey('a,b')).toBe(false);
    });

    it('treats numeric strings and numbers as the same manual order value', () => {
        expect(isManualSortValueEqual(3, 3)).toBe(true);
        expect(isManualSortValueEqual(' 3 ', 3)).toBe(true);
        expect(isManualSortValueEqual('three', 3)).toBe(false);
    });

    it('counts manual sort property coverage for markdown files only', () => {
        const first = createFile('notes/first.md', { Index: '3.5' });
        const second = createFile('notes/second.md', {});
        const third = createFile('notes/third.md', { index: null });
        const fourth = createFile('notes/fourth.md', { index: 4 });
        const nonMarkdown = createFile('assets/file.pdf', {});
        const app = createApp([first, second, third, fourth, nonMarkdown], vi.fn());

        expect(getManualSortPropertyCoverage(app, [first, second, third, fourth, nonMarkdown], 'index')).toEqual({
            markdownCount: 4,
            withPropertyCount: 3
        });
    });

    it('detects whether manual sort values already match dense order assignments', () => {
        const first = createFile('notes/first.md', { Index: '1' });
        const second = createFile('notes/second.md', { index: 2 });
        const third = createFile('notes/third.md', { index: 10 });
        const nonMarkdown = createFile('assets/file.pdf', {});
        const app = createApp([first, second, third, nonMarkdown], vi.fn());

        expect(hasDenseManualSortOrder(app, [first, nonMarkdown, second], 'index')).toBe(true);
        expect(hasDenseManualSortOrder(app, [first, third, nonMarkdown], 'index')).toBe(false);
    });

    it('writes order values while preserving existing property key casing', async () => {
        const first = createFile('notes/first.md', { Index: 'old' });
        const second = createFile('notes/second.md', { index: 2 });
        const nonMarkdown = createFile('assets/file.pdf', {});
        const processFrontMatter = vi.fn(async (file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
        });
        const app = createApp([first, second, nonMarkdown], processFrontMatter);

        const result = await writeManualSortOrder(app, [first, nonMarkdown, second], 'index');

        expect(result).toEqual({ updated: 1, skipped: 1, failed: 0, failures: [] });
        expect(processFrontMatter).toHaveBeenCalledTimes(1);
        expect(first.frontmatter).toEqual({ Index: 1 });
        expect(second.frontmatter).toEqual({ index: 2 });
        expect(nonMarkdown.frontmatter).toEqual({});
    });

    it('normalizes existing and missing manual sort properties into dense order', async () => {
        const first = createFile('notes/first.md', { index: 10 });
        const second = createFile('notes/second.md', {});
        const third = createFile('notes/third.md', { Index: 'custom' });
        const processFrontMatter = vi.fn(async (file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
        });
        const app = createApp([first, second, third], processFrontMatter);

        const result = await writeManualSortOrder(app, [first, second, third], 'index');

        expect(result).toEqual({ updated: 3, skipped: 0, failed: 0, failures: [] });
        expect(processFrontMatter).toHaveBeenCalledTimes(3);
        expect(first.frontmatter).toEqual({ index: 1 });
        expect(second.frontmatter).toEqual({ index: 2 });
        expect(third.frontmatter).toEqual({ Index: 3 });
    });

    it('records failures and continues writing remaining files', async () => {
        const first = createFile('notes/first.md', { index: 'old' });
        const second = createFile('notes/second.md', { index: 'old' });
        const third = createFile('notes/third.md', { index: 'old' });
        const processFrontMatter = vi.fn(async (file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            if (file.path === second.path) {
                throw new Error('YAML parse failed');
            }
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
        });
        const app = createApp([first, second, third], processFrontMatter);

        const result = await writeManualSortOrder(app, [first, second, third], 'index');

        expect(result).toEqual({
            updated: 2,
            skipped: 0,
            failed: 1,
            failures: [{ path: 'notes/second.md', message: 'YAML parse failed' }]
        });
        expect(processFrontMatter).toHaveBeenCalledTimes(3);
        expect(first.frontmatter).toEqual({ index: 1 });
        expect(second.frontmatter).toEqual({ index: 'old' });
        expect(third.frontmatter).toEqual({ index: 3 });
    });
});
