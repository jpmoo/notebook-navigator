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

import { AbstractInputSuggest, App, prepareFuzzySearch, renderMatches, SearchResult, TFolder } from 'obsidian';
import { naturalCompare } from '../utils/sortUtils';

interface FolderSuggestionItem {
    folder: TFolder;
    match: SearchResult | null;
}

const DEFAULT_FOLDER_SUGGEST_LIMIT = 200;

/**
 * Folder path suggestion popover for settings text inputs.
 * Uses Obsidian's built-in suggest popover so the UI matches the rest of the app.
 */
export class FolderPathInputSuggest extends AbstractInputSuggest<FolderSuggestionItem> {
    private readonly inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.limit = DEFAULT_FOLDER_SUGGEST_LIMIT;
    }

    getSuggestions(query: string): FolderSuggestionItem[] {
        const trimmedQuery = query.trim();
        const folders = this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);
        folders.sort((a, b) => naturalCompare(a.path, b.path));

        if (!trimmedQuery) {
            return folders.slice(0, this.limit).map(folder => ({ folder, match: null }));
        }

        const search = prepareFuzzySearch(trimmedQuery);
        const matches: FolderSuggestionItem[] = [];

        for (const folder of folders) {
            const result = search(folder.path);
            if (!result) {
                continue;
            }
            matches.push({ folder, match: result });
        }

        matches.sort((a, b) => {
            const scoreA = a.match?.score ?? Number.POSITIVE_INFINITY;
            const scoreB = b.match?.score ?? Number.POSITIVE_INFINITY;
            if (scoreA === scoreB) {
                return naturalCompare(a.folder.path, b.folder.path);
            }
            return scoreA - scoreB;
        });

        return matches.slice(0, this.limit);
    }

    renderSuggestion(value: FolderSuggestionItem, el: HTMLElement): void {
        const displayPath = value.folder.path === '/' ? '' : value.folder.path;
        if (value.match && value.match.matches.length > 0) {
            renderMatches(el, displayPath, value.match.matches);
            return;
        }
        el.setText(displayPath);
    }

    selectSuggestion(value: FolderSuggestionItem): void {
        const displayPath = value.folder.path === '/' ? '' : value.folder.path;
        this.inputEl.value = displayPath;
        this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        this.close();
    }
}
