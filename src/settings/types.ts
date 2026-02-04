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

import type { FileVisibility } from '../utils/fileTypeUtils';
import type { FolderAppearance, TagAppearance } from '../hooks/useListPaneAppearance';
import type { BackgroundMode, DualPaneOrientation, PinnedNotes } from '../types';
import type { FolderNoteCreationPreference } from '../types/folderNote';
import type { KeyboardShortcutConfig } from '../utils/keyboardShortcuts';
import type { ShortcutEntry, ShortcutCollection } from '../types/shortcuts';
import type { SearchProvider } from '../types/search';

export type SettingSyncMode = 'local' | 'synced';

export function isSettingSyncMode(value: unknown): value is SettingSyncMode {
    return value === 'local' || value === 'synced';
}

/** Identifiers for settings that can be switched between synced and local storage. */
export const SYNC_MODE_SETTING_IDS = [
    'vaultProfile',
    'folderSortOrder',
    'tagSortOrder',
    'searchProvider',
    'includeDescendantNotes',
    'useFloatingToolbars',
    'dualPane',
    'dualPaneOrientation',
    'paneTransitionDuration',
    'toolbarVisibility',
    'pinNavigationBanner',
    'navIndent',
    'navItemHeight',
    'navItemHeightScaleText',
    'calendarPlacement',
    'calendarWeeksToShow',
    'compactItemHeight',
    'compactItemHeightScaleText',
    'uiScale'
] as const;

export type SyncModeSettingId = (typeof SYNC_MODE_SETTING_IDS)[number];

/** Available sort options for file listing */
export type SortOption =
    | 'modified-desc'
    | 'modified-asc'
    | 'created-desc'
    | 'created-asc'
    | 'title-asc'
    | 'title-desc'
    | 'filename-asc'
    | 'filename-desc'
    | 'property-asc'
    | 'property-desc';

/** Ordered list of sort options for validation and UI choices */
export const SORT_OPTIONS: SortOption[] = [
    'modified-desc',
    'modified-asc',
    'created-desc',
    'created-asc',
    'title-asc',
    'title-desc',
    'filename-asc',
    'filename-desc',
    'property-asc',
    'property-desc'
];

/** Type guard for validating sort option values */
export function isSortOption(value: unknown): value is SortOption {
    return typeof value === 'string' && SORT_OPTIONS.includes(value as SortOption);
}

/** Alphabetical ordering options used by navigation trees. */
export type AlphaSortOrder = 'alpha-asc' | 'alpha-desc';

export function isAlphaSortOrder(value: unknown): value is AlphaSortOrder {
    return value === 'alpha-asc' || value === 'alpha-desc';
}

/** Available orderings for tags in the navigation pane */
export type TagSortOrder = 'alpha-asc' | 'alpha-desc' | 'frequency-asc' | 'frequency-desc';

/** Type guard for validating tag sort order values */
export function isTagSortOrder(value: string): value is TagSortOrder {
    return value === 'alpha-asc' || value === 'alpha-desc' || value === 'frequency-asc' || value === 'frequency-desc';
}

/** Scope of items that button actions affect */
export type ItemScope = 'all' | 'folders-only' | 'tags-only';

/** Modifier key used for multi-select operations */
export type MultiSelectModifier = 'cmdCtrl' | 'optionAlt';

/** Workspace context used when opening a file in a new leaf. */
export type FileOpenContext = 'tab' | 'split' | 'window';

/** Display options for vault title */
export type VaultTitleOption = 'header' | 'navigation';

/** Display options for list pane title */
export type ListPaneTitleOption = 'header' | 'list' | 'hidden';

/** Display options for shortcut row badges in the navigation pane */
export type ShortcutBadgeDisplayMode = 'index' | 'count' | 'none';

/** Number of calendar week rows shown in the navigation pane */
export type CalendarWeeksToShow = 1 | 2 | 3 | 4 | 5 | 6;

/** Where the calendar is shown in the navigator UI. */
export type CalendarPlacement = 'left-sidebar' | 'right-sidebar';

export function isCalendarPlacement(value: unknown): value is CalendarPlacement {
    return value === 'left-sidebar' || value === 'right-sidebar';
}

/** Which days are highlighted as weekend days in the calendar UI. */
export type CalendarWeekendDays = 'none' | 'sat-sun' | 'fri-sat' | 'thu-fri';

export function isCalendarWeekendDays(value: unknown): value is CalendarWeekendDays {
    return value === 'none' || value === 'sat-sun' || value === 'fri-sat' || value === 'thu-fri';
}

/** Source used for calendar notes in the navigation pane */
export type CalendarIntegrationMode = 'daily-notes' | 'notebook-navigator';

/** Default display modes for list items */
export type ListDisplayMode = 'standard' | 'compact';

/** Grouping options for list pane notes */
export type ListNoteGroupingOption = 'none' | 'date' | 'folder';

/** Date source to display when alphabetical sorting is active */
export type AlphabeticalDateMode = 'created' | 'modified';

/** Available custom property types displayed in file items */
export type CustomPropertyType = 'none' | 'frontmatter' | 'wordCount';

/** Type guard for validating custom property type values */
export function isCustomPropertyType(value: string): value is CustomPropertyType {
    return value === 'none' || value === 'frontmatter' || value === 'wordCount';
}

/** Buttons available in the navigation toolbar */
export type NavigationToolbarButtonId = 'toggleDualPane' | 'expandCollapse' | 'calendar' | 'hiddenItems' | 'rootReorder' | 'newFolder';

/** Buttons available in the list toolbar */
export type ListToolbarButtonId = 'back' | 'search' | 'descendants' | 'sort' | 'appearance' | 'newNote';

/** Visibility toggles for toolbar buttons */
export interface ToolbarVisibilitySettings {
    navigation: Record<NavigationToolbarButtonId, boolean>;
    list: Record<ListToolbarButtonId, boolean>;
}

/** Vault profile storing per-profile filtering and layout preferences */
export interface VaultProfile {
    id: string;
    name: string;
    fileVisibility: FileVisibility;
    hiddenFolders: string[];
    hiddenTags: string[];
    hiddenFileNames: string[];
    hiddenFileTags: string[];
    hiddenFileProperties: string[];
    navigationBanner: string | null;
    periodicNotesFolder: string;
    shortcuts: ShortcutEntry[];
}

/**
 * Plugin settings interface defining all configurable options
 * Settings are organized by tab for easier maintenance
 */
export interface NotebookNavigatorSettings {
    vaultProfiles: VaultProfile[];
    vaultProfile: string;
    vaultTitle: VaultTitleOption;
    syncModes: Record<SyncModeSettingId, SettingSyncMode>;

    // General tab - Behavior
    autoRevealActiveFile: boolean;
    autoRevealIgnoreRightSidebar: boolean;
    paneTransitionDuration: number;

    // General tab - Keyboard navigation
    multiSelectModifier: MultiSelectModifier;
    enterToOpenFiles: boolean;
    shiftEnterOpenContext: FileOpenContext;
    cmdCtrlEnterOpenContext: FileOpenContext;

    // General tab - View
    startView: 'navigation' | 'files';
    interfaceIcons: Record<string, string>;

    // General tab - Homepage
    homepage: string | null;
    mobileHomepage: string | null;
    useMobileHomepage: boolean;

    // General tab - Desktop appearance
    dualPane: boolean;
    dualPaneOrientation: DualPaneOrientation;
    showTooltips: boolean;
    showTooltipPath: boolean;
    desktopBackground: BackgroundMode;
    desktopScale: number;
    mobileScale: number;

    // General tab - Mobile appearance
    useFloatingToolbars: boolean;

    // General tab - Formatting
    dateFormat: string;
    timeFormat: string;

    // Navigation pane tab - Behavior
    pinRecentNotesWithShortcuts: boolean;
    collapseBehavior: ItemScope;
    smartCollapse: boolean;

    // Navigation pane tab - Shortcuts & recent items
    showSectionIcons: boolean;
    showShortcuts: boolean;
    shortcutBadgeDisplay: ShortcutBadgeDisplayMode;
    skipAutoScroll: boolean;
    showRecentNotes: boolean;
    recentNotesCount: number;

    // Calendar tab - Calendar
    calendarPlacement: CalendarPlacement;
    calendarLocale: string;
    calendarWeekendDays: CalendarWeekendDays;
    calendarWeeksToShow: CalendarWeeksToShow;
    calendarHighlightToday: boolean;
    calendarShowFeatureImage: boolean;
    calendarShowWeekNumber: boolean;
    calendarShowQuarter: boolean;
    calendarConfirmBeforeCreate: boolean;

    // Calendar tab - Calendar integration
    calendarIntegrationMode: CalendarIntegrationMode;
    calendarCustomFilePattern: string;
    calendarCustomWeekPattern: string;
    calendarCustomMonthPattern: string;
    calendarCustomQuarterPattern: string;
    calendarCustomYearPattern: string;
    calendarTemplateFolder: string;
    calendarCustomFileTemplate: string | null;
    calendarCustomWeekTemplate: string | null;
    calendarCustomMonthTemplate: string | null;
    calendarCustomQuarterTemplate: string | null;
    calendarCustomYearTemplate: string | null;

    // Navigation pane tab - Appearance
    colorIconOnly: boolean;
    showColorsInShortcutsOnly: boolean;
    toolbarVisibility: ToolbarVisibilitySettings;
    pinNavigationBanner: boolean;
    showNoteCount: boolean;
    separateNoteCounts: boolean;
    rootLevelSpacing: number;
    navIndent: number;
    navItemHeight: number;
    navItemHeightScaleText: boolean;

    // Folders & tags tab
    autoSelectFirstFileOnFocusChange: boolean;
    autoExpandFoldersTags: boolean;
    springLoadedFolders: boolean;
    springLoadedFoldersInitialDelay: number;
    springLoadedFoldersSubsequentDelay: number;
    showFolderIcons: boolean;
    showRootFolder: boolean;
    inheritFolderColors: boolean;
    folderSortOrder: AlphaSortOrder;
    inheritTagColors: boolean;
    enableFolderNotes: boolean;
    folderNoteType: FolderNoteCreationPreference;
    folderNoteName: string;
    folderNoteProperties: string;
    openFolderNotesInNewTab: boolean;
    hideFolderNoteInList: boolean;
    pinCreatedFolderNote: boolean;
    showTags: boolean;
    showTagIcons: boolean;
    showAllTagsFolder: boolean;
    showUntagged: boolean;
    tagSortOrder: TagSortOrder;
    keepEmptyTagsProperty: boolean;

    // List pane tab
    defaultListMode: ListDisplayMode;
    includeDescendantNotes: boolean;
    defaultFolderSort: SortOption;
    propertySortKey: string;
    revealFileOnListChanges: boolean;
    listPaneTitle: ListPaneTitleOption;
    noteGrouping: ListNoteGroupingOption;
    filterPinnedByFolder: boolean;
    showPinnedGroupHeader: boolean;
    showPinnedIcon: boolean;
    optimizeNoteHeight: boolean;
    compactItemHeight: number;
    compactItemHeightScaleText: boolean;
    showQuickActions: boolean;
    quickActionRevealInFolder: boolean;
    quickActionAddTag: boolean;
    quickActionAddToShortcuts: boolean;
    quickActionPinNote: boolean;
    quickActionOpenInNewTab: boolean;

    // Notes tab
    useFrontmatterMetadata: boolean;
    frontmatterIconField: string;
    frontmatterColorField: string;
    frontmatterNameField: string;
    frontmatterCreatedField: string;
    frontmatterModifiedField: string;
    frontmatterDateFormat: string;
    saveMetadataToFrontmatter: boolean;
    showFileIcons: boolean;
    showFilenameMatchIcons: boolean;
    fileNameIconMap: Record<string, string>;
    showCategoryIcons: boolean;
    fileTypeIconMap: Record<string, string>;
    fileNameRows: number;
    showFilePreview: boolean;
    skipHeadingsInPreview: boolean;
    skipCodeBlocksInPreview: boolean;
    stripHtmlInPreview: boolean;
    previewRows: number;
    previewProperties: string[];
    showFeatureImage: boolean;
    featureImageProperties: string[];
    featureImageExcludeProperties: string[];
    forceSquareFeatureImage: boolean;
    downloadExternalFeatureImages: boolean;
    showFileTags: boolean;
    colorFileTags: boolean;
    prioritizeColoredFileTags: boolean;
    showFileTagAncestors: boolean;
    showFileTagsInCompactMode: boolean;
    customPropertyType: CustomPropertyType;
    customPropertyFields: string;
    showCustomPropertiesOnSeparateRows: boolean;
    customPropertyColorMap: Record<string, string>;
    showCustomPropertyInCompactMode: boolean;
    showFileDate: boolean;
    alphabeticalDateMode: AlphabeticalDateMode;
    showParentFolder: boolean;
    parentFolderClickRevealsFile: boolean;
    showParentFolderColor: boolean;
    showParentFolderIcon: boolean;

    // Icon packs tab
    externalIconProviders: Record<string, boolean>;

    // Search & hotkeys tab
    searchProvider: SearchProvider | null;
    keyboardShortcuts: KeyboardShortcutConfig;
    shortcutCollections: ShortcutCollection[];
    activeShortcutCollection: string;

    // Advanced tab
    checkForUpdatesOnStart: boolean;
    confirmBeforeDelete: boolean;

    // Runtime state and cached data
    customVaultName: string;
    pinnedNotes: PinnedNotes;
    fileIcons: Record<string, string>;
    fileColors: Record<string, string>;
    folderIcons: Record<string, string>;
    folderColors: Record<string, string>;
    folderBackgroundColors: Record<string, string>;
    folderSortOverrides: Record<string, SortOption>;
    folderTreeSortOverrides: Record<string, AlphaSortOrder>;
    folderAppearances: Record<string, FolderAppearance>;
    tagIcons: Record<string, string>;
    tagColors: Record<string, string>;
    tagBackgroundColors: Record<string, string>;
    tagSortOverrides: Record<string, SortOption>;
    tagTreeSortOverrides: Record<string, AlphaSortOrder>;
    tagAppearances: Record<string, TagAppearance>;
    navigationSeparators: Record<string, boolean>;
    userColors: string[];
    lastShownVersion: string;
    lastAnnouncedRelease: string;
    rootFolderOrder: string[];
    rootTagOrder: string[];
}
