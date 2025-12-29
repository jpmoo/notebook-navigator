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
// Minimal Obsidian API stubs for Vitest environment.

import { deriveFileMetadata } from '../utils/pathMetadata';

export class App {
    vault = {
        getFolderByPath: () => null,
        getAbstractFileByPath: () => null,
        cachedRead: async () => '',
        adapter: {
            readBinary: async () => new ArrayBuffer(0)
        }
    };

    metadataCache = {
        getFileCache: () => null,
        getFirstLinkpathDest: () => null
    };

    fileManager = {
        processFrontMatter: async () => {}
    };
}

export class TFile {
    path = '';
    name = '';
    basename = '';
    extension = '';
    stat = { mtime: 0, ctime: 0 };

    constructor(path = '') {
        this.setPath(path);
    }

    setPath(path: string): void {
        this.path = path;
        const metadata = deriveFileMetadata(path);
        this.name = metadata.name;
        this.basename = metadata.basename;
        this.extension = metadata.extension;
    }
}

export class TFolder {
    path = '';

    constructor(path = '') {
        this.path = path;
    }
}

export class Notice {
    constructor(public message?: string) {}
    hide(): void {}
}

export class Menu {}
export class MenuItem {}
export class Setting {}
export class ButtonComponent {}
export class SliderComponent {}
export class WorkspaceLeaf {}

export const Platform = {
    isDesktopApp: true,
    isMobile: false,
    isIosApp: false
};

export const normalizePath = (value: string) => value;
export const setIcon = () => {};
export const getLanguage = () => 'en';
type RequestUrlResponse = {
    status: number;
    arrayBuffer?: ArrayBuffer;
    headers: Record<string, string>;
};

export const requestUrl = async (): Promise<RequestUrlResponse> => ({
    status: 404,
    headers: {}
});

export type CachedMetadata = {
    frontmatter?: Record<string, unknown>;
};

export type FrontMatterCache = Record<string, unknown>;
export type Hotkey = { modifiers: string[]; key: string };
export type Modifier = string;
