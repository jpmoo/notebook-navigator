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

import { App, Menu, MenuItem, TFile } from 'obsidian';
import { strings } from '../../i18n';
import { getCachedManualSortGroupHeaderValue, writeManualSortGroupHeader } from '../manualSort';
import { setAsyncOnClick } from './menuAsyncHelpers';

interface AddManualSortGroupHeaderMenuItemsParams {
    menu: Menu;
    app: App;
    file: TFile;
    propertyKey: string;
}

function addGroupHeaderEditorItem(menu: Menu, app: App, file: TFile, propertyKey: string, title: string, currentValue: string): void {
    menu.addItem((item: MenuItem) => {
        setAsyncOnClick(item.setTitle(title).setIcon('lucide-heading'), async () => {
            const { InputModal } = await import('../../modals/InputModal');
            const modal = new InputModal(
                app,
                strings.modals.manualSortGroupHeader.title,
                strings.modals.manualSortGroupHeader.placeholder,
                async value => {
                    await writeManualSortGroupHeader(app, file, propertyKey, value);
                },
                currentValue,
                {
                    description: strings.modals.manualSortGroupHeader.description.replace('{property}', propertyKey)
                }
            );
            modal.open();
        });
    });
}

export function addManualSortGroupHeaderMenuItems({ menu, app, file, propertyKey }: AddManualSortGroupHeaderMenuItemsParams): boolean {
    if (file.extension !== 'md') {
        return false;
    }

    const currentValue = getCachedManualSortGroupHeaderValue(app, file, propertyKey) ?? '';
    if (!currentValue) {
        addGroupHeaderEditorItem(menu, app, file, propertyKey, strings.contextMenu.file.setManualSortGroupHeader, currentValue);
        return true;
    }

    addGroupHeaderEditorItem(menu, app, file, propertyKey, strings.contextMenu.file.changeManualSortGroupHeader, currentValue);
    menu.addItem((item: MenuItem) => {
        setAsyncOnClick(item.setTitle(strings.contextMenu.file.removeManualSortGroupHeader).setIcon('lucide-eraser'), async () => {
            await writeManualSortGroupHeader(app, file, propertyKey, '');
        });
    });
    return true;
}
