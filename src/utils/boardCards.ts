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

import type { FeatureImageStatus } from '../storage/indexeddb/fileData';

/**
 * Maximum number of cards the board renders. Larger folders are capped and the
 * board shows a "Showing N of M" notice. Mirrors the wexplore board's MAX cap and
 * keeps the non-virtualized masonry layout responsive.
 */
export const BOARD_MAX_CARDS = 300;

/** Minimal cached snapshot the board needs to render a card. */
export interface BoardCardSnapshot {
    previewText: string;
    tags: readonly string[];
    featureImageKey: string | null;
    featureImageStatus: FeatureImageStatus;
    featureImageUrl: string | null;
}

/** Minimal file shape the card builder needs (a subset of Obsidian's TFile). */
export interface BoardCardFile {
    path: string;
    basename: string;
}

/** View model for a single board card. */
export interface BoardCardModel {
    path: string;
    title: string;
    previewText: string;
    tags: readonly string[];
    featureImageKey: string | null;
    featureImageStatus: FeatureImageStatus;
    featureImageUrl: string | null;
}

export interface BuildBoardCardsResult {
    cards: BoardCardModel[];
    /** Total number of files available for the folder (before capping). */
    total: number;
    /** Number of cards actually rendered. */
    shown: number;
    /** True when the list was capped (shown < total). */
    truncated: boolean;
}

/**
 * Builds board card view models from an ordered list of files, capping at `max`.
 *
 * Pure and side-effect free: the caller supplies `snapshotFor`, which reads each
 * file's already-cached content (preview text, tags, feature image). This keeps the
 * cap/"N of M" logic and card assembly independently testable.
 */
export function buildBoardCards<T extends BoardCardFile>(
    files: readonly T[],
    max: number,
    snapshotFor: (file: T) => BoardCardSnapshot
): BuildBoardCardsResult {
    const total = files.length;
    const cap = Math.max(0, max);
    const capped = files.slice(0, cap);

    const cards = capped.map(file => {
        const snapshot = snapshotFor(file);
        return {
            path: file.path,
            title: file.basename,
            previewText: snapshot.previewText,
            tags: snapshot.tags,
            featureImageKey: snapshot.featureImageKey,
            featureImageStatus: snapshot.featureImageStatus,
            featureImageUrl: snapshot.featureImageUrl
        };
    });

    return {
        cards,
        total,
        shown: cards.length,
        truncated: cards.length < total
    };
}

/**
 * Case-insensitive client-side filter over title + preview text. Empty/whitespace
 * query returns all cards unchanged.
 */
export function filterBoardCards(cards: readonly BoardCardModel[], query: string): BoardCardModel[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return [...cards];
    }
    return cards.filter(card => {
        const haystack = `${card.title}\n${card.previewText}\n${card.tags.join(' ')}`.toLowerCase();
        return haystack.includes(needle);
    });
}
