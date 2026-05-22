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

import { strings } from '../../i18n';
import type { SettingDefinitionItem } from 'obsidian';
import { createDropdownDefinition, createGroupDefinition, createToggleDefinition } from '../nativeSettingControls';

/** Builds native 1.13 setting definitions for file operations settings. */
export function createFilesSettingDefinitions(heading?: string): SettingDefinitionItem[] {
    return [
        createGroupDefinition(heading, [
            createToggleDefinition('confirmBeforeDelete', {
                name: strings.settings.items.confirmBeforeDelete.name,
                desc: strings.settings.items.confirmBeforeDelete.desc
            }),
            createDropdownDefinition('deleteAttachments', {
                name: strings.settings.items.deleteAttachments.name,
                desc: strings.settings.items.deleteAttachments.desc,
                aliases: Object.values(strings.settings.items.deleteAttachments.options),
                options: {
                    ask: strings.settings.items.deleteAttachments.options.ask,
                    always: strings.settings.items.deleteAttachments.options.always,
                    never: strings.settings.items.deleteAttachments.options.never
                }
            }),
            createDropdownDefinition('moveFileConflicts', {
                name: strings.settings.items.moveFileConflicts.name,
                desc: strings.settings.items.moveFileConflicts.desc,
                aliases: Object.values(strings.settings.items.moveFileConflicts.options),
                options: {
                    ask: strings.settings.items.moveFileConflicts.options.ask,
                    rename: strings.settings.items.moveFileConflicts.options.rename
                }
            })
        ])
    ];
}
