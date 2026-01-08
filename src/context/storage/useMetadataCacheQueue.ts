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

import { useCallback, useEffect, type RefObject } from 'react';
import { EventRef, TFile, type App } from 'obsidian';
import type { ContentProviderRegistry } from '../../services/content/ContentProviderRegistry';
import type { ContentProviderType } from '../../interfaces/IContentProvider';
import type { NotebookNavigatorSettings } from '../../settings';
import { filterFilesRequiringMetadataSources } from '../storageQueueFilters';
import { getMetadataDependentTypes, resolveMetadataDependentTypes } from './storageContentTypes';

/**
 * Queues metadata-dependent content providers once Obsidian's metadata cache is ready.
 *
 * Obsidian populates `app.metadataCache` asynchronously. Some providers (tags, frontmatter metadata, and
 * custom-property extraction) must not run until `metadataCache.getFileCache(file)` returns a value.
 *
 * This hook implements a two-phase flow:
 * 1) Queue files that already have metadata cache entries.
 * 2) For the remaining files, attach temporary `metadataCache` listeners and queue them once all are ready.
 *
 * The `pendingMetadataWaitPathsRef` map is a per-path guard against duplicated listeners when multiple callers
 * request the same content types for the same files.
 */
export function useMetadataCacheQueue(params: {
    app: App;
    settings: NotebookNavigatorSettings;
    latestSettingsRef: RefObject<NotebookNavigatorSettings>;
    stoppedRef: RefObject<boolean>;
    contentRegistryRef: RefObject<ContentProviderRegistry | null>;
    metadataWaitDisposersRef: RefObject<Set<() => void>>;
    pendingMetadataWaitPathsRef: RefObject<Map<string, Set<ContentProviderType>>>;
}): {
    queueMetadataContentWhenReady: (
        files: TFile[],
        includeTypes?: ContentProviderType[],
        settingsOverride?: NotebookNavigatorSettings
    ) => void;
    disposeMetadataWaitDisposers: () => void;
} {
    const { app, settings, latestSettingsRef, stoppedRef, contentRegistryRef, metadataWaitDisposersRef, pendingMetadataWaitPathsRef } =
        params;

    const disposeMetadataWaitDisposers = useCallback(() => {
        const metadataDisposers = metadataWaitDisposersRef.current;
        if (metadataDisposers.size === 0) {
            return;
        }

        for (const dispose of metadataDisposers) {
            try {
                dispose();
            } catch {
                // ignore errors during cleanup
            }
        }
        metadataDisposers.clear();
    }, [metadataWaitDisposersRef]);

    /**
     * Effect: Clean up pending metadata waits for disabled content types.
     *
     * Callers can queue multiple metadata-dependent types. When a setting disables a type (for example,
     * turning off tags), remove it from the pending set so we don't keep wait state for work that can
     * no longer be scheduled.
     */
    useEffect(() => {
        const activeTypes = new Set(getMetadataDependentTypes(settings));
        pendingMetadataWaitPathsRef.current.forEach((types, path) => {
            for (const type of Array.from(types)) {
                if (!activeTypes.has(type)) {
                    types.delete(type);
                }
            }
            if (types.size === 0) {
                pendingMetadataWaitPathsRef.current.delete(path);
            }
        });
    }, [pendingMetadataWaitPathsRef, settings]);

    /**
     * Effect: Cancel metadata waits when no dependent providers are enabled.
     *
     * When all metadata-dependent providers are disabled, there is no reason to keep event listeners alive.
     */
    useEffect(() => {
        if (getMetadataDependentTypes(settings).length > 0) {
            return;
        }

        disposeMetadataWaitDisposers();
        pendingMetadataWaitPathsRef.current.clear();
    }, [disposeMetadataWaitDisposers, pendingMetadataWaitPathsRef, settings]);

    const waitForMetadataCache = useCallback(
        (files: TFile[], callback: () => void): (() => void) => {
            if (files.length === 0) {
                callback();
                return () => {};
            }

            // Waiting is only meaningful for real markdown files that still exist in the vault.
            const trackedPaths = new Set(files.filter((file): file is TFile => file instanceof TFile).map(file => file.path));

            // Checks which files have metadata ready and removes them from tracking
            const removeReadyPaths = (paths: Iterable<string>) => {
                for (const path of paths) {
                    // Skip paths not being tracked
                    if (!trackedPaths.has(path)) {
                        continue;
                    }
                    const abstract = app.vault.getAbstractFileByPath(path);
                    // Remove deleted or non-file paths from tracking
                    if (!abstract || !(abstract instanceof TFile)) {
                        trackedPaths.delete(path);
                        continue;
                    }
                    // Check if metadata cache has data for this file
                    const metadata = app.metadataCache.getFileCache(abstract);
                    // Remove from tracking if metadata is available
                    if (metadata !== null && metadata !== undefined) {
                        trackedPaths.delete(path);
                    }
                }
            };

            removeReadyPaths(trackedPaths);

            if (trackedPaths.size === 0) {
                callback();
                return () => {};
            }

            let resolvedEventRef: EventRef | null = null;
            let changedEventRef: EventRef | null = null;
            let disposed = false;
            let warningTimeoutId: number | null = null;

            // Obsidian's initial metadata indexing is usually quick. If it takes a long time for these specific
            // files, tags/metadata providers will stay gated. Emit a single diagnostic after a fixed delay with
            // sample paths so the user can identify which files are blocking metadata cache readiness.
            const METADATA_WAIT_WARNING_MS = 10_000;

            // Clears the warning timer if it's currently scheduled
            const clearWarningTimer = () => {
                if (warningTimeoutId !== null && typeof window !== 'undefined') {
                    window.clearTimeout(warningTimeoutId);
                    warningTimeoutId = null;
                }
            };

            // Schedules a warning message after 10 seconds if metadata hasn't resolved
            const scheduleWarning = () => {
                // Don't schedule if already scheduled
                if (warningTimeoutId !== null) {
                    return;
                }
                // Skip in non-browser environments
                if (typeof window === 'undefined') {
                    return;
                }
                warningTimeoutId = window.setTimeout(() => {
                    warningTimeoutId = null;
                    // Don't warn if all files resolved
                    if (trackedPaths.size === 0) {
                        return;
                    }
                    // Log first 20 unresolved files for debugging
                    const unresolved = Array.from(trackedPaths).slice(0, 20);
                    console.error(
                        'Notebook Navigator could not resolve metadata for all files. Tags remain disabled until metadata becomes available.',
                        {
                            unresolved,
                            totalPending: trackedPaths.size,
                            hint: 'Reduce file size, fix invalid frontmatter, exclude the files, or disable tags.'
                        }
                    );
                }, METADATA_WAIT_WARNING_MS);
            };

            const cleanup = () => {
                if (disposed) {
                    return;
                }
                disposed = true;
                clearWarningTimer();
                if (resolvedEventRef) {
                    try {
                        app.metadataCache.offref(resolvedEventRef);
                    } catch {
                        // ignore
                    }
                    resolvedEventRef = null;
                }
                if (changedEventRef) {
                    try {
                        app.metadataCache.offref(changedEventRef);
                    } catch {
                        // ignore
                    }
                    changedEventRef = null;
                }
            };

            const maybeFinish = () => {
                if (!disposed && trackedPaths.size === 0) {
                    cleanup();
                    callback();
                }
            };

            // Listen for Obsidian's initial metadata indexing completion
            resolvedEventRef = app.metadataCache.on('resolved', () => {
                // Clear any existing warning timer since we're checking again
                clearWarningTimer();
                // Check all tracked paths for metadata availability
                removeReadyPaths(trackedPaths);
                // Schedule warning if files remain unresolved
                if (trackedPaths.size > 0) {
                    scheduleWarning();
                }
                // Fire callback if all files are ready
                maybeFinish();
            });

            // Listen for individual file metadata updates
            changedEventRef = app.metadataCache.on('changed', file => {
                // Ignore non-file events
                if (!file || !(file instanceof TFile)) {
                    return;
                }
                // Ignore files we're not tracking
                if (!trackedPaths.has(file.path)) {
                    return;
                }
                // Check if this file's metadata is now ready
                removeReadyPaths([file.path]);
                // Fire callback if all files are ready
                maybeFinish();
            });

            // Schedule a warning in case metadata never resolves after the initial sweep.
            scheduleWarning();

            return cleanup;
        },
        [app]
    );

    const queueMetadataContentWhenReady = useCallback(
        (files: TFile[], includeTypes?: ContentProviderType[], settingsOverride?: NotebookNavigatorSettings) => {
            const baseSettings = settingsOverride ?? latestSettingsRef.current;
            const requestedTypes = resolveMetadataDependentTypes(baseSettings, includeTypes);

            if (requestedTypes.length === 0) {
                return;
            }

            // Deduplicate files by path
            const uniqueFiles = new Map<string, TFile>();
            for (const file of files) {
                if (!uniqueFiles.has(file.path)) {
                    uniqueFiles.set(file.path, file);
                }
            }

            // Filter to markdown files only
            const markdownFiles = Array.from(uniqueFiles.values()).filter(file => file.extension === 'md');
            if (markdownFiles.length === 0) {
                return;
            }

            // Filter to files that actually need content generation
            const filesNeedingContent = filterFilesRequiringMetadataSources(markdownFiles, requestedTypes, baseSettings, {
                // When metadata cache is not ready yet, prefer treating metadata as missing to avoid "false ready"
                // files (for example when only a subset of fields has been indexed).
                conservativeMetadata: true
            });
            if (filesNeedingContent.length === 0) {
                return;
            }

            // Split files into those with metadata cache ready and those waiting
            const immediateFiles: TFile[] = [];
            const waitingFiles: TFile[] = [];

            for (const file of filesNeedingContent) {
                const pendingTypes = pendingMetadataWaitPathsRef.current.get(file.path);
                const hasAllPending = pendingTypes ? requestedTypes.every(type => pendingTypes.has(type)) : false;
                // Skip files already waiting for all requested types
                if (hasAllPending) {
                    continue;
                }

                const cacheReady = Boolean(app.metadataCache.getFileCache(file));
                if (cacheReady) {
                    immediateFiles.push(file);
                } else {
                    waitingFiles.push(file);
                }
            }

            // Queues files for content generation with the requested types
            const queueFilesForTypes = (targetFiles: TFile[]) => {
                if (targetFiles.length === 0 || stoppedRef.current) {
                    return;
                }
                const latestSettings = latestSettingsRef.current;
                const activeTypes = resolveMetadataDependentTypes(latestSettings, includeTypes);
                if (activeTypes.length === 0 || !contentRegistryRef.current) {
                    return;
                }
                contentRegistryRef.current.queueFilesForAllProviders(targetFiles, latestSettings, { include: activeTypes });
            };

            // Queue files with metadata cache already ready
            if (immediateFiles.length > 0) {
                queueFilesForTypes(immediateFiles);
            }

            if (waitingFiles.length === 0) {
                return;
            }

            const trackedPaths = waitingFiles.map(file => file.path);

            // Marks file paths as pending for the requested content types
            const markPending = () => {
                for (const path of trackedPaths) {
                    const existing = pendingMetadataWaitPathsRef.current.get(path) ?? new Set<ContentProviderType>();
                    requestedTypes.forEach(type => existing.add(type));
                    pendingMetadataWaitPathsRef.current.set(path, existing);
                }
            };

            // Removes requested types from pending list for tracked paths
            const releaseTrackedPaths = () => {
                for (const path of trackedPaths) {
                    const pending = pendingMetadataWaitPathsRef.current.get(path);
                    if (!pending) {
                        continue;
                    }
                    requestedTypes.forEach(type => pending.delete(type));
                    if (pending.size === 0) {
                        pendingMetadataWaitPathsRef.current.delete(path);
                    }
                }
            };

            markPending();

            let cleanupWrapper: (() => void) | null = null;
            let firedImmediately = false;

            // Called when metadata cache is ready for all waiting files
            const handleReady = () => {
                firedImmediately = true;
                releaseTrackedPaths();
                // If we registered a disposer, remove it before queueing so a later global cleanup does not
                // touch this operation after it has already completed.
                if (cleanupWrapper) {
                    metadataWaitDisposersRef.current.delete(cleanupWrapper);
                    cleanupWrapper = null;
                }
                queueFilesForTypes(waitingFiles);
            };

            let rawCleanup: (() => void) | null = null;
            try {
                rawCleanup = waitForMetadataCache(waitingFiles, handleReady);
            } catch (error: unknown) {
                releaseTrackedPaths();
                throw error;
            }

            // Track cleanup function if callback didn't fire immediately
            if (!firedImmediately && rawCleanup) {
                cleanupWrapper = () => {
                    releaseTrackedPaths();
                    try {
                        rawCleanup();
                    } catch {
                        // ignore cleanup errors
                    }
                };
                metadataWaitDisposersRef.current.add(cleanupWrapper);
            } else if (!firedImmediately) {
                // Some code paths can return a cleanup without firing the callback (for example if the caller
                // passes a list that becomes empty during the initial sweep). Ensure pending types are released.
                releaseTrackedPaths();
                if (rawCleanup) {
                    try {
                        rawCleanup();
                    } catch {
                        // ignore cleanup errors
                    }
                }
            }
        },
        [
            app,
            contentRegistryRef,
            latestSettingsRef,
            metadataWaitDisposersRef,
            pendingMetadataWaitPathsRef,
            stoppedRef,
            waitForMetadataCache
        ]
    );

    return { queueMetadataContentWhenReady, disposeMetadataWaitDisposers };
}
