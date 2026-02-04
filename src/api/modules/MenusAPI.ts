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

import { Menu, MenuItem, TFile, TFolder } from 'obsidian';

export type MenuExtensionDispose = () => void;

export type FileMenuSelectionMode = 'single' | 'multiple';

function isPromiseLike(value: unknown): value is Promise<unknown> {
    return value instanceof Promise;
}

export interface FileMenuExtensionContext {
    addItem: (cb: (item: MenuItem) => void) => void;
    file: TFile;
    selection: {
        mode: FileMenuSelectionMode;
        files: readonly TFile[];
    };
}

export interface FolderMenuExtensionContext {
    addItem: (cb: (item: MenuItem) => void) => void;
    folder: TFolder;
}

export type FileMenuExtension = (context: FileMenuExtensionContext) => void;
export type FolderMenuExtension = (context: FolderMenuExtensionContext) => void;

type FileMenuExtensionApplyContext = {
    menu: Menu;
    file: TFile;
    selection: {
        mode: FileMenuSelectionMode;
        files: readonly TFile[];
    };
};

type FolderMenuExtensionApplyContext = {
    menu: Menu;
    folder: TFolder;
};

/**
 * Menu extension API - Allow other plugins to add items to Notebook Navigator context menus.
 */
export class MenusAPI {
    private fileMenuExtensions = new Set<FileMenuExtension>();
    private folderMenuExtensions = new Set<FolderMenuExtension>();

    registerFileMenu(callback: FileMenuExtension): MenuExtensionDispose {
        this.fileMenuExtensions.add(callback);
        return () => {
            this.fileMenuExtensions.delete(callback);
        };
    }

    registerFolderMenu(callback: FolderMenuExtension): MenuExtensionDispose {
        this.folderMenuExtensions.add(callback);
        return () => {
            this.folderMenuExtensions.delete(callback);
        };
    }

    /**
     * Calls registered file menu extensions and returns number of items added.
     * @internal
     */
    applyFileMenuExtensions(context: FileMenuExtensionApplyContext): number {
        if (this.fileMenuExtensions.size === 0) {
            return 0;
        }

        const { menu, file, selection } = context;
        let addedItems = 0;
        let isBuildingMenu = true;

        const frozenSelection = Object.freeze({
            mode: selection.mode,
            files: Object.freeze([...selection.files])
        });

        const extensionContext: FileMenuExtensionContext = {
            addItem: cb => {
                if (!isBuildingMenu) {
                    console.error(
                        'Notebook Navigator file menu extension attempted to add menu items asynchronously. Add menu items synchronously and do async work in onClick handlers.'
                    );
                    return;
                }
                try {
                    menu.addItem(item => {
                        try {
                            cb(item);
                        } catch (error) {
                            console.error('Notebook Navigator file menu extension item failed', error);
                        }
                    });
                    addedItems += 1;
                } catch (error) {
                    console.error('Notebook Navigator file menu extension addItem failed', error);
                }
            },
            file,
            selection: frozenSelection
        };

        const extensions = Array.from(this.fileMenuExtensions);
        for (const extension of extensions) {
            try {
                const result: unknown = extension(extensionContext);
                if (isPromiseLike(result)) {
                    console.error(
                        'Notebook Navigator file menu extension returned a Promise. Add menu items synchronously and do async work in onClick handlers.'
                    );
                    void result.catch(error => {
                        console.error('Notebook Navigator file menu extension failed', error);
                    });
                }
            } catch (error) {
                console.error('Notebook Navigator file menu extension failed', error);
            }
        }

        isBuildingMenu = false;
        return addedItems;
    }

    /**
     * Calls registered folder menu extensions and returns number of items added.
     * @internal
     */
    applyFolderMenuExtensions(context: FolderMenuExtensionApplyContext): number {
        if (this.folderMenuExtensions.size === 0) {
            return 0;
        }

        const { menu, folder } = context;
        let addedItems = 0;
        let isBuildingMenu = true;

        const extensionContext: FolderMenuExtensionContext = {
            addItem: cb => {
                if (!isBuildingMenu) {
                    console.error(
                        'Notebook Navigator folder menu extension attempted to add menu items asynchronously. Add menu items synchronously and do async work in onClick handlers.'
                    );
                    return;
                }
                try {
                    menu.addItem(item => {
                        try {
                            cb(item);
                        } catch (error) {
                            console.error('Notebook Navigator folder menu extension item failed', error);
                        }
                    });
                    addedItems += 1;
                } catch (error) {
                    console.error('Notebook Navigator folder menu extension addItem failed', error);
                }
            },
            folder
        };

        const extensions = Array.from(this.folderMenuExtensions);
        for (const extension of extensions) {
            try {
                const result: unknown = extension(extensionContext);
                if (isPromiseLike(result)) {
                    console.error(
                        'Notebook Navigator folder menu extension returned a Promise. Add menu items synchronously and do async work in onClick handlers.'
                    );
                    void result.catch(error => {
                        console.error('Notebook Navigator folder menu extension failed', error);
                    });
                }
            } catch (error) {
                console.error('Notebook Navigator folder menu extension failed', error);
            }
        }

        isBuildingMenu = false;
        return addedItems;
    }
}
