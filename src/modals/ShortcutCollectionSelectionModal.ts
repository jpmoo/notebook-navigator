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

import { App, Modal, Setting } from 'obsidian';
import { ObsidianIcon } from '../components/ObsidianIcon';
import type { ShortcutCollection } from '../types/shortcuts';

interface ShortcutCollectionSelectionModalProps {
    collections: ShortcutCollection[];
    existingCollections?: string[];
    onSelect: (collectionId: string) => void;
    onCancel: () => void;
}

/**
 * Modal for selecting which collection to add a shortcut to
 */
export class ShortcutCollectionSelectionModal extends Modal {
    private collections: ShortcutCollection[];
    private existingCollections: string[];
    private onSelect: (collectionId: string) => void;
    private onCancel: () => void;

    constructor(app: App, props: ShortcutCollectionSelectionModalProps) {
        super(app);
        this.collections = props.collections;
        this.existingCollections = props.existingCollections || [];
        this.onSelect = props.onSelect;
        this.onCancel = props.onCancel;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Add to Collection' });
        contentEl.createEl('p', { text: 'Choose which collection to add this shortcut to:' });

        // Create collection selection buttons
        this.collections.forEach(collection => {
            const isExisting = this.existingCollections.includes(collection.id);
            const setting = new Setting(contentEl)
                .setName(collection.name)
                .setDesc(collection.isDefault ? 'Default collection' : '');

            if (isExisting) {
                // Show that it already exists and is disabled
                setting.addButton(button => {
                    button.setButtonText('Already Added')
                        .setIcon(collection.icon)
                        .setDisabled(true)
                        .setClass('mod-disabled');
                });
            } else {
                // Show as selectable
                setting.addButton(button => {
                    button.setButtonText('Select')
                        .setIcon(collection.icon)
                        .onClick(() => {
                            this.onSelect(collection.id);
                            this.close();
                        });
                });
            }
        });

        // Cancel button
        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('Cancel')
                    .onClick(() => {
                        this.onCancel();
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
