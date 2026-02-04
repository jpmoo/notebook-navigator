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

import { DEFAULT_CUSTOM_COLORS } from '../constants/colorPalette';
import { getDefaultKeyboardShortcuts } from '../utils/keyboardShortcuts';
import { FILE_VISIBILITY } from '../utils/fileTypeUtils';
import { LISTPANE_MEASUREMENTS, NAVPANE_MEASUREMENTS, type PinnedNotes } from '../types';
import { DEFAULT_UI_SCALE } from '../utils/uiScale';
import type { FolderAppearance, TagAppearance } from '../hooks/useListPaneAppearance';
import type { NotebookNavigatorSettings } from './types';
import { SYNC_MODE_SETTING_IDS, type SettingSyncMode } from './types';
import { sanitizeRecord } from '../utils/recordUtils';
import {
    DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_MONTH_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_QUARTER_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_WEEK_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_YEAR_PATTERN
} from '../utils/calendarCustomNotePatterns';

const defaultSettingsSync = sanitizeRecord<SettingSyncMode>(undefined);
SYNC_MODE_SETTING_IDS.forEach(settingId => {
    defaultSettingsSync[settingId] = 'synced';
});

/**
 * Default settings for the plugin
 * Used when plugin is first installed or settings are reset
 */
export const DEFAULT_SETTINGS: NotebookNavigatorSettings = {
    // General tab - Filtering
    vaultProfiles: [
        {
            id: 'default',
            name: '',
            fileVisibility: FILE_VISIBILITY.SUPPORTED,
            hiddenFolders: [],
            hiddenTags: [],
            hiddenFileNames: [],
            hiddenFileTags: [],
            hiddenFileProperties: [],
            navigationBanner: null,
            periodicNotesFolder: '',
            shortcuts: []
        }
    ],
    vaultProfile: 'default',
    vaultTitle: 'navigation',
    syncModes: defaultSettingsSync,

    // General tab - Behavior
    autoRevealActiveFile: true,
    autoRevealIgnoreRightSidebar: true,
    paneTransitionDuration: 150,

    // General tab - Keyboard navigation
    multiSelectModifier: 'cmdCtrl',
    enterToOpenFiles: false,
    shiftEnterOpenContext: 'tab',
    cmdCtrlEnterOpenContext: 'split',

    // General tab - View
    startView: 'files',
    interfaceIcons: sanitizeRecord<string>(undefined),

    // General tab - Homepage
    homepage: null,
    mobileHomepage: null,
    useMobileHomepage: false,

    // General tab - Desktop appearance
    dualPane: true,
    dualPaneOrientation: 'horizontal',
    showTooltips: false,
    showTooltipPath: true,
    desktopBackground: 'separate',
    desktopScale: DEFAULT_UI_SCALE,

    mobileScale: DEFAULT_UI_SCALE,

    // General tab - Mobile appearance
    useFloatingToolbars: true,

    // General tab - Formatting
    dateFormat: 'MMM d, yyyy',
    timeFormat: 'h:mm a',

    // Navigation pane tab - Behavior
    pinRecentNotesWithShortcuts: false,
    collapseBehavior: 'all',
    smartCollapse: true,

    // Navigation pane tab - Shortcuts & recent items
    showSectionIcons: true,
    showShortcuts: true,
    shortcutBadgeDisplay: 'index',
    skipAutoScroll: false,
    showRecentNotes: true,
    recentNotesCount: 5,

    // Calendar tab - Calendar
    calendarPlacement: 'left-sidebar',
    calendarLocale: 'system-default',
    calendarWeekendDays: 'sat-sun',
    calendarWeeksToShow: 1,
    calendarHighlightToday: true,
    calendarShowFeatureImage: true,
    calendarShowWeekNumber: false,
    calendarShowQuarter: false,
    calendarConfirmBeforeCreate: true,

    // Calendar tab - Calendar integration
    calendarIntegrationMode: 'notebook-navigator',
    calendarCustomFilePattern: DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN,
    calendarCustomWeekPattern: DEFAULT_CALENDAR_CUSTOM_WEEK_PATTERN,
    calendarCustomMonthPattern: DEFAULT_CALENDAR_CUSTOM_MONTH_PATTERN,
    calendarCustomQuarterPattern: DEFAULT_CALENDAR_CUSTOM_QUARTER_PATTERN,
    calendarCustomYearPattern: DEFAULT_CALENDAR_CUSTOM_YEAR_PATTERN,
    calendarTemplateFolder: '',
    calendarCustomFileTemplate: null,
    calendarCustomWeekTemplate: null,
    calendarCustomMonthTemplate: null,
    calendarCustomQuarterTemplate: null,
    calendarCustomYearTemplate: null,

    // Navigation pane tab - Appearance
    colorIconOnly: false,
    showColorsInShortcutsOnly: false,
    toolbarVisibility: {
        navigation: {
            toggleDualPane: true,
            expandCollapse: true,
            calendar: true,
            hiddenItems: true,
            rootReorder: true,
            newFolder: true
        },
        list: {
            back: true,
            search: true,
            descendants: true,
            sort: true,
            appearance: true,
            newNote: true
        }
    },
    pinNavigationBanner: true,
    showNoteCount: true,
    separateNoteCounts: true,
    rootLevelSpacing: 0,
    navIndent: NAVPANE_MEASUREMENTS.defaultIndent,
    navItemHeight: NAVPANE_MEASUREMENTS.defaultItemHeight,
    navItemHeightScaleText: true,

    // Folders & tags tab
    autoSelectFirstFileOnFocusChange: false,
    autoExpandFoldersTags: false,
    springLoadedFolders: true,
    springLoadedFoldersInitialDelay: 0.5,
    springLoadedFoldersSubsequentDelay: 0.5,
    showFolderIcons: true,
    showRootFolder: true,
    inheritFolderColors: false,
    folderSortOrder: 'alpha-asc',
    inheritTagColors: true,
    enableFolderNotes: false,
    folderNoteType: 'markdown',
    folderNoteName: '',
    folderNoteProperties: '',
    openFolderNotesInNewTab: false,
    hideFolderNoteInList: true,
    pinCreatedFolderNote: false,
    showTags: true,
    showTagIcons: true,
    showAllTagsFolder: true,
    showUntagged: true,
    tagSortOrder: 'alpha-asc',
    keepEmptyTagsProperty: false,

    // List pane tab
    defaultListMode: 'standard',
    includeDescendantNotes: false,
    defaultFolderSort: 'modified-desc',
    propertySortKey: '',
    revealFileOnListChanges: true,
    listPaneTitle: 'header',
    noteGrouping: 'date',
    filterPinnedByFolder: false,
    showPinnedGroupHeader: true,
    showPinnedIcon: true,
    optimizeNoteHeight: true,
    compactItemHeight: LISTPANE_MEASUREMENTS.defaultCompactItemHeight,
    compactItemHeightScaleText: true,
    showQuickActions: true,
    quickActionRevealInFolder: false,
    quickActionAddTag: true,
    quickActionAddToShortcuts: true,
    quickActionPinNote: true,
    quickActionOpenInNewTab: false,

    // Notes tab
    useFrontmatterMetadata: false,
    frontmatterIconField: 'icon',
    frontmatterColorField: 'color',
    frontmatterNameField: '',
    frontmatterCreatedField: '',
    frontmatterModifiedField: '',
    frontmatterDateFormat: '',
    saveMetadataToFrontmatter: false,
    showFileIcons: true,
    showFilenameMatchIcons: false,
    fileNameIconMap: {},
    showCategoryIcons: false,
    fileTypeIconMap: {},
    fileNameRows: 1,
    showFilePreview: true,
    skipHeadingsInPreview: true,
    skipCodeBlocksInPreview: true,
    stripHtmlInPreview: true,
    previewRows: 2,
    previewProperties: [],
    showFeatureImage: true,
    featureImageProperties: [],
    featureImageExcludeProperties: [],
    forceSquareFeatureImage: true,
    downloadExternalFeatureImages: true,
    showFileTags: true,
    colorFileTags: true,
    prioritizeColoredFileTags: true,
    showFileTagAncestors: false,
    showFileTagsInCompactMode: false,
    customPropertyType: 'none',
    customPropertyFields: '',
    showCustomPropertiesOnSeparateRows: true,
    customPropertyColorMap: {},
    showCustomPropertyInCompactMode: false,
    showFileDate: true,
    // Default to showing modified date when sorting alphabetically
    alphabeticalDateMode: 'modified',
    showParentFolder: true,
    parentFolderClickRevealsFile: false,
    showParentFolderColor: false,
    showParentFolderIcon: false,

    // Icon packs tab
    externalIconProviders: {},

    // Search & hotkeys tab
    searchProvider: 'internal',
    keyboardShortcuts: getDefaultKeyboardShortcuts(),
    shortcutCollections: [
        {
            id: 'default',
            name: 'Default',
            icon: 'lucide-bookmark',
            shortcuts: [],
            isDefault: true
        }
    ],
    activeShortcutCollection: 'default',

    // Advanced tab
    checkForUpdatesOnStart: true,
    confirmBeforeDelete: true,

    // Runtime state and cached data
    customVaultName: '',
    pinnedNotes: {} as PinnedNotes,
    fileIcons: {},
    fileColors: {},
    folderIcons: {},
    folderColors: {},
    folderBackgroundColors: {},
    folderSortOverrides: {},
    folderTreeSortOverrides: {},
    folderAppearances: {} as Record<string, FolderAppearance>,
    tagIcons: {},
    tagColors: {},
    tagBackgroundColors: {},
    tagSortOverrides: {},
    tagTreeSortOverrides: {},
    tagAppearances: {} as Record<string, TagAppearance>,
    navigationSeparators: {},
    userColors: [...DEFAULT_CUSTOM_COLORS],
    lastShownVersion: '',
    lastAnnouncedRelease: '',
    rootFolderOrder: [],
    rootTagOrder: []
};
