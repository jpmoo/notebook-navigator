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

import type NotebookNavigatorPlugin from '../main';
import { resolveFileTypeIconId } from '../utils/fileIconUtils';
import { resolveUXIcon, type UXIconId } from '../utils/uxIcons';
import type { SettingsPaneId } from './SettingsPaneDefinitions';

/** Top-level group buttons for the pre-1.13 custom settings navigation. */
export type SettingsGroupId = 'general' | 'navigation-pane' | 'list-pane' | 'calendar' | 'advanced';

export const SETTINGS_GROUP_IDS: SettingsGroupId[] = ['general', 'navigation-pane', 'list-pane', 'calendar', 'advanced'];

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

export const SETTINGS_GROUP_SECONDARY_TAB_IDS: Record<SettingsGroupId, SettingsPaneId[]> = {
    general: ['vault-filters', 'appearance-behavior', 'icon-packs'],
    'navigation-pane': ['shortcuts', 'folders', 'tags-properties'],
    'list-pane': ['file-operations', 'frontmatter', 'notes'],
    calendar: [],
    advanced: []
};

export const SETTINGS_TAB_GROUP_MAP: Record<SettingsPaneId, SettingsGroupId> = {
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

export const SETTINGS_SECONDARY_TAB_IDS_ORDERED: SettingsPaneId[] = [
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS.general,
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS['navigation-pane'],
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS['list-pane'],
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS.calendar
];

export function resolveSettingsTabIconId(plugin: NotebookNavigatorPlugin, tabId: SettingsPaneId): string | null {
    const iconDefinition = SETTINGS_TAB_ICONS[tabId];
    if (!iconDefinition) {
        return null;
    }

    if (iconDefinition.kind === 'fixed') {
        return iconDefinition.iconId;
    }

    if (iconDefinition.kind === 'ux') {
        return resolveUXIcon(plugin.settings.interfaceIcons, iconDefinition.uxIconId);
    }

    return resolveFileTypeIconId(iconDefinition.fileTypeKey, plugin.settings.fileTypeIconMap) ?? iconDefinition.fallbackIconId;
}
