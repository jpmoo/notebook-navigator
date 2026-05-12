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
import { createTestTFile } from './createTestTFile';
import {
    findExcalidrawFileForCompanionImage,
    getExcalidrawCompanionImagePaths,
    getExcalidrawDirectFeatureImageKey,
    isExcalidrawCompanionImageFile,
    resolveExcalidrawFeatureImageFile
} from '../../src/utils/excalidrawFeatureImages';

function createAppWithFiles(files: TFile[], frontmatterByPath: Record<string, Record<string, unknown>> = {}): App {
    const app = new App();
    const filesByPath = new Map(files.map(file => [file.path, file]));
    app.vault.getAbstractFileByPath = (path: string) => filesByPath.get(path) ?? null;
    app.vault.getFiles = () => files;
    app.metadataCache.getFileCache = (file: TFile) => ({ frontmatter: frontmatterByPath[file.path] });
    return app;
}

describe('Excalidraw companion feature images', () => {
    it('builds companion PNG paths from the final Excalidraw file extension', () => {
        const file = createTestTFile('Drawings/Sketch.excalidraw.md');

        expect(getExcalidrawCompanionImagePaths(file)).toEqual([
            'Drawings/Sketch.excalidraw.png',
            'Drawings/Sketch.excalidraw.dark.png',
            'Drawings/Sketch.excalidraw.light.png'
        ]);
    });

    it('resolves default .excalidraw.md companion PNGs', () => {
        const drawing = createTestTFile('Drawings/Sketch.excalidraw.md');
        const image = createTestTFile('Drawings/Sketch.excalidraw.png');
        const app = createAppWithFiles([drawing, image]);

        expect(resolveExcalidrawFeatureImageFile(app, drawing)).toBe(image);
        expect(findExcalidrawFileForCompanionImage(app, image.path)).toBe(drawing);
        expect(isExcalidrawCompanionImageFile(app, image)).toBe(true);
    });

    it('resolves legacy .excalidraw companion PNGs', () => {
        const drawing = createTestTFile('Drawings/Sketch.excalidraw');
        const image = createTestTFile('Drawings/Sketch.png');
        const app = createAppWithFiles([drawing, image]);

        expect(resolveExcalidrawFeatureImageFile(app, drawing)).toBe(image);
        expect(findExcalidrawFileForCompanionImage(app, image.path)).toBe(drawing);
        expect(isExcalidrawCompanionImageFile(app, image)).toBe(true);
    });

    it('resolves frontmatter Excalidraw companion PNGs', () => {
        const drawing = createTestTFile('Drawings/Sketch.md');
        const image = createTestTFile('Drawings/Sketch.png');
        const app = createAppWithFiles([drawing, image], { [drawing.path]: { 'excalidraw-plugin': 'parsed' } });

        expect(resolveExcalidrawFeatureImageFile(app, drawing)).toBe(image);
        expect(findExcalidrawFileForCompanionImage(app, image.path)).toBe(drawing);
    });

    it('prefers theme-specific companion PNGs by theme mode', () => {
        const drawing = createTestTFile('Drawings/Sketch.excalidraw.md');
        const plainImage = createTestTFile('Drawings/Sketch.excalidraw.png');
        const darkImage = createTestTFile('Drawings/Sketch.excalidraw.dark.png');
        const lightImage = createTestTFile('Drawings/Sketch.excalidraw.light.png');
        const app = createAppWithFiles([drawing, plainImage, darkImage, lightImage]);

        expect(resolveExcalidrawFeatureImageFile(app, drawing, 'dark')).toBe(darkImage);
        expect(resolveExcalidrawFeatureImageFile(app, drawing, 'light')).toBe(lightImage);
    });

    it('does not treat unrelated PNGs as hidden companion images', () => {
        const image = createTestTFile('Drawings/Sketch.excalidraw.png');
        const app = createAppWithFiles([image]);

        expect(isExcalidrawCompanionImageFile(app, image)).toBe(false);
    });

    it('uses a stable direct-render marker', () => {
        const drawing = createTestTFile('Drawings/Sketch.excalidraw.md');

        expect(getExcalidrawDirectFeatureImageKey(drawing)).toBe('x-direct-excalidraw:Drawings/Sketch.excalidraw.md');
    });
});
