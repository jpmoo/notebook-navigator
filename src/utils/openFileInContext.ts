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

import type { App, PaneType, TFile } from 'obsidian';
import type { CommandQueueService } from '../services/CommandQueueService';

interface OpenFileInContextParams {
    app: App;
    commandQueue: CommandQueueService | null;
    file: TFile;
    context: PaneType;
    active?: boolean;
}

/**
 * Opens a file in a new workspace context (tab, split, window) while respecting the command queue.
 */
export async function openFileInContext({ app, commandQueue, file, context, active = true }: OpenFileInContextParams): Promise<void> {
    // Define the file opening operation
    const openFile = async () => {
        const leaf = app.workspace.getLeaf(context);
        if (!leaf) {
            throw new Error(`Unable to open file in ${context} context: leaf not available`);
        }
        await leaf.openFile(file, { active });
    };

    // Execute through command queue if available to track file open context
    if (commandQueue) {
        await commandQueue.executeOpenInNewContext(file, context, openFile);
        return;
    }

    // Otherwise open directly
    await openFile();
}
