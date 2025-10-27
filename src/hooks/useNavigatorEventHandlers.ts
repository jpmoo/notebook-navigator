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

import { useEffect, RefObject, Dispatch, SetStateAction } from 'react';
import { App, TAbstractFile, TFile, TFolder, debounce, Platform } from 'obsidian';
import { TIMEOUTS } from '../types/obsidian-extended';
import { useExpansionDispatch } from '../context/ExpansionContext';
import { useSelectionDispatch } from '../context/SelectionContext';
import { useUIState } from '../context/UIStateContext';
import { useCommandQueue } from '../context/ServicesContext';

interface UseNavigatorEventHandlersOptions {
    app: App;
    containerRef: RefObject<HTMLDivElement | null>;
    setIsNavigatorFocused: Dispatch<SetStateAction<boolean>>;
}

/**
 * Custom hook that handles all event-related logic for the navigator, including:
 * - Delete event handling for files and folders
 * - Focus/blur event tracking
 * - Focused pane management
 *
 * This hook consolidates all event subscription logic that was previously
 * in the NotebookNavigatorComponent.
 */
export function useNavigatorEventHandlers({ app, containerRef, setIsNavigatorFocused }: UseNavigatorEventHandlersOptions) {
    const uiState = useUIState();
    const expansionDispatch = useExpansionDispatch();
    const selectionDispatch = useSelectionDispatch();
    const commandQueue = useCommandQueue();
    const isMobile = Platform.isMobile;

    // Handle delete events to clean up stale state
    useEffect(() => {
        const handleDelete = (file: TAbstractFile) => {
            if (file instanceof TFolder) {
                // Cleanup expanded folders
                const existingPaths = new Set<string>();
                const MAX_DEPTH = 50; // Safety limit to prevent infinite recursion
                let depth = 0;
                
                const collectAllFolderPaths = (folder: TFolder) => {
                    // Safety check to prevent infinite recursion
                    if (depth >= MAX_DEPTH) {
                        console.warn('[Notebook Navigator] Max folder depth reached during cleanup');
                        return;
                    }
                    
                    existingPaths.add(folder.path);
                    depth++;
                    
                    folder.children.forEach(child => {
                        if (child instanceof TFolder) {
                            collectAllFolderPaths(child);
                        }
                    });
                    
                    depth--;
                };
                collectAllFolderPaths(app.vault.getRoot());

                expansionDispatch({ type: 'CLEANUP_DELETED_FOLDERS', existingPaths });
                selectionDispatch({ type: 'CLEANUP_DELETED_FOLDER', deletedPath: file.path });
            } else if (file instanceof TFile) {
                // Just cleanup the deleted file
                selectionDispatch({
                    type: 'CLEANUP_DELETED_FILE',
                    deletedPath: file.path,
                    nextFileToSelect: null
                });

                // Let auto-reveal handle the selection of the new active file
            }
        };

        const deleteEventRef = app.vault.on('delete', handleDelete);

        return () => {
            app.vault.offref(deleteEventRef);
        };
    }, [app.vault, expansionDispatch, selectionDispatch]);

    // Handle focus/blur events to track when navigator has focus
    useEffect(() => {
        // Skip focus tracking on mobile since it's always considered focused
        if (isMobile) {
            setIsNavigatorFocused(true);
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        // Create debounced focus handlers to prevent rapid state changes
        const debouncedSetFocused = debounce((focused: boolean) => {
            setIsNavigatorFocused(focused);
        }, TIMEOUTS.DEBOUNCE_KEYBOARD);

        const handleFocus = () => {
            debouncedSetFocused(true);
        };

        const handleBlur = (e: FocusEvent) => {
            // Check if focus is moving within the navigator
            if (e.relatedTarget && container.contains(e.relatedTarget as Node)) {
                return;
            }
            debouncedSetFocused(false);
        };

        container.addEventListener('focusin', handleFocus);
        container.addEventListener('focusout', handleBlur);

        // Focus the container initially
        container.focus();

        return () => {
            // Cancel any pending debounced callback to avoid setState after unmount
            debouncedSetFocused.cancel();
            container.removeEventListener('focusin', handleFocus);
            container.removeEventListener('focusout', handleBlur);
        };
    }, [containerRef, setIsNavigatorFocused, isMobile]);

    // Ensure the container has focus when the focused pane changes
    useEffect(() => {
        // Don't focus container when search is focused
        // The search input field needs to maintain focus for typing.
        // Without this check, the container would steal focus from the search input,
        // making it impossible to type in the search field.
        if (uiState.focusedPane === 'search') {
            return;
        }

        // Don't steal focus if we're opening version history or in a new context
        const isOpeningVersionHistory = commandQueue.isOpeningVersionHistory();
        const isOpeningInNewContext = commandQueue.isOpeningInNewContext();
        if (uiState.focusedPane && !isOpeningVersionHistory && !isOpeningInNewContext) {
            containerRef.current?.focus();
        }
    }, [uiState.focusedPane, containerRef, commandQueue]);
}
