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

import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { DndContext, MouseSensor, TouchSensor, type DragEndEvent, type DragStartEvent, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TFile, type App } from 'obsidian';
import { useServices } from '../../context/ServicesContext';
import { strings } from '../../i18n';
import type { SortOption } from '../../settings';
import { ListPaneItemType, type NavigationItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import type { ListPaneAppearanceSettings } from '../../hooks/useListPaneAppearance';
import type { FileNameIconNeedle } from '../../utils/fileIconUtils';
import type { FileItemPillDecorationModel } from '../../utils/fileItemPillDecoration';
import type { FolderDecorationModel } from '../../utils/folderDecoration';
import type { HiddenTagVisibility } from '../../utils/tagPrefixMatcher';
import { typeFilteredCollisionDetection, verticalAxisOnly } from '../../utils/dndConfig';
import {
    getCachedManualSortGroupHeaderValue,
    getManualSortSelectedMarkdownPaths,
    moveManualSortMarkdownFiles,
    partitionManualSortFiles
} from '../../utils/manualSort';
import { ObsidianIcon } from '../ObsidianIcon';
import { FileItem, type FileItemStorageHelpers } from '../FileItem';

const MANUAL_SORT_MOUSE_CONSTRAINT = { distance: 2 };
const MANUAL_SORT_TOUCH_CONSTRAINT = { distance: 4 };

interface ManualSortFileInfo {
    fileIndex?: number;
    parentFolder?: string | null;
    isHidden?: boolean;
}

interface ManualSortListContentProps {
    files: TFile[];
    listItems: ListPaneItem[];
    hiddenFileState: ReadonlyMap<string, boolean>;
    propertyKey: string;
    manualSortGroupHeaderPropertyKey: string | null;
    rankByPath: ReadonlyMap<string, number>;
    selectedFolderPath: string | null;
    isSaving: boolean;
    isDoneDisabled: boolean;
    selectionType: NavigationItemType | null;
    sortOption?: SortOption;
    localDayReference: Date | null;
    fileIconSize: number;
    appearanceSettings: ListPaneAppearanceSettings;
    includeDescendantNotes: boolean;
    hiddenTagVisibility: HiddenTagVisibility;
    fileNameIconNeedles: readonly FileNameIconNeedle[];
    visibleListPropertyKeys: ReadonlySet<string>;
    visibleNavigationPropertyKeys: ReadonlySet<string>;
    fileItemStorage: FileItemStorageHelpers;
    noteShortcutKeysByPath: ReadonlyMap<string, string>;
    folderDecorationModel: FolderDecorationModel;
    fileItemPillDecorationModel: FileItemPillDecorationModel;
    getSolidBackground: (color?: string | null) => string | undefined;
    selectedFiles: ReadonlySet<string>;
    onFileClick: (file: TFile, fileIndex: number | undefined, event: ReactMouseEvent) => void;
    onDone: () => void;
    onReorder: (params: { nextFiles: TFile[]; movedPaths: ReadonlySet<string> }) => void;
}

interface ManualSortEntry {
    file: TFile;
    sortableId: string;
    info: ManualSortFileInfo;
}

interface ManualSortHeaderRenderRow {
    type: 'header';
    key: string;
    label: string;
}

interface ManualSortFileRenderRow {
    type: 'file';
    key: string;
    entry: ManualSortEntry;
    segmentKey: string;
}

type ManualSortRenderRow = ManualSortHeaderRenderRow | ManualSortFileRenderRow;

interface ManualSortRowContext {
    isMobile: boolean;
    selectionType: NavigationItemType | null;
    sortOption?: SortOption;
    localDayReference: Date | null;
    fileIconSize: number;
    appearanceSettings: ListPaneAppearanceSettings;
    includeDescendantNotes: boolean;
    hiddenTagVisibility: HiddenTagVisibility;
    fileNameIconNeedles: readonly FileNameIconNeedle[];
    visibleListPropertyKeys: ReadonlySet<string>;
    visibleNavigationPropertyKeys: ReadonlySet<string>;
    fileItemStorage: FileItemStorageHelpers;
    folderDecorationModel: FolderDecorationModel;
    fileItemPillDecorationModel: FileItemPillDecorationModel;
    getSolidBackground: (color?: string | null) => string | undefined;
    onFileClick: (file: TFile, fileIndex: number | undefined, event: ReactMouseEvent) => void;
}

interface ManualSortRowProps extends ManualSortRowContext {
    entry: ManualSortEntry;
    isLastEntry: boolean;
    canReorder: boolean;
    isSelected: boolean;
    hasSelectedAbove: boolean;
    hasSelectedBelow: boolean;
    isDragBlockMember: boolean;
    shortcutKey?: string;
}

function noopModifySearch(): void {
    return;
}

async function noopToggleShortcut(): Promise<void> {
    return;
}

function ManualSortRowContent({
    entry,
    canReorder,
    isMobile,
    selectionType,
    sortOption,
    localDayReference,
    fileIconSize,
    appearanceSettings,
    includeDescendantNotes,
    hiddenTagVisibility,
    fileNameIconNeedles,
    visibleListPropertyKeys,
    visibleNavigationPropertyKeys,
    fileItemStorage,
    shortcutKey,
    folderDecorationModel,
    fileItemPillDecorationModel,
    getSolidBackground,
    onFileClick,
    isSelected,
    hasSelectedAbove,
    hasSelectedBelow,
    dragHandle
}: ManualSortRowProps & { dragHandle?: ReactNode }) {
    return (
        <>
            <div className="nn-manual-sort-file">
                <FileItem
                    file={entry.file}
                    isSelected={isSelected}
                    hasSelectedAbove={hasSelectedAbove}
                    hasSelectedBelow={hasSelectedBelow}
                    showQuickActionsPanel={false}
                    onFileClick={onFileClick}
                    fileIndex={entry.info.fileIndex}
                    sortOption={sortOption}
                    parentFolder={entry.info.parentFolder}
                    isPinned={false}
                    selectionType={selectionType}
                    isHidden={entry.info.isHidden}
                    onModifySearchWithTag={noopModifySearch}
                    onModifySearchWithProperty={noopModifySearch}
                    localDayReference={localDayReference}
                    fileIconSize={fileIconSize}
                    appearanceSettings={appearanceSettings}
                    includeDescendantNotes={includeDescendantNotes}
                    hiddenTagVisibility={hiddenTagVisibility}
                    fileNameIconNeedles={fileNameIconNeedles}
                    visiblePropertyKeys={visibleListPropertyKeys}
                    visibleNavigationPropertyKeys={visibleNavigationPropertyKeys}
                    fileItemStorage={fileItemStorage}
                    shortcutKey={shortcutKey}
                    onToggleNoteShortcut={noopToggleShortcut}
                    folderDecorationModel={folderDecorationModel}
                    fileItemPillDecorationModel={fileItemPillDecorationModel}
                    getSolidBackground={getSolidBackground}
                    disableNativeDrag={true}
                    manualSortDisabled={!canReorder}
                />
            </div>
            {isMobile && canReorder ? dragHandle : null}
        </>
    );
}

function SortableManualSortRow(props: ManualSortRowProps) {
    const { entry, isLastEntry, canReorder, isMobile, isDragBlockMember } = props;
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isSorting } = useSortable({
        id: entry.sortableId,
        disabled: !canReorder,
        data: { type: 'manual-sort-file' }
    });
    const dragStyle = {
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        transition
    };
    const bindRowDrag = canReorder && !isMobile;
    const bindHandleDrag = canReorder && isMobile;
    const dragHandle = (
        <span
            ref={setActivatorNodeRef}
            className="nn-drag-handle"
            role="button"
            tabIndex={-1}
            {...(bindHandleDrag ? attributes : undefined)}
            {...(bindHandleDrag ? listeners : undefined)}
        >
            <ObsidianIcon name="lucide-grip-horizontal" />
        </span>
    );

    return (
        <div
            ref={setNodeRef}
            className={`nn-manual-sort-row${
                canReorder ? ' nn-manual-sort-row-draggable' : ' nn-manual-sort-row-disabled'
            }${isDragBlockMember ? ' nn-manual-sort-row-drag-block' : ''}${isSorting ? ' nn-manual-sort-row-sorting' : ''}${
                isLastEntry ? ' nn-manual-sort-row-last' : ''
            }`}
            style={dragStyle}
            {...(bindRowDrag ? attributes : undefined)}
            {...(bindRowDrag ? listeners : undefined)}
        >
            <ManualSortRowContent {...props} dragHandle={dragHandle} />
        </div>
    );
}

function ManualSortStaticRow(props: ManualSortRowProps) {
    const { isLastEntry, isDragBlockMember } = props;

    return (
        <div
            className={`nn-manual-sort-row nn-manual-sort-row-disabled${isDragBlockMember ? ' nn-manual-sort-row-drag-block' : ''}${
                isLastEntry ? ' nn-manual-sort-row-last' : ''
            }`}
        >
            <ManualSortRowContent {...props} canReorder={false} />
        </div>
    );
}

function buildManualSortRenderRows(
    app: App,
    entries: readonly ManualSortEntry[],
    groupHeaderPropertyKey: string | null,
    sectionKey: string
): ManualSortRenderRow[] {
    const rows: ManualSortRenderRow[] = [];
    let segmentIndex = 0;

    entries.forEach(entry => {
        if (groupHeaderPropertyKey && entry.file.extension === 'md') {
            const header = getCachedManualSortGroupHeaderValue(app, entry.file, groupHeaderPropertyKey);
            if (header) {
                segmentIndex += 1;
                rows.push({
                    type: 'header',
                    key: `${sectionKey}-manual-sort-custom-header-${entry.file.path}`,
                    label: header
                });
            }
        }

        rows.push({
            type: 'file',
            key: entry.sortableId,
            entry,
            segmentKey: `${sectionKey}:${segmentIndex}`
        });
    });

    return rows;
}

interface ManualSortGroupProps {
    rankedRows: ManualSortRenderRow[];
    unsortedRows: ManualSortRenderRow[];
    nonMarkdownRows: ManualSortRenderRow[];
    sortableIds: string[];
    canReorder: boolean;
    rowContext: ManualSortRowContext;
    noteShortcutKeysByPath: ReadonlyMap<string, string>;
    selectedFiles: ReadonlySet<string>;
    activeDragPaths: ReadonlySet<string>;
}

function ManualSortGroup({
    rankedRows,
    unsortedRows,
    nonMarkdownRows,
    sortableIds,
    canReorder,
    rowContext,
    noteShortcutKeysByPath,
    selectedFiles,
    activeDragPaths
}: ManualSortGroupProps) {
    const renderRows = (rows: ManualSortRenderRow[]) =>
        rows.map((row, index) => {
            if (row.type === 'header') {
                return (
                    <div key={row.key} className="nn-list-group-header nn-manual-sort-section-header">
                        <span className="nn-list-group-header-text">{row.label}</span>
                    </div>
                );
            }

            const entry = row.entry;
            const previousRow = rows[index - 1];
            const nextRow = rows[index + 1];
            const previousEntry = previousRow?.type === 'file' && previousRow.segmentKey === row.segmentKey ? previousRow.entry : undefined;
            const nextEntry = nextRow?.type === 'file' && nextRow.segmentKey === row.segmentKey ? nextRow.entry : undefined;
            const isLastEntry = !nextEntry;
            const isSelected = selectedFiles.has(entry.file.path);
            const rowProps: ManualSortRowProps = {
                ...rowContext,
                entry,
                isLastEntry,
                canReorder: canReorder && entry.file.extension === 'md',
                isSelected,
                hasSelectedAbove: Boolean(previousEntry && selectedFiles.has(previousEntry.file.path)),
                hasSelectedBelow: Boolean(nextEntry && selectedFiles.has(nextEntry.file.path)),
                isDragBlockMember: activeDragPaths.has(entry.file.path),
                shortcutKey: noteShortcutKeysByPath.get(entry.file.path)
            };

            if (entry.file.extension !== 'md') {
                return <ManualSortStaticRow key={row.key} {...rowProps} />;
            }

            return <SortableManualSortRow key={row.key} {...rowProps} />;
        });

    return (
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {renderRows(rankedRows)}
            {unsortedRows.length > 0 ? (
                <>
                    <div className="nn-list-group-header nn-manual-sort-section-header">
                        <span className="nn-list-group-header-text">{strings.listPane.unsortedSection}</span>
                    </div>
                    {renderRows(unsortedRows)}
                </>
            ) : null}
            {renderRows(nonMarkdownRows)}
        </SortableContext>
    );
}

function buildFileInfoMap(listItems: readonly ListPaneItem[]): Map<string, ManualSortFileInfo> {
    const map = new Map<string, ManualSortFileInfo>();
    listItems.forEach(item => {
        if (item.type !== ListPaneItemType.FILE || !(item.data instanceof TFile)) {
            return;
        }

        map.set(item.data.path, {
            fileIndex: item.fileIndex,
            parentFolder: item.parentFolder,
            isHidden: item.isHidden
        });
    });
    return map;
}

export function ManualSortListContent({
    files,
    listItems,
    hiddenFileState,
    propertyKey,
    manualSortGroupHeaderPropertyKey,
    rankByPath,
    selectedFolderPath,
    isSaving,
    isDoneDisabled,
    selectionType,
    sortOption,
    localDayReference,
    fileIconSize,
    appearanceSettings,
    includeDescendantNotes,
    hiddenTagVisibility,
    fileNameIconNeedles,
    visibleListPropertyKeys,
    visibleNavigationPropertyKeys,
    fileItemStorage,
    noteShortcutKeysByPath,
    folderDecorationModel,
    fileItemPillDecorationModel,
    getSolidBackground,
    selectedFiles,
    onFileClick,
    onDone,
    onReorder
}: ManualSortListContentProps) {
    const { app, isMobile } = useServices();
    const [activeDragPaths, setActiveDragPaths] = useState<ReadonlySet<string>>(() => new Set());
    const fileInfoByPath = useMemo(() => buildFileInfoMap(listItems), [listItems]);
    const filePartitions = useMemo(() => partitionManualSortFiles(files), [files]);
    const markdownFiles = filePartitions.markdown;
    const nonMarkdownFiles = filePartitions.nonMarkdown;
    const manualFileIndexByPath = useMemo(() => new Map(files.map((file, index) => [file.path, index])), [files]);
    const rankedMarkdownFiles = useMemo(() => markdownFiles.filter(file => rankByPath.has(file.path)), [markdownFiles, rankByPath]);
    const unsortedMarkdownFiles = useMemo(() => markdownFiles.filter(file => !rankByPath.has(file.path)), [markdownFiles, rankByPath]);
    const nonMarkdownCount = nonMarkdownFiles.length;
    const hasNoFiles = files.length === 0;

    const buildEntries = useCallback(
        (sourceFiles: TFile[]): ManualSortEntry[] =>
            sourceFiles.map(file => {
                const info = fileInfoByPath.get(file.path) ?? {};
                return {
                    file,
                    sortableId: file.path,
                    info: {
                        ...info,
                        fileIndex: manualFileIndexByPath.get(file.path) ?? info.fileIndex,
                        parentFolder: info.parentFolder ?? selectedFolderPath,
                        isHidden: info.isHidden ?? hiddenFileState.get(file.path)
                    }
                };
            }),
        [fileInfoByPath, hiddenFileState, manualFileIndexByPath, selectedFolderPath]
    );
    const rankedEntries = useMemo<ManualSortEntry[]>(() => buildEntries(rankedMarkdownFiles), [buildEntries, rankedMarkdownFiles]);
    const unsortedEntries = useMemo<ManualSortEntry[]>(() => buildEntries(unsortedMarkdownFiles), [buildEntries, unsortedMarkdownFiles]);
    const nonMarkdownEntries = useMemo<ManualSortEntry[]>(() => buildEntries(nonMarkdownFiles), [buildEntries, nonMarkdownFiles]);
    const rankedRows = useMemo(
        () => buildManualSortRenderRows(app, rankedEntries, manualSortGroupHeaderPropertyKey, 'ranked'),
        [app, manualSortGroupHeaderPropertyKey, rankedEntries]
    );
    const unsortedRows = useMemo(
        () => buildManualSortRenderRows(app, unsortedEntries, manualSortGroupHeaderPropertyKey, 'unsorted'),
        [app, manualSortGroupHeaderPropertyKey, unsortedEntries]
    );
    const nonMarkdownRows = useMemo(
        () => buildManualSortRenderRows(app, nonMarkdownEntries, null, 'non-markdown'),
        [app, nonMarkdownEntries]
    );
    const entries = useMemo<ManualSortEntry[]>(() => {
        return [...rankedEntries, ...unsortedEntries, ...nonMarkdownEntries];
    }, [nonMarkdownEntries, rankedEntries, unsortedEntries]);
    const sortableRegistry = useMemo(() => {
        return new Map(entries.map(entry => [entry.sortableId, entry]));
    }, [entries]);
    const sortableIds = useMemo(() => markdownFiles.map(file => file.path), [markdownFiles]);

    const rowContext = useMemo<ManualSortRowContext>(
        () => ({
            isMobile,
            selectionType,
            sortOption,
            localDayReference,
            fileIconSize,
            appearanceSettings,
            includeDescendantNotes,
            hiddenTagVisibility,
            fileNameIconNeedles,
            visibleListPropertyKeys,
            visibleNavigationPropertyKeys,
            fileItemStorage,
            folderDecorationModel,
            fileItemPillDecorationModel,
            getSolidBackground,
            onFileClick
        }),
        [
            isMobile,
            selectionType,
            sortOption,
            localDayReference,
            fileIconSize,
            appearanceSettings,
            includeDescendantNotes,
            hiddenTagVisibility,
            fileNameIconNeedles,
            visibleListPropertyKeys,
            visibleNavigationPropertyKeys,
            fileItemStorage,
            folderDecorationModel,
            fileItemPillDecorationModel,
            getSolidBackground,
            onFileClick
        ]
    );

    const getDragBlockPaths = useCallback(
        (activePath: string): ReadonlySet<string> => {
            const selectedMarkdownPaths = getManualSortSelectedMarkdownPaths(markdownFiles, activePath, selectedFiles);
            return selectedMarkdownPaths.size > 1 ? selectedMarkdownPaths : new Set();
        },
        [markdownFiles, selectedFiles]
    );

    const moveMarkdownFiles = useCallback(
        (activePath: string, overPath: string): TFile[] | null => {
            return moveManualSortMarkdownFiles(files, activePath, overPath, selectedFiles);
        },
        [files, selectedFiles]
    );

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: MANUAL_SORT_MOUSE_CONSTRAINT }),
        useSensor(TouchSensor, { activationConstraint: MANUAL_SORT_TOUCH_CONSTRAINT })
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            setActiveDragPaths(new Set());
            if (isSaving) {
                return;
            }

            const activeId = event.active.id as string;
            const overId = event.over?.id as string | undefined;
            if (!overId || activeId === overId) {
                return;
            }

            const active = sortableRegistry.get(activeId);
            const over = sortableRegistry.get(overId);
            if (!active || !over || active.file.extension !== 'md' || over.file.extension !== 'md') {
                return;
            }

            const nextFiles = moveMarkdownFiles(active.file.path, over.file.path);
            if (!nextFiles) {
                return;
            }

            const selectedMarkdownPaths = getManualSortSelectedMarkdownPaths(markdownFiles, active.file.path, selectedFiles);
            onReorder({
                nextFiles,
                movedPaths: selectedMarkdownPaths.size > 1 ? selectedMarkdownPaths : new Set([active.file.path])
            });
        },
        [isSaving, markdownFiles, moveMarkdownFiles, onReorder, selectedFiles, sortableRegistry]
    );

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            if (isSaving) {
                return;
            }

            const activeId = event.active.id as string;
            setActiveDragPaths(getDragBlockPaths(activeId));
        },
        [getDragBlockPaths, isSaving]
    );

    const handleDragCancel = useCallback(() => {
        setActiveDragPaths(new Set());
    }, []);

    return (
        <div className="nn-list-pane-scroller nn-manual-sort-scroller" role="list" tabIndex={-1}>
            <div className="nn-manual-sort-panel">
                <div className="nn-manual-sort-header">
                    <div className="nn-manual-sort-header-text">
                        <span className="nn-manual-sort-title">{strings.listPane.manualSortTitle.replace('{property}', propertyKey)}</span>
                        <span className="nn-manual-sort-hint">{strings.listPane.manualSortHint.replace('{property}', propertyKey)}</span>
                        {nonMarkdownCount > 0 ? (
                            <span className="nn-manual-sort-hint">{strings.listPane.manualSortNonMarkdownHint}</span>
                        ) : null}
                    </div>
                    <button type="button" className="nn-support-button nn-manual-sort-done" onClick={onDone} disabled={isDoneDisabled}>
                        {strings.listPane.manualSortDone}
                    </button>
                </div>

                {hasNoFiles ? (
                    <div className="nn-empty-state">
                        <div className="nn-empty-message">{strings.listPane.emptyStateNoNotes}</div>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={typeFilteredCollisionDetection}
                        modifiers={[verticalAxisOnly]}
                        onDragStart={handleDragStart}
                        onDragCancel={handleDragCancel}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="nn-manual-sort-list" aria-busy={isSaving ? 'true' : undefined}>
                            {entries.length > 0 ? (
                                <ManualSortGroup
                                    rankedRows={rankedRows}
                                    unsortedRows={unsortedRows}
                                    nonMarkdownRows={nonMarkdownRows}
                                    sortableIds={sortableIds}
                                    canReorder={!isSaving}
                                    rowContext={rowContext}
                                    noteShortcutKeysByPath={noteShortcutKeysByPath}
                                    selectedFiles={selectedFiles}
                                    activeDragPaths={activeDragPaths}
                                />
                            ) : null}
                        </div>
                    </DndContext>
                )}
            </div>
        </div>
    );
}
