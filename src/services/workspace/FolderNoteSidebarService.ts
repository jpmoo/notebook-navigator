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

import { FileView, TFile, TFolder, type ViewState, type WorkspaceLeaf } from 'obsidian';
import type NotebookNavigatorPlugin from '../../main';
import { runAsyncAction } from '../../utils/async';
import { getFolderNote } from '../../utils/folderNotes';
import { getLeafSplitLocation } from '../../utils/workspaceSplit';
import { registerActiveFileWorkspaceListeners, type ActiveFileWorkspaceEvent } from '../../utils/workspaceActiveFileEvents';

const SETTINGS_LISTENER_ID = 'folder-note-sidebar-service';
const SIDEBAR_OPEN_SUPPRESSION_MS = 1000;
const EMPTY_VIEW_STATE: ViewState = { type: 'empty', state: {} };

interface WorkspaceWithActiveLeaf {
    activeLeaf?: WorkspaceLeaf | null;
}

export class FolderNoteSidebarService {
    private readonly plugin: NotebookNavigatorPlugin;
    private stopWorkspaceListeners: (() => void) | null = null;
    private companionLeaf: WorkspaceLeaf | null = null;
    private currentFolderNotePath: string | null = null;
    private workspaceReady = false;
    private syncRequestId = 0;
    private suppressedSidebarOpenPath: string | null = null;
    private suppressionTimer: number | null = null;

    constructor(plugin: NotebookNavigatorPlugin) {
        this.plugin = plugin;
    }

    start(): void {
        if (this.stopWorkspaceListeners) {
            return;
        }

        this.stopWorkspaceListeners = registerActiveFileWorkspaceListeners({
            workspace: this.plugin.app.workspace,
            commandQueue: this.plugin.commandQueue,
            onChange: event => this.handleWorkspaceActiveFileChange(event)
        });

        this.plugin.registerSettingsUpdateListener(SETTINGS_LISTENER_ID, () => this.handleSettingsUpdate());
    }

    dispose(): void {
        this.stopWorkspaceListeners?.();
        this.stopWorkspaceListeners = null;
        this.plugin.unregisterSettingsUpdateListener(SETTINGS_LISTENER_ID);
        this.clearSidebarOpenSuppression();
    }

    handleWorkspaceReady(): void {
        this.workspaceReady = true;
        this.syncCurrentFile();
    }

    isSuppressingSidebarOpen(path: string): boolean {
        return this.suppressedSidebarOpenPath === path;
    }

    async openFolderNote(folderNote: TFile): Promise<void> {
        const requestId = ++this.syncRequestId;
        await this.applyResolvedFolderNote(folderNote, requestId);
    }

    private get canUseRightSidebar(): boolean {
        const settings = this.plugin.settings;
        return settings.enableFolderNotes && settings.folderNoteOpenLocation === 'right-sidebar';
    }

    private get shouldFollowRelatedFolderNotes(): boolean {
        return this.canUseRightSidebar && this.plugin.settings.showNearestFolderNoteInSidebar;
    }

    private handleSettingsUpdate(): void {
        if (!this.workspaceReady || this.plugin.isShuttingDown()) {
            return;
        }

        if (!this.canUseRightSidebar) {
            runAsyncAction(() => this.detachCompanionLeaf());
            return;
        }

        if (this.shouldFollowRelatedFolderNotes) {
            this.syncCurrentFile();
        }
    }

    private handleWorkspaceActiveFileChange(event: ActiveFileWorkspaceEvent): void {
        if (!this.workspaceReady || this.plugin.isShuttingDown() || !this.shouldFollowRelatedFolderNotes) {
            return;
        }

        const activeLeaf = event.activeLeaf ?? this.getActiveLeaf();
        if (activeLeaf && getLeafSplitLocation(this.plugin.app, activeLeaf) === 'right-sidebar') {
            return;
        }

        const candidateFile = event.candidateFile;
        if (candidateFile instanceof TFile) {
            if (this.isSuppressingSidebarOpen(candidateFile.path)) {
                return;
            }

            this.syncToFile(candidateFile);
            return;
        }

        if (!activeLeaf) {
            return;
        }

        const split = getLeafSplitLocation(this.plugin.app, activeLeaf);
        if (split !== 'main') {
            return;
        }

        const activeLeafFile = this.getFileFromLeaf(activeLeaf);
        if (activeLeafFile) {
            this.syncToFile(activeLeafFile);
            return;
        }

        runAsyncAction(() => this.clearCompanionLeaf());
    }

    private syncCurrentFile(): void {
        if (!this.shouldFollowRelatedFolderNotes) {
            return;
        }

        const activeView = this.plugin.app.workspace.getActiveViewOfType(FileView);
        if (!activeView?.file || getLeafSplitLocation(this.plugin.app, activeView.leaf ?? null) === 'right-sidebar') {
            return;
        }

        this.syncToFile(activeView.file);
    }

    private syncToFile(file: TFile): void {
        const requestId = ++this.syncRequestId;
        const folderNote = this.findNearestFolderNote(file);
        runAsyncAction(() => this.applyResolvedFolderNote(folderNote, requestId));
    }

    private async applyResolvedFolderNote(folderNote: TFile | null, requestId: number): Promise<void> {
        if (requestId !== this.syncRequestId || this.plugin.isShuttingDown() || !this.canUseRightSidebar) {
            return;
        }

        if (!folderNote) {
            this.adoptRestoredCompanionLeaf();
            await this.clearCompanionLeaf();
            return;
        }

        if (this.currentFolderNotePath === folderNote.path && this.getUsableCompanionLeaf(folderNote.path)) {
            return;
        }

        const leaf = this.getOrCreateCompanionLeaf(folderNote);
        if (!leaf) {
            return;
        }

        const previousActiveLeaf = this.getActiveLeaf();
        this.suppressSidebarOpen(folderNote.path);
        const openCompanionFile = async () => {
            await leaf.openFile(folderNote, { active: false });
        };
        if (this.plugin.commandQueue) {
            const result = await this.plugin.commandQueue.executeBackgroundFileOpen(folderNote, openCompanionFile);
            if (!result.success) {
                return;
            }
        } else {
            await openCompanionFile();
        }
        if (requestId !== this.syncRequestId || this.plugin.isShuttingDown()) {
            return;
        }

        this.currentFolderNotePath = folderNote.path;
        await this.plugin.app.workspace.revealLeaf(leaf);
        if (previousActiveLeaf && previousActiveLeaf !== leaf && !this.plugin.isShuttingDown()) {
            this.plugin.app.workspace.setActiveLeaf(previousActiveLeaf, { focus: false });
        }
    }

    private findNearestFolderNote(file: TFile): TFile | null {
        let folder: TFolder | null = file.parent instanceof TFolder ? file.parent : null;

        while (folder) {
            const folderNote = getFolderNote(folder, this.plugin.settings);
            if (folderNote && folderNote.path !== file.path) {
                return folderNote;
            }

            folder = folder.parent instanceof TFolder ? folder.parent : null;
        }

        return null;
    }

    private getOrCreateCompanionLeaf(folderNote: TFile): WorkspaceLeaf | null {
        const existingLeaf = this.getUsableCompanionLeaf();
        if (existingLeaf) {
            this.pruneRestoredCompanionLeafDuplicates(existingLeaf);
            return existingLeaf;
        }

        const restoredLeaf = this.findRestoredCompanionLeaf(folderNote);
        if (restoredLeaf) {
            this.companionLeaf = restoredLeaf;
            this.pruneRestoredCompanionLeafDuplicates(restoredLeaf);
            return restoredLeaf;
        }

        const leaf = this.plugin.app.workspace.getRightLeaf(true) ?? this.plugin.app.workspace.getRightLeaf(false);
        this.companionLeaf = leaf;
        return leaf;
    }

    private getUsableCompanionLeaf(expectedFolderNotePath?: string | null): WorkspaceLeaf | null {
        const leaf = this.companionLeaf;
        if (!leaf || getLeafSplitLocation(this.plugin.app, leaf) !== 'right-sidebar') {
            return null;
        }

        const expectedPath = expectedFolderNotePath === undefined ? this.currentFolderNotePath : expectedFolderNotePath;
        if (expectedPath === null) {
            return leaf.getViewState().type === EMPTY_VIEW_STATE.type ? leaf : null;
        }

        return this.getFilePathFromLeaf(leaf) === expectedPath ? leaf : null;
    }

    private adoptRestoredCompanionLeaf(): void {
        if (this.getUsableCompanionLeaf()) {
            return;
        }

        const restoredLeaf = this.findRestoredCompanionLeaf(null);
        if (!restoredLeaf) {
            this.companionLeaf = null;
            this.currentFolderNotePath = null;
            return;
        }

        this.companionLeaf = restoredLeaf;
        this.currentFolderNotePath = this.getFilePathFromLeaf(restoredLeaf);
        this.pruneRestoredCompanionLeafDuplicates(restoredLeaf);
    }

    private findRestoredCompanionLeaf(targetFolderNote: TFile | null): WorkspaceLeaf | null {
        let exactMatch: WorkspaceLeaf | null = null;
        let folderNoteLeaf: WorkspaceLeaf | null = null;

        this.plugin.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            if (exactMatch || getLeafSplitLocation(this.plugin.app, leaf) !== 'right-sidebar') {
                return;
            }

            const filePath = this.getFilePathFromLeaf(leaf);
            if (!filePath) {
                return;
            }

            if (targetFolderNote && filePath === targetFolderNote.path) {
                exactMatch = leaf;
                return;
            }

            if (!folderNoteLeaf && this.isFolderNotePath(filePath)) {
                folderNoteLeaf = leaf;
            }
        });

        return exactMatch ?? folderNoteLeaf;
    }

    private pruneRestoredCompanionLeafDuplicates(keepLeaf: WorkspaceLeaf): void {
        const leavesToDetach: WorkspaceLeaf[] = [];

        this.plugin.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            if (leaf === keepLeaf || getLeafSplitLocation(this.plugin.app, leaf) !== 'right-sidebar') {
                return;
            }

            const filePath = this.getFilePathFromLeaf(leaf);
            if (filePath && this.isFolderNotePath(filePath)) {
                leavesToDetach.push(leaf);
            }
        });

        leavesToDetach.forEach(leaf => leaf.detach());
    }

    private getFileFromLeaf(leaf: WorkspaceLeaf): TFile | null {
        const view = leaf.view;
        if (typeof FileView === 'function' && view instanceof FileView && view.file instanceof TFile) {
            return view.file;
        }

        return null;
    }

    private getFilePathFromLeaf(leaf: WorkspaceLeaf): string | null {
        const file = this.getFileFromLeaf(leaf);
        if (file) {
            return file.path;
        }

        const filePath = leaf.getViewState().state?.file;
        return typeof filePath === 'string' && filePath.length > 0 ? filePath : null;
    }

    private isFolderNotePath(path: string): boolean {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || !(file.parent instanceof TFolder)) {
            return false;
        }

        return getFolderNote(file.parent, this.plugin.settings)?.path === file.path;
    }

    private getActiveLeaf(): WorkspaceLeaf | null {
        const workspace = this.plugin.app.workspace as unknown as WorkspaceWithActiveLeaf;
        return workspace.activeLeaf ?? null;
    }

    private async clearCompanionLeaf(): Promise<void> {
        const leaf = this.getUsableCompanionLeaf();
        if (this.currentFolderNotePath === null) {
            return;
        }

        this.currentFolderNotePath = null;
        if (!leaf) {
            this.companionLeaf = null;
            return;
        }

        await leaf.setViewState(EMPTY_VIEW_STATE);
    }

    private async detachCompanionLeaf(): Promise<void> {
        const leaf = this.getUsableCompanionLeaf();
        this.currentFolderNotePath = null;
        this.companionLeaf = null;
        if (!leaf) {
            return;
        }

        leaf.detach();
    }

    private suppressSidebarOpen(path: string): void {
        this.clearSidebarOpenSuppression();
        this.suppressedSidebarOpenPath = path;
        if (typeof window === 'undefined') {
            return;
        }

        this.suppressionTimer = window.setTimeout(() => {
            if (this.suppressedSidebarOpenPath === path) {
                this.suppressedSidebarOpenPath = null;
            }
            this.suppressionTimer = null;
        }, SIDEBAR_OPEN_SUPPRESSION_MS);
    }

    private clearSidebarOpenSuppression(): void {
        if (this.suppressionTimer !== null && typeof window !== 'undefined') {
            window.clearTimeout(this.suppressionTimer);
        }
        this.suppressionTimer = null;
        this.suppressedSidebarOpenPath = null;
    }
}
