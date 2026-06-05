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

import { App, TFile, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { createFolderNote, getFolderNote, isFolderNote, resolveFolderNoteNameForFolder } from '../../src/utils/folderNotes';
import { createTestTFile } from './createTestTFile';

interface TestVaultMethods {
    registerFile(file: TFile): void;
}

function getTestVault(app: App): App['vault'] & TestVaultMethods {
    return app.vault as App['vault'] & TestVaultMethods;
}

function createRootFolder(app: App, vaultName: string): TFolder {
    Object.defineProperty(app.vault, 'getName', {
        configurable: true,
        value: () => vaultName
    });

    const root = app.vault.getRoot() as TFolder & { children: TFile[]; name: string; vault: App['vault'] };
    root.name = '/';
    root.path = '/';
    root.children = [];
    root.vault = app.vault;

    return root;
}

function registerRootFile(app: App, root: TFolder, path: string): TFile {
    const file = createTestTFile(path);
    file.parent = root;
    file.vault = app.vault;
    root.children.push(file);
    getTestVault(app).registerFile(file);

    return file;
}

describe('root folder notes', () => {
    it('resolves root folder note names from the vault name when no fixed name is configured', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');

        expect(
            resolveFolderNoteNameForFolder(root, {
                folderNoteName: '',
                folderNoteNamePattern: ''
            })
        ).toBe('Shared Scratch');
    });

    it('applies folder note name patterns to the vault root', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');

        expect(
            resolveFolderNoteNameForFolder(root, {
                folderNoteName: '',
                folderNoteNamePattern: '_{{folder}}'
            })
        ).toBe('_Shared Scratch');
    });

    it('detects a root folder note at the vault root', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const folderNote = registerRootFile(app, root, 'Shared Scratch.md');

        expect(
            getFolderNote(root, {
                enableFolderNotes: true,
                folderNoteName: '',
                folderNoteNamePattern: ''
            })
        ).toBe(folderNote);
    });

    it('matches root folder note files using the vault name', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const folderNote = registerRootFile(app, root, 'Shared Scratch.md');

        expect(
            isFolderNote(folderNote, root, {
                enableFolderNotes: true,
                folderNoteName: '',
                folderNoteNamePattern: ''
            })
        ).toBe(true);
    });

    it('keeps fixed folder note names for the vault root', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const folderNote = registerRootFile(app, root, 'index.md');

        expect(
            getFolderNote(root, {
                enableFolderNotes: true,
                folderNoteName: 'index',
                folderNoteNamePattern: ''
            })
        ).toBe(folderNote);
    });

    it('creates root folder notes at the vault root', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const openFile = vi.fn().mockResolvedValue(undefined);
        const createdFile = createTestTFile('Shared Scratch.md');
        createdFile.parent = root;
        createdFile.vault = app.vault;

        const createNewMarkdownFile = vi.fn(async () => {
            root.children.push(createdFile);
            getTestVault(app).registerFile(createdFile);
            return createdFile;
        });
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'markdown',
                folderNoteName: '',
                folderNoteNamePattern: '',
                folderNoteTemplate: DEFAULT_SETTINGS.folderNoteTemplate
            },
            null
        );

        expect(createNewMarkdownFile).toHaveBeenCalledWith(root, 'Shared Scratch');
        expect(created).toBe(createdFile);
        expect(openFile).toHaveBeenCalledWith(createdFile, { active: true });
    });

    it('opens created folder notes in the right sidebar when requested', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const openFile = vi.fn().mockResolvedValue(undefined);
        const openInRightSidebar = vi.fn().mockResolvedValue(undefined);
        const createdFile = createTestTFile('Shared Scratch.md');
        createdFile.parent = root;
        createdFile.vault = app.vault;

        const createNewMarkdownFile = vi.fn(async () => {
            root.children.push(createdFile);
            getTestVault(app).registerFile(createdFile);
            return createdFile;
        });
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'markdown',
                folderNoteName: '',
                folderNoteNamePattern: '',
                folderNoteTemplate: DEFAULT_SETTINGS.folderNoteTemplate
            },
            null,
            {
                openContext: 'right-sidebar',
                openInRightSidebar
            }
        );

        expect(created).toBe(createdFile);
        expect(openInRightSidebar).toHaveBeenCalledWith(createdFile);
        expect(openFile).not.toHaveBeenCalled();
    });
});
