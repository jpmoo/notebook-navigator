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

import { TFile, TFolder, normalizePath, type App } from 'obsidian';
import { strings } from '../i18n';
import type { NotebookNavigatorSettings } from '../settings/types';
import {
    createCalendarCustomDateFormatter,
    ensureMarkdownFileName,
    isCalendarCustomDatePatternValid,
    isCalendarCustomMonthPatternValid,
    isCalendarCustomQuarterPatternValid,
    isCalendarCustomWeekPatternValid,
    isCalendarCustomYearPatternValid,
    normalizeCalendarCustomRootFolder,
    normalizeCalendarVaultFolderPath,
    splitCalendarCustomPattern
} from './calendarCustomNotePatterns';
import type { MomentApi, MomentInstance } from './moment';

export type CalendarNoteKind = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface CalendarNoteConfig {
    calendarCustomFilePattern: string;
    fallbackPattern?: string;
    isPatternValid: (pattern: string, momentApi?: MomentApi | null) => boolean;
    parsingErrorText: string;
}

export function getCalendarNoteConfig(kind: CalendarNoteKind, settings: NotebookNavigatorSettings): CalendarNoteConfig {
    switch (kind) {
        case 'day':
            return {
                calendarCustomFilePattern: settings.calendarCustomFilePattern,
                isPatternValid: isCalendarCustomDatePatternValid,
                parsingErrorText: strings.settings.items.calendarCustomFilePattern.parsingError
            };
        case 'week':
            return {
                calendarCustomFilePattern: settings.calendarCustomWeekPattern,
                fallbackPattern: '',
                isPatternValid: isCalendarCustomWeekPatternValid,
                parsingErrorText: strings.settings.items.calendarCustomWeekPattern.parsingError
            };
        case 'month':
            return {
                calendarCustomFilePattern: settings.calendarCustomMonthPattern,
                fallbackPattern: '',
                isPatternValid: isCalendarCustomMonthPatternValid,
                parsingErrorText: strings.settings.items.calendarCustomMonthPattern.parsingError
            };
        case 'quarter':
            return {
                calendarCustomFilePattern: settings.calendarCustomQuarterPattern,
                fallbackPattern: '',
                isPatternValid: isCalendarCustomQuarterPatternValid,
                parsingErrorText: strings.settings.items.calendarCustomQuarterPattern.parsingError
            };
        case 'year':
            return {
                calendarCustomFilePattern: settings.calendarCustomYearPattern,
                fallbackPattern: '',
                isPatternValid: isCalendarCustomYearPatternValid,
                parsingErrorText: strings.settings.items.calendarCustomYearPattern.parsingError
            };
    }
}

/** Returns the configured template file path for a calendar note kind, or null if not set. */
export function getCalendarTemplatePath(kind: CalendarNoteKind, settings: NotebookNavigatorSettings): string | null {
    switch (kind) {
        case 'day':
            return settings.calendarCustomFileTemplate;
        case 'week':
            return settings.calendarCustomWeekTemplate;
        case 'month':
            return settings.calendarCustomMonthTemplate;
        case 'quarter':
            return settings.calendarCustomQuarterTemplate;
        case 'year':
            return settings.calendarCustomYearTemplate;
    }
}

export function buildCustomCalendarMomentPattern(calendarCustomFilePattern: string, fallbackPattern?: string): string {
    const { folderPattern, filePattern } = splitCalendarCustomPattern(calendarCustomFilePattern, fallbackPattern);
    return folderPattern ? `${folderPattern}/${filePattern}` : filePattern;
}

export function buildCustomCalendarFilePathForPattern(
    date: MomentInstance,
    settings: {
        calendarCustomRootFolder: string;
    },
    calendarCustomFilePattern: string,
    fallbackPattern?: string
): { folderPath: string; fileName: string; filePath: string; formattedFilePattern: string } {
    const customRootFolder = normalizeCalendarCustomRootFolder(settings.calendarCustomRootFolder);
    const { folderPattern: customFolderPattern, filePattern: customFilePattern } = splitCalendarCustomPattern(
        calendarCustomFilePattern,
        fallbackPattern
    );

    const folderFormatter = createCalendarCustomDateFormatter(customFolderPattern);
    const fileFormatter = createCalendarCustomDateFormatter(customFilePattern);

    const folderSuffix = folderFormatter(date);
    const rawFolderPath = customRootFolder ? (folderSuffix ? `${customRootFolder}/${folderSuffix}` : customRootFolder) : folderSuffix;
    const folderPath = normalizeCalendarVaultFolderPath(rawFolderPath || '/');

    const formattedFilePattern = fileFormatter(date).trim();
    const fileName = ensureMarkdownFileName(formattedFilePattern);
    const filePath = folderPath === '/' ? fileName : normalizePath(`${folderPath}/${fileName}`);

    return { folderPath, fileName, filePath, formattedFilePattern };
}

/** Creates nested folders recursively if they don't exist, returns final folder or null when a path segment is not a folder. */
async function ensureCalendarFolderExists(app: App, folderPath: string): Promise<TFolder | null> {
    if (folderPath === '/' || !folderPath) {
        return app.vault.getRoot();
    }

    const normalized = normalizePath(folderPath);
    if (!normalized || normalized === '/' || normalized === '.') {
        return app.vault.getRoot();
    }

    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const existing = app.vault.getAbstractFileByPath(current);
        if (!existing) {
            await app.vault.createFolder(current);
            continue;
        }
        if (!(existing instanceof TFolder)) {
            return null;
        }
    }

    const folder = app.vault.getAbstractFileByPath(normalized);
    return folder instanceof TFolder ? folder : null;
}

function getCalendarNoteBaseName(fileName: string): string | null {
    const baseName = fileName.replace(/\.md$/iu, '').trim();
    return baseName.length > 0 ? baseName : null;
}

export async function createCalendarMarkdownFile(
    app: App,
    folderPath: string,
    fileName: string,
    templatePath?: string | null
): Promise<TFile> {
    const baseName = getCalendarNoteBaseName(fileName);
    if (!baseName) {
        throw new Error('Invalid calendar note filename');
    }

    const folder = await ensureCalendarFolderExists(app, folderPath);
    if (!folder) {
        throw new Error('Calendar folder path is not a folder');
    }

    const created = await app.fileManager.createNewMarkdownFile(folder, baseName);

    // Create the note first (fires Obsidian vault "create" for other plugins), then write optional template content.
    // Note: some plugins (e.g. Templater) handle "create" asynchronously and may read/modify the file after a short delay.
    if (templatePath) {
        try {
            const entry = app.vault.getAbstractFileByPath(templatePath);
            if (entry instanceof TFile) {
                const content = await app.vault.read(entry);
                await app.vault.modify(created, content);
            }
        } catch (error) {
            console.error('Failed to apply calendar template', templatePath, error);
        }
    }

    return created;
}
