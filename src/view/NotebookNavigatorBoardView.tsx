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

import React from 'react';
import { Root, createRoot } from 'react-dom/client';
import { ItemView, type ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { SettingsProvider } from '../context/SettingsContext';
import { ServicesProvider } from '../context/ServicesContext';
import { BoardView } from '../components/board/BoardView';
import { strings } from '../i18n';
import type NotebookNavigatorPlugin from '../main';
import { NOTEBOOK_NAVIGATOR_BOARD_VIEW } from '../types';
import { setupNotebookNavigatorViewContainer, teardownNotebookNavigatorViewContainer } from './NotebookNavigatorView';

/** Persisted/restored view state for the board view. */
interface BoardViewState {
    targetFolderPath?: string | null;
}

export class NotebookNavigatorBoardView extends ItemView {
    private readonly plugin: NotebookNavigatorPlugin;
    private root: Root | null = null;
    private currentFolderPath: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: NotebookNavigatorPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return NOTEBOOK_NAVIGATOR_BOARD_VIEW;
    }

    getDisplayText() {
        return strings.plugin.boardViewName;
    }

    getIcon() {
        return 'layout-grid';
    }

    getState(): Record<string, unknown> {
        return { ...super.getState(), targetFolderPath: this.currentFolderPath };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        if (state && typeof state === 'object') {
            const next = (state as BoardViewState).targetFolderPath;
            this.currentFolderPath = typeof next === 'string' ? next : null;
        }
        this.renderBoard();
        await super.setState(state, result);
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        if (!container.instanceOf(HTMLElement)) {
            return;
        }

        setupNotebookNavigatorViewContainer(container, { useFloatingToolbars: false });
        this.root = createRoot(container);
        this.renderBoard();
    }

    async onClose() {
        const container = this.containerEl.children[1];
        this.root?.unmount();
        this.root = null;
        if (container.instanceOf(HTMLElement)) {
            teardownNotebookNavigatorViewContainer(container);
        }
    }

    stopContentProcessing() {
        this.root?.unmount();
        this.root = null;
    }

    private renderBoard(): void {
        if (!this.root) {
            return;
        }
        this.root.render(
            <React.StrictMode>
                <SettingsProvider plugin={this.plugin}>
                    <ServicesProvider plugin={this.plugin}>
                        <BoardView app={this.plugin.app} folderPath={this.currentFolderPath} />
                    </ServicesProvider>
                </SettingsProvider>
            </React.StrictMode>
        );
    }
}
