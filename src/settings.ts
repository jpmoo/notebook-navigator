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

import { App, ButtonComponent, Platform, PluginSettingTab, Setting } from 'obsidian';
import type { SettingDefinition, SettingDefinitionItem, SettingDefinitionPage } from 'obsidian';
import NotebookNavigatorPlugin from './main';
import { strings } from './i18n';
import { TIMEOUTS } from './types/obsidian-extended';
import {
    renderAppearanceBehaviorTab,
    renderGeneralTab,
    renderStartResourcesSection,
    renderStartVaultConfigurationSection,
    renderVaultProfilesAndFiltersTab
} from './settings/tabs/GeneralTab';
import { renderNavigationPaneTab } from './settings/tabs/NavigationTab';
import { renderShortcutsTab } from './settings/tabs/ShortcutsTab';
import { renderCalendarTab } from './settings/tabs/CalendarTab';
import { renderListPaneTab } from './settings/tabs/ListTab';
import { renderFrontmatterTab } from './settings/tabs/FrontmatterTab';
import { renderNotesTab } from './settings/tabs/NotesTab';
import { renderFilesTab } from './settings/tabs/FilesTab';
import { renderFoldersAndFolderNotesTab, renderTagsPropertiesTab } from './settings/tabs/ContentTab';
import { renderIconPacksTab } from './settings/tabs/IconPacksTab';
import { renderAdvancedTab } from './settings/tabs/AdvancedTab';
import type {
    AddSettingFunction,
    DebouncedTextAreaSettingOptions,
    SettingsTabId,
    SettingsTabContext,
    SettingDescription
} from './settings/tabs/SettingsTabContext';
import { runAsyncAction } from './utils/async';
import { NOTEBOOK_NAVIGATOR_ICON_ID } from './constants/notebookNavigatorIcon';
import { getIconService } from './services/icons';
import { resolveFileTypeIconId } from './utils/fileIconUtils';
import { resolveUXIcon, type UXIconId } from './utils/uxIcons';
import { SettingsDiagnosticsController } from './settings/SettingsDiagnosticsController';

/** Identifiers for different settings tab panes */
type SettingsPaneId = Exclude<SettingsTabId, 'files' | 'tags' | 'properties'>;

/** Top-level group buttons for settings navigation */
type SettingsGroupId = 'general' | 'navigation-pane' | 'list-pane' | 'calendar' | 'advanced';

const SETTINGS_GROUP_IDS: SettingsGroupId[] = ['general', 'navigation-pane', 'list-pane', 'calendar', 'advanced'];

type SettingsTabIconDefinition =
    | { kind: 'fixed'; iconId: string }
    | { kind: 'ux'; uxIconId: UXIconId }
    | { kind: 'fileType'; fileTypeKey: string; fallbackIconId: string };

const SETTINGS_TAB_ICONS: Record<SettingsPaneId, SettingsTabIconDefinition> = {
    general: { kind: 'fixed', iconId: 'home' },
    'vault-filters': { kind: 'fixed', iconId: 'filter' },
    'appearance-behavior': { kind: 'fixed', iconId: 'sliders-horizontal' },
    'navigation-pane': { kind: 'fixed', iconId: 'panel-left' },
    'list-pane': { kind: 'fixed', iconId: 'list' },
    calendar: { kind: 'fixed', iconId: 'calendar-days' },
    folders: { kind: 'ux', uxIconId: 'nav-folder-closed' },
    'tags-properties': { kind: 'fixed', iconId: 'tags' },
    'file-operations': { kind: 'fixed', iconId: 'file-cog' },
    'icon-packs': { kind: 'fixed', iconId: 'package' },
    advanced: { kind: 'fixed', iconId: 'sliders-horizontal' },
    shortcuts: { kind: 'ux', uxIconId: 'nav-shortcuts' },
    frontmatter: { kind: 'ux', uxIconId: 'nav-properties' },
    notes: { kind: 'fileType', fileTypeKey: 'md', fallbackIconId: 'file' }
};

const SETTINGS_GROUP_SECONDARY_TAB_IDS: Record<SettingsGroupId, SettingsPaneId[]> = {
    general: ['vault-filters', 'appearance-behavior', 'icon-packs'],
    'navigation-pane': ['shortcuts', 'folders', 'tags-properties'],
    'list-pane': ['file-operations', 'frontmatter', 'notes'],
    calendar: [],
    advanced: []
};

interface SettingsPageGroupDefinition {
    getHeading: () => string;
    items: SettingsPaneId[];
}

const SETTINGS_PAGE_GROUP_DEFINITIONS: SettingsPageGroupDefinition[] = [
    {
        getHeading: () => strings.settings.pageGroups.configuration,
        items: ['vault-filters', 'appearance-behavior']
    },
    {
        getHeading: () => strings.settings.pageGroups.navigationAndContent,
        items: ['navigation-pane', 'shortcuts', 'folders', 'tags-properties']
    },
    {
        getHeading: () => strings.settings.pageGroups.notesAndLists,
        items: ['list-pane', 'file-operations', 'frontmatter', 'notes']
    },
    {
        getHeading: () => strings.settings.pageGroups.calendarAndTools,
        items: ['calendar', 'icon-packs', 'advanced']
    }
];

const SETTINGS_PAGE_DESCRIPTION_GETTERS: Record<SettingsPaneId, () => string> = {
    general: () => strings.settings.pageDescriptions.general,
    'vault-filters': () => strings.settings.pageDescriptions.vaultFilters,
    'appearance-behavior': () => strings.settings.pageDescriptions.appearanceBehavior,
    'navigation-pane': () => strings.settings.pageDescriptions.navigationPane,
    shortcuts: () => strings.settings.pageDescriptions.shortcuts,
    calendar: () => strings.settings.pageDescriptions.calendar,
    folders: () => strings.settings.pageDescriptions.foldersAndFolderNotes,
    'tags-properties': () => strings.settings.pageDescriptions.tagsProperties,
    'file-operations': () => strings.settings.pageDescriptions.fileOperations,
    'list-pane': () => strings.settings.pageDescriptions.listPane,
    frontmatter: () => strings.settings.pageDescriptions.frontmatter,
    notes: () => strings.settings.pageDescriptions.notes,
    'icon-packs': () => strings.settings.pageDescriptions.iconPacks,
    advanced: () => strings.settings.pageDescriptions.advanced
};

type SettingsItemKey = keyof typeof strings.settings.items;

const RENDERED_SETTING_ITEM_SELECTOR = '.setting-item:not(.setting-item-heading):not(.nn-setting-hidden)';

const SETTINGS_PANE_SEARCH_ITEM_KEYS: Record<SettingsPaneId, readonly SettingsItemKey[]> = {
    general: ['fileVisibility', 'masteringVideo', 'propertyFields', 'supportDevelopment', 'vaultProfiles', 'vaultTitle', 'whatsNew'],
    'vault-filters': ['excludedFileNamePatterns', 'excludedFolders', 'excludedNotes', 'hiddenFileTags', 'hiddenTags'],
    'appearance-behavior': [
        'appearanceBackground',
        'appearanceScale',
        'autoRevealActiveNote',
        'autoRevealIgnoreOtherWindows',
        'autoRevealIgnoreRightSidebar',
        'autoRevealShortestPath',
        'createNewNotesInNewTab',
        'dateFormat',
        'dualPane',
        'dualPaneOrientation',
        'enterToOpenFiles',
        'cmdEnterOpenContext',
        'ctrlEnterOpenContext',
        'homepage',
        'interfaceIcons',
        'mouseBackForwardAction',
        'multiSelectModifier',
        'paneTransitionDuration',
        'shiftEnterOpenContext',
        'showIconsColorOnly',
        'showInfoButtons',
        'showTooltipPath',
        'showTooltipWordCount',
        'showTooltips',
        'startView',
        'timeFormat',
        'toolbarButtons',
        'useFloatingToolbars',
        'calendarTemplateFolder'
    ],
    'navigation-pane': [
        'autoExpandNavItems',
        'autoSelectFirstFileOnFocusChange',
        'collapseBehavior',
        'navIndent',
        'navItemHeight',
        'navItemHeightScaleText',
        'navRainbowApplyToFolders',
        'navRainbowApplyToProperties',
        'navRainbowApplyToRecent',
        'navRainbowApplyToShortcuts',
        'navRainbowApplyToTags',
        'navRainbowBalanceHueLuminance',
        'navRainbowMode',
        'navRainbowSeparateThemeColors',
        'navRootSpacing',
        'navigationBanner',
        'pinNavigationBanner',
        'separateNoteCounts',
        'showIndentGuides',
        'showNoteCount',
        'smartCollapse',
        'springLoadedFolders',
        'springLoadedFoldersInitialDelay',
        'springLoadedFoldersSubsequentDelay'
    ],
    shortcuts: [
        'hideRecentNotes',
        'pinRecentNotesWithShortcuts',
        'recentNotesCount',
        'shortcutBadgeDisplay',
        'showRecentNotes',
        'showSectionIcons',
        'showShortcuts',
        'skipAutoScroll'
    ],
    calendar: [
        'calendarConfirmBeforeCreate',
        'calendarCustomFilePattern',
        'calendarCustomMonthPattern',
        'calendarCustomQuarterPattern',
        'calendarCustomRootFolder',
        'calendarCustomWeekPattern',
        'calendarCustomYearPattern',
        'calendarEnabled',
        'calendarHighlightToday',
        'calendarIntegrationMode',
        'calendarLeftPlacement',
        'calendarLocale',
        'calendarMonthHeadingFormat',
        'calendarPeriodicNotesLocale',
        'calendarPlacement',
        'calendarShowFeatureImage',
        'calendarShowQuarter',
        'calendarShowWeekNumber',
        'calendarShowYearCalendar',
        'calendarWeekendDays',
        'calendarWeeksToShow'
    ],
    'file-operations': ['confirmBeforeDelete', 'deleteAttachments', 'moveFileConflicts'],
    folders: [
        'enableFolderNoteLinks',
        'enableFolderNotes',
        'folderNoteName',
        'folderNoteNamePattern',
        'folderNoteTemplate',
        'folderNoteType',
        'folderSortOrder',
        'hideFolderNoteInList',
        'inheritFolderColors',
        'openFolderNotesInNewTab',
        'pinCreatedFolderNote',
        'showFolderIcons',
        'showRootFolder'
    ],
    'tags-properties': [
        'inheritTagColors',
        'keepEmptyTagsProperty',
        'scopeTagsToCurrentContext',
        'showAllTagsFolder',
        'showTagIcons',
        'showTags',
        'showUntagged',
        'tagSortOrder',
        'inheritPropertyColors',
        'propertySortOrder',
        'scopePropertiesToCurrentContext',
        'showAllPropertiesFolder',
        'showProperties',
        'showPropertyIcons'
    ],
    'list-pane': [
        'compactItemHeight',
        'compactItemHeightScaleText',
        'confirmBeforeManualSort',
        'defaultListMode',
        'groupNotes',
        'hideDrawingPreviewImages',
        'includeDescendantNotes',
        'limitPinnedToCurrentFolder',
        'listPaneTitle',
        'manualSortGroupHeaderProperty',
        'manualSortNewNotePlacement',
        'manualSortPropertyKey',
        'propertySortKey',
        'propertySortSecondary',
        'revealFileOnListChanges',
        'showQuickActions',
        'showSelectedNavigationPills',
        'sortNotesBy',
        'stickyGroupHeaders'
    ],
    frontmatter: [
        'frontmatterBackgroundField',
        'frontmatterColorField',
        'frontmatterCreatedField',
        'frontmatterDateFormat',
        'frontmatterIconField',
        'frontmatterMigration',
        'frontmatterModifiedField',
        'frontmatterNameField',
        'useFrontmatterDates'
    ],
    notes: [
        'alphabeticalDateMode',
        'colorFileProperties',
        'colorFileTags',
        'downloadExternalFeatureImages',
        'enablePropertyExternalLinks',
        'enablePropertyInternalLinks',
        'featureImageExcludeProperties',
        'featureImagePixelSize',
        'featureImageProperties',
        'featureImageSize',
        'fileNameIconMap',
        'fileNameRows',
        'fileTypeIconMap',
        'forceSquareFeatureImage',
        'parentFolderClickRevealsFile',
        'previewProperties',
        'previewPropertiesFallback',
        'previewRows',
        'prioritizeColoredFileProperties',
        'prioritizeColoredFileTags',
        'showCategoryIcons',
        'showFeatureImage',
        'showFileBackgroundUnfinishedTask',
        'showFileDate',
        'showFileIconUnfinishedTask',
        'showFileIcons',
        'showFilePreview',
        'showFileProperties',
        'showFilePropertiesInCompactMode',
        'showFileTagAncestors',
        'showFileTags',
        'showFileTagsInCompactMode',
        'showFilenameMatchIcons',
        'showParentFolder',
        'showParentFolderColor',
        'showParentFolderFullPath',
        'showParentFolderIcon',
        'showPropertiesOnSeparateRows',
        'showWordCount',
        'showWordCountPercentage',
        'skipCodeBlocksInPreview',
        'skipHeadingsInPreview',
        'stripHtmlInPreview',
        'stripLatexInPreview',
        'unfinishedTaskBackgroundColor',
        'useFolderColor',
        'useFolderIcon',
        'wordCountPlacement',
        'wordCountTargetProperty'
    ],
    'icon-packs': [],
    advanced: ['metadataCleanup', 'rebuildCache', 'resetAllSettings', 'resetPaneSeparator', 'settingsTransfer', 'updateCheckOnStart']
};

type SettingsSearchVisibilityGetter = (plugin: NotebookNavigatorPlugin) => boolean;

function isActiveNavRainbowVisible(plugin: NotebookNavigatorPlugin): boolean {
    const profiles = plugin.settings.vaultProfiles;
    const activeProfile = Array.isArray(profiles)
        ? (profiles.find(profile => profile.id === plugin.settings.vaultProfile) ?? profiles[0])
        : null;

    const mode = activeProfile?.navRainbow?.mode;
    return Boolean(mode && mode !== 'none');
}

function isCustomCalendarIntegration(plugin: NotebookNavigatorPlugin): boolean {
    return plugin.settings.calendarIntegrationMode === 'notebook-navigator';
}

const SETTINGS_SEARCH_VISIBILITY_GETTERS: Partial<Record<SettingsItemKey, SettingsSearchVisibilityGetter>> = {
    appearanceBackground: () => !Platform.isMobile,
    autoRevealIgnoreOtherWindows: plugin => plugin.settings.autoRevealActiveFile,
    autoRevealIgnoreRightSidebar: plugin => plugin.settings.autoRevealActiveFile,
    autoRevealShortestPath: plugin => plugin.settings.autoRevealActiveFile,
    alphabeticalDateMode: plugin => plugin.settings.showFileDate,
    cmdEnterOpenContext: plugin => !Platform.isMobile && Platform.isMacOS && plugin.settings.enterToOpenFiles,
    colorFileProperties: plugin => plugin.settings.showFileProperties,
    colorFileTags: plugin => plugin.settings.showTags && plugin.settings.showFileTags,
    ctrlEnterOpenContext: plugin => !Platform.isMobile && !Platform.isMacOS && plugin.settings.enterToOpenFiles,
    dualPane: () => !Platform.isMobile,
    dualPaneOrientation: () => !Platform.isMobile,
    enterToOpenFiles: () => !Platform.isMobile,
    featureImageExcludeProperties: plugin => plugin.settings.showFeatureImage,
    featureImagePixelSize: plugin => plugin.settings.showFeatureImage,
    featureImageProperties: plugin => plugin.settings.showFeatureImage,
    featureImageSize: plugin => plugin.settings.showFeatureImage,
    fileNameIconMap: plugin => plugin.settings.showFileIcons && plugin.settings.showFilenameMatchIcons,
    fileTypeIconMap: plugin => plugin.settings.showFileIcons && plugin.settings.showCategoryIcons,
    forceSquareFeatureImage: plugin => plugin.settings.showFeatureImage,
    frontmatterBackgroundField: plugin => plugin.settings.useFrontmatterMetadata,
    frontmatterColorField: plugin => plugin.settings.useFrontmatterMetadata,
    frontmatterCreatedField: plugin => plugin.settings.useFrontmatterMetadata,
    frontmatterDateFormat: plugin => plugin.settings.useFrontmatterMetadata,
    frontmatterIconField: plugin => plugin.settings.useFrontmatterMetadata,
    frontmatterMigration: plugin => plugin.settings.useFrontmatterMetadata,
    frontmatterModifiedField: plugin => plugin.settings.useFrontmatterMetadata,
    frontmatterNameField: plugin => plugin.settings.useFrontmatterMetadata,
    hideFolderNoteInList: plugin => plugin.settings.enableFolderNotes,
    hideRecentNotes: plugin => plugin.settings.showRecentNotes,
    inheritPropertyColors: plugin => plugin.settings.showProperties,
    inheritTagColors: plugin => plugin.settings.showTags,
    keepEmptyTagsProperty: plugin => plugin.settings.showTags,
    listPaneTitle: () => !Platform.isMobile,
    mouseBackForwardAction: () => !Platform.isMobile,
    multiSelectModifier: () => !Platform.isMobile,
    navRainbowApplyToFolders: isActiveNavRainbowVisible,
    navRainbowApplyToProperties: isActiveNavRainbowVisible,
    navRainbowApplyToRecent: isActiveNavRainbowVisible,
    navRainbowApplyToShortcuts: isActiveNavRainbowVisible,
    navRainbowApplyToTags: isActiveNavRainbowVisible,
    navRainbowBalanceHueLuminance: isActiveNavRainbowVisible,
    navRainbowSeparateThemeColors: isActiveNavRainbowVisible,
    openFolderNotesInNewTab: plugin => plugin.settings.enableFolderNotes,
    parentFolderClickRevealsFile: plugin => plugin.settings.showParentFolder,
    pinCreatedFolderNote: plugin => plugin.settings.enableFolderNotes,
    pinRecentNotesWithShortcuts: plugin => plugin.settings.showRecentNotes,
    previewProperties: plugin => plugin.settings.showFilePreview,
    previewPropertiesFallback: plugin => plugin.settings.showFilePreview && plugin.settings.previewProperties.length > 0,
    previewRows: plugin => plugin.settings.showFilePreview,
    prioritizeColoredFileProperties: plugin => plugin.settings.showFileProperties && plugin.settings.colorFileProperties,
    prioritizeColoredFileTags: plugin => plugin.settings.showTags && plugin.settings.showFileTags && plugin.settings.colorFileTags,
    propertySortOrder: plugin => plugin.settings.showProperties,
    recentNotesCount: plugin => plugin.settings.showRecentNotes,
    scopePropertiesToCurrentContext: plugin => plugin.settings.showProperties,
    scopeTagsToCurrentContext: plugin => plugin.settings.showTags,
    separateNoteCounts: plugin => plugin.settings.showNoteCount,
    shiftEnterOpenContext: plugin => !Platform.isMobile && plugin.settings.enterToOpenFiles,
    showAllPropertiesFolder: plugin => plugin.settings.showProperties,
    showAllTagsFolder: plugin => plugin.settings.showTags,
    showCategoryIcons: plugin => plugin.settings.showFileIcons,
    showFilePropertiesInCompactMode: plugin => plugin.settings.showFileProperties,
    showFileTagAncestors: plugin => plugin.settings.showTags && plugin.settings.showFileTags,
    showFileTags: plugin => plugin.settings.showTags,
    showFileTagsInCompactMode: plugin => plugin.settings.showTags && plugin.settings.showFileTags,
    showFilenameMatchIcons: plugin => plugin.settings.showFileIcons,
    showParentFolderColor: plugin => plugin.settings.showParentFolder,
    showParentFolderFullPath: plugin => plugin.settings.showParentFolder,
    showParentFolderIcon: plugin => plugin.settings.showParentFolder,
    showPropertiesOnSeparateRows: plugin => plugin.settings.showFileProperties,
    showPropertyIcons: plugin => plugin.settings.showProperties,
    showQuickActions: () => !Platform.isMobile,
    showTagIcons: plugin => plugin.settings.showTags,
    showTooltipPath: plugin => !Platform.isMobile && plugin.settings.showTooltips,
    showTooltips: () => !Platform.isMobile,
    showTooltipWordCount: plugin => !Platform.isMobile && plugin.settings.showTooltips,
    showUntagged: plugin => plugin.settings.showTags,
    showWordCountPercentage: plugin => plugin.settings.showWordCount,
    skipAutoScroll: plugin => plugin.settings.showShortcuts,
    shortcutBadgeDisplay: plugin => plugin.settings.showShortcuts,
    skipCodeBlocksInPreview: plugin => plugin.settings.showFilePreview,
    skipHeadingsInPreview: plugin => plugin.settings.showFilePreview,
    springLoadedFolders: () => !Platform.isMobile,
    springLoadedFoldersInitialDelay: plugin => !Platform.isMobile && plugin.settings.springLoadedFolders,
    springLoadedFoldersSubsequentDelay: plugin => !Platform.isMobile && plugin.settings.springLoadedFolders,
    stripHtmlInPreview: plugin => plugin.settings.showFilePreview,
    stripLatexInPreview: plugin => plugin.settings.showFilePreview,
    tagSortOrder: plugin => plugin.settings.showTags,
    unfinishedTaskBackgroundColor: plugin => plugin.settings.showFileBackgroundUnfinishedTask,
    useFloatingToolbars: () => Platform.isMobile,
    useFolderIcon: plugin => plugin.settings.showFileIcons,
    wordCountPlacement: plugin => plugin.settings.showWordCount,
    wordCountTargetProperty: plugin => plugin.settings.showWordCount,
    calendarCustomFilePattern: isCustomCalendarIntegration,
    calendarCustomMonthPattern: isCustomCalendarIntegration,
    calendarCustomQuarterPattern: isCustomCalendarIntegration,
    calendarCustomRootFolder: isCustomCalendarIntegration,
    calendarCustomWeekPattern: isCustomCalendarIntegration,
    calendarCustomYearPattern: isCustomCalendarIntegration,
    calendarPeriodicNotesLocale: isCustomCalendarIntegration,
    downloadExternalFeatureImages: plugin => plugin.settings.showFeatureImage,
    enableFolderNoteLinks: plugin => plugin.settings.enableFolderNotes,
    enablePropertyExternalLinks: plugin => plugin.settings.showFileProperties,
    enablePropertyInternalLinks: plugin => plugin.settings.showFileProperties,
    folderNoteName: plugin => plugin.settings.enableFolderNotes,
    folderNoteNamePattern: plugin => plugin.settings.enableFolderNotes,
    folderNoteTemplate: plugin => plugin.settings.enableFolderNotes,
    folderNoteType: plugin => plugin.settings.enableFolderNotes
};

const SETTINGS_TAB_GROUP_MAP: Record<SettingsPaneId, SettingsGroupId> = {
    general: 'general',
    'vault-filters': 'general',
    'appearance-behavior': 'general',
    'navigation-pane': 'navigation-pane',
    shortcuts: 'navigation-pane',
    folders: 'navigation-pane',
    'tags-properties': 'navigation-pane',
    'list-pane': 'list-pane',
    'file-operations': 'list-pane',
    frontmatter: 'list-pane',
    notes: 'list-pane',
    calendar: 'calendar',
    'icon-packs': 'general',
    advanced: 'advanced'
};

const SETTINGS_SECONDARY_TAB_IDS_ORDERED: SettingsPaneId[] = [
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS.general,
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS['navigation-pane'],
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS['list-pane'],
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS.calendar
];

/** Definition of a settings pane with its ID, label resolver, and render function */
interface SettingsPaneDefinition {
    id: SettingsPaneId;
    getLabel: () => string;
    render: (context: SettingsTabContext) => void;
}

const SETTINGS_PANE_DEFINITIONS: SettingsPaneDefinition[] = [
    { id: 'general', getLabel: () => strings.settings.sections.general, render: renderGeneralTab },
    { id: 'vault-filters', getLabel: () => strings.settings.sections.vaultFilters, render: renderVaultProfilesAndFiltersTab },
    { id: 'appearance-behavior', getLabel: () => strings.settings.sections.appearanceBehavior, render: renderAppearanceBehaviorTab },
    { id: 'navigation-pane', getLabel: () => strings.settings.sections.navigationPane, render: renderNavigationPaneTab },
    { id: 'shortcuts', getLabel: () => strings.settings.sections.shortcutsAndRecentFiles, render: renderShortcutsTab },
    { id: 'folders', getLabel: () => strings.settings.sections.foldersAndFolderNotes, render: renderFoldersAndFolderNotesTab },
    { id: 'tags-properties', getLabel: () => strings.settings.sections.tagsAndProperties, render: renderTagsPropertiesTab },
    { id: 'list-pane', getLabel: () => strings.settings.sections.listPane, render: renderListPaneTab },
    { id: 'file-operations', getLabel: () => strings.settings.sections.fileOperations, render: renderFilesTab },
    { id: 'frontmatter', getLabel: () => strings.settings.groups.notes.frontmatter, render: renderFrontmatterTab },
    { id: 'notes', getLabel: () => strings.settings.sections.notes, render: renderNotesTab },
    { id: 'calendar', getLabel: () => strings.settings.sections.calendar, render: renderCalendarTab },
    { id: 'icon-packs', getLabel: () => strings.settings.sections.icons, render: renderIconPacksTab },
    { id: 'advanced', getLabel: () => strings.settings.sections.advanced, render: renderAdvancedTab }
];

const SETTINGS_PANE_DEFINITION_MAP = new Map<SettingsPaneId, SettingsPaneDefinition>(
    SETTINGS_PANE_DEFINITIONS.map(definition => [definition.id, definition])
);

function resolveSettingsPaneId(tabId: SettingsTabId): SettingsPaneId {
    switch (tabId) {
        case 'files':
            return 'file-operations';
        case 'tags':
        case 'properties':
            return 'tags-properties';
        default:
            return tabId;
    }
}

/**
 * Settings tab for configuring the Notebook Navigator plugin
 * Provides organized sections for different aspects of the plugin
 * Implements debounced text inputs to prevent excessive updates
 */
export class NotebookNavigatorSettingTab extends PluginSettingTab {
    plugin: NotebookNavigatorPlugin;
    // Map of active debounce timers for text inputs
    private debounceTimers: Map<string, number> = new Map();
    // Map of tab IDs to their content elements
    private tabContentMap: Map<SettingsPaneId, HTMLElement> = new Map();
    // Map of tab IDs to their button components
    private tabButtons: Map<SettingsPaneId, ButtonComponent> = new Map();
    private tabIconElements: Map<SettingsPaneId, HTMLElement> = new Map();
    private primaryNavEl: HTMLElement | null = null;
    private secondaryNavEl: HTMLElement | null = null;
    // Tracks the most recently active tab during the current session
    private lastActiveTabId: SettingsPaneId | null = null;
    // Registered listeners for show tags visibility changes
    private showTagsListeners: ((visible: boolean) => void)[] = [];
    // Current visibility state of show tags setting
    private currentShowTagsVisible = false;
    private settingsUpdateListenerId = 'settings-tab';
    private tabSettingsUpdateListeners = new Map<string, () => void>();
    private readonly diagnosticsController: SettingsDiagnosticsController;
    private settingsRenderContainerEl: HTMLElement | null = null;
    private activeNativePaneId: SettingsPaneId | null = null;
    // Index-only native definitions are visually hidden but remain searchable.
    private hiddenSearchDefinitionTargets = new Map<SettingDefinition, HTMLElement>();

    private getGroupIdForTab(tabId: SettingsPaneId): SettingsGroupId {
        return SETTINGS_TAB_GROUP_MAP[tabId];
    }

    private resolveTabButtonIconId(tabId: SettingsPaneId): string | null {
        const iconDefinition = SETTINGS_TAB_ICONS[tabId];
        if (!iconDefinition) {
            return null;
        }

        if (iconDefinition.kind === 'fixed') {
            return iconDefinition.iconId;
        }

        if (iconDefinition.kind === 'ux') {
            return resolveUXIcon(this.plugin.settings.interfaceIcons, iconDefinition.uxIconId);
        }

        return resolveFileTypeIconId(iconDefinition.fileTypeKey, this.plugin.settings.fileTypeIconMap) ?? iconDefinition.fallbackIconId;
    }

    private renderTabButtonIcon(tabId: SettingsPaneId): void {
        const iconEl = this.tabIconElements.get(tabId);
        if (!iconEl) {
            return;
        }

        iconEl.empty();
        const iconId = this.resolveTabButtonIconId(tabId);
        if (!iconId) {
            return;
        }

        getIconService().renderIcon(iconEl, iconId);
    }

    private refreshTabButtonIcons(): void {
        this.tabIconElements.forEach((_iconEl, tabId) => {
            this.renderTabButtonIcon(tabId);
        });
        this.updateTabRowIconVisibility();
    }

    private rowExceedsSingleLine(rowEl: HTMLElement): boolean {
        const overflowTolerance = 1;
        if (rowEl.scrollWidth - rowEl.clientWidth > overflowTolerance) {
            return true;
        }

        const buttons = Array.from(rowEl.querySelectorAll<HTMLElement>('.nn-settings-tab-button')).filter(button => {
            if (button.hasClass('is-hidden')) {
                return false;
            }
            return button.offsetParent !== null;
        });

        if (buttons.length <= 1) {
            return false;
        }

        const firstTop = buttons[0].offsetTop;
        return buttons.some(button => Math.abs(button.offsetTop - firstTop) > overflowTolerance);
    }

    private updateTabRowIconVisibilityForRow(rowEl: HTMLElement | null): void {
        if (!rowEl) {
            return;
        }

        rowEl.toggleClass('is-icons-hidden', false);
        if (rowEl.hasClass('is-hidden')) {
            return;
        }

        if (this.rowExceedsSingleLine(rowEl)) {
            rowEl.toggleClass('is-icons-hidden', true);
        }
    }

    private updateTabRowIconVisibility(): void {
        this.updateTabRowIconVisibilityForRow(this.primaryNavEl);
        this.updateTabRowIconVisibilityForRow(this.secondaryNavEl);
    }

    private updateTabNavigation(activeTabId: SettingsPaneId): void {
        const activeGroupId = this.getGroupIdForTab(activeTabId);
        this.secondaryNavEl?.toggleClass('is-hidden', SETTINGS_GROUP_SECONDARY_TAB_IDS[activeGroupId].length === 0);

        for (const groupId of SETTINGS_GROUP_IDS) {
            const groupButton = this.tabButtons.get(groupId);
            if (!groupButton) {
                continue;
            }

            const isActive = groupId === activeTabId;
            const isGroupActive = groupId === activeGroupId && !isActive;
            groupButton.buttonEl.toggleClass('is-group-active', isGroupActive);
            groupButton.buttonEl.toggleClass('is-active', isActive);
            groupButton.buttonEl.setAttribute('aria-selected', isActive ? 'true' : 'false');

            if (isActive) {
                groupButton.setCta();
            } else {
                groupButton.removeCta();
            }
        }

        for (const tabId of SETTINGS_SECONDARY_TAB_IDS_ORDERED) {
            const tabButton = this.tabButtons.get(tabId);
            if (!tabButton) {
                continue;
            }

            const isVisible = this.getGroupIdForTab(tabId) === activeGroupId;
            tabButton.buttonEl.toggleClass('is-hidden', !isVisible);

            const isActive = tabId === activeTabId;
            tabButton.buttonEl.toggleClass('is-active', isActive);
            tabButton.buttonEl.setAttribute('aria-selected', isActive ? 'true' : 'false');

            // Keep the secondary tab row in the lighter tab-button style.
            tabButton.removeCta();
        }

        this.updateTabRowIconVisibility();
    }

    /**
     * Creates a new settings tab
     * @param app - The Obsidian app instance
     * @param plugin - The plugin instance to configure
     */
    constructor(app: App, plugin: NotebookNavigatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.diagnosticsController = new SettingsDiagnosticsController({
            app: this.app,
            plugin: this.plugin,
            registerInterval: intervalId => this.plugin.registerInterval(intervalId),
            scheduleDebouncedUpdate: (name, updater) => this.scheduleDebouncedSettingUpdate(name, updater)
        });

        this.icon = NOTEBOOK_NAVIGATOR_ICON_ID;
    }

    public selectTab(tabId: SettingsTabId, options?: { focus?: boolean }): void {
        const paneId = resolveSettingsPaneId(tabId);
        this.lastActiveTabId = paneId;

        const contentWrapper = this.containerEl.querySelector<HTMLElement>('.nn-settings-tabs-content');
        if (!contentWrapper) {
            if (paneId === 'general') {
                this.returnToNativeSettingsIndex();
                return;
            }

            if (!this.openNativeSettingsPage(paneId)) {
                this.returnToNativeSettingsIndex(paneId);
            }
            return;
        }

        this.activateTab(paneId, contentWrapper, { focus: options?.focus ?? false });
    }

    private openNativeSettingsPage(tabId: SettingsPaneId): boolean {
        if (tabId === 'general') {
            return false;
        }

        const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
        if (!definition) {
            return false;
        }

        const pageName = definition.getLabel();
        const settingItems = Array.from(this.containerEl.querySelectorAll<HTMLElement>('.setting-item'));
        const targetItem = settingItems.find(settingItem => {
            const nameEl = settingItem.querySelector<HTMLElement>('.setting-item-name');
            return nameEl?.textContent?.trim() === pageName;
        });

        if (!targetItem) {
            return false;
        }

        const pageButton = targetItem.querySelector<HTMLElement>('.setting-item-control button, .setting-item-control .clickable-icon');
        (pageButton ?? targetItem).click();
        return true;
    }

    private returnToNativeSettingsIndex(tabId?: SettingsPaneId): void {
        const backButton = this.containerEl.querySelector<HTMLElement>('.setting-page-back-button');
        if (!backButton) {
            return;
        }

        backButton.click();
        if (!tabId) {
            return;
        }

        window.requestAnimationFrame(() => {
            this.openNativeSettingsPage(tabId);
        });
    }

    private ensureSettingsUpdateListener(): void {
        this.plugin.registerSettingsUpdateListener(this.settingsUpdateListenerId, () => {
            if (this.plugin.isExternalSettingsUpdate()) {
                this.refreshFromExternalSettingsUpdate();
                return;
            }

            this.refreshNativeSettingsDomState();
            this.refreshTabButtonIcons();
            const listeners = Array.from(this.tabSettingsUpdateListeners.values());
            listeners.forEach(callback => {
                try {
                    callback();
                } catch {
                    // Ignore errors from settings-tab UI callbacks
                }
            });
        });
    }

    private refreshNativeSettingsDomState(): void {
        const refreshDomState: unknown = Reflect.get(this, 'refreshDomState');
        if (typeof refreshDomState === 'function') {
            refreshDomState.call(this);
        }
    }

    private refreshFromExternalSettingsUpdate(): void {
        const renderContainerEl = this.settingsRenderContainerEl ?? this.containerEl;
        const contentWrapper = renderContainerEl.querySelector<HTMLElement>('.nn-settings-tabs-content');
        const scrollTop = contentWrapper?.scrollTop ?? renderContainerEl.scrollTop;

        if (this.activeNativePaneId) {
            this.renderSettingsPane(this.activeNativePaneId, renderContainerEl);
            renderContainerEl.scrollTop = scrollTop;
            return;
        }

        if (!contentWrapper) {
            this.updateNativeSettingsDefinitions();
            renderContainerEl.scrollTop = scrollTop;
            return;
        }

        this.renderSettingsTab({ focus: false, restoreScrollTop: scrollTop, containerEl: renderContainerEl });
    }

    private updateNativeSettingsDefinitions(): void {
        const update: unknown = Reflect.get(this, 'update');
        if (typeof update === 'function') {
            update.call(this);
        }
    }

    /**
     * Ensures only the most recent change for a given setting runs after the debounce delay.
     */
    private scheduleDebouncedSettingUpdate(name: string, updater: () => Promise<void> | void): void {
        const timerId = `setting-${name}`;
        const existingTimer = this.debounceTimers.get(timerId);
        if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
        }

        const timer = window.setTimeout(() => {
            runAsyncAction(async () => {
                try {
                    await updater();
                } finally {
                    this.debounceTimers.delete(timerId);
                }
            });
        }, TIMEOUTS.DEBOUNCE_SETTINGS);

        this.debounceTimers.set(timerId, timer);
    }

    private addToggleSetting(
        addSetting: AddSettingFunction,
        name: string,
        desc: string,
        getValue: () => boolean,
        setValue: (value: boolean) => void,
        onAfterUpdate?: () => void
    ): Setting {
        return addSetting(setting => {
            setting.setName(name).setDesc(desc);
            setting.addToggle(toggle =>
                toggle.setValue(getValue()).onChange(async value => {
                    setValue(value);
                    await this.plugin.saveSettingsAndUpdate();
                    onAfterUpdate?.();
                })
            );
        });
    }

    private addInfoSetting(
        addSetting: AddSettingFunction,
        cls: string | readonly string[],
        render: (descEl: HTMLElement) => void
    ): Setting {
        return addSetting(setting => {
            setting.setName('').setDesc('');

            const classNames = typeof cls === 'string' ? cls.split(/\s+/) : cls;
            for (const className of classNames) {
                if (className) {
                    setting.settingEl.addClass(className);
                }
            }

            const descEl = setting.descEl;
            descEl.empty();
            render(descEl);
        });
    }

    /**
     * Creates a text setting with debounced onChange handler
     * Prevents excessive updates while user is typing
     * Supports optional validation before applying changes
     * @param container - Container element for the setting
     * @param name - Setting display name
     * @param desc - Setting description
     * @param placeholder - Placeholder text for the input
     * @param getValue - Function to get current value
     * @param setValue - Function to set new value
     * @param validator - Optional validation function
     * @returns The created Setting instance
     */
    private createDebouncedTextSetting(
        container: HTMLElement,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        validator?: (value: string) => boolean,
        onAfterUpdate?: () => void
    ): Setting {
        return this.configureDebouncedTextSetting(
            new Setting(container),
            name,
            desc,
            placeholder,
            getValue,
            setValue,
            validator,
            onAfterUpdate
        );
    }

    private configureDebouncedTextSetting(
        setting: Setting,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        validator?: (value: string) => boolean,
        onAfterUpdate?: () => void
    ): Setting {
        return setting
            .setName(name)
            .setDesc(desc)
            .addText(text =>
                text
                    .setPlaceholder(placeholder)
                    .setValue(getValue())
                    .onChange(value => {
                        // Schedule debounced update to ensure async operations complete safely
                        this.scheduleDebouncedSettingUpdate(name, async () => {
                            const isValid = !validator || validator(value);
                            if (!isValid) {
                                return;
                            }
                            setValue(value);
                            await this.plugin.saveSettingsAndUpdate();
                            onAfterUpdate?.();
                        });
                    })
            );
    }

    /**
     * Creates a multiline text setting with debounced onChange handler
     * Uses the same debounce timers as single-line inputs
     * @param container - Container element for the setting
     * @param name - Setting display name
     * @param desc - Setting description
     * @param placeholder - Placeholder text for the textarea
     * @param getValue - Function to get current value
     * @param setValue - Function to set new value
     * @param options - Optional configuration for validation and row count
     * @returns The created Setting instance
     */
    private createDebouncedTextAreaSetting(
        container: HTMLElement,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        options?: DebouncedTextAreaSettingOptions
    ): Setting {
        return this.configureDebouncedTextAreaSetting(new Setting(container), name, desc, placeholder, getValue, setValue, options);
    }

    private configureDebouncedTextAreaSetting(
        setting: Setting,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        options?: DebouncedTextAreaSettingOptions
    ): Setting {
        const rows = options?.rows ?? 4;

        return setting
            .setName(name)
            .setDesc(desc)
            .addTextArea(textArea => {
                textArea.setPlaceholder(placeholder);
                textArea.setValue(getValue());
                textArea.inputEl.rows = rows;
                textArea.onChange(value => {
                    // Schedule debounced update to ensure async operations complete safely
                    this.scheduleDebouncedSettingUpdate(name, async () => {
                        const validator = options?.validator;
                        const isValid = !validator || validator(value);
                        if (!isValid) {
                            return;
                        }
                        setValue(value);
                        await this.plugin.saveSettingsAndUpdate();
                        options?.onAfterUpdate?.();
                    });
                });
            });
    }

    /**
     * Renders the settings tab UI
     * Organizes settings into grouped tabs:
     * - General: General, Display filters, Appearance & behavior, Icon packs
     * - Navigation pane: Navigation pane, Shortcuts, Folders & folder notes, Tags & properties
     * - List pane: List pane, File operations, Frontmatter fields, File display
     * - Calendar: Calendar
     * - Advanced: Advanced
     */
    display(): void {
        this.ensureSettingsUpdateListener();
        this.renderSettingsTab({ focus: true });
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            ...this.createNativeSettingsLandingStartItems(),
            ...SETTINGS_PAGE_GROUP_DEFINITIONS.map(group => ({
                type: 'group' as const,
                heading: group.getHeading(),
                items: group.items.map(tabId => this.createNativeSettingsPageDefinition(tabId))
            }))
        ];
    }

    /**
     * Obsidian renders this declarative shell for pages and search, while Notebook Navigator
     * keeps ownership of each setting row through its existing custom renderers.
     */
    private createNativeSettingsLandingStartItems(): SettingDefinitionItem[] {
        const searchDefinitions = this.createHiddenNativeSearchDefinitions('general');
        let nativeStartContentEl: HTMLElement | null = null;

        return [
            this.createNativeSettingsLandingItem(strings.settings.sections.general, renderStartResourcesSection, rootEl => {
                nativeStartContentEl = rootEl;
            }),
            this.createNativeSettingsLandingSection(
                strings.settings.groups.general.vaultConfiguration,
                renderStartVaultConfigurationSection,
                rootEl => {
                    nativeStartContentEl = rootEl;
                }
            ),
            ...searchDefinitions,
            this.createNativeSearchTargetMapper(strings.settings.sections.general, searchDefinitions, settingEl => {
                return nativeStartContentEl ?? this.resolveNativePageContentEl(settingEl);
            })
        ];
    }

    private createNativeSettingsLandingItem(
        name: string,
        render: (context: SettingsTabContext) => void,
        onRender?: (rootEl: HTMLElement) => void
    ): SettingDefinition {
        return {
            name,
            searchable: false,
            element: listEl => {
                this.ensureSettingsUpdateListener();
                this.activeNativePaneId = null;
                this.settingsRenderContainerEl = this.containerEl;
                const rootEl = this.resolveNativePageContentEl(listEl);
                const contentEl = listEl.createDiv('nn-settings-native-start-content nn-settings-tab-root');
                onRender?.(rootEl);
                render(this.createTabContext(contentEl));
            }
        };
    }

    private createNativeSettingsLandingSection(
        heading: string,
        render: (context: SettingsTabContext) => void,
        onRender?: (rootEl: HTMLElement) => void
    ): SettingDefinitionItem {
        return {
            type: 'group' as const,
            heading,
            items: [this.createNativeSettingsLandingItem(heading, render, onRender)]
        };
    }

    private createNativeSettingsPageDefinition(tabId: SettingsPaneId): SettingDefinitionPage {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
        const name = definition?.getLabel() ?? tabId;
        const searchDefinitions = this.createHiddenNativeSearchDefinitions(tabId);
        let nativePageContentEl: HTMLElement | null = null;

        return {
            type: 'page' as const,
            name,
            desc: SETTINGS_PAGE_DESCRIPTION_GETTERS[tabId](),
            items: [
                {
                    name,
                    searchable: false,
                    element: (listEl: HTMLElement) => {
                        this.ensureSettingsUpdateListener();
                        nativePageContentEl = this.resolveNativePageContentEl(listEl);
                        this.renderSettingsPane(tabId, nativePageContentEl);
                    }
                },
                ...searchDefinitions,
                this.createNativeSearchTargetMapper(name, searchDefinitions, settingEl => {
                    return nativePageContentEl ?? this.resolveNativePageContentEl(settingEl);
                })
            ]
        };
    }

    /**
     * Adds an index-only row after each rendered page that maps searchable native
     * definitions to the custom Setting rows currently in the DOM.
     */
    private createNativeSearchTargetMapper(
        name: string,
        definitions: SettingDefinition[],
        resolveContainerEl: (settingEl: HTMLElement) => HTMLElement
    ): SettingDefinition {
        return {
            name: `${name} search targets`,
            searchable: false,
            render: setting => {
                setting.settingEl.addClass('nn-setting-hidden');
                this.mapHiddenSearchDefinitionsToRenderedRows(resolveContainerEl(setting.settingEl), definitions);
            }
        };
    }

    private resolveNativePageContentEl(listEl: HTMLElement): HTMLElement {
        return listEl.closest<HTMLElement>('.setting-page-content') ?? listEl;
    }

    private createHiddenNativeSearchDefinitions(tabId: SettingsPaneId): SettingDefinition[] {
        const definitions: SettingDefinition[] = [];
        const seenNames = new Set<string>();

        for (const itemKey of SETTINGS_PANE_SEARCH_ITEM_KEYS[tabId]) {
            const definition = this.createHiddenNativeSearchDefinition(itemKey, seenNames);
            if (definition) {
                definitions.push(definition);
            }
        }

        return definitions;
    }

    private createHiddenNativeSearchDefinition(itemKey: SettingsItemKey, seenNames: Set<string>): SettingDefinition | null {
        const value = strings.settings.items[itemKey] as unknown;
        const name = this.getSearchableSettingName(value);
        if (!name || seenNames.has(name)) {
            return null;
        }

        seenNames.add(name);
        const visible = SETTINGS_SEARCH_VISIBILITY_GETTERS[itemKey];
        return {
            name,
            desc: this.collectSearchText(value)
                .filter(text => text !== name)
                .join(' '),
            ...(visible ? { visible: () => visible(this.plugin) } : {}),
            render: setting => {
                setting.settingEl.addClass('nn-setting-hidden');
            }
        };
    }

    private getSearchableSettingName(value: unknown): string | null {
        if (typeof value !== 'object' || value === null || !('name' in value) || typeof value.name !== 'string') {
            return null;
        }

        const name = value.name.trim();
        return name.length > 0 ? name : null;
    }

    private mapHiddenSearchDefinitionsToRenderedRows(containerEl: HTMLElement, definitions: SettingDefinition[]): void {
        const settingElements = Array.from(containerEl.querySelectorAll<HTMLElement>(RENDERED_SETTING_ITEM_SELECTOR));
        const settingElementsByName = new Map<string, HTMLElement[]>();

        for (const settingEl of settingElements) {
            const name = settingEl.querySelector<HTMLElement>('.setting-item-name')?.textContent?.trim();
            if (!name) {
                continue;
            }

            const existingElements = settingElementsByName.get(name) ?? [];
            existingElements.push(settingEl);
            settingElementsByName.set(name, existingElements);
        }

        for (const definition of definitions) {
            const matchingElements = settingElementsByName.get(definition.name);
            const targetEl = matchingElements?.find(element => element.offsetParent !== null) ?? matchingElements?.[0];
            if (targetEl) {
                this.hiddenSearchDefinitionTargets.set(definition, targetEl);
            }
        }
    }

    /**
     * Obsidian calls this when a search result is selected. Search results backed by
     * index-only definitions should scroll to the visible custom Setting row.
     */
    getElementForDefinition(definition: SettingDefinition): HTMLElement | undefined {
        const mappedTargetEl = this.hiddenSearchDefinitionTargets.get(definition);
        if (mappedTargetEl?.isConnected) {
            return mappedTargetEl;
        }

        const renderContainerEl = this.settingsRenderContainerEl ?? this.containerEl;
        const fallbackTargetEl = this.findRenderedSettingElement(renderContainerEl, definition.name);
        if (fallbackTargetEl) {
            this.hiddenSearchDefinitionTargets.set(definition, fallbackTargetEl);
            return fallbackTargetEl;
        }

        if (mappedTargetEl) {
            this.hiddenSearchDefinitionTargets.delete(definition);
        }

        return undefined;
    }

    private findRenderedSettingElement(containerEl: HTMLElement, name: string): HTMLElement | undefined {
        const settingElements = Array.from(containerEl.querySelectorAll<HTMLElement>(RENDERED_SETTING_ITEM_SELECTOR));
        const matchingElements = settingElements.filter(
            settingEl => settingEl.querySelector<HTMLElement>('.setting-item-name')?.textContent?.trim() === name
        );
        return matchingElements.find(element => element.offsetParent !== null) ?? matchingElements[0];
    }

    private clearHiddenSearchDefinitionTargets(): void {
        this.hiddenSearchDefinitionTargets.clear();
    }

    private collectSearchText(value: unknown): string[] {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed ? [trimmed] : [];
        }

        if (Array.isArray(value)) {
            return value.flatMap(item => this.collectSearchText(item));
        }

        if (typeof value !== 'object' || value === null) {
            return [];
        }

        return Object.values(value).flatMap(item => this.collectSearchText(item));
    }

    private prepareSettingsRender(containerEl: HTMLElement): void {
        this.clearHiddenSearchDefinitionTargets();
        this.settingsRenderContainerEl = containerEl;
        containerEl.empty();
        containerEl.addClass('nn-settings-tab-root');

        this.diagnosticsController.prepareForRender();
        this.tabContentMap.clear();
        this.tabButtons.clear();
        this.tabIconElements.clear();
        this.primaryNavEl = null;
        this.secondaryNavEl = null;
        this.tabSettingsUpdateListeners.clear();
        this.showTagsListeners = [];
        this.currentShowTagsVisible = this.plugin.settings.showTags;
    }

    private renderSettingsPane(tabId: SettingsPaneId, containerEl: HTMLElement): void {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
        if (!definition) {
            return;
        }

        this.activeNativePaneId = tabId;
        this.prepareSettingsRender(containerEl);

        const tabContainer = containerEl.createDiv('nn-settings-tab is-active');
        const context = this.createTabContext(tabContainer);
        definition.render(context);
        this.lastActiveTabId = tabId;
        this.diagnosticsController.handleTabActivation(tabId);
    }

    private renderSettingsTab(options?: { focus?: boolean; restoreScrollTop?: number; containerEl?: HTMLElement }): void {
        const shouldFocus = options?.focus ?? false;
        const restoreScrollTop = options?.restoreScrollTop;

        const containerEl = options?.containerEl ?? this.containerEl;
        this.activeNativePaneId = null;
        this.prepareSettingsRender(containerEl);

        // Create tab navigation structure
        const tabsWrapper = containerEl.createDiv('nn-settings-tabs');
        const navEl = tabsWrapper.createDiv('nn-settings-tabs-nav');
        navEl.setAttribute('role', 'tablist');
        const primaryNavEl = navEl.createDiv('nn-settings-tabs-nav-row nn-settings-tabs-nav-primary');
        this.primaryNavEl = primaryNavEl;
        const secondaryNavEl = navEl.createDiv('nn-settings-tabs-nav-row nn-settings-tabs-nav-secondary');
        this.secondaryNavEl = secondaryNavEl;
        const contentWrapper = tabsWrapper.createDiv('nn-settings-tabs-content');

        const createTabButton = (container: HTMLElement, tabId: SettingsPaneId, variant: 'primary' | 'secondary'): void => {
            const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
            if (!definition) {
                return;
            }

            const buttonComponent = new ButtonComponent(container);
            buttonComponent.setButtonText(definition.getLabel());
            const iconEl = buttonComponent.buttonEl.createSpan('nn-settings-tab-icon');
            iconEl.setAttribute('aria-hidden', 'true');
            buttonComponent.buttonEl.prepend(iconEl);
            this.tabIconElements.set(tabId, iconEl);
            this.renderTabButtonIcon(tabId);
            buttonComponent.removeCta();
            buttonComponent.buttonEl.addClass('nn-settings-tab-button');
            buttonComponent.buttonEl.addClass('clickable-icon');
            buttonComponent.buttonEl.addClass(
                variant === 'primary' ? 'nn-settings-tab-button-primary' : 'nn-settings-tab-button-secondary'
            );
            buttonComponent.buttonEl.setAttribute('role', 'tab');
            buttonComponent.buttonEl.setAttribute('aria-selected', 'false');
            buttonComponent.onClick(() => {
                this.activateTab(tabId, contentWrapper);
            });
            this.tabButtons.set(tabId, buttonComponent);
        };

        SETTINGS_GROUP_IDS.forEach(groupId => {
            createTabButton(primaryNavEl, groupId, 'primary');
        });

        SETTINGS_SECONDARY_TAB_IDS_ORDERED.forEach(tabId => {
            createTabButton(secondaryNavEl, tabId, 'secondary');
        });

        // Activate previously open tab if available, otherwise default to first
        const fallbackTabId = SETTINGS_PANE_DEFINITIONS[0]?.id ?? null;
        const initialTabId =
            this.lastActiveTabId && SETTINGS_PANE_DEFINITION_MAP.has(this.lastActiveTabId) ? this.lastActiveTabId : fallbackTabId;
        if (initialTabId) {
            this.activateTab(initialTabId, contentWrapper, { focus: shouldFocus, preserveScroll: restoreScrollTop !== undefined });
        }
        if (restoreScrollTop !== undefined) {
            contentWrapper.scrollTop = restoreScrollTop;
        }
    }

    /**
     * Creates a context object for rendering settings tabs
     * Provides access to app, plugin, and utility methods for tab rendering
     */
    private createTabContext(container: HTMLElement): SettingsTabContext {
        return {
            app: this.app,
            plugin: this.plugin,
            containerEl: container,
            addToggleSetting: (addSetting, name, desc, getValue, setValue, onAfterUpdate) =>
                this.addToggleSetting(addSetting, name, desc, getValue, setValue, onAfterUpdate),
            addInfoSetting: (addSetting, cls, render) => this.addInfoSetting(addSetting, cls, render),
            createDebouncedTextSetting: (parent, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate) =>
                this.createDebouncedTextSetting(parent, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate),
            configureDebouncedTextSetting: (setting, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate) =>
                this.configureDebouncedTextSetting(setting, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate),
            createDebouncedTextAreaSetting: (parent, name, desc, placeholder, getValue, setValue, options) =>
                this.createDebouncedTextAreaSetting(parent, name, desc, placeholder, getValue, setValue, options),
            configureDebouncedTextAreaSetting: (setting, name, desc, placeholder, getValue, setValue, options) =>
                this.configureDebouncedTextAreaSetting(setting, name, desc, placeholder, getValue, setValue, options),
            registerSettingsUpdateListener: (id, listener) => {
                this.tabSettingsUpdateListeners.set(id, listener);
            },
            unregisterSettingsUpdateListener: id => {
                this.tabSettingsUpdateListeners.delete(id);
            },
            registerMetadataInfoElement: element => {
                this.diagnosticsController.registerMetadataInfoElement(element);
            },
            registerStatsTextElement: element => {
                this.diagnosticsController.registerStatsTextElement(element);
            },
            requestStatisticsRefresh: () => {
                this.diagnosticsController.requestRefresh();
            },
            ensureStatisticsInterval: () => {
                this.diagnosticsController.ensureStatisticsInterval();
            },
            openSettingsTab: (tabId: SettingsTabId) => {
                this.plugin.openSettingsTab(tabId);
            },
            registerShowTagsListener: listener => {
                this.showTagsListeners.push(listener);
                listener(this.currentShowTagsVisible);
            },
            notifyShowTagsVisibility: visible => {
                this.currentShowTagsVisible = visible;
                this.showTagsListeners.forEach(callback => callback(visible));
            }
        };
    }

    /**
     * Activates a settings tab by ID
     * Creates tab content if it doesn't exist yet (lazy loading)
     * Updates active state for both content and buttons
     */
    private activateTab(id: SettingsPaneId, contentWrapper: HTMLElement, options?: { focus?: boolean; preserveScroll?: boolean }): void {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(id);
        if (!definition) {
            return;
        }
        const shouldFocus = options?.focus ?? false;

        // Lazy load tab content on first access
        if (!this.tabContentMap.has(id)) {
            const tabContainer = contentWrapper.createDiv('nn-settings-tab');
            const context = this.createTabContext(tabContainer);
            definition.render(context);
            this.tabContentMap.set(id, tabContainer);
        }

        const previousTabId = this.lastActiveTabId;
        if (previousTabId && previousTabId !== id) {
            this.tabContentMap.get(previousTabId)?.toggleClass('is-active', false);
        }

        this.tabContentMap.get(id)?.toggleClass('is-active', true);
        this.lastActiveTabId = id;
        this.updateTabNavigation(id);
        if (!options?.preserveScroll) {
            contentWrapper.scrollTop = 0;
        }

        this.diagnosticsController.handleTabActivation(id);

        if (shouldFocus) {
            this.tabButtons.get(id)?.buttonEl.focus();
        }
    }

    /**
     * Called when settings tab is closed
     * Cleans up any pending debounce timers and intervals to prevent memory leaks
     */
    hide(): void {
        this.plugin.unregisterSettingsUpdateListener(this.settingsUpdateListenerId);
        this.clearHiddenSearchDefinitionTargets();

        // Clean up all pending debounce timers when settings tab is closed
        this.debounceTimers.forEach(timer => window.clearTimeout(timer));
        this.debounceTimers.clear();

        this.diagnosticsController.dispose();

        // Clear references and state
        this.primaryNavEl = null;
        this.secondaryNavEl = null;
        this.tabSettingsUpdateListeners.clear();
        this.tabContentMap.clear();
        this.tabButtons.clear();
        this.tabIconElements.clear();
        this.showTagsListeners = [];
        this.settingsRenderContainerEl?.removeClass('nn-settings-tab-root');
        this.settingsRenderContainerEl = null;
        this.activeNativePaneId = null;
        this.containerEl.removeClass('nn-settings-tab-root');
    }
}

export type {
    NotebookNavigatorSettings,
    SortOption,
    ListSortOverride,
    ListSortOverrideValue,
    AlphaSortOrder,
    ItemScope,
    MultiSelectModifier,
    DeleteAttachmentsSetting,
    FeatureImagePixelSizeSetting,
    FeatureImageSizeSetting,
    ListPaneTitleOption,
    PropertySortSecondaryOption,
    AlphabeticalDateMode
} from './settings/types';
export { DEFAULT_SETTINGS } from './settings/defaultSettings';
