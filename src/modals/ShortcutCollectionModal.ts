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

import { App, Modal, Setting, Menu, Notice, setIcon } from 'obsidian';
import { strings } from '../i18n';
import { ObsidianIcon } from '../components/ObsidianIcon';
import type { ShortcutCollection } from '../types/shortcuts';
import type { MetadataService } from '../services/MetadataService';
import { ItemType } from '../types';

interface ShortcutCollectionModalProps {
    collections: ShortcutCollection[];
    onSave: (collections: ShortcutCollection[]) => void;
    editingCollection?: ShortcutCollection;
}

/**
 * Modal for creating and editing shortcut collections
 */
export class ShortcutCollectionModal extends Modal {
    private collections: ShortcutCollection[];
    private onSave: (collections: ShortcutCollection[]) => void;
    private editingCollection?: ShortcutCollection;
    private metadataService: MetadataService;
    
    private nameInput: HTMLInputElement | null = null;
    private iconButton: HTMLButtonElement | null = null;
    private selectedIcon: string = 'lucide-bookmark';

    constructor(app: App, metadataService: MetadataService, props: ShortcutCollectionModalProps) {
        super(app);
        this.metadataService = metadataService;
        this.collections = [...props.collections];
        this.onSave = props.onSave;
        this.editingCollection = props.editingCollection;
        
        if (this.editingCollection) {
            this.selectedIcon = this.editingCollection.icon;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.editingCollection ? 'Edit Collection' : 'New Collection' });

        // Name input
        new Setting(contentEl)
            .setName('Collection Name')
            .setDesc('Enter a name for this shortcut collection')
            .addText(text => {
                text.setPlaceholder('My Collection')
                    .setValue(this.editingCollection?.name || '')
                    .onChange(value => {
                        // Store reference to input element
                        this.nameInput = text.inputEl;
                    });
                // Set the input reference immediately
                this.nameInput = text.inputEl;
            });

        // Icon selection
        new Setting(contentEl)
            .setName('Collection Icon')
            .setDesc('Choose an icon for this collection')
            .addButton(button => {
                button.setButtonText('Select Icon')
                    .setIcon(this.selectedIcon)
                    .onClick(() => {
                        this.showIconPicker();
                    });
                // Store reference to button for updating
                this.iconButton = button.buttonEl;
            });

        // Action buttons
        new Setting(contentEl)
            .addButton(button => {
                button.setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .addButton(button => {
                button.setButtonText(this.editingCollection ? 'Update' : 'Create')
                    .onClick(() => this.saveCollection());
            });
    }

    private async showIconPicker() {
        const { IconPickerModal } = await import('./IconPickerModal');
        const modal = new IconPickerModal(this.app, this.metadataService, 'collection', ItemType.FOLDER);
        modal.onChooseIcon = (iconId) => {
            if (iconId) {
                this.selectedIcon = iconId;
                this.updateIconButton();
            }
        };
        modal.open();
    }

    private updateIconButton() {
        if (this.iconButton) {
            // Update the button's icon using Obsidian's setIcon
            setIcon(this.iconButton, this.selectedIcon);
        }
    }

    private async saveCollection() {
        const name = this.nameInput?.value.trim();
        if (!name) {
            new Notice('Please enter a collection name');
            return;
        }

        // Check for duplicate names
        const existingCollection = this.collections.find(c => 
            c.name.toLowerCase() === name.toLowerCase() && 
            (!this.editingCollection || c.id !== this.editingCollection.id)
        );
        
        if (existingCollection) {
            new Notice('A collection with this name already exists');
            return;
        }

        if (this.editingCollection) {
            // Update existing collection
            const index = this.collections.findIndex(c => c.id === this.editingCollection!.id);
            if (index !== -1) {
                this.collections[index] = {
                    ...this.collections[index],
                    name,
                    icon: this.selectedIcon
                    // Preserve isDefault flag and id for default collection
                };
            }
        } else {
            // Create new collection
            const newCollection: ShortcutCollection = {
                id: `collection_${Date.now()}`,
                name,
                icon: this.selectedIcon,
                shortcuts: []
            };
            this.collections.push(newCollection);
        }

        this.onSave(this.collections);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
