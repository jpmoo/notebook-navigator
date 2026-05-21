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

import { strings } from '../i18n';
import { renderAdvancedTab } from './tabs/AdvancedTab';
import { renderCalendarTab } from './tabs/CalendarTab';
import { renderFoldersAndFolderNotesTab, renderTagsPropertiesTab } from './tabs/ContentTab';
import { renderDisplayFiltersTab } from './tabs/DisplayFiltersTab';
import { renderFilesTab } from './tabs/FilesTab';
import { renderFrontmatterTab } from './tabs/FrontmatterTab';
import { renderGeneralTab } from './tabs/GeneralTab';
import { renderIconPacksTab } from './tabs/IconPacksTab';
import { renderListPaneTab } from './tabs/ListTab';
import { renderNavigationPaneTab } from './tabs/NavigationTab';
import { renderNotesTab } from './tabs/NotesTab';
import { renderShortcutsTab } from './tabs/ShortcutsTab';
import { renderAppearanceBehaviorTab } from './tabs/AppearanceBehaviorTab';
import type { SettingsTabContext, SettingsTabId } from './tabs/SettingsTabContext';

/** Identifiers for settings panes rendered as native settings pages. */
export type SettingsPaneId = Exclude<SettingsTabId, 'files' | 'tags' | 'properties'>;

export interface SettingsPageGroupDefinition {
    getHeading: () => string;
    items: SettingsPaneId[];
}

/** Definition of a settings pane with its ID, label resolver, and render function. */
export interface SettingsPaneDefinition {
    id: SettingsPaneId;
    getLabel: () => string;
    render: (context: SettingsTabContext) => void;
}

export const SETTINGS_PAGE_GROUP_DEFINITIONS: SettingsPageGroupDefinition[] = [
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

export const SETTINGS_PAGE_DESCRIPTION_GETTERS: Record<SettingsPaneId, () => string> = {
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

export const SETTINGS_PANE_DEFINITIONS: SettingsPaneDefinition[] = [
    { id: 'general', getLabel: () => strings.settings.sections.general, render: renderGeneralTab },
    { id: 'vault-filters', getLabel: () => strings.settings.sections.vaultFilters, render: renderDisplayFiltersTab },
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

export const SETTINGS_PANE_DEFINITION_MAP = new Map<SettingsPaneId, SettingsPaneDefinition>(
    SETTINGS_PANE_DEFINITIONS.map(definition => [definition.id, definition])
);

export function resolveSettingsPaneId(tabId: SettingsTabId): SettingsPaneId {
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
