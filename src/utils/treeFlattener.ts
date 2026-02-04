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

import { TFolder } from 'obsidian';
import { naturalCompare } from './sortUtils';
import { NavigationPaneItemType } from '../types';
import { TagTreeNode } from '../types/storage';
import type { FolderTreeItem, TagTreeItem } from '../types/virtualization';
import { isFolderInExcludedFolder } from './fileFilters';
import { matchesHiddenTagPattern, HiddenTagMatcher } from './tagPrefixMatcher';
import type { AlphaSortOrder } from '../settings';

/** Options for flattenFolderTree function */
interface FlattenFolderTreeOptions {
    /** Map of folder paths to their custom display order */
    rootOrderMap?: Map<string, number>;
    /** Default alphabetical order for child folders */
    defaultSortOrder?: AlphaSortOrder;
    /** Per-folder child sort order overrides */
    childSortOrderOverrides?: Record<string, AlphaSortOrder>;
}

/** Options for flattenTagTree function */
interface FlattenTagTreeOptions {
    /** Matcher for determining hidden tags */
    hiddenMatcher?: HiddenTagMatcher;
    /** Custom comparator for sorting tag nodes */
    comparator?: (a: TagTreeNode, b: TagTreeNode) => number;
    /** Per-tag child sort order overrides */
    childSortOrderOverrides?: Record<string, AlphaSortOrder>;
}

function compareAlpha(a: string, b: string, order: AlphaSortOrder): number {
    const cmp = naturalCompare(a, b);
    return order === 'alpha-desc' ? -cmp : cmp;
}

/**
 * Compares folders using custom order map with fallback to natural sorting.
 * Returns negative if a comes before b, positive if b comes before a, 0 if equal.
 */
export function compareFolderOrderWithFallback(
    a: TFolder,
    b: TFolder,
    orderMap?: Map<string, number>,
    fallback?: (first: TFolder, second: TFolder) => number
): number {
    const fallbackCompare = fallback ?? ((first: TFolder, second: TFolder) => naturalCompare(first.name, second.name));

    if (!orderMap || orderMap.size === 0) {
        return fallbackCompare(a, b);
    }

    const orderA = orderMap.get(a.path);
    const orderB = orderMap.get(b.path);

    if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
    }
    if (orderA !== undefined) {
        return -1;
    }
    if (orderB !== undefined) {
        return 1;
    }
    return fallbackCompare(a, b);
}

/**
 * Compares tags using custom order map with fallback to provided comparator or natural order.
 * Returns negative if a comes before b, positive if b comes before a, 0 if equal.
 */
export function compareTagOrderWithFallback(
    a: TagTreeNode,
    b: TagTreeNode,
    orderMap?: Map<string, number>,
    fallback?: (first: TagTreeNode, second: TagTreeNode) => number
): number {
    if (!orderMap || orderMap.size === 0) {
        return fallback ? fallback(a, b) : naturalCompare(a.name, b.name);
    }

    const orderA = orderMap.get(a.path);
    const orderB = orderMap.get(b.path);

    if (orderA !== undefined && orderB !== undefined) {
        return orderA - orderB;
    }
    if (orderA !== undefined) {
        return -1;
    }
    if (orderB !== undefined) {
        return 1;
    }
    return fallback ? fallback(a, b) : naturalCompare(a.name, b.name);
}

/**
 * Flattens a folder tree into a linear array for virtualization.
 * Only includes folders that are visible based on the expanded state.
 *
 * @param folders - Array of root folders to flatten
 * @param expandedFolders - Set of expanded folder paths
 * @param excludePatterns - Patterns for folders to exclude
 * @param level - Current nesting level (for indentation)
 * @returns Array of flattened folder items
 */
export function flattenFolderTree(
    folders: TFolder[],
    expandedFolders: Set<string>,
    excludePatterns: string[],
    level: number = 0,
    visitedPaths: Set<string> = new Set(),
    options: FlattenFolderTreeOptions = {}
): FolderTreeItem[] {
    const items: FolderTreeItem[] = [];
    const { rootOrderMap, childSortOrderOverrides } = options;
    const defaultSortOrder = options.defaultSortOrder ?? 'alpha-asc';

    const getEffectiveChildSortOrder = (folderPath: string): AlphaSortOrder => {
        if (childSortOrderOverrides && Object.prototype.hasOwnProperty.call(childSortOrderOverrides, folderPath)) {
            return childSortOrderOverrides[folderPath] ?? defaultSortOrder;
        }
        return defaultSortOrder;
    };

    const compareFolderNames = (order: AlphaSortOrder) => (a: TFolder, b: TFolder) => {
        const cmp = compareAlpha(a.name, b.name, order);
        if (cmp !== 0) {
            return cmp;
        }
        return a.path.localeCompare(b.path);
    };

    const rootChildComparator = compareFolderNames(getEffectiveChildSortOrder('/'));

    const foldersToProcess =
        level === 0 ? folders.slice().sort((a, b) => compareFolderOrderWithFallback(a, b, rootOrderMap, rootChildComparator)) : folders;

    foldersToProcess.forEach(folder => {
        // Skip folders already visited to prevent infinite loops
        if (visitedPaths.has(folder.path)) {
            return;
        }

        // Check if folder matches exclusion patterns or is within an excluded parent
        const isExcluded = excludePatterns.length > 0 && isFolderInExcludedFolder(folder, excludePatterns);

        // Create folder item for display
        const folderItem: FolderTreeItem = {
            type: NavigationPaneItemType.FOLDER,
            data: folder,
            level,
            path: folder.path,
            key: folder.path
        };

        // Add exclusion flag for visual indication
        if (isExcluded) {
            folderItem.isExcluded = true;
        }

        items.push(folderItem);

        // Process child folders if this folder is expanded
        if (expandedFolders.has(folder.path) && folder.children && folder.children.length > 0) {
            const childFolders = folder.children.filter((child): child is TFolder => child instanceof TFolder);
            const childSortOrder = getEffectiveChildSortOrder(folder.path);
            const childNameComparator = compareFolderNames(childSortOrder);

            if (folder.path === '/') {
                childFolders.sort((a, b) => compareFolderOrderWithFallback(a, b, rootOrderMap, childNameComparator));
            } else {
                childFolders.sort(childNameComparator);
            }

            if (childFolders.length > 0) {
                // Track visited paths to prevent circular references
                const newVisitedPaths = new Set(visitedPaths);
                newVisitedPaths.add(folder.path);

                items.push(...flattenFolderTree(childFolders, expandedFolders, excludePatterns, level + 1, newVisitedPaths, options));
            }
        }
    });

    return items;
}

/**
 * Flattens a tag tree into a linear array for virtualization.
 * Only includes tags that are visible based on the expanded state.
 *
 * @param tagNodes - Array of root tag nodes to flatten
 * @param expandedTags - Set of expanded tag paths
 * @param level - Current nesting level (for indentation)
 * @param options - Configuration options for flattening behavior
 * @returns Array of flattened tag items
 */
export function flattenTagTree(
    tagNodes: TagTreeNode[],
    expandedTags: Set<string>,
    level: number = 0,
    options: FlattenTagTreeOptions = {}
): TagTreeItem[] {
    const items: TagTreeItem[] = [];
    const { hiddenMatcher, comparator, childSortOrderOverrides } = options;
    /** Use custom comparator or default to alphabetical sorting */
    const sortFn = comparator ?? ((a: TagTreeNode, b: TagTreeNode) => naturalCompare(a.name, b.name));

    /** Sort tags using the selected comparator */
    const sortedNodes = tagNodes.slice().sort(sortFn);

    const compareAlphaNodes = (order: AlphaSortOrder) => (a: TagTreeNode, b: TagTreeNode) => {
        const cmp = compareAlpha(a.name, b.name, order);
        if (cmp !== 0) {
            return cmp;
        }
        return a.path.localeCompare(b.path);
    };

    const getEffectiveChildComparator = (parentTagPath: string) => {
        if (childSortOrderOverrides && Object.prototype.hasOwnProperty.call(childSortOrderOverrides, parentTagPath)) {
            const override = childSortOrderOverrides[parentTagPath];
            if (override) {
                return compareAlphaNodes(override);
            }
        }
        return sortFn;
    };

    /** Recursively adds a tag node and its children to the items array */
    function addNode(node: TagTreeNode, currentLevel: number, parentHidden: boolean = false) {
        const matchesRule = hiddenMatcher ? matchesHiddenTagPattern(node.path, node.name, hiddenMatcher) : false;
        const isHidden = parentHidden || matchesRule;

        const item: TagTreeItem = {
            type: NavigationPaneItemType.TAG,
            data: node,
            level: currentLevel,
            path: node.path,
            key: node.path
        };

        // Mark tags that match hidden patterns (shows eye icon when visible)
        if (isHidden) {
            item.isHidden = true;
        }

        items.push(item);

        // Add children if expanded and has children
        if (expandedTags.has(node.path) && node.children && node.children.size > 0) {
            const childComparator = getEffectiveChildComparator(node.path);
            const sortedChildren = Array.from(node.children.values()).sort(childComparator);

            sortedChildren.forEach(child => addNode(child, currentLevel + 1, isHidden));
        }
    }

    sortedNodes.forEach(node => addNode(node, level));
    return items;
}
