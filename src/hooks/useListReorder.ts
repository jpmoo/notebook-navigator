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

import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { ListReorderHandlers } from '../types/listReorder';

interface UseListReorderOptions {
    items: Array<{ key: string }>;
    isEnabled: boolean;
    reorderItems: (orderedKeys: string[]) => Promise<boolean>;
}

interface UseListReorderResult {
    getDragHandlers: (key: string) => ListReorderHandlers;
    dropIndex: number | null;
    draggingKey: string | null;
}

export function useListReorder({ items, isEnabled, reorderItems }: UseListReorderOptions): UseListReorderResult {
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const dragOverIndexRef = useRef<number | null>(null);

    const getDragHandlers = useCallback(
        (key: string): ListReorderHandlers => {
            if (!isEnabled) {
                return {};
            }

            const itemIndex = items.findIndex(item => item.key === key);

            return {
                onDragStart: (event: DragEvent<HTMLElement>) => {
                    setDraggingKey(key);
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', key);
                    }
                },
                onDragEnd: () => {
                    setDraggingKey(null);
                    setDropIndex(null);
                    dragOverIndexRef.current = null;
                },
                onDragOver: (event: DragEvent<HTMLElement>) => {
                    event.preventDefault();
                    if (event.dataTransfer) {
                        event.dataTransfer.dropEffect = 'move';
                    }

                    const rect = event.currentTarget.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    const newIndex = event.clientY < midpoint ? itemIndex : itemIndex + 1;

                    if (dragOverIndexRef.current !== newIndex) {
                        dragOverIndexRef.current = newIndex;
                        setDropIndex(newIndex);
                    }
                },
                onDragLeave: () => {
                    // Only clear if we're leaving the container entirely
                },
                onDrop: async (event: DragEvent<HTMLElement>) => {
                    event.preventDefault();
                    const draggedKey = event.dataTransfer?.getData('text/plain');

                    if (!draggedKey || draggedKey === key) {
                        setDraggingKey(null);
                        setDropIndex(null);
                        dragOverIndexRef.current = null;
                        return;
                    }

                    const targetIndex = dragOverIndexRef.current ?? itemIndex;
                    const draggedIndex = items.findIndex(item => item.key === draggedKey);

                    if (draggedIndex === -1 || targetIndex === draggedIndex) {
                        setDraggingKey(null);
                        setDropIndex(null);
                        dragOverIndexRef.current = null;
                        return;
                    }

                    const newOrder = [...items.map(item => item.key)];
                    newOrder.splice(draggedIndex, 1);
                    newOrder.splice(targetIndex > draggedIndex ? targetIndex - 1 : targetIndex, 0, draggedKey);

                    const success = await reorderItems(newOrder);
                    if (success) {
                        setDraggingKey(null);
                        setDropIndex(null);
                        dragOverIndexRef.current = null;
                    }
                }
            };
        },
        [items, isEnabled, reorderItems]
    );

    return {
        getDragHandlers,
        dropIndex,
        draggingKey
    };
}





