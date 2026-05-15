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
import { App, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../src/settings/defaultSettings';
import type { PropertyItem } from '../../../src/storage/IndexedDBStorage';
import type { IndexedDBStorage } from '../../../src/storage/IndexedDBStorage';
import { buildListItems, type ListPaneConfig } from '../../../src/hooks/listPaneData/listItems';
import { FILE_VISIBILITY } from '../../../src/utils/fileTypeUtils';
import { createTestTFile } from '../../utils/createTestTFile';
import { ItemType, ListPaneItemType, PINNED_SECTION_HEADER_KEY } from '../../../src/types';

interface FileMetadataRecord {
    properties: PropertyItem[] | null;
    tags: readonly string[] | null;
}

function createApp(): App {
    const app = new App();
    app.metadataCache.getFileCache = () => null;
    return app;
}

function createDb(records: Record<string, FileMetadataRecord>): IndexedDBStorage {
    return {
        getFile(path: string): FileMetadataRecord | null {
            return records[path] ?? null;
        }
    } as IndexedDBStorage;
}

function createListConfig(pinnedNotes: ListPaneConfig['pinnedNotes']): ListPaneConfig {
    return {
        filterPinnedByFolder: true,
        folderGroupSortOrder: DEFAULT_SETTINGS.folderSortOrder,
        groupBy: DEFAULT_SETTINGS.noteGrouping,
        pinnedGroupExpanded: true,
        pinnedNotes,
        showFileTags: false,
        showTags: false
    };
}

function getFileItems(items: ReturnType<typeof buildListItems>): { path: string; isPinned: boolean }[] {
    const fileItems: { path: string; isPinned: boolean }[] = [];

    items.forEach(item => {
        if (item.type !== ListPaneItemType.FILE) {
            return;
        }

        const fileData = item.data;
        if (!(fileData instanceof TFile)) {
            return;
        }

        fileItems.push({
            path: fileData.path,
            isPinned: item.isPinned === true
        });
    });

    return fileItems;
}

function getHeaderItems(items: ReturnType<typeof buildListItems>): { data: string; kind: string | undefined }[] {
    return items
        .filter(item => item.type === ListPaneItemType.HEADER && typeof item.data === 'string')
        .map(item => ({
            data: item.data as string,
            kind: item.headerKind
        }));
}

describe('buildListItems pinned display scope', () => {
    it('adds spacer rows before subsequent fixed-height group headers', () => {
        const app = createApp();
        const todayFile = createTestTFile('notes/today.md');
        const olderFile = createTestTFile('notes/older.md');
        const db = createDb({
            [todayFile.path]: { tags: null, properties: null },
            [olderFile.path]: { tags: null, properties: null }
        });
        const timestamps = new Map([
            [todayFile.path, new Date(2026, 2, 7).getTime()],
            [olderFile.path, new Date(2026, 1, 20).getTime()]
        ]);

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [todayFile, olderFile],
            getDB: () => db,
            getFileTimestamps: file => {
                const timestamp = timestamps.get(file.path) ?? 0;
                return { created: timestamp, modified: timestamp };
            },
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: createListConfig({}),
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        expect(items.map(item => item.type)).toEqual([
            ListPaneItemType.TOP_SPACER,
            ListPaneItemType.HEADER,
            ListPaneItemType.FILE,
            ListPaneItemType.HEADER_SPACER,
            ListPaneItemType.HEADER,
            ListPaneItemType.FILE,
            ListPaneItemType.BOTTOM_SPACER
        ]);
        expect(items[3].key).toMatch(/-spacer-before$/);
    });

    it('adds an Unsorted section for property-sorted markdown files missing the property', () => {
        const app = createApp();
        const rankedFile = createTestTFile('notes/ranked.md');
        const unsortedFile = createTestTFile('notes/unsorted.md');
        app.metadataCache.getFileCache = (file: TFile) => ({
            frontmatter: file.path === rankedFile.path ? { index: 1 } : {}
        });
        const db = createDb({
            [rankedFile.path]: { tags: null, properties: null },
            [unsortedFile.path]: { tags: null, properties: null }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [rankedFile, unsortedFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: { ...createListConfig({}), groupBy: 'none' },
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'property-asc',
            propertySortKey: 'index',
            isManualSortActive: true
        });

        expect(items.map(item => item.type)).toEqual([
            ListPaneItemType.TOP_SPACER,
            ListPaneItemType.FILE,
            ListPaneItemType.HEADER_SPACER,
            ListPaneItemType.HEADER,
            ListPaneItemType.FILE,
            ListPaneItemType.BOTTOM_SPACER
        ]);
        expect(items[3].data).toBe('Unsorted');
        expect(items[3].headerKind).toBe('section');
        expect(getFileItems(items)).toEqual([
            { path: rankedFile.path, isPinned: false },
            { path: unsortedFile.path, isPinned: false }
        ]);
    });

    it('adds manual sort custom headers in pinned, ranked, and Unsorted sections', () => {
        const app = createApp();
        const pinnedFile = createTestTFile('notes/pinned.md');
        const rankedHeaderFile = createTestTFile('notes/ranked-header.md');
        const rankedPlainFile = createTestTFile('notes/ranked-plain.md');
        const unsortedHeaderFile = createTestTFile('notes/unsorted-header.md');
        app.metadataCache.getFileCache = (file: TFile) => ({
            frontmatter:
                file.path === pinnedFile.path
                    ? { index: 1000, GroupHeader: 'Pinned header' }
                    : file.path === rankedHeaderFile.path
                      ? { index: 2000, groupheader: 'Ranked header' }
                      : file.path === rankedPlainFile.path
                        ? { index: 3000 }
                        : file.path === unsortedHeaderFile.path
                          ? { groupheader: 'Unsorted header' }
                          : {}
        });
        const db = createDb({
            [pinnedFile.path]: { tags: null, properties: null },
            [rankedHeaderFile.path]: { tags: null, properties: null },
            [rankedPlainFile.path]: { tags: null, properties: null },
            [unsortedHeaderFile.path]: { tags: null, properties: null }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [pinnedFile, rankedHeaderFile, rankedPlainFile, unsortedHeaderFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: {
                ...createListConfig({
                    [pinnedFile.path]: { folder: true, tag: false, property: false }
                }),
                groupBy: 'none'
            },
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'property-asc',
            propertySortKey: 'index',
            isManualSortActive: true,
            manualSortGroupHeaderPropertyKey: 'groupheader'
        });

        expect(getHeaderItems(items)).toEqual([
            { data: 'Pinned', kind: 'pinned' },
            { data: 'Pinned header', kind: 'manual-sort-custom' },
            { data: 'Notes', kind: 'section' },
            { data: 'Ranked header', kind: 'manual-sort-custom' },
            { data: 'Unsorted', kind: 'section' },
            { data: 'Unsorted header', kind: 'manual-sort-custom' }
        ]);
        expect(getFileItems(items)).toEqual([
            { path: pinnedFile.path, isPinned: true },
            { path: rankedHeaderFile.path, isPinned: false },
            { path: rankedPlainFile.path, isPinned: false },
            { path: unsortedHeaderFile.path, isPinned: false }
        ]);
    });

    it('does not add manual sort custom headers when the group header key is disabled', () => {
        const app = createApp();
        const rankedFile = createTestTFile('notes/ranked.md');
        app.metadataCache.getFileCache = () => ({
            frontmatter: { index: 1000, groupheader: 'Ranked header' }
        });
        const db = createDb({
            [rankedFile.path]: { tags: null, properties: null }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [rankedFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: { ...createListConfig({}), groupBy: 'none' },
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'property-asc',
            propertySortKey: 'index',
            isManualSortActive: true,
            manualSortGroupHeaderPropertyKey: null
        });

        expect(getHeaderItems(items)).toEqual([]);
    });

    it('does not split missing values into Unsorted for normal property sort', () => {
        const app = createApp();
        const rankedFile = createTestTFile('notes/ranked.md');
        const missingFile = createTestTFile('notes/missing.md');
        app.metadataCache.getFileCache = (file: TFile) => ({
            frontmatter: file.path === rankedFile.path ? { author: 'Ada' } : {}
        });
        const db = createDb({
            [rankedFile.path]: { tags: null, properties: null },
            [missingFile.path]: { tags: null, properties: null }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [rankedFile, missingFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: { ...createListConfig({}), groupBy: 'none' },
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'property-asc',
            propertySortKey: 'author',
            isManualSortActive: false
        });

        expect(items.map(item => item.type)).toEqual([
            ListPaneItemType.TOP_SPACER,
            ListPaneItemType.FILE,
            ListPaneItemType.FILE,
            ListPaneItemType.BOTTOM_SPACER
        ]);
    });

    it('marks date headers with date header kind', () => {
        const app = createApp();
        const todayFile = createTestTFile('notes/today.md');
        const olderFile = createTestTFile('notes/older.md');
        const db = createDb({
            [todayFile.path]: { tags: null, properties: null },
            [olderFile.path]: { tags: null, properties: null }
        });
        const timestamps = new Map([
            [todayFile.path, new Date(2026, 2, 7).getTime()],
            [olderFile.path, new Date(2026, 1, 20).getTime()]
        ]);

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [todayFile, olderFile],
            getDB: () => db,
            getFileTimestamps: file => {
                const timestamp = timestamps.get(file.path) ?? 0;
                return { created: timestamp, modified: timestamp };
            },
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: createListConfig({}),
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        expect(getHeaderItems(items).map(item => item.kind)).toEqual(['date', 'date']);
    });

    it('keeps tag pins in the pinned section when folder pin scoping is enabled', () => {
        const app = createApp();
        const rootFile = createTestTFile('notes/root.md');
        const childFile = createTestTFile('notes/child.md');
        const db = createDb({
            [rootFile.path]: { tags: ['work'], properties: null },
            [childFile.path]: { tags: ['work/anthropic'], properties: null }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [rootFile, childFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: createListConfig({
                [childFile.path]: { folder: false, tag: true, property: false }
            }),
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: 'work',
            selectionType: ItemType.TAG,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        expect(items.some(item => item.key === PINNED_SECTION_HEADER_KEY)).toBe(true);
        expect(getFileItems(items)).toEqual([
            { path: childFile.path, isPinned: true },
            { path: rootFile.path, isPinned: false }
        ]);
    });

    it('keeps direct tag pins in the pinned section for the matching tag selection', () => {
        const app = createApp();
        const childFile = createTestTFile('notes/child.md');
        const siblingFile = createTestTFile('notes/sibling.md');
        const db = createDb({
            [childFile.path]: { tags: ['work/anthropic'], properties: null },
            [siblingFile.path]: { tags: ['work/anthropic'], properties: null }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [childFile, siblingFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: createListConfig({
                [childFile.path]: { folder: false, tag: true, property: false }
            }),
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: 'work/anthropic',
            selectionType: ItemType.TAG,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        expect(items.some(item => item.key === PINNED_SECTION_HEADER_KEY)).toBe(true);
        expect(getFileItems(items)).toEqual([
            { path: childFile.path, isPinned: true },
            { path: siblingFile.path, isPinned: false }
        ]);
    });

    it('keeps property pins in the pinned section when folder pin scoping is enabled', () => {
        const app = createApp();
        const keyOnlyFile = createTestTFile('notes/key-only.md');
        const valueFile = createTestTFile('notes/value.md');
        const db = createDb({
            [keyOnlyFile.path]: {
                tags: null,
                properties: [{ fieldKey: 'status', value: '', valueKind: 'string' }]
            },
            [valueFile.path]: {
                tags: null,
                properties: [{ fieldKey: 'status', value: 'work/anthropic', valueKind: 'string' }]
            }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [keyOnlyFile, valueFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: createListConfig({
                [valueFile.path]: { folder: false, tag: false, property: true }
            }),
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: null,
            selectionType: ItemType.PROPERTY,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        expect(items.some(item => item.key === PINNED_SECTION_HEADER_KEY)).toBe(true);
        expect(getFileItems(items)).toEqual([
            { path: valueFile.path, isPinned: true },
            { path: keyOnlyFile.path, isPinned: false }
        ]);
    });

    it('keeps direct property value pins in the pinned section for the matching value selection', () => {
        const app = createApp();
        const valueFile = createTestTFile('notes/value.md');
        const siblingFile = createTestTFile('notes/sibling.md');
        const db = createDb({
            [valueFile.path]: {
                tags: null,
                properties: [{ fieldKey: 'status', value: 'work/anthropic', valueKind: 'string' }]
            },
            [siblingFile.path]: {
                tags: null,
                properties: [{ fieldKey: 'status', value: 'work/anthropic', valueKind: 'string' }]
            }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [valueFile, siblingFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: createListConfig({
                [valueFile.path]: { folder: false, tag: false, property: true }
            }),
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: null,
            selectionType: ItemType.PROPERTY,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        expect(items.some(item => item.key === PINNED_SECTION_HEADER_KEY)).toBe(true);
        expect(getFileItems(items)).toEqual([
            { path: valueFile.path, isPinned: true },
            { path: siblingFile.path, isPinned: false }
        ]);
    });

    it('keeps the pinned header and hides pinned file rows when the pinned group is collapsed', () => {
        const app = createApp();
        const pinnedFile = createTestTFile('notes/pinned.md');
        const regularFile = createTestTFile('notes/regular.md');
        const db = createDb({
            [pinnedFile.path]: { tags: null, properties: null },
            [regularFile.path]: { tags: null, properties: null }
        });

        const items = buildListItems({
            app,
            dayKey: '2026-03-07',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [pinnedFile, regularFile],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: {
                ...createListConfig({
                    [pinnedFile.path]: { folder: true, tag: false, property: false }
                }),
                groupBy: 'none',
                pinnedGroupExpanded: false
            },
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        expect(items.some(item => item.key === PINNED_SECTION_HEADER_KEY)).toBe(true);
        expect(getFileItems(items)).toEqual([{ path: regularFile.path, isPinned: false }]);
    });
});
