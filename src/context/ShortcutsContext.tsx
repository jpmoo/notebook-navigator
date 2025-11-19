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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TAbstractFile, TFile, TFolder } from 'obsidian';
import { useSettingsState, useSettingsUpdate } from './SettingsContext';
import { useServices } from './ServicesContext';
import {
    ShortcutEntry,
    ShortcutCollection,
    ShortcutType,
    SearchShortcut,
    getShortcutKey,
    isFolderShortcut,
    isNoteShortcut,
    isSearchShortcut,
    isTagShortcut
} from '../types/shortcuts';
import type { SearchProvider } from '../types/search';
import { strings } from '../i18n';
import { showNotice } from '../utils/noticeUtils';
import { normalizeTagPath } from '../utils/tagUtils';
import { runAsyncAction } from '../utils/async';

// Generates a unique fingerprint for a shortcut based on its type and key properties
const getShortcutFingerprint = (shortcut: ShortcutEntry): string => {
    if (isFolderShortcut(shortcut) || isNoteShortcut(shortcut) || isTagShortcut(shortcut)) {
        const path = isTagShortcut(shortcut) ? shortcut.tagPath : shortcut.path;
        return `${shortcut.type}:${path}`;
    }

    return `${shortcut.type}:${shortcut.name}:${shortcut.query}:${shortcut.provider}`;
};

// Creates a fingerprint for an array of shortcuts to detect changes
const buildShortcutsFingerprint = (shortcuts: ShortcutEntry[]): string => {
    if (shortcuts.length === 0) {
        return 'empty';
    }
    return shortcuts.map(getShortcutFingerprint).join('|');
};

/**
 * Represents a shortcut with resolved file/folder references and validation state.
 * Hydrated shortcuts have their paths resolved to actual Obsidian file objects.
 */
interface HydratedShortcut {
    key: string;
    shortcut: ShortcutEntry;
    folder: TFolder | null;
    note: TFile | null;
    search: SearchShortcut | null;
    tagPath: string | null;
    isMissing: boolean;
}

/**
 * Context value providing shortcut management functionality and state
 */
export interface ShortcutsContextValue {
    shortcuts: ShortcutEntry[];
    hydratedShortcuts: HydratedShortcut[];
    shortcutMap: Map<string, ShortcutEntry>;
    folderShortcutKeysByPath: Map<string, string>;
    noteShortcutKeysByPath: Map<string, string>;
    tagShortcutKeysByPath: Map<string, string>;
    searchShortcutsByName: Map<string, SearchShortcut>;
    collections: ShortcutCollection[];
    activeCollectionId: string;
    addFolderShortcut: (path: string, options?: { index?: number; collectionId?: string }) => Promise<boolean>;
    addNoteShortcut: (path: string, options?: { index?: number; collectionId?: string }) => Promise<boolean>;
    addTagShortcut: (tagPath: string, options?: { index?: number; collectionId?: string }) => Promise<boolean>;
    addSearchShortcut: (input: { name: string; query: string; provider: SearchProvider }, options?: { index?: number; collectionId?: string }) => Promise<boolean>;
    addShortcutsBatch: (entries: ShortcutEntry[], options?: { index?: number; collectionId?: string }) => Promise<number>;
    removeShortcut: (key: string) => Promise<boolean>;
    removeSearchShortcut: (name: string) => Promise<boolean>;
    reorderShortcuts: (orderedKeys: string[]) => Promise<boolean>;
    hasFolderShortcut: (path: string) => boolean;
    hasNoteShortcut: (path: string) => boolean;
    hasTagShortcut: (tagPath: string) => boolean;
    findSearchShortcut: (name: string) => SearchShortcut | undefined;
    setActiveCollection: (collectionId: string) => Promise<void>;
    addCollection: (collection: Omit<ShortcutCollection, 'id'>) => Promise<boolean>;
    updateCollection: (collectionId: string, updates: Partial<ShortcutCollection>) => Promise<boolean>;
    deleteCollection: (collectionId: string) => Promise<boolean>;
    reorderCollections: (orderedCollectionIds: string[]) => Promise<boolean>;
    getShortcutInCollection: (path: string, collectionId: string) => string | null;
    getCollectionsWithShortcut: (path: string) => string[];
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

// Type guard to check if an abstract file is a folder
function isFolder(file: TAbstractFile | null): file is TFolder {
    return file instanceof TFolder;
}

// Type guard to check if an abstract file is a file
function isFile(file: TAbstractFile | null): file is TFile {
    return file instanceof TFile;
}

interface ShortcutsProviderProps {
    children: React.ReactNode;
}

/**
 * Provider component that manages shortcuts state and operations.
 * Handles adding, removing, reordering shortcuts and maintains lookup maps for fast access.
 */
export function ShortcutsProvider({ children }: ShortcutsProviderProps) {
    const settings = useSettingsState();
    const updateSettings = useSettingsUpdate();
    const { app } = useServices();
    const [vaultChangeVersion, setVaultChangeVersion] = useState(0);
    // Caches fingerprints to track which collections have been checked for normalization
    const normalizationFingerprintsRef = useRef<Map<string, string>>(new Map());

    // Get collections and active collection from settings
    const collections = useMemo(() => settings.shortcutCollections ?? [], [settings.shortcutCollections]);
    const activeCollectionId = useMemo(() => settings.activeShortcutCollection ?? 'default', [settings.activeShortcutCollection]);
    
    // Get shortcuts for the active collection
    const activeCollection = useMemo(() => 
        collections.find(c => c.id === activeCollectionId) || collections[0], 
        [collections, activeCollectionId]
    );
    
    const collectionShortcuts = useMemo(() => 
        activeCollection?.shortcuts ?? [], 
        [activeCollection]
    );

    // Creates snapshots of shortcuts for all collections with their fingerprints (for normalization)
    const collectionShortcutSnapshots = useMemo(
        () =>
            collections.map(collection => {
                const shortcuts = collection.shortcuts ?? [];
                return {
                    id: collection.id,
                    shortcuts,
                    fingerprint: buildShortcutsFingerprint(shortcuts)
                };
            }),
        [collections]
    );

    // TODO: remove migration once tag shortcuts are normalized across active installs
    // Normalize stored tag shortcut paths for consistent lookups
    useEffect(() => {
        const fingerprintCache = normalizationFingerprintsRef.current;
        const activeCollectionIds = new Set(collectionShortcutSnapshots.map(snapshot => snapshot.id));
        fingerprintCache.forEach((_value, key) => {
            if (!activeCollectionIds.has(key)) {
                fingerprintCache.delete(key);
            }
        });

        if (collectionShortcutSnapshots.length === 0) {
            return;
        }

        const collectionsNeedingCheck = collectionShortcutSnapshots.filter(snapshot => {
            const cachedFingerprint = fingerprintCache.get(snapshot.id);
            return cachedFingerprint !== snapshot.fingerprint;
        });

        if (collectionsNeedingCheck.length === 0) {
            return;
        }

        const targets = collectionsNeedingCheck.filter(snapshot =>
            snapshot.shortcuts.some(shortcut => {
                if (!isTagShortcut(shortcut)) {
                    return false;
                }
                const normalized = normalizeTagPath(shortcut.tagPath);
                return normalized !== null && normalized !== shortcut.tagPath;
            })
        );

        const targetIds = new Set(targets.map(target => target.id));
        collectionsNeedingCheck.forEach(snapshot => {
            if (!targetIds.has(snapshot.id)) {
                fingerprintCache.set(snapshot.id, snapshot.fingerprint);
            }
        });

        if (targets.length === 0) {
            return;
        }

        runAsyncAction(async () => {
            await updateSettings(current => {
                targets.forEach(target => {
                    const collections = current.shortcutCollections ?? [];
                    const collection = collections.find(entry => entry.id === target.id);
                    if (!collection || !Array.isArray(collection.shortcuts)) {
                        fingerprintCache.set(target.id, target.fingerprint);
                        return;
                    }

                    let mutated = false;
                    const normalizedShortcuts = collection.shortcuts.map(entry => {
                        if (!isTagShortcut(entry)) {
                            return entry;
                        }
                        const normalized = normalizeTagPath(entry.tagPath);
                        if (!normalized || normalized === entry.tagPath) {
                            return entry;
                        }
                        mutated = true;
                        return {
                            ...entry,
                            tagPath: normalized
                        };
                    });

                    if (mutated) {
                        collection.shortcuts = normalizedShortcuts;
                        fingerprintCache.set(target.id, buildShortcutsFingerprint(normalizedShortcuts));
                        return;
                    }

                    const currentFingerprint = buildShortcutsFingerprint(collection.shortcuts ?? []);
                    fingerprintCache.set(target.id, currentFingerprint);
                });
            });
        });
    }, [collectionShortcutSnapshots, updateSettings]);

    // Migration: Move existing shortcuts to default collection if collections don't exist
    // Note: This migration handles the transition from the old shortcuts array to collections
    // The old shortcuts property may not exist in settings if coming from upstream
    useEffect(() => {
        const hasCollections = collections.length > 0;
        // Check if there's an old shortcuts property (for migration from older versions)
        const oldShortcuts = (settings as any).shortcuts;
        const hasOldShortcuts = oldShortcuts && Array.isArray(oldShortcuts) && oldShortcuts.length > 0;
        
        if (!hasCollections && hasOldShortcuts) {
            void (async () => {
                await updateSettings(current => {
                    // Create default collection with existing shortcuts
                    current.shortcutCollections = [
                        {
                            id: 'default',
                            name: 'Default',
                            icon: 'lucide-bookmark',
                            shortcuts: [...(oldShortcuts ?? [])],
                            isDefault: true
                        }
                    ];
                    current.activeShortcutCollection = 'default';
                    // Clear old shortcuts array if it exists
                    if ('shortcuts' in current) {
                        (current as any).shortcuts = [];
                    }
                });
            })();
        }
    }, [collections.length, updateSettings]);

    // Creates map of shortcuts by their unique keys for O(1) lookup
    const shortcutMap = useMemo(() => {
        const map = new Map<string, ShortcutEntry>();
        collectionShortcuts.forEach(shortcut => {
            map.set(getShortcutKey(shortcut), shortcut);
        });
        return map;
    }, [collectionShortcuts]);

    // Maps folder paths to their shortcut keys for duplicate detection within the ACTIVE collection only
    const folderShortcutKeysByPath = useMemo(() => {
        const map = new Map<string, string>();
        collectionShortcuts.forEach(shortcut => {
            if (isFolderShortcut(shortcut)) {
                map.set(shortcut.path, getShortcutKey(shortcut));
            }
        });
        return map;
    }, [collectionShortcuts]);

    // Maps note paths to their shortcut keys for duplicate detection within the ACTIVE collection only
    const noteShortcutKeysByPath = useMemo(() => {
        const map = new Map<string, string>();
        collectionShortcuts.forEach(shortcut => {
            if (isNoteShortcut(shortcut)) {
                map.set(shortcut.path, getShortcutKey(shortcut));
            }
        });
        return map;
    }, [collectionShortcuts]);

    // Maps tag paths to their shortcut keys for duplicate detection within the ACTIVE collection only
    const tagShortcutKeysByPath = useMemo(() => {
        const map = new Map<string, string>();
        collectionShortcuts.forEach(shortcut => {
            if (isTagShortcut(shortcut)) {
                const normalized = normalizeTagPath(shortcut.tagPath);
                if (normalized) {
                    map.set(normalized, getShortcutKey(shortcut));
                }
            }
        });
        return map;
    }, [collectionShortcuts]);

    // Maps search shortcut names (lowercase) to shortcuts for fast lookup within the ACTIVE collection only
    const searchShortcutsByName = useMemo(() => {
        const map = new Map<string, SearchShortcut>();
        collectionShortcuts.forEach(shortcut => {
            if (isSearchShortcut(shortcut)) {
                map.set(shortcut.name.toLowerCase(), shortcut);
            }
        });
        return map;
    }, [collectionShortcuts]);

    // Helper function to check if a shortcut exists in a specific collection
    const getShortcutInCollection = useCallback((path: string, collectionId: string): string | null => {
        const collection = collections.find(c => c.id === collectionId);
        if (!collection) return null;

        const shortcut = collection.shortcuts.find(s => {
            if (isFolderShortcut(s) || isNoteShortcut(s)) {
                return s.path === path;
            }
            if (isTagShortcut(s)) {
                const normalized = normalizeTagPath(s.tagPath);
                return normalized === path;
            }
            return false;
        });

        return shortcut ? getShortcutKey(shortcut) : null;
    }, [collections]);

    // Helper function to get all collections that contain a specific shortcut
    const getCollectionsWithShortcut = useCallback((path: string): string[] => {
        const collectionIds: string[] = [];
        collections.forEach(collection => {
            const hasShortcut = collection.shortcuts.some(s => {
                if (isFolderShortcut(s) || isNoteShortcut(s)) {
                    return s.path === path;
                }
                if (isTagShortcut(s)) {
                    const normalized = normalizeTagPath(s.tagPath);
                    return normalized === path;
                }
                return false;
            });
            if (hasShortcut) {
                collectionIds.push(collection.id);
            }
        });
        return collectionIds;
    }, [collections]);

    // Monitors vault changes for shortcut target files to trigger re-hydration when they are created/deleted/renamed
    useEffect(() => {
        const folderPaths = new Map(folderShortcutKeysByPath);
        const notePaths = new Map(noteShortcutKeysByPath);

        if (folderPaths.size === 0 && notePaths.size === 0) {
            return;
        }

        const vault = app.vault;

        const handleCreate = (file: TAbstractFile) => {
            if (!isFolder(file) && !isFile(file)) {
                return;
            }
            if (folderPaths.has(file.path) || notePaths.has(file.path)) {
                setVaultChangeVersion(value => value + 1);
            }
        };

        const handleDelete = (file: TAbstractFile) => {
            if (!isFolder(file) && !isFile(file)) {
                return;
            }
            if (folderPaths.has(file.path) || notePaths.has(file.path)) {
                setVaultChangeVersion(value => value + 1);
            }
        };

        const handleRename = (file: TAbstractFile, oldPath: string) => {
            if (!isFolder(file) && !isFile(file)) {
                return;
            }
            if (folderPaths.has(oldPath) || notePaths.has(oldPath) || folderPaths.has(file.path) || notePaths.has(file.path)) {
                setVaultChangeVersion(value => value + 1);
            }
        };

        const createRef = vault.on('create', handleCreate);
        const deleteRef = vault.on('delete', handleDelete);
        const renameRef = vault.on('rename', (file, oldPath) => {
            handleRename(file, oldPath);
        });

        return () => {
            vault.offref(createRef);
            vault.offref(deleteRef);
            vault.offref(renameRef);
        };
    }, [app.vault, folderShortcutKeysByPath, noteShortcutKeysByPath]);

    const hydratedShortcuts = useMemo<HydratedShortcut[]>(() => {
        // Reference vaultChangeVersion to ensure memoized value updates when tracked files change
        void vaultChangeVersion; // Ensures memo recalculates after vault changes
        return collectionShortcuts.map(shortcut => {
            const key = getShortcutKey(shortcut);

            if (isFolderShortcut(shortcut)) {
                const target = shortcut.path === '/' ? app.vault.getRoot() : app.vault.getAbstractFileByPath(shortcut.path);
                if (isFolder(target)) {
                    return {
                        key,
                        shortcut,
                        folder: target,
                        note: null,
                        search: null,
                        tagPath: null,
                        isMissing: false
                    };
                }
                return {
                    key,
                    shortcut,
                    folder: null,
                    note: null,
                    search: null,
                    tagPath: null,
                    isMissing: true
                };
            }

            if (isNoteShortcut(shortcut)) {
                const target = app.vault.getAbstractFileByPath(shortcut.path);
                if (isFile(target)) {
                    return {
                        key,
                        shortcut,
                        folder: null,
                        note: target,
                        search: null,
                        tagPath: null,
                        isMissing: false
                    };
                }
                return {
                    key,
                    shortcut,
                    folder: null,
                    note: null,
                    search: null,
                    tagPath: null,
                    isMissing: true
                };
            }

            if (isTagShortcut(shortcut)) {
                const normalizedTagPath = normalizeTagPath(shortcut.tagPath);
                return {
                    key,
                    shortcut,
                    folder: null,
                    note: null,
                    search: null,
                    tagPath: normalizedTagPath ?? shortcut.tagPath,
                    isMissing: !normalizedTagPath
                };
            }

            // Search shortcut
            return {
                key,
                shortcut,
                folder: null,
                note: null,
                search: shortcut,
                tagPath: null,
                isMissing: false
            };
        });
    }, [app.vault, collectionShortcuts, vaultChangeVersion]);

    // Inserts a shortcut at the specified index or appends to the end
    const insertShortcut = useCallback(
        async (shortcut: ShortcutEntry, index?: number, collectionId?: string): Promise<boolean> => {
            const targetCollectionId = collectionId || activeCollectionId;
            let didInsert = false;
            await updateSettings(current => {
                const collections = current.shortcutCollections ?? [];
                const collectionIndex = collections.findIndex(c => c.id === targetCollectionId);
                
                if (collectionIndex === -1) {
                    return; // Collection not found
                }
                
                const collection = collections[collectionIndex];
                const existing = collection.shortcuts ?? [];
                const next = [...existing];
                const insertAt = typeof index === 'number' ? Math.max(0, Math.min(index, next.length)) : next.length;
                next.splice(insertAt, 0, shortcut);
                
                // Create new collections array to ensure reference changes
                const updatedCollections = [...collections];
                updatedCollections[collectionIndex] = {
                    ...collection,
                    shortcuts: next
                };
                current.shortcutCollections = updatedCollections;
                didInsert = true;
            });
            return didInsert;
        },
        [updateSettings, activeCollectionId]
    );

    // Adds multiple shortcuts, validating each type and showing notices for duplicates or invalid entries
    const addShortcutsBatch = useCallback(
        async (entries: ShortcutEntry[], options?: { index?: number; collectionId?: string }) => {
            if (entries.length === 0) {
                return 0;
            }

            // Create sets of existing paths/names for O(1) duplicate checking
            const folderPaths = new Set(folderShortcutKeysByPath.keys());
            const notePaths = new Set(noteShortcutKeysByPath.keys());
            const tagPaths = new Set(tagShortcutKeysByPath.keys());
            const searchNames = new Set(searchShortcutsByName.keys());

            // Track validation errors to show notices after processing all entries
            let duplicateFolder = false;
            let duplicateNote = false;
            let duplicateTag = false;
            let invalidTag = false;
            let duplicateSearch = false;
            let emptySearchName = false;
            let emptySearchQuery = false;

            // Validate and normalize each entry, tracking errors
            const normalizedEntries: ShortcutEntry[] = [];
            entries.forEach(entry => {
                if (entry.type === ShortcutType.FOLDER) {
                    if (folderPaths.has(entry.path)) {
                        duplicateFolder = true;
                        return;
                    }
                    folderPaths.add(entry.path);
                    normalizedEntries.push(entry);
                    return;
                }

                if (entry.type === ShortcutType.NOTE) {
                    if (notePaths.has(entry.path)) {
                        duplicateNote = true;
                        return;
                    }
                    notePaths.add(entry.path);
                    normalizedEntries.push(entry);
                    return;
                }

                if (entry.type === ShortcutType.TAG) {
                    const normalizedPath = normalizeTagPath(entry.tagPath);
                    if (!normalizedPath) {
                        invalidTag = true;
                        return;
                    }
                    if (tagPaths.has(normalizedPath)) {
                        duplicateTag = true;
                        return;
                    }
                    tagPaths.add(normalizedPath);
                    normalizedEntries.push({
                        ...entry,
                        tagPath: normalizedPath
                    });
                    return;
                }

                if (entry.type === ShortcutType.SEARCH) {
                    const normalizedName = entry.name.trim();
                    const normalizedQuery = entry.query.trim();
                    if (!normalizedName) {
                        emptySearchName = true;
                        return;
                    }
                    if (!normalizedQuery) {
                        emptySearchQuery = true;
                        return;
                    }
                    const lookupKey = normalizedName.toLowerCase();
                    if (searchNames.has(lookupKey)) {
                        duplicateSearch = true;
                        return;
                    }
                    searchNames.add(lookupKey);
                    normalizedEntries.push({
                        ...entry,
                        name: normalizedName,
                        query: normalizedQuery
                    });
                }
            });

            // Show notices for any validation errors found
            if (duplicateFolder) {
                showNotice(strings.shortcuts.folderExists, { variant: 'warning' });
            }
            if (duplicateNote) {
                showNotice(strings.shortcuts.noteExists, { variant: 'warning' });
            }
            if (duplicateTag) {
                showNotice(strings.shortcuts.tagExists, { variant: 'warning' });
            }
            if (invalidTag) {
                showNotice(strings.modals.tagOperation.invalidTagName, { variant: 'warning' });
            }
            if (duplicateSearch) {
                showNotice(strings.shortcuts.searchExists, { variant: 'warning' });
            }
            if (emptySearchName) {
                showNotice(strings.shortcuts.emptySearchName, { variant: 'warning' });
            }
            if (emptySearchQuery) {
                showNotice(strings.shortcuts.emptySearchQuery, { variant: 'warning' });
            }

            if (normalizedEntries.length === 0) {
                return 0;
            }

            // Insert normalized entries using insertShortcut to support collections
            const targetCollectionId = options?.collectionId || activeCollectionId;
            let insertIndex = options?.index;
            let successCount = 0;

            for (const entry of normalizedEntries) {
                // Check for duplicates within the target collection
                let existingKey: string | null = null;
                if (entry.type === ShortcutType.FOLDER) {
                    existingKey = getShortcutInCollection(entry.path, targetCollectionId);
                } else if (entry.type === ShortcutType.NOTE) {
                    existingKey = getShortcutInCollection(entry.path, targetCollectionId);
                } else if (entry.type === ShortcutType.TAG) {
                    existingKey = getShortcutInCollection(entry.tagPath, targetCollectionId);
                } else if (entry.type === ShortcutType.SEARCH) {
                    // Search shortcuts are checked by name
                    const collection = collections.find(c => c.id === targetCollectionId);
                    if (collection) {
                        const lookupKey = entry.name.toLowerCase();
                        const existing = collection.shortcuts.find(s => 
                            isSearchShortcut(s) && s.name.toLowerCase() === lookupKey
                        );
                        if (existing) {
                            continue; // Skip duplicate
                        }
                    }
                }

                if (existingKey) {
                    continue; // Skip duplicate within collection
                }

                await insertShortcut(entry, insertIndex, targetCollectionId);
                successCount++;
                if (typeof insertIndex === 'number') {
                    insertIndex += 1;
                }
            }

            return successCount;
        },
        [folderShortcutKeysByPath, noteShortcutKeysByPath, tagShortcutKeysByPath, searchShortcutsByName, insertShortcut, getShortcutInCollection, activeCollectionId, collections]
    );

    // Adds a folder shortcut if it doesn't already exist in the target collection
    const addFolderShortcut = useCallback(
        async (path: string, options?: { index?: number; collectionId?: string }) => {
            const targetCollectionId = options?.collectionId || activeCollectionId;
            const existingKey = getShortcutInCollection(path, targetCollectionId);
            if (existingKey) {
                showNotice(strings.shortcuts.folderExists, { variant: 'warning' });
                return false;
            }
            return insertShortcut({ type: ShortcutType.FOLDER, path }, options?.index, targetCollectionId);
        },
        [insertShortcut, getShortcutInCollection, activeCollectionId]
    );

    // Adds a note shortcut if it doesn't already exist in the target collection
    const addNoteShortcut = useCallback(
        async (path: string, options?: { index?: number; collectionId?: string }) => {
            const targetCollectionId = options?.collectionId || activeCollectionId;
            const existingKey = getShortcutInCollection(path, targetCollectionId);
            if (existingKey) {
                showNotice(strings.shortcuts.noteExists, { variant: 'warning' });
                return false;
            }
            return insertShortcut({ type: ShortcutType.NOTE, path }, options?.index, targetCollectionId);
        },
        [insertShortcut, getShortcutInCollection, activeCollectionId]
    );

    // Adds a tag shortcut if it doesn't already exist in the target collection
    const addTagShortcut = useCallback(
        async (tagPath: string, options?: { index?: number; collectionId?: string }) => {
            const normalizedPath = normalizeTagPath(tagPath);
            if (!normalizedPath) {
                return false;
            }
            const targetCollectionId = options?.collectionId || activeCollectionId;
            const existingKey = getShortcutInCollection(normalizedPath, targetCollectionId);
            if (existingKey) {
                showNotice(strings.shortcuts.tagExists, { variant: 'warning' });
                return false;
            }
            return insertShortcut({ type: ShortcutType.TAG, tagPath: normalizedPath }, options?.index, targetCollectionId);
        },
        [insertShortcut, getShortcutInCollection, activeCollectionId]
    );

    // Adds a search shortcut with validation for name and query uniqueness
    const addSearchShortcut = useCallback(
        async ({ name, query, provider }: { name: string; query: string; provider: SearchProvider }, options?: { index?: number; collectionId?: string }) => {
            const normalizedQuery = query.trim();
            if (!normalizedQuery) {
                showNotice(strings.shortcuts.emptySearchQuery, { variant: 'warning' });
                return false;
            }

            const normalizedName = name.trim();
            if (!normalizedName) {
                showNotice(strings.shortcuts.emptySearchName, { variant: 'warning' });
                return false;
            }

            const nameKey = normalizedName.toLowerCase();
            if (searchShortcutsByName.has(nameKey)) {
                showNotice(strings.shortcuts.searchExists, { variant: 'warning' });
                return false;
            }

            return insertShortcut(
                {
                    type: ShortcutType.SEARCH,
                    name: normalizedName,
                    query: normalizedQuery,
                    provider
                },
                options?.index,
                options?.collectionId
            );
        },
        [insertShortcut, searchShortcutsByName]
    );

    // Removes a shortcut by its unique key
    const removeShortcut = useCallback(
        async (key: string) => {
            if (!shortcutMap.has(key)) {
                return false;
            }

            await updateSettings(current => {
                const collections = current.shortcutCollections ?? [];
                const updatedCollections = collections.map(collection => ({
                    ...collection,
                    shortcuts: collection.shortcuts.filter(entry => getShortcutKey(entry) !== key)
                }));
                current.shortcutCollections = updatedCollections;
            });
            return true;
        },
        [shortcutMap, updateSettings]
    );

    // Removes a search shortcut by its name (case-insensitive)
    const removeSearchShortcut = useCallback(
        async (name: string) => {
            const shortcut = searchShortcutsByName.get(name.trim().toLowerCase());
            if (!shortcut) {
                return false;
            }

            return removeShortcut(getShortcutKey(shortcut));
        },
        [removeShortcut, searchShortcutsByName]
    );

    // Reorders shortcuts based on provided key order (for drag & drop functionality)
    // Validates that all keys are present before applying the new order
    const reorderShortcuts = useCallback(
        async (orderedKeys: string[]) => {
            if (orderedKeys.length !== collectionShortcuts.length) {
                return false;
            }

            const orderedEntries: ShortcutEntry[] = [];
            for (const key of orderedKeys) {
                const entry = shortcutMap.get(key);
                if (!entry) {
                    return false;
                }
                orderedEntries.push(entry);
            }

            await updateSettings(current => {
                const collections = current.shortcutCollections ?? [];
                const collectionIndex = collections.findIndex(c => c.id === activeCollectionId);
                
                if (collectionIndex !== -1) {
                    // Create new collections array to ensure reference changes
                    const updatedCollections = [...collections];
                    updatedCollections[collectionIndex] = {
                        ...collections[collectionIndex],
                        shortcuts: orderedEntries
                    };
                    current.shortcutCollections = updatedCollections;
                }
            });

            return true;
        },
        [collectionShortcuts.length, shortcutMap, updateSettings, activeCollectionId]
    );

    // Checks if a folder shortcut exists for the given path
    const hasFolderShortcut = useCallback((path: string) => folderShortcutKeysByPath.has(path), [folderShortcutKeysByPath]);
    // Checks if a note shortcut exists for the given path
    const hasNoteShortcut = useCallback((path: string) => noteShortcutKeysByPath.has(path), [noteShortcutKeysByPath]);
    // Checks if a tag shortcut exists for the given tag path
    const hasTagShortcut = useCallback(
        (tagPath: string) => {
            const normalized = normalizeTagPath(tagPath);
            return normalized ? tagShortcutKeysByPath.has(normalized) : false;
        },
        [tagShortcutKeysByPath]
    );

    // Finds a search shortcut by name (case-insensitive)
    const findSearchShortcut = useCallback((name: string) => searchShortcutsByName.get(name.trim().toLowerCase()), [searchShortcutsByName]);

    // Collection management functions
    const setActiveCollection = useCallback(
        async (collectionId: string) => {
            await updateSettings(current => {
                current.activeShortcutCollection = collectionId;
            });
        },
        [updateSettings]
    );

    const addCollection = useCallback(
        async (collection: Omit<ShortcutCollection, 'id'>) => {
            const newCollection: ShortcutCollection = {
                ...collection,
                id: `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };

            await updateSettings(current => {
                const collections = current.shortcutCollections ?? [];
                current.shortcutCollections = [...collections, newCollection];
            });

            return true;
        },
        [updateSettings]
    );

    const updateCollection = useCallback(
        async (collectionId: string, updates: Partial<ShortcutCollection>) => {
            await updateSettings(current => {
                const collections = current.shortcutCollections ?? [];
                const index = collections.findIndex(c => c.id === collectionId);
                
                if (index !== -1) {
                    // Create new collections array to ensure reference changes
                    const updatedCollections = [...collections];
                    updatedCollections[index] = { ...collections[index], ...updates };
                    current.shortcutCollections = updatedCollections;
                }
            });

            return true;
        },
        [updateSettings]
    );

    const deleteCollection = useCallback(
        async (collectionId: string) => {
            // Don't allow deleting the default collection
            const collection = collections.find(c => c.id === collectionId);
            if (collection?.isDefault) {
                return false;
            }

            await updateSettings(current => {
                const collections = current.shortcutCollections ?? [];
                current.shortcutCollections = collections.filter(c => c.id !== collectionId);
                
                // If we deleted the active collection, switch to default
                if (current.activeShortcutCollection === collectionId) {
                    const defaultCollection = collections.find(c => c.isDefault);
                    current.activeShortcutCollection = defaultCollection?.id || 'default';
                }
            });

            return true;
        },
        [updateSettings, collections]
    );

    const reorderCollections = useCallback(
        async (orderedCollectionIds: string[]) => {
            // Validate that all collection IDs are present
            if (orderedCollectionIds.length !== collections.length) {
                return false;
            }

            const orderedCollections: ShortcutCollection[] = [];
            for (const id of orderedCollectionIds) {
                const collection = collections.find(c => c.id === id);
                if (!collection) {
                    return false;
                }
                orderedCollections.push(collection);
            }

            await updateSettings(current => {
                current.shortcutCollections = orderedCollections;
            });

            return true;
        },
        [collections, updateSettings]
    );

    const value: ShortcutsContextValue = useMemo(
        () => ({
            shortcuts: collectionShortcuts,
            hydratedShortcuts,
            shortcutMap,
            folderShortcutKeysByPath,
            noteShortcutKeysByPath,
            tagShortcutKeysByPath,
            searchShortcutsByName,
            collections,
            activeCollectionId,
            addFolderShortcut,
            addNoteShortcut,
            addTagShortcut,
            addSearchShortcut,
            addShortcutsBatch,
            removeShortcut,
            removeSearchShortcut,
            reorderShortcuts,
            hasFolderShortcut,
            hasNoteShortcut,
            hasTagShortcut,
            findSearchShortcut,
            setActiveCollection,
            addCollection,
            updateCollection,
            deleteCollection,
            reorderCollections,
            getShortcutInCollection,
            getCollectionsWithShortcut
        }),
        [
            collectionShortcuts,
            hydratedShortcuts,
            shortcutMap,
            folderShortcutKeysByPath,
            noteShortcutKeysByPath,
            tagShortcutKeysByPath,
            searchShortcutsByName,
            collections,
            activeCollectionId,
            addFolderShortcut,
            addNoteShortcut,
            addTagShortcut,
            addSearchShortcut,
            addShortcutsBatch,
            removeShortcut,
            removeSearchShortcut,
            reorderShortcuts,
            hasFolderShortcut,
            hasNoteShortcut,
            hasTagShortcut,
            findSearchShortcut,
            setActiveCollection,
            addCollection,
            updateCollection,
            deleteCollection,
            reorderCollections,
            getShortcutInCollection,
            getCollectionsWithShortcut
        ]
    );

    return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}

/**
 * Hook to access the shortcuts context.
 * Must be used within a ShortcutsProvider.
 */
export function useShortcuts() {
    const context = useContext(ShortcutsContext);
    if (!context) {
        throw new Error('useShortcuts must be used within a ShortcutsProvider');
    }
    return context;
}
