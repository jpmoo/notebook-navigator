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

import { useCallback, useMemo } from 'react';
import { Menu } from 'obsidian';
import { useSelectionState, useSelectionDispatch } from '../context/SelectionContext';
import { useServices, useFileSystemOps, useMetadataService } from '../context/ServicesContext';
import { useSettingsState, useSettingsUpdate } from '../context/SettingsContext';
import { useUXPreferenceActions, useUXPreferences } from '../context/UXPreferencesContext';
import { strings } from '../i18n';
import type { SortOption } from '../settings';
import { ItemType, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID, TAGGED_TAG_ID, UNTAGGED_TAG_ID } from '../types';
import { getEffectiveSortOption, getSortIcon as getSortIconName, isPropertySortOption, SORT_OPTIONS } from '../utils/sortUtils';
import { showListPaneAppearanceMenu } from '../components/ListPaneAppearanceMenu';
import { getDefaultListMode } from './useListPaneAppearance';
import type { FolderAppearance } from './useListPaneAppearance';
import { getFilesForFolder } from '../utils/fileFinder';
import { runAsyncAction } from '../utils/async';
import { FILE_VISIBILITY } from '../utils/fileTypeUtils';
import { findVaultProfileById } from '../utils/vaultProfiles';

/**
 * Custom hook that provides shared actions for list pane toolbars.
 * Used by both ListPaneHeader (desktop) and ListToolbar (mobile) to avoid code duplication.
 *
 * @returns Object containing action handlers and computed values for list pane operations
 */
export function useListActions() {
    const { app } = useServices();
    const settings = useSettingsState();
    const vaultProfileId = settings.vaultProfile;
    const vaultProfiles = settings.vaultProfiles;
    const uxPreferences = useUXPreferences();
    const includeDescendantNotes = uxPreferences.includeDescendantNotes;
    const showHiddenItems = uxPreferences.showHiddenItems;
    const { setIncludeDescendantNotes } = useUXPreferenceActions();
    const updateSettings = useSettingsUpdate();
    const selectionState = useSelectionState();
    const selectionDispatch = useSelectionDispatch();
    const fileSystemOps = useFileSystemOps();
    const metadataService = useMetadataService();
    const hasFolderSelection = selectionState.selectionType === ItemType.FOLDER && Boolean(selectionState.selectedFolder);
    const hasTagSelection = selectionState.selectionType === ItemType.TAG && Boolean(selectionState.selectedTag);
    const hasCreatableTagSelection =
        hasTagSelection && selectionState.selectedTag !== TAGGED_TAG_ID && selectionState.selectedTag !== UNTAGGED_TAG_ID;
    const hasPropertySelection = selectionState.selectionType === ItemType.PROPERTY && Boolean(selectionState.selectedProperty);
    const hasCreatablePropertySelection = hasPropertySelection && selectionState.selectedProperty !== PROPERTIES_ROOT_VIRTUAL_FOLDER_ID;
    const hasFolderOrTagSelection = hasFolderSelection || hasTagSelection;
    const canCreateNewFile = Boolean(selectionState.selectedFolder) || hasCreatableTagSelection || hasCreatablePropertySelection;

    const handleNewFile = useCallback(async () => {
        try {
            if (selectionState.selectedFolder) {
                await fileSystemOps.createNewFile(selectionState.selectedFolder, settings.createNewNotesInNewTab);
                return;
            }

            if (hasCreatableTagSelection && selectionState.selectedTag) {
                const sourcePath = selectionState.selectedFile?.path ?? app.workspace.getActiveFile()?.path ?? '';
                await fileSystemOps.createNewFileForTag(selectionState.selectedTag, sourcePath, settings.createNewNotesInNewTab);
                return;
            }

            if (hasCreatablePropertySelection && selectionState.selectedProperty) {
                const sourcePath = selectionState.selectedFile?.path ?? app.workspace.getActiveFile()?.path ?? '';
                await fileSystemOps.createNewFileForProperty(selectionState.selectedProperty, sourcePath, settings.createNewNotesInNewTab);
            }
        } catch {
            // Error is handled by FileSystemOperations with user notification
        }
    }, [
        selectionState.selectedFolder,
        selectionState.selectedTag,
        selectionState.selectedProperty,
        selectionState.selectedFile,
        hasCreatableTagSelection,
        hasCreatablePropertySelection,
        settings.createNewNotesInNewTab,
        fileSystemOps,
        app
    ]);

    const getCurrentSortOption = useCallback((): SortOption => {
        return getEffectiveSortOption(settings, selectionState.selectionType, selectionState.selectedFolder, selectionState.selectedTag);
    }, [settings, selectionState.selectionType, selectionState.selectedFolder, selectionState.selectedTag]);

    const getSortIcon = useCallback(() => {
        return getSortIconName(getCurrentSortOption());
    }, [getCurrentSortOption]);

    const handleAppearanceMenu = useCallback(
        (event: React.MouseEvent) => {
            if (!hasFolderOrTagSelection) {
                return;
            }

            showListPaneAppearanceMenu({
                event: event.nativeEvent,
                settings,
                selectedFolder: selectionState.selectedFolder,
                selectedTag: selectionState.selectedTag,
                selectionType: selectionState.selectionType,
                updateSettings
            });
        },
        [
            hasFolderOrTagSelection,
            settings,
            selectionState.selectedFolder,
            selectionState.selectedTag,
            selectionState.selectionType,
            updateSettings
        ]
    );

    const handleSortMenu = useCallback(
        (event: React.MouseEvent) => {
            if (!hasFolderOrTagSelection) {
                return;
            }

            const menu = new Menu();
            const currentSort = getCurrentSortOption();
            const propertySortKey = settings.propertySortKey.trim();

            const getSortOptionLabel = (option: SortOption): string => {
                if (isPropertySortOption(option) && propertySortKey.length > 0) {
                    const template =
                        option === 'property-asc'
                            ? strings.settings.items.sortNotesBy.propertyOverride.asc
                            : strings.settings.items.sortNotesBy.propertyOverride.desc;
                    return template.replace('{property}', propertySortKey);
                }
                return strings.settings.items.sortNotesBy.options[option];
            };

            const isCustomSort =
                (hasFolderSelection &&
                    selectionState.selectedFolder &&
                    metadataService.getFolderSortOverride(selectionState.selectedFolder.path)) ||
                (hasTagSelection && selectionState.selectedTag && metadataService.getTagSortOverride(selectionState.selectedTag));

            menu.addItem(item => {
                item.setTitle(`${strings.paneHeader.defaultSort}: ${getSortOptionLabel(settings.defaultFolderSort)}`)
                    .setChecked(!isCustomSort)
                    .onClick(() => {
                        // Reset to default sort
                        runAsyncAction(async () => {
                            if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
                                await metadataService.removeFolderSortOverride(selectionState.selectedFolder.path);
                            } else if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
                                await metadataService.removeTagSortOverride(selectionState.selectedTag);
                            }
                            app.workspace.requestSaveLayout();
                        });
                    });
            });

            menu.addSeparator();

            let lastCategory = '';
            SORT_OPTIONS.forEach(option => {
                const category = option.split('-')[0];
                if (lastCategory && lastCategory !== category) {
                    menu.addSeparator();
                }
                lastCategory = category;

                menu.addItem(item => {
                    item.setTitle(getSortOptionLabel(option))
                        .setChecked(!!isCustomSort && currentSort === option)
                        .onClick(() => {
                            // Apply sort option
                            runAsyncAction(async () => {
                                if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
                                    await metadataService.setFolderSortOverride(selectionState.selectedFolder.path, option);
                                } else if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
                                    await metadataService.setTagSortOverride(selectionState.selectedTag, option);
                                }
                                app.workspace.requestSaveLayout();
                            });
                        });
                });
            });

            menu.showAtMouseEvent(event.nativeEvent);
        },
        [
            hasFolderOrTagSelection,
            hasFolderSelection,
            hasTagSelection,
            selectionState.selectionType,
            selectionState.selectedFolder,
            selectionState.selectedTag,
            app,
            getCurrentSortOption,
            metadataService,
            settings
        ]
    );

    /**
     * Toggles the display of notes from descendants.
     * When enabling descendants, automatically selects the active file if it's within the current folder/tag hierarchy.
     */
    const handleToggleDescendants = useCallback(() => {
        const wasShowingDescendants = includeDescendantNotes;
        const activeFile = app.workspace.getActiveFile();

        // Toggle descendant notes preference using UX action
        setIncludeDescendantNotes(!wasShowingDescendants);

        // Special case: When enabling descendants, auto-select the active file if it's in the folder
        if (!wasShowingDescendants && selectionState.selectedFolder && !selectionState.selectedFile) {
            if (activeFile) {
                // Check if the active file would be visible with descendants enabled
                const filesInFolder = getFilesForFolder(
                    selectionState.selectedFolder,
                    settings,
                    { includeDescendantNotes: true, showHiddenItems },
                    app
                );

                if (filesInFolder.some(f => f.path === activeFile.path)) {
                    selectionDispatch({ type: 'SET_SELECTED_FILE', file: activeFile });
                }
            }
        }
    }, [
        setIncludeDescendantNotes,
        includeDescendantNotes,
        showHiddenItems,
        selectionState.selectedFolder,
        selectionState.selectedFile,
        app,
        selectionDispatch,
        settings
    ]);

    const isCustomSort =
        (hasFolderSelection &&
            selectionState.selectedFolder &&
            metadataService.getFolderSortOverride(selectionState.selectedFolder.path)) ||
        (hasTagSelection && selectionState.selectedTag && metadataService.getTagSortOverride(selectionState.selectedTag));

    const defaultMode = getDefaultListMode(settings);
    const hasMeaningfulOverrides = (appearance: FolderAppearance | undefined) => {
        if (!appearance) {
            return false;
        }

        const hasModeOverride = (appearance.mode === 'compact' || appearance.mode === 'standard') && appearance.mode !== defaultMode;
        const otherOverrides =
            appearance.titleRows !== undefined ||
            appearance.previewRows !== undefined ||
            appearance.notePropertyType !== undefined ||
            appearance.groupBy !== undefined;

        return hasModeOverride || otherOverrides;
    };

    // Check if folder or tag has custom appearance settings
    const hasCustomAppearance =
        (hasFolderSelection &&
            selectionState.selectedFolder &&
            hasMeaningfulOverrides(settings.folderAppearances?.[selectionState.selectedFolder.path])) ||
        (hasTagSelection && selectionState.selectedTag && hasMeaningfulOverrides(settings.tagAppearances?.[selectionState.selectedTag]));

    const activeFileVisibility = useMemo(() => {
        return findVaultProfileById(vaultProfiles, vaultProfileId).fileVisibility;
    }, [vaultProfileId, vaultProfiles]);

    const descendantsTooltip = useMemo(() => {
        const showNotes = activeFileVisibility === FILE_VISIBILITY.DOCUMENTS;

        if (selectionState.selectionType === ItemType.TAG) {
            return showNotes ? strings.paneHeader.showNotesFromDescendants : strings.paneHeader.showFilesFromDescendants;
        }

        if (selectionState.selectionType === ItemType.PROPERTY) {
            return showNotes ? strings.paneHeader.showNotesFromDescendants : strings.paneHeader.showFilesFromDescendants;
        }

        if (selectionState.selectionType === ItemType.FOLDER) {
            return showNotes ? strings.paneHeader.showNotesFromSubfolders : strings.paneHeader.showFilesFromSubfolders;
        }

        return showNotes ? strings.paneHeader.showNotesFromSubfolders : strings.paneHeader.showFilesFromSubfolders;
    }, [activeFileVisibility, selectionState.selectionType]);

    return {
        handleNewFile,
        canCreateNewFile,
        handleAppearanceMenu,
        handleSortMenu,
        handleToggleDescendants,
        getCurrentSortOption,
        getSortIcon,
        isCustomSort,
        hasCustomAppearance,
        descendantsTooltip
    };
}
