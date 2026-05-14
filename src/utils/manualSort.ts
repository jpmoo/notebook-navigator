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

function hasCachedManualSortValue(app: App, file: TFile, propertyKey: string, order: number): boolean {
    const frontmatter = app.metadataCache?.getFileCache(file)?.frontmatter;
    if (!isRecord(frontmatter)) {
        return false;
    }

    const targetKey = findMatchingRecordKey(frontmatter, propertyKey) ?? propertyKey;
    return isManualSortValueEqual(frontmatter[targetKey], order);
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
                const targetKey = findMatchingRecordKey(frontmatter, propertyKey) ?? propertyKey;
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
