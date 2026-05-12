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

import { App, TFile, normalizePath } from 'obsidian';
import { EXCALIDRAW_BASENAME_SUFFIX, hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from './fileNameUtils';
import { getCurrentThemeMode, type ThemeMode } from './themeMode';
import type { NotebookNavigatorSettings } from '../settings';

const EXCALIDRAW_COMPANION_IMAGE_EXTENSIONS = ['png', 'dark.png', 'light.png'] as const;
const EXCALIDRAW_DIRECT_FEATURE_IMAGE_KEY_PREFIX = 'x-direct-excalidraw:';

type ExcalidrawCompanionImageExtension = (typeof EXCALIDRAW_COMPANION_IMAGE_EXTENSIONS)[number];
type ExcalidrawFeatureImageListener = () => void;

const featureImageListenersBySourcePath = new Map<string, Set<ExcalidrawFeatureImageListener>>();

function getPathWithoutFinalExtension(path: string): string | null {
    const dotIndex = path.lastIndexOf('.');
    if (dotIndex <= 0) {
        return null;
    }
    return path.slice(0, dotIndex);
}

function getFileByPath(app: App, path: string): TFile | null {
    const abstractFile = app.vault.getAbstractFileByPath(normalizePath(path));
    return abstractFile instanceof TFile ? abstractFile : null;
}

export function isExcalidrawSourceFile(app: App, file: TFile): boolean {
    if (file.extension === 'md') {
        if (isExcalidrawFile(file)) {
            return true;
        }
        return hasExcalidrawFrontmatterFlagValue(app.metadataCache.getFileCache(file)?.frontmatter);
    }

    return file.name.toLowerCase().endsWith(EXCALIDRAW_BASENAME_SUFFIX);
}

function getThemePreferredExtensions(themeMode: ThemeMode): ExcalidrawCompanionImageExtension[] {
    return themeMode === 'dark' ? ['dark.png', 'png', 'light.png'] : ['light.png', 'png', 'dark.png'];
}

function getCompanionBasePath(path: string): string | null {
    const lowerPath = path.toLowerCase();
    for (const extension of ['.dark.png', '.light.png', '.png']) {
        if (lowerPath.endsWith(extension)) {
            return path.slice(0, -extension.length);
        }
    }
    return null;
}

export function getExcalidrawDirectFeatureImageKey(file: Pick<TFile, 'path'>): string {
    return `${EXCALIDRAW_DIRECT_FEATURE_IMAGE_KEY_PREFIX}${file.path}`;
}

function getExcalidrawCompanionImagePath(excalidrawFile: Pick<TFile, 'path'>, extension: ExcalidrawCompanionImageExtension): string | null {
    const basePath = getPathWithoutFinalExtension(excalidrawFile.path);
    return basePath ? `${basePath}.${extension}` : null;
}

export function getExcalidrawCompanionImagePaths(excalidrawFile: Pick<TFile, 'path'>): string[] {
    return EXCALIDRAW_COMPANION_IMAGE_EXTENSIONS.map(extension => getExcalidrawCompanionImagePath(excalidrawFile, extension)).filter(
        (path): path is string => path !== null
    );
}

export function resolveExcalidrawFeatureImageFile(
    app: App,
    excalidrawFile: TFile,
    themeMode: ThemeMode = getCurrentThemeMode()
): TFile | null {
    for (const extension of getThemePreferredExtensions(themeMode)) {
        const path = getExcalidrawCompanionImagePath(excalidrawFile, extension);
        if (!path) {
            continue;
        }

        const file = getFileByPath(app, path);
        if (file) {
            return file;
        }
    }

    return null;
}

export function findExcalidrawFileForCompanionImage(app: App, imagePath: string): TFile | null {
    const basePath = getCompanionBasePath(imagePath);
    if (!basePath) {
        return null;
    }

    const sourcePathCandidates = basePath.toLowerCase().endsWith(EXCALIDRAW_BASENAME_SUFFIX)
        ? [`${basePath}.md`, basePath]
        : [`${basePath}.md`, `${basePath}${EXCALIDRAW_BASENAME_SUFFIX}`];

    for (const sourcePath of sourcePathCandidates) {
        const sourceFile = getFileByPath(app, sourcePath);
        if (sourceFile && isExcalidrawSourceFile(app, sourceFile)) {
            return sourceFile;
        }
    }

    return null;
}

export function isExcalidrawCompanionImageFile(app: App, file: TFile): boolean {
    return file.extension.toLowerCase() === 'png' && findExcalidrawFileForCompanionImage(app, file.path) !== null;
}

export function shouldHideExcalidrawCompanionImageFile(
    app: App,
    file: TFile,
    settings: Pick<NotebookNavigatorSettings, 'hideExcalidrawPreviewImages'>
): boolean {
    return settings.hideExcalidrawPreviewImages && isExcalidrawCompanionImageFile(app, file);
}

export function subscribeExcalidrawFeatureImageChange(sourcePath: string, listener: ExcalidrawFeatureImageListener): () => void {
    const existingListeners = featureImageListenersBySourcePath.get(sourcePath);
    const listeners = existingListeners ?? new Set<ExcalidrawFeatureImageListener>();
    listeners.add(listener);
    if (!existingListeners) {
        featureImageListenersBySourcePath.set(sourcePath, listeners);
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            featureImageListenersBySourcePath.delete(sourcePath);
        }
    };
}

function emitExcalidrawFeatureImageChange(sourcePath: string): void {
    featureImageListenersBySourcePath.get(sourcePath)?.forEach(listener => listener());
}

export function emitExcalidrawCompanionImageChange(app: App, imagePath: string): void {
    const sourceFile = findExcalidrawFileForCompanionImage(app, imagePath);
    if (sourceFile) {
        emitExcalidrawFeatureImageChange(sourceFile.path);
    }
}
