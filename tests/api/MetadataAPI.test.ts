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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataAPI } from '../../src/api/modules/MetadataAPI';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorAPI } from '../../src/api/NotebookNavigatorAPI';
import type { NotebookNavigatorSettings } from '../../src/settings';
import type { IconString } from '../../src/api/types';
import { TFolder } from 'obsidian';

describe('MetadataAPI icon normalization', () => {
    let plugin: {
        settings: NotebookNavigatorSettings;
        saveSettingsAndUpdate: ReturnType<typeof vi.fn>;
    };
    let api: NotebookNavigatorAPI;

    beforeEach(() => {
        plugin = {
            settings: structuredClone(DEFAULT_SETTINGS),
            saveSettingsAndUpdate: vi.fn().mockResolvedValue(undefined)
        };

        api = {
            getPlugin: () => plugin,
            getApp: () =>
                ({
                    vault: {
                        getFolderByPath: () => null
                    }
                }) as unknown,
            trigger: vi.fn()
        } as unknown as NotebookNavigatorAPI;
    });

    it('normalizes legacy lucide identifiers provided through the API', async () => {
        const metadataAPI = new MetadataAPI(api);
        const folder = new TFolder();
        folder.path = 'Folder';

        await metadataAPI.setFolderMeta(folder, {
            icon: 'lucide-sun' as unknown as IconString
        });

        expect(plugin.settings.folderIcons.Folder).toBe('sun');
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalled();
    });

    it('normalizes provider-prefixed identifiers provided through the API', async () => {
        const metadataAPI = new MetadataAPI(api);
        const folder = new TFolder();
        folder.path = 'Folder';

        await metadataAPI.setFolderMeta(folder, {
            icon: 'phosphor:ph-apple-logo' as IconString
        });

        expect(plugin.settings.folderIcons.Folder).toBe('phosphor:apple-logo');
    });
});
