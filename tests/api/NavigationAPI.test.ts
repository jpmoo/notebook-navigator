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
import { describe, it, expect, vi } from 'vitest';
import { NavigationAPI } from '../../src/api/modules/NavigationAPI';
import { TFolder } from 'obsidian';

describe('NavigationAPI', () => {
    it('navigates to a folder via the navigator view', async () => {
        const view = {
            navigateToFile: vi.fn(),
            navigateToFolder: vi.fn(),
            navigateToTag: vi.fn(),
            navigateToProperty: vi.fn()
        };

        const folder = new TFolder();
        folder.path = 'Projects';
        const resolvedFolder = new TFolder();
        resolvedFolder.path = 'Projects';

        const api: ConstructorParameters<typeof NavigationAPI>[0] = {
            app: {
                vault: {
                    getFolderByPath: (path: string) => (path === folder.path ? resolvedFolder : null)
                },
                workspace: {
                    getLeavesOfType: () => [{ view }]
                }
            },
            getPlugin: () => ({
                activateView: vi.fn(async () => null)
            })
        };

        const navigationAPI = new NavigationAPI(api);
        await navigationAPI.navigateToFolder(folder);

        expect(view.navigateToFolder).toHaveBeenCalledWith(resolvedFolder, { preserveNavigationFocus: true });
    });

    it('skips navigation when the folder does not resolve', async () => {
        const view = {
            navigateToFile: vi.fn(),
            navigateToFolder: vi.fn(),
            navigateToTag: vi.fn(),
            navigateToProperty: vi.fn()
        };

        const folder = new TFolder();
        folder.path = 'Missing';

        const api: ConstructorParameters<typeof NavigationAPI>[0] = {
            app: {
                vault: {
                    getFolderByPath: () => null
                },
                workspace: {
                    getLeavesOfType: () => [{ view }]
                }
            },
            getPlugin: () => ({
                activateView: vi.fn(async () => null)
            })
        };

        const navigationAPI = new NavigationAPI(api);
        await navigationAPI.navigateToFolder(folder);

        expect(view.navigateToFolder).not.toHaveBeenCalled();
    });

    it('navigates to a tag via the navigator view', async () => {
        const view = {
            navigateToFile: vi.fn(),
            navigateToFolder: vi.fn(),
            navigateToTag: vi.fn(),
            navigateToProperty: vi.fn()
        };

        const api: ConstructorParameters<typeof NavigationAPI>[0] = {
            app: {
                vault: {
                    getFolderByPath: () => null
                },
                workspace: {
                    getLeavesOfType: () => [{ view }]
                }
            },
            getPlugin: () => ({
                activateView: vi.fn(async () => null)
            })
        };

        const navigationAPI = new NavigationAPI(api);
        await navigationAPI.navigateToTag('#work');

        expect(view.navigateToTag).toHaveBeenCalledWith('#work');
    });

    it('finds the navigator view when multiple leaves exist', async () => {
        const view = {
            navigateToFile: vi.fn(),
            navigateToFolder: vi.fn(),
            navigateToTag: vi.fn(),
            navigateToProperty: vi.fn()
        };

        const api: ConstructorParameters<typeof NavigationAPI>[0] = {
            app: {
                vault: {
                    getFolderByPath: () => null
                },
                workspace: {
                    getLeavesOfType: () => [{ view: {} }, { view }]
                }
            },
            getPlugin: () => ({
                activateView: vi.fn(async () => null)
            })
        };

        const navigationAPI = new NavigationAPI(api);
        await navigationAPI.navigateToTag('#work');

        expect(view.navigateToTag).toHaveBeenCalledWith('#work');
    });

    it('navigates to a property via the navigator view', async () => {
        const view = {
            navigateToFile: vi.fn(),
            navigateToFolder: vi.fn(),
            navigateToTag: vi.fn(),
            navigateToProperty: vi.fn()
        };

        const api: ConstructorParameters<typeof NavigationAPI>[0] = {
            app: {
                vault: {
                    getFolderByPath: () => null
                },
                workspace: {
                    getLeavesOfType: () => [{ view }]
                }
            },
            getPlugin: () => ({
                activateView: vi.fn(async () => null)
            })
        };

        const navigationAPI = new NavigationAPI(api);
        await navigationAPI.navigateToProperty('key:status=done');

        expect(view.navigateToProperty).toHaveBeenCalledWith('key:status=done');
    });
});
