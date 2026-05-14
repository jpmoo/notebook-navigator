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

import type { App, TFile } from 'obsidian';
import type { NotebookNavigatorSettings } from '../settings';
import { getErrorMessage } from './errorUtils';
import { findMatchingRecordKey } from './recordUtils';
import { getPropertySortValueFromRecord } from './sortUtils';
import { isRecord } from './typeGuards';

export interface ManualSortFileLike {
    path: string;
    extension: string;
}

export interface ManualSortOrderAssignment {
    path: string;
    value: number;
}

export interface ManualSortWriteFailure {
    path: string;
    message: string;
}

export interface ManualSortWriteResult {
    updated: number;
    skipped: number;
    failed: number;
    failures: ManualSortWriteFailure[];
}

export interface ManualSortFilePartitions<T extends ManualSortFileLike> {
    markdown: T[];
    nonMarkdown: T[];
}

export type ManualSortMoveDirection = 'up' | 'down';

export interface ManualSortMoveResult<T extends ManualSortFileLike> {
    files: T[];
    scrollPath: string;
}

export function normalizeManualSortPropertyKey(value: string): string {
    return value.trim();
}

export function isValidManualSortPropertyKey(value: string): boolean {
    const key = normalizeManualSortPropertyKey(value);
    return key.length > 0 && !key.includes(',');
}

export function getManualSortBaselineSettings(settings: NotebookNavigatorSettings): NotebookNavigatorSettings {
    return {
        ...settings,
        pinnedNotes: {}
    };
}

export function partitionManualSortFiles<T extends ManualSortFileLike>(files: readonly T[]): ManualSortFilePartitions<T> {
    const markdown: T[] = [];
    const nonMarkdown: T[] = [];

    files.forEach(file => {
        if (file.extension === 'md') {
            markdown.push(file);
            return;
        }

        nonMarkdown.push(file);
    });

    return { markdown, nonMarkdown };
}

export function orderManualSortFiles<T extends ManualSortFileLike>(files: readonly T[]): T[] {
    const { markdown, nonMarkdown } = partitionManualSortFiles(files);
    return [...markdown, ...nonMarkdown];
}

export function applyManualSortMarkdownOrder<T extends ManualSortFileLike>(
    files: readonly T[],
    orderedMarkdownPaths: readonly string[]
): T[] {
    const { markdown, nonMarkdown } = partitionManualSortFiles(files);
    if (orderedMarkdownPaths.length === 0 || markdown.length === 0) {
        return [...markdown, ...nonMarkdown];
    }

    const orderIndexByPath = new Map(orderedMarkdownPaths.map((path, index) => [path, index]));
    const orderedMarkdown = [...markdown].sort((left, right) => {
        const leftIndex = orderIndexByPath.get(left.path);
        const rightIndex = orderIndexByPath.get(right.path);

        if (leftIndex !== undefined && rightIndex !== undefined) {
            return leftIndex - rightIndex;
        }
        if (leftIndex !== undefined) {
            return -1;
        }
        if (rightIndex !== undefined) {
            return 1;
        }
        return 0;
    });

    return [...orderedMarkdown, ...nonMarkdown];
}

function moveSingleManualSortMarkdownFile<T extends ManualSortFileLike>(
    markdownFiles: readonly T[],
    activeIndex: number,
    overIndex: number
): T[] {
    const reorderedMarkdown = [...markdownFiles];
    const [activeFile] = reorderedMarkdown.splice(activeIndex, 1);
    reorderedMarkdown.splice(overIndex, 0, activeFile);
    return reorderedMarkdown;
}

export function getManualSortSelectedMarkdownPaths<T extends ManualSortFileLike>(
    markdownFiles: readonly T[],
    activePath: string,
    selectedPaths: ReadonlySet<string>
): Set<string> {
    if (!selectedPaths.has(activePath)) {
        return new Set();
    }

    return new Set(markdownFiles.filter(file => selectedPaths.has(file.path)).map(file => file.path));
}

export function moveManualSortMarkdownFiles<T extends ManualSortFileLike>(
    files: readonly T[],
    activePath: string,
    overPath: string,
    selectedPaths: ReadonlySet<string>
): T[] | null {
    const { markdown, nonMarkdown } = partitionManualSortFiles(files);
    const activeIndex = markdown.findIndex(file => file.path === activePath);
    const overIndex = markdown.findIndex(file => file.path === overPath);
    if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
        return null;
    }

    const selectedMarkdownPaths = getManualSortSelectedMarkdownPaths(markdown, activePath, selectedPaths);

    if (selectedMarkdownPaths.size <= 1) {
        return [...moveSingleManualSortMarkdownFile(markdown, activeIndex, overIndex), ...nonMarkdown];
    }

    if (selectedMarkdownPaths.has(overPath)) {
        return null;
    }

    const movedMarkdown = markdown.filter(file => selectedMarkdownPaths.has(file.path));
    const remainingMarkdown = markdown.filter(file => !selectedMarkdownPaths.has(file.path));
    const overRemainingIndex = remainingMarkdown.findIndex(file => file.path === overPath);
    if (overRemainingIndex === -1) {
        return null;
    }

    const insertionIndex = overIndex > activeIndex ? overRemainingIndex + 1 : overRemainingIndex;
    return [...remainingMarkdown.slice(0, insertionIndex), ...movedMarkdown, ...remainingMarkdown.slice(insertionIndex), ...nonMarkdown];
}

export function moveManualSortSelectionByDirection<T extends ManualSortFileLike>(
    files: readonly T[],
    activePath: string | null,
    selectedPaths: ReadonlySet<string>,
    direction: ManualSortMoveDirection
): ManualSortMoveResult<T> | null {
    if (!activePath) {
        return null;
    }

    const { markdown, nonMarkdown } = partitionManualSortFiles(files);
    const activeMarkdownFile = markdown.find(file => file.path === activePath);
    if (!activeMarkdownFile) {
        return null;
    }

    const movedPathSet = selectedPaths.has(activePath)
        ? new Set(markdown.filter(file => selectedPaths.has(file.path)).map(file => file.path))
        : new Set([activePath]);
    if (movedPathSet.size === 0) {
        return null;
    }

    const movedMarkdown = markdown.filter(file => movedPathSet.has(file.path));
    const remainingMarkdown = markdown.filter(file => !movedPathSet.has(file.path));
    if (movedMarkdown.length === 0 || remainingMarkdown.length === 0) {
        return null;
    }

    const firstMovedIndex = markdown.findIndex(file => movedPathSet.has(file.path));
    const currentInsertionIndex = markdown.slice(0, firstMovedIndex).filter(file => !movedPathSet.has(file.path)).length;
    const nextInsertionIndex = direction === 'up' ? currentInsertionIndex - 1 : currentInsertionIndex + 1;
    if (nextInsertionIndex < 0 || nextInsertionIndex > remainingMarkdown.length) {
        return null;
    }

    const nextMarkdown = [
        ...remainingMarkdown.slice(0, nextInsertionIndex),
        ...movedMarkdown,
        ...remainingMarkdown.slice(nextInsertionIndex)
    ];
    const scrollFile = direction === 'up' ? movedMarkdown[0] : movedMarkdown[movedMarkdown.length - 1];

    return {
        files: [...nextMarkdown, ...nonMarkdown],
        scrollPath: scrollFile.path
    };
}

export function buildManualSortOrderAssignments<T extends ManualSortFileLike>(files: readonly T[]): ManualSortOrderAssignment[] {
    return partitionManualSortFiles(files).markdown.map((file, index) => ({
        path: file.path,
        value: index + 1
    }));
}

export function isManualSortValueEqual(value: unknown, order: number): boolean {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value === order;
    }

    if (typeof value === 'string') {
        return value.trim() === order.toString();
    }

    return false;
}

export function getManualSortPropertyValue(app: App, file: TFile, propertyKey: string): string | null {
    if (file.extension !== 'md') {
        return null;
    }

    return getPropertySortValueFromRecord(app.metadataCache?.getFileCache(file)?.frontmatter, propertyKey);
}

export function hasCachedManualSortProperty(app: App, file: TFile, propertyKey: string): boolean {
    const frontmatter = app.metadataCache?.getFileCache(file)?.frontmatter;
    if (!isRecord(frontmatter)) {
        return false;
    }

    return findMatchingRecordKey(frontmatter, propertyKey) !== null;
}

function hasCachedManualSortValue(app: App, file: TFile, propertyKey: string, order: number): boolean {
    const frontmatter = app.metadataCache?.getFileCache(file)?.frontmatter;
    if (!isRecord(frontmatter)) {
        return false;
    }

    const targetKey = findMatchingRecordKey(frontmatter, propertyKey) ?? propertyKey;
    return isManualSortValueEqual(frontmatter[targetKey], order);
}

export function hasDenseManualSortOrder(app: App, files: readonly TFile[], propertyKey: string): boolean {
    return partitionManualSortFiles(files).markdown.every((file, index) => hasCachedManualSortValue(app, file, propertyKey, index + 1));
}

export async function writeManualSortOrder(app: App, files: readonly TFile[], propertyKey: string): Promise<ManualSortWriteResult> {
    const assignments = buildManualSortOrderAssignments(files);
    const fileByPath = new Map(files.map(file => [file.path, file]));
    let updated = 0;
    let skipped = 0;
    const failures: ManualSortWriteFailure[] = [];

    for (const assignment of assignments) {
        const file = fileByPath.get(assignment.path);
        if (!file || file.extension !== 'md') {
            continue;
        }

        if (hasCachedManualSortValue(app, file, propertyKey, assignment.value)) {
            skipped += 1;
            continue;
        }

        let didChange = false;
        try {
            await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
                const existingKey = findMatchingRecordKey(frontmatter, propertyKey);
                const targetKey = existingKey ?? propertyKey;
                if (isManualSortValueEqual(frontmatter[targetKey], assignment.value)) {
                    return;
                }

                frontmatter[targetKey] = assignment.value;
                didChange = true;
            });
        } catch (error) {
            failures.push({
                path: file.path,
                message: getErrorMessage(error)
            });
            continue;
        }

        if (didChange) {
            updated += 1;
        } else {
            skipped += 1;
        }
    }

    return { updated, skipped, failed: failures.length, failures };
}
