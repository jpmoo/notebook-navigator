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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { type App, TFile, TFolder } from 'obsidian';
import { useSettingsState } from '../../context/SettingsContext';
import { useMetadataService } from '../../context/ServicesContext';
import { getFilesForFolder } from '../../utils/fileFinder';
import { getDBInstance } from '../../storage/fileOperations';
import { loadFileItemCacheSnapshot } from '../fileItem/useFileItemContentState';
import { buildBoardCards, filterBoardCards, BOARD_MAX_CARDS, type BoardCardModel } from '../../utils/boardCards';
import { strings } from '../../i18n';
import { BoardCard } from './BoardCard';

interface BoardViewProps {
    app: App;
    folderPath: string | null;
}

interface BoardData {
    folderName: string;
    cards: BoardCardModel[];
    total: number;
    truncated: boolean;
    accentColor?: string;
    backgroundColor?: string;
}

// Persists the full/collapsed card layout choice across board sessions.
const BOARD_COLLAPSED_KEY = 'notebook-navigator-board-collapsed';

function resolveFolder(app: App, folderPath: string | null): TFolder | null {
    if (folderPath === null) {
        return null;
    }
    if (folderPath === '' || folderPath === '/') {
        return app.vault.getRoot();
    }
    const abstract = app.vault.getAbstractFileByPath(folderPath);
    return abstract instanceof TFolder ? abstract : null;
}

/**
 * Full-width masonry board: renders a folder's notes as preview cards. Reuses the
 * navigator's already-cached per-file content (preview text, tags, feature images)
 * read straight from the shared storage singleton, so the board adds no second
 * content pipeline. Large folders are capped (see BOARD_MAX_CARDS) with a
 * "Showing N of M" notice.
 */
export function BoardView({ app, folderPath }: BoardViewProps) {
    const settings = useSettingsState();
    const metadataService = useMetadataService();
    const [data, setData] = useState<BoardData | null>(null);
    const [query, setQuery] = useState('');
    // Bumped by vault changes within the folder to trigger a re-gather.
    const [refreshKey, setRefreshKey] = useState(0);
    // Full vs collapsed card layout, persisted across sessions.
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        try {
            return window.localStorage.getItem(BOARD_COLLAPSED_KEY) === '1';
        } catch {
            return false;
        }
    });

    const toggleCollapsed = useCallback(() => {
        setCollapsed(prev => {
            const next = !prev;
            try {
                window.localStorage.setItem(BOARD_COLLAPSED_KEY, next ? '1' : '0');
            } catch {
                // Ignore storage failures (private mode, quota); the toggle still works for the session.
            }
            return next;
        });
    }, []);

    // Gather the folder's files and build card models from cached content.
    useEffect(() => {
        const folder = resolveFolder(app, folderPath);
        if (!folder) {
            setData(null);
            return;
        }

        let active = true;
        // The board intentionally shows only the selected folder's own notes, never
        // descendants, regardless of the navigator's "include descendant notes" setting.
        const visibility = { includeDescendantNotes: false, showHiddenItems: false };
        const files = getFilesForFolder(folder, settings, visibility, app);
        const capped = files.slice(0, BOARD_MAX_CARDS);
        const db = getDBInstance();

        const build = () => {
            if (!active) {
                return;
            }
            const result = buildBoardCards(files, BOARD_MAX_CARDS, file =>
                loadFileItemCacheSnapshot({ app, file, showPreview: true, showImage: true, db })
            );
            setData({
                folderName: folder.path === '' ? app.vault.getName() : folder.name,
                cards: result.cards,
                total: result.total,
                truncated: result.truncated,
                accentColor: metadataService.getFolderColor(folder.path),
                backgroundColor: metadataService.getFolderBackgroundColor(folder.path)
            });
        };

        // Preview text loads lazily from the DB; ensure it is in the cache before
        // building cards, then render synchronously from the cached getters.
        void Promise.all(capped.map(file => db.ensurePreviewTextLoaded(file.path)))
            .then(build)
            .catch(build);

        return () => {
            active = false;
        };
    }, [app, folderPath, settings, metadataService, refreshKey]);

    // Refresh when files inside the folder change (create/delete/rename/modify).
    useEffect(() => {
        if (folderPath === null) {
            return;
        }
        const prefix = folderPath === '' || folderPath === '/' ? '' : `${folderPath}/`;
        const isInFolder = (path: string) => prefix === '' || path.startsWith(prefix);

        let timer: number | null = null;
        const scheduleRefresh = () => {
            if (timer !== null) {
                return;
            }
            timer = window.setTimeout(() => {
                timer = null;
                setRefreshKey(key => key + 1);
            }, 200);
        };

        const onChange = (file: { path: string }) => {
            if (isInFolder(file.path)) {
                scheduleRefresh();
            }
        };
        const onRename = (file: { path: string }, oldPath: string) => {
            if (isInFolder(file.path) || isInFolder(oldPath)) {
                scheduleRefresh();
            }
        };

        const refs = [
            app.vault.on('create', onChange),
            app.vault.on('delete', onChange),
            app.vault.on('modify', onChange),
            app.vault.on('rename', onRename)
        ];

        return () => {
            if (timer !== null) {
                window.clearTimeout(timer);
            }
            refs.forEach(ref => app.vault.offref(ref));
        };
    }, [app, folderPath]);

    const openNote = useCallback(
        (path: string) => {
            const file = app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                // Open in a new tab so the board itself stays put for continued browsing.
                void app.workspace.getLeaf('tab').openFile(file);
            }
        },
        [app]
    );

    const visibleCards = useMemo(() => (data ? filterBoardCards(data.cards, query) : []), [data, query]);

    if (!data) {
        return (
            <div className="nn-board">
                <div className="nn-board-empty">{strings.board.empty}</div>
            </div>
        );
    }

    const countNotice = data.truncated
        ? strings.board.showingCount.replace('{shown}', String(data.cards.length)).replace('{total}', String(data.total))
        : null;

    return (
        <div className="nn-board">
            <div className="nn-board-header">
                <h1 className="nn-board-title">{data.folderName}</h1>
                <div className="nn-board-header-actions">
                    <button
                        type="button"
                        className="nn-board-toggle"
                        onClick={toggleCollapsed}
                        aria-pressed={collapsed}
                    >
                        {collapsed ? strings.board.expandCards : strings.board.collapseCards}
                    </button>
                    <input
                        type="search"
                        className="nn-board-search"
                        placeholder={strings.board.searchPlaceholder}
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                    />
                </div>
            </div>
            {countNotice ? <div className="nn-board-notice">{countNotice}</div> : null}
            {data.cards.length === 0 ? (
                <div className="nn-board-empty">{strings.board.empty}</div>
            ) : visibleCards.length === 0 ? (
                <div className="nn-board-empty">{strings.board.noSearchResults}</div>
            ) : (
                <div className={collapsed ? 'nn-board-grid nn-board-grid--collapsed' : 'nn-board-grid'}>
                    {visibleCards.map(card => (
                        <BoardCard
                            key={card.path}
                            app={app}
                            card={card}
                            accentColor={data.accentColor}
                            backgroundColor={data.backgroundColor}
                            onOpen={openNote}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
