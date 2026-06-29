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
import { buildBoardCards, filterBoardCards, type BoardCardModel, type BoardCardSnapshot } from '../../src/utils/boardCards';

interface TestFile {
    path: string;
    basename: string;
}

function makeFiles(count: number): TestFile[] {
    return Array.from({ length: count }, (_unused, index) => ({
        path: `Folder/note-${index}.md`,
        basename: `note-${index}`
    }));
}

const emptySnapshot: BoardCardSnapshot = {
    previewText: '',
    tags: [],
    featureImageKey: null,
    featureImageStatus: 'unprocessed',
    featureImageUrl: null
};

function snapshotFor(file: TestFile): BoardCardSnapshot {
    return { ...emptySnapshot, previewText: `preview for ${file.basename}` };
}

describe('buildBoardCards', () => {
    it('maps files to card models using the supplied snapshot', () => {
        const files = makeFiles(2);
        const result = buildBoardCards(files, 10, snapshotFor);

        expect(result.total).toBe(2);
        expect(result.shown).toBe(2);
        expect(result.truncated).toBe(false);
        expect(result.cards[0]).toMatchObject({
            path: 'Folder/note-0.md',
            title: 'note-0',
            previewText: 'preview for note-0'
        });
    });

    it('caps the number of cards and reports truncation', () => {
        const files = makeFiles(50);
        const result = buildBoardCards(files, 10, snapshotFor);

        expect(result.total).toBe(50);
        expect(result.shown).toBe(10);
        expect(result.cards).toHaveLength(10);
        expect(result.truncated).toBe(true);
        // Only the first `max` files are snapshotted/rendered.
        expect(result.cards[result.cards.length - 1].title).toBe('note-9');
    });

    it('handles an empty folder', () => {
        const result = buildBoardCards([], 10, snapshotFor);
        expect(result.total).toBe(0);
        expect(result.shown).toBe(0);
        expect(result.truncated).toBe(false);
        expect(result.cards).toEqual([]);
    });

    it('carries feature image and tag data from the snapshot', () => {
        const files = makeFiles(1);
        const result = buildBoardCards(files, 10, () => ({
            previewText: 'p',
            tags: ['todo', 'idea'],
            featureImageKey: 'key-1',
            featureImageStatus: 'has',
            featureImageUrl: null
        }));

        expect(result.cards[0].tags).toEqual(['todo', 'idea']);
        expect(result.cards[0].featureImageKey).toBe('key-1');
        expect(result.cards[0].featureImageStatus).toBe('has');
    });
});

describe('filterBoardCards', () => {
    const cards: BoardCardModel[] = [
        {
            path: 'a.md',
            title: 'Grocery list',
            previewText: 'milk and eggs',
            tags: [],
            featureImageKey: null,
            featureImageStatus: 'unprocessed',
            featureImageUrl: null
        },
        {
            path: 'b.md',
            title: 'Meeting notes',
            previewText: 'discuss roadmap',
            tags: ['work'],
            featureImageKey: null,
            featureImageStatus: 'unprocessed',
            featureImageUrl: null
        }
    ];

    it('returns all cards for an empty query', () => {
        expect(filterBoardCards(cards, '   ')).toHaveLength(2);
    });

    it('matches against the title', () => {
        const filtered = filterBoardCards(cards, 'grocery');
        expect(filtered).toHaveLength(1);
        expect(filtered[0].path).toBe('a.md');
    });

    it('matches against preview text and tags case-insensitively', () => {
        expect(filterBoardCards(cards, 'ROADMAP')).toHaveLength(1);
        expect(filterBoardCards(cards, 'work')[0].path).toBe('b.md');
    });

    it('returns nothing when no card matches', () => {
        expect(filterBoardCards(cards, 'zzz')).toEqual([]);
    });
});
