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

/**
 * OPTIMIZATIONS:
 *
 * 1. React.memo with forwardRef - Only re-renders on prop changes
 *
 * 2. Virtualization:
 *    - TanStack Virtual for rendering only visible items
 *    - Estimated row heights from fixed measurements and visible row sections
 *    - Direct memory cache lookups in estimateSize function
 *    - Virtualizer refreshes size estimates when row-height inputs change
 *
 * 3. List building optimization:
 *    - useMemo rebuilds list items only when dependencies change
 *    - File filtering happens once during list build
 *    - Sort operations optimized with pre-computed values
 *    - Pinned files handled separately for efficiency
 *
 * 4. Event handling:
 *    - Debounced vault event handlers via forceUpdate
 *    - Selective updates based on file location (folder/tag context)
 *    - Database content changes trigger selective size-estimate refreshes
 *
 * 5. Selection handling:
 *    - Stable file index for onClick handlers
 *    - Multi-selection support without re-render
 *    - Keyboard navigation optimized
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState, useMemo, useLayoutEffect } from 'react';
import { TFile, Platform } from 'obsidian';
import { Virtualizer } from '@tanstack/react-virtual';
import { useSelectionState, useSelectionDispatch } from '../context/SelectionContext';
import { useServices } from '../context/ServicesContext';
import { useSettingsState, useActiveProfile, useSettingsDerived } from '../context/SettingsContext';
import { useUIState } from '../context/UIStateContext';
import { useFileCache } from '../context/StorageContext';
import { useShortcuts } from '../context/ShortcutsContext';
import { useListPaneKeyboard } from '../hooks/useListPaneKeyboard';
import { useListPaneData } from '../hooks/useListPaneData';
import { useListPaneScroll } from '../hooks/useListPaneScroll';
import { useListPaneTitle } from '../hooks/useListPaneTitle';
import { useListPaneAppearance } from '../hooks/useListPaneAppearance';
import { useListPaneSearch, type SearchQueryUpdateOptions } from '../hooks/useListPaneSearch';
import { useListPaneSelectionCoordinator } from '../hooks/useListPaneSelectionCoordinator';
import type { EnsureSelectionOptions, EnsureSelectionResult, SelectFileOptions } from '../hooks/useListPaneSelectionCoordinator';
import { useContextMenu } from '../hooks/useContextMenu';
import { IOS_FLOATING_TOOLBAR_HEIGHT_PX, ItemType, ListPaneItemType, type CSSPropertiesWithVars } from '../types';
import { getEffectiveListSort, getSortField, sortFiles } from '../utils/sortUtils';
import { ListPaneHeader } from './ListPaneHeader';
import { ListToolbar } from './ListToolbar';
import { Calendar } from './calendar';
import { SearchInput } from './SearchInput';
import { ListPaneTitleArea } from './ListPaneTitleArea';
import { ListPaneVirtualContent, getHoveredFilePathAtPointer, type PointerClientPosition } from './listPane/ListPaneVirtualContent';
import { ManualSortListContent } from './listPane/ManualSortListContent';
import type { FileItemStorageHelpers } from './FileItem';
import { type SearchShortcut } from '../types/shortcuts';
import { type SearchNavFilterState } from '../types/search';
import { EMPTY_LIST_MENU_TYPE } from '../utils/contextMenu';
import { useUXPreferences } from '../context/UXPreferencesContext';
import { type InclusionOperator } from '../utils/filterSearch';
import type { FolderDecorationModel } from '../utils/folderDecoration';
import { useSurfaceColorVariables } from '../hooks/useSurfaceColorVariables';
import { LIST_PANE_SURFACE_COLOR_MAPPINGS } from '../constants/surfaceColorMappings';
import { getListPaneMeasurements } from '../utils/listPaneMeasurements';
import { createHiddenTagVisibility } from '../utils/tagPrefixMatcher';
import { getPropertyKeySet } from '../utils/vaultProfiles';
import { DateUtils } from '../utils/dateUtils';
import type { NavigateToFolderOptions, RevealPropertyOptions, RevealTagOptions } from '../hooks/useNavigatorReveal';
import type { FileItemPillDecorationModel } from '../utils/fileItemPillDecoration';
import { compositeWithBase } from '../utils/colorUtils';
import { runAsyncAction } from '../utils/async';
import { getPinnedSectionCollapseKey } from '../utils/selectionUtils';
import {
    applyManualSortMarkdownOrder,
    getManualSortPropertyValue,
    hasDenseManualSortOrder,
    hasCachedManualSortProperty,
    moveManualSortSelectionByDirection,
    orderManualSortFiles,
    writeManualSortOrder
} from '../utils/manualSort';
import { showNotice } from '../utils/noticeUtils';
import { getErrorMessage } from '../utils/errorUtils';
import { strings } from '../i18n';

/**
 * Renders the list pane displaying files from the selected folder.
 * Handles file sorting, grouping by date or folder, pinned notes, and auto-selection.
 * Integrates with the app context to manage file selection and navigation.
 *
 * @returns A scrollable list of files grouped by date or folder with empty state handling
 */
interface ExecuteSearchShortcutParams {
    searchShortcut: SearchShortcut;
}

export type { SelectFileOptions };

export interface ListPaneHandle {
    getIndexOfPath: (path: string) => number;
    virtualizer: Virtualizer<HTMLDivElement, Element> | null;
    scrollContainerRef: HTMLDivElement | null;
    selectFile: (file: TFile, options?: SelectFileOptions) => void;
    selectAdjacentFile: (direction: 'next' | 'previous') => boolean;
    modifySearchWithTag: (tag: string, operator: InclusionOperator, options?: SearchQueryUpdateOptions) => void;
    modifySearchWithProperty: (key: string, value: string | null, operator: InclusionOperator, options?: SearchQueryUpdateOptions) => void;
    modifySearchWithDateToken: (dateToken: string, options?: SearchQueryUpdateOptions) => void;
    toggleSearch: () => void;
    executeSearchShortcut: (params: ExecuteSearchShortcutParams) => Promise<void>;
}

interface ListPaneProps {
    /**
     * Reference to the root navigator container (.nn-split-container).
     * This is passed from NotebookNavigatorComponent to ensure keyboard events
     * are captured at the navigator level, not globally. This allows proper
     * keyboard navigation between panes while preventing interference with
     * other Obsidian views.
     */
    rootContainerRef: React.RefObject<HTMLDivElement | null>;
    /**
     * Optional resize handle props for dual-pane mode.
     * When provided, renders a resize handle overlay on the list pane boundary.
     */
    resizeHandleProps?: {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    };
    /**
     * Callback invoked whenever tag-related search tokens change.
     */
    onSearchTokensChange?: (state: SearchNavFilterState) => void;
    folderDecorationModel: FolderDecorationModel;
    fileItemPillDecorationModel: FileItemPillDecorationModel;
    onNavigateToFolder: (folderPath: string, options?: NavigateToFolderOptions) => void;
    onRevealTag: (tagPath: string, options?: RevealTagOptions) => void;
    onRevealProperty: (propertyNodeId: string, options?: RevealPropertyOptions) => boolean;
}

interface ManualSortState {
    propertyKey: string;
    order: string[] | null;
    isSaving: boolean;
    selectionKey: string;
    sessionId: number;
    saveId: number;
}

interface PropertyKeyboardReorderState {
    propertyKey: string;
    order: string[];
    isSaving: boolean;
    selectionKey: string;
    saveId: number;
}

function getManualSortFailureMessage(result: Awaited<ReturnType<typeof writeManualSortOrder>>): string {
    const firstFailure = result.failures[0];
    if (!firstFailure) {
        return strings.common.unknownError;
    }

    if (result.failed === 1) {
        return `${firstFailure.path}: ${firstFailure.message}`;
    }

    return strings.listPane.manualSortMultipleWriteFailure
        .replace('{count}', result.failed.toString())
        .replace('{path}', firstFailure.path)
        .replace('{message}', firstFailure.message);
}

interface ListPaneTitleChromeProps {
    onHeaderClick?: () => void;
    isSearchActive?: boolean;
    onSearchToggle?: () => void;
    onManualSortStart?: (propertyKey: string, initialFiles: TFile[]) => void;
    actionsDisabled?: boolean;
    shouldShowDesktopTitleArea: boolean;
    children: React.ReactNode;
}

function ListPaneTitleChrome({
    onHeaderClick,
    isSearchActive,
    onSearchToggle,
    onManualSortStart,
    actionsDisabled,
    shouldShowDesktopTitleArea,
    children
}: ListPaneTitleChromeProps) {
    const { desktopTitle, breadcrumbSegments, iconName, showIcon } = useListPaneTitle();
    return (
        <>
            <ListPaneHeader
                onHeaderClick={onHeaderClick}
                isSearchActive={isSearchActive}
                onSearchToggle={onSearchToggle}
                onManualSortStart={onManualSortStart}
                actionsDisabled={actionsDisabled}
                desktopTitle={desktopTitle}
                breadcrumbSegments={breadcrumbSegments}
                iconName={iconName}
                showIcon={showIcon}
            />
            {children}
            {shouldShowDesktopTitleArea ? <ListPaneTitleArea desktopTitle={desktopTitle} /> : null}
        </>
    );
}

export const ListPane = React.memo(
    forwardRef<ListPaneHandle, ListPaneProps>(function ListPane(props, ref) {
        const { app, isMobile, plugin } = useServices();
        const { onNavigateToFolder, onRevealTag, onRevealProperty, folderDecorationModel, fileItemPillDecorationModel } = props;
        const selectionState = useSelectionState();
        const selectionDispatch = useSelectionDispatch();
        const settings = useSettingsState();
        const activeProfile = useActiveProfile();
        const { fileNameIconNeedles } = useSettingsDerived();
        const uxPreferences = useUXPreferences();
        const includeDescendantNotes = uxPreferences.includeDescendantNotes;
        const showHiddenItems = uxPreferences.showHiddenItems;
        const showCalendar = uxPreferences.showCalendar;
        const appearanceSettings = useListPaneAppearance();
        const { getFileDisplayName, getDB, getFileTimestamps, hasPreview, regenerateFeatureImageForFile } = useFileCache();
        const { noteShortcutKeysByPath, addNoteShortcut, removeShortcut } = useShortcuts();
        const uiState = useUIState();
        const isVerticalDualPane = !uiState.singlePane && settings.dualPaneOrientation === 'vertical';
        const calendarPlacement = settings.calendarPlacement;
        const shouldRenderCalendarOverlay =
            settings.calendarEnabled && calendarPlacement === 'left-sidebar' && showCalendar && isVerticalDualPane;
        const listPaneRef = useRef<HTMLDivElement | null>(null);
        const hoverPointerClientPositionRef = useRef<PointerClientPosition | null>(null);
        // Android uses toolbar at top, iOS at bottom
        const isAndroid = Platform.isAndroidApp;
        /** Maps semi-transparent theme color variables to computed opaque equivalents (see constants/surfaceColorMappings). */
        const { color: listSurfaceColor, version: listSurfaceVersion } = useSurfaceColorVariables(listPaneRef, {
            app,
            rootContainerRef: props.rootContainerRef,
            variables: LIST_PANE_SURFACE_COLOR_MAPPINGS
        });
        const solidBackgroundCacheRef = useRef<Map<string, string | undefined>>(new Map());
        const [calendarWeekCount, setCalendarWeekCount] = useState<number>(() => settings.calendarWeeksToShow);
        const [isListScrolling, setIsListScrolling] = useState(false);
        const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);
        const [manualSortState, setManualSortState] = useState<ManualSortState | null>(null);
        const [propertyKeyboardReorderState, setPropertyKeyboardReorderState] = useState<PropertyKeyboardReorderState | null>(null);
        const manualSortSessionCounterRef = useRef(0);
        const manualSortSaveCounterRef = useRef(0);
        const propertyKeyboardReorderSaveCounterRef = useRef(0);
        const propertyKeyboardReorderSavingRef = useRef(false);
        const propertyKeyboardReorderScrollPathRef = useRef<string | null>(null);
        const addNoteShortcutRef = useRef(addNoteShortcut);
        const removeShortcutRef = useRef(removeShortcut);
        const listPaneTitle = settings.listPaneTitle ?? 'header';
        const shouldShowDesktopTitleArea = !isMobile && listPaneTitle === 'list';
        const listMeasurements = getListPaneMeasurements(isMobile);
        const topSpacerHeight = shouldShowDesktopTitleArea ? 0 : listMeasurements.topSpacer;
        const iconColumnStyle = useMemo(() => {
            if (settings.showFileIcons) {
                return undefined;
            }
            return {
                '--nn-file-icon-slot-width': '0px',
                '--nn-file-icon-slot-width-mobile': '0px',
                '--nn-file-icon-slot-gap': '0px'
            } as React.CSSProperties;
        }, [settings.showFileIcons]);
        const listPaneStyle = useMemo<CSSPropertiesWithVars>(() => {
            return {
                ...(iconColumnStyle ?? {}),
                '--nn-calendar-week-count': calendarWeekCount
            };
        }, [calendarWeekCount, iconColumnStyle]);

        useEffect(() => {
            if (settings.calendarWeeksToShow !== 6) {
                setCalendarWeekCount(settings.calendarWeeksToShow);
            }
        }, [settings.calendarWeeksToShow]);

        useEffect(() => {
            solidBackgroundCacheRef.current.clear();
        }, [listSurfaceColor, listSurfaceVersion]);

        const getSolidBackground = useMemo(() => {
            return (color?: string | null) => {
                void listSurfaceVersion;
                if (!color) {
                    return undefined;
                }
                const trimmed = color.trim();
                if (!trimmed) {
                    return undefined;
                }
                const cache = solidBackgroundCacheRef.current;
                if (cache.has(trimmed)) {
                    return cache.get(trimmed);
                }
                const pane = listPaneRef.current;
                const solidColor = compositeWithBase(listSurfaceColor, trimmed, { container: pane ?? null });
                cache.set(trimmed, solidColor);
                return solidColor;
            };
        }, [listSurfaceColor, listSurfaceVersion]);

        const shouldUseFloatingToolbars = isMobile && Platform.isIosApp && settings.useFloatingToolbars;
        const scrollPaddingEnd = useMemo(() => {
            if (!shouldUseFloatingToolbars) {
                return 0;
            }

            // Keep in sync with `--nn-ios-pane-bottom-overlay-height` in `src/styles/sections/platform-ios.css`.
            // The calendar overlay is outside the scroller, so it is intentionally not included here.
            return IOS_FLOATING_TOOLBAR_HEIGHT_PX;
        }, [shouldUseFloatingToolbars]);
        const ensureSelectionForCurrentFilterRef = useRef<((options?: EnsureSelectionOptions) => EnsureSelectionResult) | null>(null);
        const {
            isSearchActive,
            searchProvider,
            searchQuery,
            debouncedSearchQuery,
            debouncedSearchTokens,
            searchHighlightQuery,
            shouldFocusSearch,
            activeSearchShortcut,
            isSavingSearchShortcut,
            suppressSearchTopScrollRef,
            setSearchQuery,
            handleSearchToggle,
            closeSearch,
            focusSearchComplete,
            handleSaveSearchShortcut,
            handleRemoveSearchShortcut,
            modifySearchWithTag,
            modifySearchWithProperty,
            modifySearchWithDateToken,
            toggleSearch,
            executeSearchShortcut
        } = useListPaneSearch({
            rootContainerRef: props.rootContainerRef,
            onSearchTokensChange: props.onSearchTokensChange,
            onNavigateToFolder,
            onRevealTag,
            onRevealProperty,
            ensureSelectionForCurrentFilterRef
        });

        const { selectionType, selectedFolder, selectedTag, selectedProperty, selectedFile } = selectionState;
        const effectiveSortSpec = getEffectiveListSort(settings, selectionType, selectedFolder, selectedTag, selectedProperty);
        const effectiveSortOption = effectiveSortSpec.option;
        const effectivePropertySortKey = effectiveSortSpec.propertyKey.trim();
        const isPropertySortActive = getSortField(effectiveSortOption) === 'property';
        const manualSortSelectionKey = useMemo(() => {
            if (selectionType === ItemType.FOLDER && selectedFolder) {
                return `${selectionType}:${selectedFolder.path}`;
            }
            if (selectionType === ItemType.TAG && selectedTag) {
                return `${selectionType}:${selectedTag}`;
            }
            if (selectionType === ItemType.PROPERTY && selectedProperty) {
                return `${selectionType}:${selectedProperty}`;
            }
            return 'none';
        }, [selectedFolder, selectedProperty, selectedTag, selectionType]);
        const isManualSortActive = manualSortState !== null;
        const pinnedCollapseKey = getPinnedSectionCollapseKey({ selectionType, selectedFolder, selectedTag, selectedProperty });
        const pinnedGroupExpanded = settings.collapsedPinnedContexts[pinnedCollapseKey] !== true;
        const handlePinnedGroupHeaderToggle = React.useCallback(() => {
            runAsyncAction(() => plugin.togglePinnedGroupCollapsed(pinnedCollapseKey));
        }, [pinnedCollapseKey, plugin]);

        useEffect(() => {
            if (!manualSortState || manualSortState.selectionKey === manualSortSelectionKey) {
                return;
            }

            setManualSortState(null);
        }, [manualSortSelectionKey, manualSortState]);

        useEffect(() => {
            if (!propertyKeyboardReorderState) {
                return;
            }

            if (
                isManualSortActive ||
                isSearchActive ||
                !isPropertySortActive ||
                !effectivePropertySortKey ||
                propertyKeyboardReorderState.selectionKey !== manualSortSelectionKey ||
                propertyKeyboardReorderState.propertyKey !== effectivePropertySortKey
            ) {
                propertyKeyboardReorderSavingRef.current = false;
                propertyKeyboardReorderScrollPathRef.current = null;
                setPropertyKeyboardReorderState(null);
            }
        }, [
            effectivePropertySortKey,
            isManualSortActive,
            isPropertySortActive,
            isSearchActive,
            manualSortSelectionKey,
            propertyKeyboardReorderState
        ]);

        const propertySortOrderOverride =
            !isManualSortActive &&
            !isSearchActive &&
            propertyKeyboardReorderState?.selectionKey === manualSortSelectionKey &&
            propertyKeyboardReorderState.propertyKey === effectivePropertySortKey
                ? propertyKeyboardReorderState.order
                : null;

        const effectiveGroupBy = isManualSortActive || isPropertySortActive ? 'none' : appearanceSettings.groupBy;
        const effectiveAppearanceSettings = useMemo(
            () =>
                effectiveGroupBy === appearanceSettings.groupBy ? appearanceSettings : { ...appearanceSettings, groupBy: effectiveGroupBy },
            [appearanceSettings, effectiveGroupBy]
        );

        const saveManualSortFiles = React.useCallback(
            (filesToWrite: TFile[], propertyKey: string, onComplete: (hasFailure: boolean) => void) => {
                runAsyncAction(async () => {
                    let hasFailure = false;
                    try {
                        const result = await writeManualSortOrder(app, filesToWrite, propertyKey);
                        if (result.failed > 0) {
                            hasFailure = true;
                            showNotice(
                                strings.dragDrop.errors.failedToSetProperty.replace('{error}', getManualSortFailureMessage(result)),
                                { variant: 'warning' }
                            );
                        }
                    } catch (error) {
                        hasFailure = true;
                        showNotice(
                            strings.dragDrop.errors.failedToSetProperty.replace(
                                '{error}',
                                getErrorMessage(error, strings.common.unknownError)
                            ),
                            { variant: 'warning' }
                        );
                    } finally {
                        onComplete(hasFailure);
                    }
                });
            },
            [app]
        );

        const saveManualSortOrder = React.useCallback(
            (filesToWrite: TFile[], propertyKey: string, selectionKey: string, sessionId: number, saveId: number) => {
                saveManualSortFiles(filesToWrite, propertyKey, shouldResetOptimisticOrder => {
                    setManualSortState(current => {
                        if (
                            !current ||
                            current.propertyKey !== propertyKey ||
                            current.selectionKey !== selectionKey ||
                            current.sessionId !== sessionId ||
                            current.saveId !== saveId
                        ) {
                            return current;
                        }
                        return { ...current, order: shouldResetOptimisticOrder ? null : current.order, isSaving: false };
                    });
                });
            },
            [saveManualSortFiles]
        );

        const savePropertyKeyboardReorder = React.useCallback(
            (filesToWrite: TFile[], propertyKey: string, selectionKey: string, saveId: number) => {
                saveManualSortFiles(filesToWrite, propertyKey, shouldClearOptimisticOrder => {
                    if (propertyKeyboardReorderSaveCounterRef.current === saveId) {
                        propertyKeyboardReorderSavingRef.current = false;
                    }
                    setPropertyKeyboardReorderState(current => {
                        if (
                            !current ||
                            current.propertyKey !== propertyKey ||
                            current.selectionKey !== selectionKey ||
                            current.saveId !== saveId
                        ) {
                            return current;
                        }
                        return shouldClearOptimisticOrder ? null : { ...current, isSaving: false };
                    });
                });
            },
            [saveManualSortFiles]
        );

        const handleManualSortStart = React.useCallback(
            (propertyKey: string, initialFiles: TFile[]) => {
                const sessionId = manualSortSessionCounterRef.current + 1;
                manualSortSessionCounterRef.current = sessionId;
                const saveId = manualSortSaveCounterRef.current + 1;
                manualSortSaveCounterRef.current = saveId;
                const selectionKey = manualSortSelectionKey;
                const orderedInitialFiles = orderManualSortFiles(initialFiles);
                const initialOrder = orderedInitialFiles.filter(file => file.extension === 'md').map(file => file.path);
                closeSearch();
                setManualSortState({
                    propertyKey,
                    order: initialOrder,
                    isSaving: true,
                    selectionKey,
                    sessionId,
                    saveId
                });
                saveManualSortOrder(orderedInitialFiles, propertyKey, selectionKey, sessionId, saveId);
            },
            [closeSearch, manualSortSelectionKey, saveManualSortOrder]
        );

        // Determine if list pane is visible early to optimize
        const isVisible = !uiState.singlePane || uiState.currentSinglePaneView === 'files';

        // Use the new data hook
        const { listItems, orderedFiles, orderedFileIndexMap, filePathToIndex, files, hiddenFileState, localDayKey } = useListPaneData({
            selectionType,
            selectedFolder,
            selectedTag,
            selectedProperty,
            settings,
            activeProfile,
            groupBy: effectiveAppearanceSettings.groupBy,
            pinnedGroupExpanded,
            searchProvider,
            // Use debounced value for filtering
            searchQuery: !isManualSortActive && isSearchActive ? debouncedSearchQuery : undefined,
            searchTokens: !isManualSortActive && isSearchActive ? debouncedSearchTokens : undefined,
            visibility: { includeDescendantNotes, showHiddenItems },
            propertySortOrderOverride
        });
        const listStartsWithGroupHeader =
            listItems[0]?.type === ListPaneItemType.TOP_SPACER && listItems[1]?.type === ListPaneItemType.HEADER;
        const effectiveTopSpacerHeight = settings.stickyGroupHeaders && listStartsWithGroupHeader ? 0 : topSpacerHeight;
        const localDayReference = useMemo(() => DateUtils.parseLocalDayKey(localDayKey), [localDayKey]);

        useEffect(() => {
            if (!propertyKeyboardReorderState || propertyKeyboardReorderState.isSaving) {
                return;
            }

            const writtenPathSet = new Set(propertyKeyboardReorderState.order);
            const writtenFiles = files.filter(file => writtenPathSet.has(file.path));
            const markdownOrder = writtenFiles.filter(file => file.extension === 'md').map(file => file.path);
            const isSameWrittenOrder =
                markdownOrder.length === propertyKeyboardReorderState.order.length &&
                markdownOrder.every((path, index) => path === propertyKeyboardReorderState.order[index]);

            if (!isSameWrittenOrder) {
                setPropertyKeyboardReorderState(current =>
                    current && current.saveId === propertyKeyboardReorderState.saveId ? null : current
                );
                return;
            }

            if (!hasDenseManualSortOrder(app, writtenFiles, propertyKeyboardReorderState.propertyKey)) {
                return;
            }

            setPropertyKeyboardReorderState(current =>
                current && current.saveId === propertyKeyboardReorderState.saveId && !current.isSaving ? null : current
            );
        }, [app, files, propertyKeyboardReorderState]);

        // Determine the target folder path for drag-and-drop of external files
        const activeFolderDropPath = useMemo(() => {
            if (selectionType !== 'folder' || !selectedFolder) {
                return null;
            }
            return selectedFolder.path;
        }, [selectionType, selectedFolder]);
        const { visibleListPropertyKeys, visibleNavigationPropertyKeys } = useMemo(() => {
            return {
                visibleListPropertyKeys: getPropertyKeySet(activeProfile.propertyKeys, 'list'),
                visibleNavigationPropertyKeys: getPropertyKeySet(activeProfile.propertyKeys, 'navigation')
            };
        }, [activeProfile.propertyKeys]);
        const fileItemStorage = useMemo<FileItemStorageHelpers>(
            () => ({
                getFileDisplayName,
                getDB,
                getFileTimestamps,
                hasPreview,
                regenerateFeatureImageForFile
            }),
            [getFileDisplayName, getDB, getFileTimestamps, hasPreview, regenerateFeatureImageForFile]
        );
        const hiddenTagVisibility = useMemo(
            () => createHiddenTagVisibility(activeProfile.hiddenTags, showHiddenItems),
            [activeProfile.hiddenTags, showHiddenItems]
        );
        const syncHoveredFilePathToPointer = React.useCallback((scrollElement: HTMLDivElement | null) => {
            const nextHoveredFilePath = getHoveredFilePathAtPointer(scrollElement, hoverPointerClientPositionRef.current);
            setHoveredFilePath(previous => (previous === nextHoveredFilePath ? previous : nextHoveredFilePath));
        }, []);
        const handleVirtualizerScrollingChange = React.useCallback(
            (isScrolling: boolean, scrollElement: HTMLDivElement | null) => {
                if (isScrolling) {
                    setIsListScrolling(previous => (previous ? previous : true));
                    setHoveredFilePath(previous => (previous === null ? previous : null));
                    return;
                }

                syncHoveredFilePathToPointer(scrollElement);
                setIsListScrolling(false);
            },
            [syncHoveredFilePathToPointer]
        );
        const visibleListPropertyKeySignature = useMemo(() => {
            if (visibleListPropertyKeys.size === 0) {
                return '';
            }

            const sortedKeys = Array.from(visibleListPropertyKeys);
            sortedKeys.sort();
            return sortedKeys.join('\u0001');
        }, [visibleListPropertyKeys]);

        // Use the new scroll hook
        const { rowVirtualizer, scrollContainerRef, scrollContainerRefCallback, handleScrollToTop, scrollToIndexSafely } =
            useListPaneScroll({
                enabled: !isManualSortActive,
                listItems,
                filePathToIndex,
                selectedFile,
                selectedFolder,
                selectedTag,
                selectedProperty,
                settings,
                folderSettings: effectiveAppearanceSettings,
                isVisible,
                selectionState,
                selectionDispatch,
                // Use debounced value for scroll orchestration to align with filtering
                searchQuery: !isManualSortActive && isSearchActive ? debouncedSearchQuery : undefined,
                suppressSearchTopScrollRef,
                topSpacerHeight: effectiveTopSpacerHeight,
                includeDescendantNotes,
                pinnedGroupExpanded,
                visiblePropertyKeys: visibleListPropertyKeys,
                visiblePropertyKeySignature: visibleListPropertyKeySignature,
                hiddenTagVisibility,
                scrollMargin: 0,
                scrollPaddingEnd,
                onVirtualizerScrollingChange: handleVirtualizerScrollingChange
            });

        const prevCalendarOverlayVisibleRef = useRef<boolean>(shouldRenderCalendarOverlay);
        const prevCalendarWeekCountRef = useRef<number>(calendarWeekCount);

        useEffect(() => {
            const wasVisible = prevCalendarOverlayVisibleRef.current;
            const prevWeekCount = prevCalendarWeekCountRef.current;

            const becameVisible = shouldRenderCalendarOverlay && !wasVisible;
            const weekCountChanged = shouldRenderCalendarOverlay && calendarWeekCount !== prevWeekCount;

            prevCalendarOverlayVisibleRef.current = shouldRenderCalendarOverlay;
            prevCalendarWeekCountRef.current = calendarWeekCount;

            if (!becameVisible && !weekCountChanged) {
                return;
            }

            if (!selectedFile) {
                return;
            }

            const index = filePathToIndex.get(selectedFile.path);
            if (index === undefined) {
                return;
            }

            const scheduleScroll = () => scrollToIndexSafely(index, 'auto');

            if (typeof requestAnimationFrame !== 'undefined') {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(scheduleScroll);
                });
                return;
            }

            window.setTimeout(scheduleScroll, 0);
        }, [calendarWeekCount, filePathToIndex, scrollToIndexSafely, selectedFile, shouldRenderCalendarOverlay]);

        const listToolbar = useMemo(() => {
            return (
                <ListToolbar
                    isSearchActive={isSearchActive}
                    onSearchToggle={handleSearchToggle}
                    onManualSortStart={handleManualSortStart}
                    useFloatingLayout={shouldUseFloatingToolbars}
                />
            );
        }, [handleManualSortStart, handleSearchToggle, isSearchActive, shouldUseFloatingToolbars]);

        const handleHoveredFilePathChange = React.useCallback(
            (path: string | null, pointerClientPosition: PointerClientPosition | null) => {
                hoverPointerClientPositionRef.current = pointerClientPosition;
                setHoveredFilePath(previous => (previous === path ? previous : path));
            },
            []
        );

        useLayoutEffect(() => {
            if (isListScrolling) {
                return;
            }

            syncHoveredFilePathToPointer(scrollContainerRef.current);
        }, [isListScrolling, listItems, scrollContainerRef, syncHoveredFilePathToPointer]);

        useEffect(() => {
            addNoteShortcutRef.current = addNoteShortcut;
            removeShortcutRef.current = removeShortcut;
        }, [addNoteShortcut, removeShortcut]);

        // Attach context menu to empty areas in the list pane for file creation
        useContextMenu(scrollContainerRef, { type: EMPTY_LIST_MENU_TYPE, item: selectedFolder ?? null });

        // Check if we're in compact mode
        const isCompactMode = !appearanceSettings.showDate && !appearanceSettings.showPreview && !appearanceSettings.showImage;
        const {
            selectFileFromList,
            selectAdjacentFile,
            ensureSelectionForCurrentFilter,
            handleFileItemClick,
            lastSelectedFilePath,
            isFileSelected,
            scheduleKeyboardSelectionOpen,
            scheduleKeyboardSelectionOpenForFile,
            commitPendingKeyboardSelectionOpen
        } = useListPaneSelectionCoordinator({
            rootContainerRef: props.rootContainerRef,
            orderedFiles,
            filePathToIndex,
            scrollToIndexSafely
        });
        ensureSelectionForCurrentFilterRef.current = ensureSelectionForCurrentFilter;
        const toggleNoteShortcut = React.useCallback(async (file: TFile, shortcutKey: string | undefined) => {
            if (shortcutKey) {
                await removeShortcutRef.current(shortcutKey);
                return;
            }

            await addNoteShortcutRef.current(file.path);
        }, []);

        const manualSortPropertyKey = manualSortState?.propertyKey ?? '';
        const propertySortedManualFiles = useMemo(() => {
            if (!manualSortPropertyKey) {
                return files;
            }

            // Manual sort edits the full visible order, including temporarily pinned notes.
            // The saved numeric order is independent of the normal pinned partition.
            const sortedFiles = [...files];
            const propertyValueByPath = new Map<string, string | null>();
            const getCachedManualSortPropertyValue = (file: TFile): string | null => {
                if (propertyValueByPath.has(file.path)) {
                    return propertyValueByPath.get(file.path) ?? null;
                }

                const value = getManualSortPropertyValue(app, file, manualSortPropertyKey);
                propertyValueByPath.set(file.path, value);
                return value;
            };
            sortFiles(
                sortedFiles,
                'property-asc',
                file => getFileTimestamps(file).created,
                file => getFileTimestamps(file).modified,
                getFileDisplayName,
                getCachedManualSortPropertyValue,
                settings.propertySortSecondary
            );
            return sortedFiles;
        }, [app, files, getFileDisplayName, getFileTimestamps, manualSortPropertyKey, settings.propertySortSecondary]);

        const manualSortFiles = useMemo(() => {
            const order = manualSortState?.order;
            if (!order) {
                return propertySortedManualFiles;
            }

            return applyManualSortMarkdownOrder(propertySortedManualFiles, order);
        }, [manualSortState?.order, propertySortedManualFiles]);
        const manualSortRankedMarkdownPaths = useMemo(() => {
            const rankedPaths = new Set<string>();
            if (!manualSortPropertyKey) {
                return rankedPaths;
            }

            const orderedPaths = manualSortState?.order ? new Set(manualSortState.order) : null;
            manualSortFiles.forEach(file => {
                if (file.extension !== 'md') {
                    return;
                }

                if (orderedPaths?.has(file.path) || hasCachedManualSortProperty(app, file, manualSortPropertyKey)) {
                    rankedPaths.add(file.path);
                }
            });

            return rankedPaths;
        }, [app, manualSortFiles, manualSortPropertyKey, manualSortState?.order]);
        const isManualSortDoneDisabled = Boolean(manualSortState?.isSaving);
        const handleManualSortDone = React.useCallback(() => {
            if (!manualSortState || isManualSortDoneDisabled) {
                return;
            }

            setManualSortState(null);
        }, [isManualSortDoneDisabled, manualSortState]);
        const handleManualSortReorder = React.useCallback(
            (nextFiles: TFile[]) => {
                if (!manualSortState?.propertyKey) {
                    return;
                }

                const { propertyKey, selectionKey, sessionId } = manualSortState;
                const saveId = manualSortSaveCounterRef.current + 1;
                manualSortSaveCounterRef.current = saveId;
                const orderedFilesToWrite = orderManualSortFiles(nextFiles);
                const nextOrder = orderedFilesToWrite.filter(file => file.extension === 'md').map(file => file.path);
                setManualSortState(current =>
                    current && current.sessionId === sessionId ? { ...current, order: nextOrder, isSaving: true, saveId } : current
                );
                saveManualSortOrder(orderedFilesToWrite, propertyKey, selectionKey, sessionId, saveId);
            },
            [manualSortState, saveManualSortOrder]
        );
        const handleManualSortFileClick = React.useCallback(
            (file: TFile, fileIndex: number | undefined, event: React.MouseEvent) => {
                handleFileItemClick(file, fileIndex, event, manualSortFiles);
            },
            [handleFileItemClick, manualSortFiles]
        );
        const getPropertyKeyboardReorderScopeFiles = React.useCallback(
            (activePath: string | null): TFile[] => {
                if (!activePath) {
                    return [];
                }

                const activeItem = listItems.find(
                    item => item.type === ListPaneItemType.FILE && item.data instanceof TFile && item.data.path === activePath
                );
                if (!activeItem || !(activeItem.data instanceof TFile)) {
                    return [];
                }

                const activePinnedState = Boolean(activeItem.isPinned);
                return listItems.flatMap(item => {
                    if (item.type !== ListPaneItemType.FILE || !(item.data instanceof TFile)) {
                        return [];
                    }
                    if (Boolean(item.isPinned) !== activePinnedState) {
                        return [];
                    }
                    return [item.data];
                });
            },
            [listItems]
        );
        const handlePropertyKeyboardReorder = React.useCallback(
            (direction: 'up' | 'down') => {
                if (isManualSortActive || isSearchActive || !isPropertySortActive || !effectivePropertySortKey) {
                    return false;
                }

                if (propertyKeyboardReorderSavingRef.current) {
                    return true;
                }

                const activePath = selectedFile?.path ?? null;
                const reorderScopeFiles = getPropertyKeyboardReorderScopeFiles(activePath);
                const result = moveManualSortSelectionByDirection(reorderScopeFiles, activePath, selectionState.selectedFiles, direction);
                if (!result) {
                    return true;
                }

                const saveId = propertyKeyboardReorderSaveCounterRef.current + 1;
                propertyKeyboardReorderSaveCounterRef.current = saveId;
                propertyKeyboardReorderSavingRef.current = true;
                propertyKeyboardReorderScrollPathRef.current = result.scrollPath;

                const reorderScopePaths = new Set(reorderScopeFiles.map(file => file.path));
                let resultFileIndex = 0;
                const nextOrderedFiles = orderedFiles.map(file => {
                    if (!reorderScopePaths.has(file.path)) {
                        return file;
                    }

                    const resultFile = result.files[resultFileIndex];
                    resultFileIndex += 1;
                    return resultFile ?? file;
                });
                const orderedFilesToWrite = orderManualSortFiles(nextOrderedFiles);
                const nextOrder = orderedFilesToWrite.filter(file => file.extension === 'md').map(file => file.path);
                setPropertyKeyboardReorderState({
                    propertyKey: effectivePropertySortKey,
                    order: nextOrder,
                    isSaving: true,
                    selectionKey: manualSortSelectionKey,
                    saveId
                });
                savePropertyKeyboardReorder(orderedFilesToWrite, effectivePropertySortKey, manualSortSelectionKey, saveId);
                return true;
            },
            [
                effectivePropertySortKey,
                isManualSortActive,
                isPropertySortActive,
                isSearchActive,
                getPropertyKeyboardReorderScopeFiles,
                manualSortSelectionKey,
                orderedFiles,
                savePropertyKeyboardReorder,
                selectedFile,
                selectionState.selectedFiles
            ]
        );

        useEffect(() => {
            const scrollPath = propertyKeyboardReorderScrollPathRef.current;
            if (!scrollPath) {
                return;
            }

            const index = filePathToIndex.get(scrollPath);
            if (index === undefined) {
                return;
            }

            propertyKeyboardReorderScrollPathRef.current = null;
            scrollToIndexSafely(index, 'auto');
        }, [filePathToIndex, propertyKeyboardReorderState?.order, scrollToIndexSafely]);

        // Expose the virtualizer instance and file lookup method via the ref
        useImperativeHandle(
            ref,
            () => ({
                getIndexOfPath: (path: string) => filePathToIndex.get(path) ?? -1,
                virtualizer: rowVirtualizer,
                scrollContainerRef: scrollContainerRef.current,
                // Allow parent components to trigger file selection programmatically
                selectFile: selectFileFromList,
                // Provide imperative adjacent navigation for command handlers
                selectAdjacentFile,
                // Toggle or modify search query to include/exclude a tag with AND/OR operator
                modifySearchWithTag,
                // Toggle or modify search query to include/exclude a property with AND/OR operator
                modifySearchWithProperty,
                // Replace the active search query with a date token
                modifySearchWithDateToken,
                // Toggle search mode on/off or focus existing search
                toggleSearch,
                executeSearchShortcut
            }),
            [
                filePathToIndex,
                rowVirtualizer,
                scrollContainerRef,
                toggleSearch,
                executeSearchShortcut,
                selectFileFromList,
                selectAdjacentFile,
                modifySearchWithTag,
                modifySearchWithProperty,
                modifySearchWithDateToken
            ]
        );

        // Add keyboard navigation
        // Note: We pass the root container ref, not the scroll container ref.
        // This ensures keyboard events work across the entire navigator, allowing
        // users to navigate between panes (navigation <-> files) with Tab/Arrow keys.
        useListPaneKeyboard({
            enabled: !isManualSortActive,
            items: listItems,
            virtualizer: rowVirtualizer,
            containerRef: props.rootContainerRef,
            pathToIndex: filePathToIndex,
            orderedFiles,
            orderedFileIndexMap,
            scrollToIndexSafely,
            onSelectFile: (file, options) =>
                selectFileFromList(file, {
                    markKeyboardNavigation: true,
                    suppressOpen: settings.enterToOpenFiles || options?.suppressOpen,
                    debounceOpen: options?.debounceOpen
                }),
            onScheduleKeyboardOpen: scheduleKeyboardSelectionOpen,
            onScheduleKeyboardOpenForFile: scheduleKeyboardSelectionOpenForFile,
            onCommitKeyboardOpen: commitPendingKeyboardSelectionOpen,
            onReorderPropertySort: handlePropertyKeyboardReorder
        });

        // Determine if we're showing empty state
        const isEmptySelection = !selectedFolder && !selectedTag && !selectedProperty;
        const hasNoFiles = files.length === 0;

        const shouldRenderBottomToolbar = isMobile && !isAndroid;
        const shouldRenderBottomToolbarInsidePanel = shouldRenderBottomToolbar && shouldUseFloatingToolbars;
        const shouldRenderBottomToolbarOutsidePanel = shouldRenderBottomToolbar && !shouldUseFloatingToolbars;

        // Single return with conditional content
        return (
            <div
                ref={listPaneRef}
                className={`nn-list-pane ${isSearchActive ? 'nn-search-active' : ''}`}
                style={listPaneStyle}
                data-calendar={shouldRenderCalendarOverlay ? 'true' : undefined}
            >
                {props.resizeHandleProps && <div className="nn-resize-handle" {...props.resizeHandleProps} />}
                <div className="nn-list-pane-chrome">
                    <ListPaneTitleChrome
                        onHeaderClick={handleScrollToTop}
                        isSearchActive={isSearchActive}
                        onSearchToggle={handleSearchToggle}
                        onManualSortStart={handleManualSortStart}
                        actionsDisabled={isManualSortActive}
                        shouldShowDesktopTitleArea={shouldShowDesktopTitleArea}
                    >
                        {/* Android - toolbar at top */}
                        {isMobile && isAndroid && !manualSortState ? listToolbar : null}
                        {/* Search bar - collapsible */}
                        <div className={`nn-search-bar-container ${isSearchActive ? 'nn-search-bar-visible' : ''}`}>
                            {isSearchActive && (
                                <SearchInput
                                    searchQuery={searchQuery}
                                    onSearchQueryChange={setSearchQuery}
                                    shouldFocus={shouldFocusSearch}
                                    onFocusComplete={focusSearchComplete}
                                    onClose={closeSearch}
                                    onFocusFiles={() => {
                                        // Ensure selection exists when focusing list from search (no editor open)
                                        ensureSelectionForCurrentFilter({ openInEditor: false });
                                    }}
                                    containerRef={props.rootContainerRef}
                                    onSaveShortcut={!activeSearchShortcut ? handleSaveSearchShortcut : undefined}
                                    onRemoveShortcut={activeSearchShortcut ? handleRemoveSearchShortcut : undefined}
                                    isShortcutSaved={Boolean(activeSearchShortcut)}
                                    isShortcutDisabled={isSavingSearchShortcut}
                                    searchProvider={searchProvider}
                                />
                            )}
                        </div>
                    </ListPaneTitleChrome>
                </div>
                <div className="nn-list-pane-panel">
                    {manualSortState ? (
                        <ManualSortListContent
                            files={manualSortFiles}
                            listItems={listItems}
                            hiddenFileState={hiddenFileState}
                            propertyKey={manualSortState.propertyKey}
                            rankedMarkdownPaths={manualSortRankedMarkdownPaths}
                            selectedFolderPath={selectedFolder?.path ?? null}
                            isSaving={manualSortState.isSaving}
                            isDoneDisabled={isManualSortDoneDisabled}
                            settings={settings}
                            selectionType={selectionType}
                            sortOption={effectiveSortOption}
                            localDayReference={localDayReference}
                            fileIconSize={listMeasurements.fileIconSize}
                            appearanceSettings={effectiveAppearanceSettings}
                            includeDescendantNotes={includeDescendantNotes}
                            hiddenTagVisibility={hiddenTagVisibility}
                            fileNameIconNeedles={fileNameIconNeedles}
                            visibleListPropertyKeys={visibleListPropertyKeys}
                            visibleNavigationPropertyKeys={visibleNavigationPropertyKeys}
                            fileItemStorage={fileItemStorage}
                            noteShortcutKeysByPath={noteShortcutKeysByPath}
                            folderDecorationModel={folderDecorationModel}
                            fileItemPillDecorationModel={fileItemPillDecorationModel}
                            getSolidBackground={getSolidBackground}
                            selectedFiles={selectionState.selectedFiles}
                            onFileClick={handleManualSortFileClick}
                            onDone={handleManualSortDone}
                            onReorder={handleManualSortReorder}
                        />
                    ) : (
                        <ListPaneVirtualContent
                            listItems={listItems}
                            rowVirtualizer={rowVirtualizer}
                            scrollContainerRefCallback={scrollContainerRefCallback}
                            activeFolderDropPath={activeFolderDropPath}
                            isCompactMode={isCompactMode}
                            isEmptySelection={isEmptySelection}
                            hasNoFiles={hasNoFiles}
                            topSpacerHeight={effectiveTopSpacerHeight}
                            settings={settings}
                            pinnedGroupExpanded={pinnedGroupExpanded}
                            onPinnedGroupHeaderToggle={handlePinnedGroupHeaderToggle}
                            selectionType={selectionType}
                            sortOption={effectiveSortOption}
                            searchHighlightQuery={searchHighlightQuery}
                            isFolderNavigation={selectionState.isFolderNavigation}
                            lastSelectedFilePath={lastSelectedFilePath}
                            isFileSelected={isFileSelected}
                            hoveredFilePath={hoveredFilePath}
                            suppressRowHover={isListScrolling}
                            onHoveredFilePathChange={handleHoveredFilePathChange}
                            onFileClick={handleFileItemClick}
                            onModifySearchWithTag={modifySearchWithTag}
                            onModifySearchWithProperty={modifySearchWithProperty}
                            localDayReference={localDayReference}
                            fileIconSize={listMeasurements.fileIconSize}
                            appearanceSettings={effectiveAppearanceSettings}
                            includeDescendantNotes={includeDescendantNotes}
                            hiddenTagVisibility={hiddenTagVisibility}
                            fileNameIconNeedles={fileNameIconNeedles}
                            visibleListPropertyKeys={visibleListPropertyKeys}
                            visibleNavigationPropertyKeys={visibleNavigationPropertyKeys}
                            fileItemStorage={fileItemStorage}
                            noteShortcutKeysByPath={noteShortcutKeysByPath}
                            onToggleNoteShortcut={toggleNoteShortcut}
                            onNavigateToFolder={onNavigateToFolder}
                            folderDecorationModel={folderDecorationModel}
                            fileItemPillDecorationModel={fileItemPillDecorationModel}
                            getSolidBackground={getSolidBackground}
                        />
                    )}
                    {/* iOS: keep the floating toolbar inside the panel */}
                    {shouldRenderBottomToolbarInsidePanel && !manualSortState ? (
                        <div className="nn-pane-bottom-toolbar">{listToolbar}</div>
                    ) : null}
                </div>
                {shouldRenderCalendarOverlay ? (
                    <div className="nn-navigation-calendar-overlay">
                        <Calendar onWeekCountChange={setCalendarWeekCount} onAddDateFilter={modifySearchWithDateToken} />
                    </div>
                ) : null}
                {shouldRenderBottomToolbarOutsidePanel && !manualSortState ? (
                    <div className="nn-pane-bottom-toolbar">{listToolbar}</div>
                ) : null}
            </div>
        );
    })
);
