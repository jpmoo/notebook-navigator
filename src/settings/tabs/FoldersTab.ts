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

import { Setting } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import { strings } from '../../i18n';
import { isAlphaSortOrder } from '../types';
import type { SettingsTabContext } from './SettingsTabContext';
import {
    createDropdownDefinition,
    createGroupDefinition,
    createRenderDefinition,
    createTextDefinition,
    createToggleDefinition
} from '../nativeSettingControls';
import { addSettingSyncModeToggle } from '../syncModeToggle';
import { FilePathInputSuggest } from '../../suggest/FilePathInputSuggest';
import { FOLDER_NOTE_NAME_PATTERN_PLACEHOLDER } from '../../utils/folderNoteName';
import { normalizeOptionalVaultFilePath } from '../../utils/pathUtils';

/** Builds native 1.13 setting definitions for folder and folder note settings. */
export function createFoldersSettingDefinitions(context: SettingsTabContext, heading?: string): SettingDefinitionItem[] {
    const { plugin } = context;

    return [
        createGroupDefinition(heading, [
            createToggleDefinition('showFolderIcons', {
                name: strings.settings.items.showFolderIcons.name,
                desc: strings.settings.items.showFolderIcons.desc
            }),
            createToggleDefinition('showRootFolder', {
                name: strings.settings.items.showRootFolder.name,
                desc: strings.settings.items.showRootFolder.desc
            }),
            createToggleDefinition('inheritFolderColors', {
                name: strings.settings.items.inheritFolderColors.name,
                desc: strings.settings.items.inheritFolderColors.desc
            }),
            createRenderDefinition({
                name: strings.settings.items.folderSortOrder.name,
                desc: strings.settings.items.folderSortOrder.desc,
                aliases: Object.values(strings.settings.items.folderSortOrder.options),
                render: setting => renderFolderSortOrderSetting(setting, context)
            })
        ]),
        createGroupDefinition(strings.settings.sections.folderNotes, [
            createToggleDefinition('enableFolderNotes', {
                name: strings.settings.items.enableFolderNotes.name,
                desc: strings.settings.items.enableFolderNotes.desc
            }),
            createDropdownDefinition('folderNoteType', {
                name: strings.settings.items.folderNoteType.name,
                desc: strings.settings.items.folderNoteType.desc,
                aliases: Object.values(strings.settings.items.folderNoteType.options),
                visible: () => plugin.settings.enableFolderNotes,
                options: {
                    ask: strings.settings.items.folderNoteType.options.ask,
                    markdown: strings.settings.items.folderNoteType.options.markdown,
                    canvas: strings.settings.items.folderNoteType.options.canvas,
                    base: strings.settings.items.folderNoteType.options.base
                }
            }),
            createTextDefinition('folderNoteName', {
                name: strings.settings.items.folderNoteName.name,
                desc: strings.settings.items.folderNoteName.desc,
                aliases: [strings.settings.items.folderNoteName.placeholder],
                visible: () => plugin.settings.enableFolderNotes
            }),
            createTextDefinition('folderNoteNamePattern', {
                name: strings.settings.items.folderNoteNamePattern.name,
                desc: strings.settings.items.folderNoteNamePattern.desc,
                aliases: [FOLDER_NOTE_NAME_PATTERN_PLACEHOLDER],
                visible: () => plugin.settings.enableFolderNotes
            }),
            createRenderDefinition({
                name: strings.settings.items.folderNoteTemplate.name,
                desc: strings.settings.items.folderNoteTemplate.desc,
                visible: () => plugin.settings.enableFolderNotes,
                render: setting => renderFolderNoteTemplateSetting(setting, context)
            }),
            createToggleDefinition('enableFolderNoteLinks', {
                name: strings.settings.items.enableFolderNoteLinks.name,
                desc: strings.settings.items.enableFolderNoteLinks.desc,
                visible: () => plugin.settings.enableFolderNotes
            }),
            createToggleDefinition('hideFolderNoteInList', {
                name: strings.settings.items.hideFolderNoteInList.name,
                desc: strings.settings.items.hideFolderNoteInList.desc,
                visible: () => plugin.settings.enableFolderNotes
            }),
            createToggleDefinition('pinCreatedFolderNote', {
                name: strings.settings.items.pinCreatedFolderNote.name,
                desc: strings.settings.items.pinCreatedFolderNote.desc,
                visible: () => plugin.settings.enableFolderNotes
            }),
            createToggleDefinition('openFolderNotesInNewTab', {
                name: strings.settings.items.openFolderNotesInNewTab.name,
                desc: strings.settings.items.openFolderNotesInNewTab.desc,
                visible: () => plugin.settings.enableFolderNotes
            })
        ])
    ];
}

function renderFolderSortOrderSetting(setting: Setting, context: SettingsTabContext): void {
    const { plugin } = context;

    setting.setName(strings.settings.items.folderSortOrder.name).setDesc(strings.settings.items.folderSortOrder.desc);
    setting.addDropdown(dropdown => {
        dropdown
            .addOption('alpha-asc', strings.settings.items.folderSortOrder.options.alphaAsc)
            .addOption('alpha-desc', strings.settings.items.folderSortOrder.options.alphaDesc)
            .setValue(plugin.getFolderSortOrder())
            .onChange(value => {
                if (!isAlphaSortOrder(value)) {
                    return;
                }
                plugin.setFolderSortOrder(value);
            });
    });

    addSettingSyncModeToggle({ setting, plugin, settingId: 'folderSortOrder' });
}

function renderFolderNoteTemplateSetting(setting: Setting, context: SettingsTabContext): void {
    const { plugin } = context;

    context.configureDebouncedTextSetting(
        setting,
        strings.settings.items.folderNoteTemplate.name,
        strings.settings.items.folderNoteTemplate.desc,
        '',
        () => plugin.settings.folderNoteTemplate ?? '',
        value => {
            plugin.settings.folderNoteTemplate = normalizeOptionalVaultFilePath(value);
        }
    );
    setting.controlEl.addClass('nn-setting-wide-input');
    const folderNoteTemplateInputEl = setting.controlEl.querySelector<HTMLInputElement>('input');
    if (folderNoteTemplateInputEl) {
        const templateSuggest = new FilePathInputSuggest(context.app, folderNoteTemplateInputEl, {
            getBaseFolder: () => plugin.settings.calendarTemplateFolder,
            includeFile: file => file.extension === 'md'
        });
        folderNoteTemplateInputEl.addEventListener('click', () => templateSuggest.open());
    }
}
