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

import React, { useCallback, useMemo } from 'react';
import { Menu } from 'obsidian';
import { useServices } from '../context/ServicesContext';
import { useSettingsState, useSettingsUpdate } from '../context/SettingsContext';
import { useUIState } from '../context/UIStateContext';
import { ObsidianIcon } from './ObsidianIcon';
import type { ShortcutCollection } from '../types/shortcuts';

interface ShortcutCollectionSelectorProps {
    collections: ShortcutCollection[];
    activeCollectionId: string;
    onCollectionChange: (collectionId: string) => void;
    onAddCollection: () => void;
    onEditCollection: (collectionId: string) => void;
    onDeleteCollection: (collectionId: string) => void;
}

/**
 * Component for selecting and managing shortcut collections
 * Displays a row of collection icons that can be clicked to switch collections
 */
export const ShortcutCollectionSelector = React.memo(function ShortcutCollectionSelector({
    collections,
    activeCollectionId,
    onCollectionChange,
    onAddCollection,
    onEditCollection,
    onDeleteCollection
}: ShortcutCollectionSelectorProps) {
    const { app } = useServices();
    const settings = useSettingsState();
    const updateSettings = useSettingsUpdate();
    const uiState = useUIState();

    // Sort collections with default first, then alphabetically
    const sortedCollections = useMemo(() => {
        return [...collections].sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [collections]);

    const handleCollectionClick = useCallback((collectionId: string) => {
        onCollectionChange(collectionId);
    }, [onCollectionChange]);

    const handleCollectionContextMenu = useCallback((event: React.MouseEvent, collectionId: string) => {
        event.preventDefault();
        event.stopPropagation();
        
        const menu = new Menu();
        
        // Don't allow editing/deleting the default collection
        const collection = collections.find(c => c.id === collectionId);
        if (collection && !collection.isDefault) {
        menu.addItem((item: any) => {
            item.setTitle('Edit Collection')
                .setIcon('lucide-edit')
                .onClick(() => onEditCollection(collectionId));
        });
        
        menu.addItem((item: any) => {
            item.setTitle('Delete Collection')
                .setIcon('lucide-trash-2')
                .onClick(() => onDeleteCollection(collectionId));
        });
        }
        
        menu.showAtMouseEvent(event.nativeEvent);
    }, [app, collections, onEditCollection, onDeleteCollection]);

    if (!settings.showShortcuts) {
        return null;
    }

    return (
        <div className="nn-shortcut-collection-selector">
            <div className="nn-collection-tabs">
                {sortedCollections.map(collection => (
                    <button
                        key={collection.id}
                        className={`nn-collection-tab ${activeCollectionId === collection.id ? 'nn-collection-tab--active' : ''}`}
                        onClick={() => handleCollectionClick(collection.id)}
                        onContextMenu={(e) => handleCollectionContextMenu(e, collection.id)}
                        title={collection.name}
                        tabIndex={-1}
                    >
                        <ObsidianIcon name={collection.icon} />
                    </button>
                ))}
                <button
                    className="nn-collection-tab nn-collection-tab--add"
                    onClick={onAddCollection}
                    title="Add Collection"
                    tabIndex={-1}
                >
                    <ObsidianIcon name="lucide-plus" />
                </button>
            </div>
        </div>
    );
});
