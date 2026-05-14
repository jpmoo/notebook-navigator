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
import { TFile } from 'obsidian';
import { useServices } from '../../context/ServicesContext';
import { strings } from '../../i18n';
import type { NotebookNavigatorSettings, SortOption } from '../../settings';
import { ListPaneItemType, type NavigationItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import type { ListPaneAppearanceSettings } from '../../hooks/useListPaneAppearance';
import type { FileNameIconNeedle } from '../../utils/fileIconUtils';
import type { FileItemPillDecorationModel } from '../../utils/fileItemPillDecoration';
import type { FolderDecorationModel } from '../../utils/folderDecoration';
import type { HiddenTagVisibility } from '../../utils/tagPrefixMatcher';
import { typeFilteredCollisionDetection, verticalAxisOnly } from '../../utils/dndConfig';
import {
    buildManualSortOrderAssignments,
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
    rankedMarkdownPaths: ReadonlySet<string>;
    selectedFolderPath: string | null;
    isSaving: boolean;
    isDoneDisabled: boolean;
    settings: NotebookNavigatorSettings;
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
    onReorder: (files: TFile[]) => void;
}

interface ManualSortEntry {
    file: TFile;
    sortableId: string;
    manualValue: number | null;
    info: ManualSortFileInfo;
}

interface ManualSortRowContext {
    isMobile: boolean;
    settings: NotebookNavigatorSettings;
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
    settings,
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
    const valueLabel = entry.manualValue === null ? null : entry.manualValue.toString();

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
            <span className="nn-manual-sort-value" title={settings.showTooltips ? undefined : (valueLabel ?? undefined)}>
                {valueLabel ?? '-'}
            </span>
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

interface ManualSortGroupProps {
    rankedEntries: ManualSortEntry[];
    unsortedEntries: ManualSortEntry[];
    nonMarkdownEntries: ManualSortEntry[];
    sortableIds: string[];
    canReorder: boolean;
    rowContext: ManualSortRowContext;
    noteShortcutKeysByPath: ReadonlyMap<string, string>;
    selectedFiles: ReadonlySet<string>;
    activeDragPaths: ReadonlySet<string>;
}

function ManualSortGroup({
    rankedEntries,
    unsortedEntries,
    nonMarkdownEntries,
    sortableIds,
    canReorder,
    rowContext,
    noteShortcutKeysByPath,
    selectedFiles,
    activeDragPaths
}: ManualSortGroupProps) {
    const renderEntries = (entries: ManualSortEntry[]) =>
        entries.map((entry, index) => {
            const isLastEntry = index === entries.length - 1;
            const previousEntry = entries[index - 1];
            const nextEntry = entries[index + 1];
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
                return <ManualSortStaticRow key={entry.sortableId} {...rowProps} />;
            }

            return <SortableManualSortRow key={entry.sortableId} {...rowProps} />;
        });

    return (
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {renderEntries(rankedEntries)}
            {unsortedEntries.length > 0 ? (
                <>
                    <div className="nn-list-group-header nn-manual-sort-section-header">
                        <span className="nn-list-group-header-text">{strings.listPane.unsortedSection}</span>
                    </div>
                    {renderEntries(unsortedEntries)}
                </>
            ) : null}
            {renderEntries(nonMarkdownEntries)}
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
    rankedMarkdownPaths,
    selectedFolderPath,
    isSaving,
    isDoneDisabled,
    settings,
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
    const { isMobile } = useServices();
    const [activeDragPaths, setActiveDragPaths] = useState<ReadonlySet<string>>(() => new Set());
    const fileInfoByPath = useMemo(() => buildFileInfoMap(listItems), [listItems]);
    const filePartitions = useMemo(() => partitionManualSortFiles(files), [files]);
    const markdownFiles = filePartitions.markdown;
    const nonMarkdownFiles = filePartitions.nonMarkdown;
    const manualFileIndexByPath = useMemo(() => new Map(files.map((file, index) => [file.path, index])), [files]);
    const rankedMarkdownFiles = useMemo(
        () => markdownFiles.filter(file => rankedMarkdownPaths.has(file.path)),
        [markdownFiles, rankedMarkdownPaths]
    );
    const unsortedMarkdownFiles = useMemo(
        () => markdownFiles.filter(file => !rankedMarkdownPaths.has(file.path)),
        [markdownFiles, rankedMarkdownPaths]
    );
    const manualValueByPath = useMemo(() => {
        const map = new Map<string, number>();
        buildManualSortOrderAssignments(rankedMarkdownFiles).forEach(assignment => {
            map.set(assignment.path, assignment.value);
        });
        return map;
    }, [rankedMarkdownFiles]);
    const nonMarkdownCount = nonMarkdownFiles.length;
    const hasNoFiles = files.length === 0;

    const buildEntries = useCallback(
        (sourceFiles: TFile[]): ManualSortEntry[] =>
            sourceFiles.map(file => {
                const info = fileInfoByPath.get(file.path) ?? {};
                return {
                    file,
                    sortableId: file.path,
                    manualValue: manualValueByPath.get(file.path) ?? null,
                    info: {
                        ...info,
                        fileIndex: manualFileIndexByPath.get(file.path) ?? info.fileIndex,
                        parentFolder: info.parentFolder ?? selectedFolderPath,
                        isHidden: info.isHidden ?? hiddenFileState.get(file.path)
                    }
                };
            }),
        [fileInfoByPath, hiddenFileState, manualFileIndexByPath, manualValueByPath, selectedFolderPath]
    );
    const rankedEntries = useMemo<ManualSortEntry[]>(() => buildEntries(rankedMarkdownFiles), [buildEntries, rankedMarkdownFiles]);
    const unsortedEntries = useMemo<ManualSortEntry[]>(() => buildEntries(unsortedMarkdownFiles), [buildEntries, unsortedMarkdownFiles]);
    const nonMarkdownEntries = useMemo<ManualSortEntry[]>(() => buildEntries(nonMarkdownFiles), [buildEntries, nonMarkdownFiles]);
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
            settings,
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
            settings,
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

            onReorder(nextFiles);
        },
        [isSaving, moveMarkdownFiles, onReorder, sortableRegistry]
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
                                    rankedEntries={rankedEntries}
                                    unsortedEntries={unsortedEntries}
                                    nonMarkdownEntries={nonMarkdownEntries}
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
