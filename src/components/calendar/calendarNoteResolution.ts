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

import { App, TFile } from 'obsidian';
import type { NotebookNavigatorSettings } from '../../settings/types';
import {
    buildCustomCalendarFilePathForPattern,
    buildCustomCalendarMomentPattern,
    getCalendarNoteConfig,
    resolveCalendarCustomNotePathDate
} from '../../utils/calendarNotes';
import type { MomentApi, MomentInstance } from '../../utils/moment';
import type { CustomCalendarNoteConfig, CustomCalendarNoteKind } from './types';

export interface CalendarNotePathResolverContext {
    config: CustomCalendarNoteConfig;
    momentPattern: string;
}

export interface ResolvedCalendarNotePath {
    folderPath: string;
    fileName: string;
    filePath: string;
}

export interface CalendarNoteRootFolderSettings {
    calendarCustomRootFolder: string;
}

interface ResolveCalendarNotePathOptions {
    kind: CustomCalendarNoteKind;
    date: MomentInstance;
    resolverContext: CalendarNotePathResolverContext;
    displayLocale: string;
    weekLocale: string;
    customCalendarRootFolderSettings: CalendarNoteRootFolderSettings;
    momentApi: MomentApi | null;
}

interface GetExistingCalendarNoteFileOptions extends ResolveCalendarNotePathOptions {
    app: App;
}

export function createCalendarNotePathResolverContext(
    kind: CustomCalendarNoteKind,
    settings: NotebookNavigatorSettings
): CalendarNotePathResolverContext {
    const config = getCalendarNoteConfig(kind, settings);
    const momentPattern = buildCustomCalendarMomentPattern(config.calendarCustomFilePattern, config.fallbackPattern);
    return { config, momentPattern };
}

export function resolveCalendarNotePath({
    kind,
    date,
    resolverContext,
    displayLocale,
    weekLocale,
    customCalendarRootFolderSettings,
    momentApi
}: ResolveCalendarNotePathOptions): ResolvedCalendarNotePath | null {
    const { config, momentPattern } = resolverContext;
    if (!config.isPatternValid(momentPattern, momentApi)) {
        return null;
    }

    const dateForPath = resolveCalendarCustomNotePathDate(kind, date, momentPattern, displayLocale, weekLocale);
    return buildCustomCalendarFilePathForPattern(
        dateForPath,
        customCalendarRootFolderSettings,
        config.calendarCustomFilePattern,
        config.fallbackPattern
    );
}

export function getExistingCalendarNoteFile({
    app,
    kind,
    date,
    resolverContext,
    displayLocale,
    weekLocale,
    customCalendarRootFolderSettings,
    momentApi
}: GetExistingCalendarNoteFileOptions): TFile | null {
    const resolved = resolveCalendarNotePath({
        kind,
        date,
        resolverContext,
        displayLocale,
        weekLocale,
        customCalendarRootFolderSettings,
        momentApi
    });
    if (!resolved) {
        return null;
    }

    const existing = app.vault.getAbstractFileByPath(resolved.filePath);
    return existing instanceof TFile ? existing : null;
}
