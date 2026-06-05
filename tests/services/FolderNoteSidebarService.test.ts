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

import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import type NotebookNavigatorPlugin from '../../src/main';
import type { CommandQueueService } from '../../src/services/CommandQueueService';
import { FolderNoteSidebarService } from '../../src/services/workspace/FolderNoteSidebarService';
import { NOTEBOOK_NAVIGATOR_CALENDAR_VIEW } from '../../src/types';
import { createTestTFile } from '../utils/createTestTFile';

interface MutableFolderNoteSidebarService {
    companionLeaf: WorkspaceLeaf | null;
    currentFolderNotePath: string | null;
}

interface TestWorkspaceLeaf {
    leaf: WorkspaceLeaf;
    openFile: ReturnType<typeof vi.fn>;
}

function createRightSidebarLeaf(viewState: { type: string; state?: Record<string, unknown> }, rightSplit: object): TestWorkspaceLeaf {
    const openFile = vi.fn().mockResolvedValue(undefined);
    const leaf = {
        parent: rightSplit,
        view: {},
        detach: vi.fn(),
        getViewState: vi.fn(() => viewState),
        openFile,
        setViewState: vi.fn().mockResolvedValue(undefined)
    } as unknown as WorkspaceLeaf;

    return { leaf, openFile };
}

describe('FolderNoteSidebarService', () => {
    it('creates a new companion leaf when the remembered right sidebar leaf was repurposed', async () => {
        const rightSplit = {};
        const staleCalendarLeaf = createRightSidebarLeaf({ type: NOTEBOOK_NAVIGATOR_CALENDAR_VIEW, state: {} }, rightSplit);
        const newFolderNoteLeaf = createRightSidebarLeaf({ type: 'empty', state: {} }, rightSplit);
        const folderNote = createTestTFile('Projects/index.md');
        const getRightLeaf = vi.fn((split: boolean) => (split ? newFolderNoteLeaf.leaf : null));
        const workspace = {
            rootSplit: {},
            leftSplit: {},
            rightSplit,
            activeLeaf: null,
            getRightLeaf,
            iterateAllLeaves: vi.fn((callback: (leaf: WorkspaceLeaf) => void) => {
                callback(staleCalendarLeaf.leaf);
            }),
            revealLeaf: vi.fn().mockResolvedValue(undefined),
            setActiveLeaf: vi.fn()
        };
        const plugin = {
            app: {
                workspace
            },
            settings: {
                enableFolderNotes: true,
                folderNoteOpenLocation: 'right-sidebar'
            },
            isShuttingDown: () => false
        } as unknown as NotebookNavigatorPlugin;
        const service = new FolderNoteSidebarService(plugin);
        const mutableService = service as unknown as MutableFolderNoteSidebarService;
        mutableService.companionLeaf = staleCalendarLeaf.leaf;
        mutableService.currentFolderNotePath = folderNote.path;

        await service.openFolderNote(folderNote);

        expect(staleCalendarLeaf.openFile).not.toHaveBeenCalled();
        expect(getRightLeaf).toHaveBeenCalledWith(true);
        expect(newFolderNoteLeaf.openFile).toHaveBeenCalledWith(folderNote, { active: false });
        expect(workspace.revealLeaf).toHaveBeenCalledWith(newFolderNoteLeaf.leaf);
    });

    it('marks companion opens as background file opens', async () => {
        const rightSplit = {};
        const companionLeaf = createRightSidebarLeaf({ type: 'empty', state: {} }, rightSplit);
        const folderNote = createTestTFile('Projects/index.md');
        const executeBackgroundFileOpen = vi.fn(async (_folderNote: unknown, openFile: () => Promise<void>) => {
            await openFile();
            return { success: true };
        });
        const workspace = {
            rootSplit: {},
            leftSplit: {},
            rightSplit,
            activeLeaf: null,
            getRightLeaf: vi.fn(() => companionLeaf.leaf),
            iterateAllLeaves: vi.fn(),
            revealLeaf: vi.fn().mockResolvedValue(undefined),
            setActiveLeaf: vi.fn()
        };
        const plugin = {
            app: {
                workspace
            },
            commandQueue: {
                executeBackgroundFileOpen
            } as unknown as CommandQueueService,
            settings: {
                enableFolderNotes: true,
                folderNoteOpenLocation: 'right-sidebar'
            },
            isShuttingDown: () => false
        } as unknown as NotebookNavigatorPlugin;
        const service = new FolderNoteSidebarService(plugin);

        await service.openFolderNote(folderNote);

        expect(executeBackgroundFileOpen).toHaveBeenCalledWith(folderNote, expect.any(Function));
        expect(companionLeaf.openFile).toHaveBeenCalledWith(folderNote, { active: false });
        expect(workspace.revealLeaf).toHaveBeenCalledWith(companionLeaf.leaf);
    });
});
