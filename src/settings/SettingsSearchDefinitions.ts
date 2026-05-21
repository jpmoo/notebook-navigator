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

import { Platform } from 'obsidian';
import type { SettingDefinition } from 'obsidian';
import { strings } from '../i18n';
import type NotebookNavigatorPlugin from '../main';
import type { SettingsPaneId } from './SettingsPaneDefinitions';

type SettingsItemKey = keyof typeof strings.settings.items;
type SettingsSearchVisibilityGetter = (plugin: NotebookNavigatorPlugin) => boolean;

export const RENDERED_SETTING_ITEM_SELECTOR = '.setting-item:not(.setting-item-heading):not(.nn-setting-hidden)';

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

export function createSettingsSearchDefinitions(tabId: SettingsPaneId, plugin: NotebookNavigatorPlugin): SettingDefinition[] {
    const definitions: SettingDefinition[] = [];
    const seenNames = new Set<string>();

    for (const itemKey of SETTINGS_PANE_SEARCH_ITEM_KEYS[tabId]) {
        const definition = createSettingsSearchDefinition(itemKey, seenNames, plugin);
        if (definition) {
            definitions.push(definition);
        }
    }

    return definitions;
}

function createSettingsSearchDefinition(
    itemKey: SettingsItemKey,
    seenNames: Set<string>,
    plugin: NotebookNavigatorPlugin
): SettingDefinition | null {
    const value = strings.settings.items[itemKey] as unknown;
    const name = getSearchableSettingName(value);
    if (!name || seenNames.has(name)) {
        return null;
    }

    seenNames.add(name);
    const visible = SETTINGS_SEARCH_VISIBILITY_GETTERS[itemKey];
    return {
        name,
        desc: collectSearchText(value)
            .filter(text => text !== name)
            .join(' '),
        ...(visible ? { visible: () => visible(plugin) } : {}),
        render: setting => {
            setting.settingEl.addClass('nn-setting-hidden');
        }
    };
}

function getSearchableSettingName(value: unknown): string | null {
    if (typeof value !== 'object' || value === null || !('name' in value) || typeof value.name !== 'string') {
        return null;
    }

    const name = value.name.trim();
    return name.length > 0 ? name : null;
}

function collectSearchText(value: unknown): string[] {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap(item => collectSearchText(item));
    }

    if (typeof value !== 'object' || value === null) {
        return [];
    }

    return Object.values(value).flatMap(item => collectSearchText(item));
}
