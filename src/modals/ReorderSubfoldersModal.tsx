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

import React, { useMemo, useState } from 'react';
import { Root, createRoot } from 'react-dom/client';
import { App, Modal, TFolder } from 'obsidian';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { strings } from '../i18n';
import { naturalCompare } from '../utils/sortUtils';

interface SubfolderEntry {
    path: string;
    name: string;
}

/**
 * Orders a folder's immediate subfolders by the saved manual order (when present),
 * appending any not-yet-ordered subfolders in natural-alphabetical order at the end.
 */
function orderSubfolders(folder: TFolder, savedOrder: readonly string[] | undefined): SubfolderEntry[] {
    const subfolders = folder.children.filter((child): child is TFolder => child instanceof TFolder);
    const byPath = new Map(subfolders.map(child => [child.path, child]));
    const ordered: SubfolderEntry[] = [];
    const used = new Set<string>();

    for (const path of savedOrder ?? []) {
        const child = byPath.get(path);
        if (child && !used.has(path)) {
            ordered.push({ path: child.path, name: child.name });
            used.add(path);
        }
    }

    const remaining = subfolders.filter(child => !used.has(child.path)).sort((a, b) => naturalCompare(a.name, b.name));
    for (const child of remaining) {
        ordered.push({ path: child.path, name: child.name });
    }
    return ordered;
}

function SortableSubfolderRow({ entry }: { entry: SubfolderEntry }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.path });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1
    };
    return (
        <div ref={setNodeRef} className="nn-reorder-subfolders-row" style={style} {...attributes} {...listeners}>
            <span className="nn-reorder-subfolders-grip" aria-hidden="true">
                ⋮⋮
            </span>
            <span className="nn-reorder-subfolders-name">{entry.name}</span>
        </div>
    );
}

interface ReorderSubfoldersContentProps {
    folderName: string;
    initialEntries: SubfolderEntry[];
    onSave: (orderedPaths: string[]) => void;
    onCancel: () => void;
}

function ReorderSubfoldersContent({ folderName, initialEntries, onSave, onCancel }: ReorderSubfoldersContentProps) {
    const [entries, setEntries] = useState<SubfolderEntry[]>(initialEntries);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    const itemIds = useMemo(() => entries.map(entry => entry.path), [entries]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) {
            return;
        }
        setEntries(current => {
            const oldIndex = current.findIndex(entry => entry.path === active.id);
            const newIndex = current.findIndex(entry => entry.path === over.id);
            if (oldIndex === -1 || newIndex === -1) {
                return current;
            }
            return arrayMove(current, oldIndex, newIndex);
        });
    };

    return (
        <div className="nn-reorder-subfolders">
            <div className="nn-reorder-subfolders-hint">{strings.modals.reorderSubfolders.instructions.replace('{folder}', folderName)}</div>
            <div className="nn-reorder-subfolders-list">
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                        {entries.map(entry => (
                            <SortableSubfolderRow key={entry.path} entry={entry} />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>
            <div className="nn-reorder-subfolders-actions">
                <button type="button" className="nn-support-button" onClick={onCancel}>
                    {strings.common.cancel}
                </button>
                <button type="button" className="mod-cta" onClick={() => onSave(entries.map(entry => entry.path))}>
                    {strings.modals.reorderSubfolders.save}
                </button>
            </div>
        </div>
    );
}

/**
 * Modal for drag-reordering a folder's immediate subfolders into a custom order.
 * Mounts a small React tree (reusing @dnd-kit) and returns the chosen order via onSave.
 */
export class ReorderSubfoldersModal extends Modal {
    private root: Root | null = null;

    constructor(
        app: App,
        private readonly folder: TFolder,
        private readonly savedOrder: readonly string[] | undefined,
        private readonly onSave: (orderedPaths: string[]) => void
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(strings.modals.reorderSubfolders.title);
        const initialEntries = orderSubfolders(this.folder, this.savedOrder);
        this.root = createRoot(this.contentEl);
        this.root.render(
            <React.StrictMode>
                <ReorderSubfoldersContent
                    folderName={this.folder.name}
                    initialEntries={initialEntries}
                    onSave={orderedPaths => {
                        this.onSave(orderedPaths);
                        this.close();
                    }}
                    onCancel={() => this.close()}
                />
            </React.StrictMode>
        );
    }

    onClose(): void {
        this.root?.unmount();
        this.root = null;
        this.contentEl.empty();
    }
}
