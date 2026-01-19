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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { TagRenameWorkflow, type TagRenameHooks } from '../../../src/services/tagOperations/TagRenameWorkflow';
import { TagDeleteWorkflow, type TagDeleteHooks } from '../../../src/services/tagOperations/TagDeleteWorkflow';
import { TagFileMutations } from '../../../src/services/tagOperations/TagFileMutations';
import { TagDescriptor, type RenameFile } from '../../../src/services/tagRename/TagRenameEngine';
import { DEFAULT_SETTINGS } from '../../../src/settings/defaultSettings';
import { createTestTFile } from '../../utils/createTestTFile';

describe('TagRenameWorkflow', () => {
    let hooks: TagRenameHooks;
    let workflow: TagRenameWorkflow;

    beforeEach(() => {
        hooks = {
            executeRename: vi.fn().mockResolvedValue({ renamed: 1, total: 1 }),
            updateTagMetadataAfterRename: vi.fn().mockResolvedValue(undefined),
            updateTagShortcutsAfterRename: vi.fn().mockResolvedValue(undefined),
            notifyTagRenamed: vi.fn()
        };

        const app = new App();
        const fileMutations = new TagFileMutations(app, () => DEFAULT_SETTINGS);
        workflow = new TagRenameWorkflow(
            app,
            fileMutations,
            () => null,
            () => null,
            tagPath => tagPath,
            () => hooks
        );
    });

    it('runs rename workflow and notifies listeners', async () => {
        const result = await workflow.runTagRename('Projects/Client', 'Projects/Clients', [{} as unknown as RenameFile]);

        expect(result).toBe(true);
        expect(hooks.executeRename).toHaveBeenCalled();
        expect(hooks.updateTagMetadataAfterRename).toHaveBeenCalledWith('Projects/Client', 'Projects/Clients', false);
        expect(hooks.updateTagShortcutsAfterRename).toHaveBeenCalledWith('Projects/Client', 'Projects/Clients');
        expect(hooks.notifyTagRenamed).toHaveBeenCalledWith({
            oldPath: 'Projects/Client',
            newPath: 'Projects/Clients',
            oldCanonicalPath: 'projects/client',
            newCanonicalPath: 'projects/clients',
            mergedIntoExisting: false
        });
    });

    it('rejects descendant renames', async () => {
        const result = await workflow.runTagRename('Project', 'Project/Sub', [{} as unknown as RenameFile]);

        expect(result).toBe(false);
        expect(hooks.executeRename).not.toHaveBeenCalled();
        expect(hooks.notifyTagRenamed).not.toHaveBeenCalled();
    });

    it('rejects rename when no targets are provided', async () => {
        const result = await workflow.runTagRename('Project', 'Projects', []);

        expect(result).toBe(false);
        expect(hooks.executeRename).not.toHaveBeenCalled();
    });
});

describe('TagDeleteWorkflow', () => {
    let hooks: TagDeleteHooks;
    let workflow: TagDeleteWorkflow;
    let app: App;
    let file: TFile & { content: string };
    let deleteTagFromFile: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        file = Object.assign(createTestTFile('Projects/Client.md'), {
            content: '#project/client note'
        });

        deleteTagFromFile = vi.fn().mockResolvedValue(true);

        hooks = {
            deleteTagFromFile,
            removeTagMetadataAfterDelete: vi.fn().mockResolvedValue(undefined),
            removeTagShortcutsAfterDelete: vi.fn().mockResolvedValue(undefined),
            notifyTagDeleted: vi.fn(),
            resolveDisplayTagPath: vi.fn().mockReturnValue('project/client')
        };

        app = new App();
        app.vault.getAbstractFileByPath = vi.fn((path: string) => (path === file.path ? file : null));

        const fileMutations = new TagFileMutations(app, () => DEFAULT_SETTINGS);
        workflow = new TagDeleteWorkflow(
            app,
            fileMutations,
            () => null,
            () => null,
            () => hooks
        );
    });

    it('removes tags across preset paths and notifies listeners', async () => {
        const result = await workflow.runTagDelete('project/client', [file.path]);

        expect(result).toBe(true);
        expect(deleteTagFromFile).toHaveBeenCalledTimes(1);
        expect(deleteTagFromFile.mock.calls[0][0]).toBe(file);
        expect(deleteTagFromFile.mock.calls[0][1]).toBeInstanceOf(TagDescriptor);
        expect(hooks.removeTagMetadataAfterDelete).toHaveBeenCalledWith('project/client');
        expect(hooks.removeTagShortcutsAfterDelete).toHaveBeenCalledWith('project/client');
        expect(hooks.notifyTagDeleted).toHaveBeenCalledWith({
            path: 'project/client',
            canonicalPath: 'project/client'
        });
    });

    it('short-circuits when no tags were removed', async () => {
        deleteTagFromFile.mockResolvedValue(false);

        const result = await workflow.runTagDelete('project/client', [file.path]);

        expect(result).toBe(false);
        expect(hooks.removeTagMetadataAfterDelete).not.toHaveBeenCalled();
        expect(hooks.notifyTagDeleted).not.toHaveBeenCalled();
    });
});
