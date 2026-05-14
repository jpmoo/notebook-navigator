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

import { useCallback, useMemo, type ReactNode } from 'react';
import { DndContext, MouseSensor, TouchSensor, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
import { buildManualSortOrderAssignments, partitionManualSortFiles } from '../../utils/manualSort';
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
}

interface ManualSortRowProps extends ManualSortRowContext {
    entry: ManualSortEntry;
    isLastEntry: boolean;
    canReorder: boolean;
    shortcutKey?: string;
}

function noopFileClick(): void {
    return;
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
    dragHandle
}: ManualSortRowProps & { dragHandle?: ReactNode }) {
    const valueLabel = entry.manualValue === null ? null : entry.manualValue.toString();

    return (
        <>
            <div className="nn-manual-sort-file">
                <FileItem
                    file={entry.file}
                    isSelected={false}
                    showQuickActionsPanel={false}
                    onFileClick={noopFileClick}
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
    const { entry, isLastEntry, canReorder, isMobile } = props;
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
            }${isSorting ? ' nn-manual-sort-row-sorting' : ''}${isLastEntry ? ' nn-manual-sort-row-last' : ''}`}
            style={dragStyle}
            {...(bindRowDrag ? attributes : undefined)}
            {...(bindRowDrag ? listeners : undefined)}
        >
            <ManualSortRowContent {...props} dragHandle={dragHandle} />
        </div>
    );
}

function ManualSortStaticRow(props: ManualSortRowProps) {
    const { isLastEntry } = props;

    return (
        <div className={`nn-manual-sort-row nn-manual-sort-row-disabled${isLastEntry ? ' nn-manual-sort-row-last' : ''}`}>
            <ManualSortRowContent {...props} canReorder={false} />
        </div>
    );
}

interface ManualSortGroupProps {
    entries: ManualSortEntry[];
    sortableIds: string[];
    canReorder: boolean;
    rowContext: ManualSortRowContext;
    noteShortcutKeysByPath: ReadonlyMap<string, string>;
}

function ManualSortGroup({ entries, sortableIds, canReorder, rowContext, noteShortcutKeysByPath }: ManualSortGroupProps) {
    return (
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {entries.map((entry, index) => {
                const isLastEntry = index === entries.length - 1;
                const rowProps: ManualSortRowProps = {
                    ...rowContext,
                    entry,
                    isLastEntry,
                    canReorder: canReorder && entry.file.extension === 'md',
                    shortcutKey: noteShortcutKeysByPath.get(entry.file.path)
                };

                if (entry.file.extension !== 'md') {
                    return <ManualSortStaticRow key={entry.sortableId} {...rowProps} />;
                }

                return <SortableManualSortRow key={entry.sortableId} {...rowProps} />;
            })}
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
    onDone,
    onReorder
}: ManualSortListContentProps) {
    const { isMobile } = useServices();
    const fileInfoByPath = useMemo(() => buildFileInfoMap(listItems), [listItems]);
    const filePartitions = useMemo(() => partitionManualSortFiles(files), [files]);
    const markdownFiles = filePartitions.markdown;
    const nonMarkdownFiles = filePartitions.nonMarkdown;
    const manualValueByPath = useMemo(() => {
        const map = new Map<string, number>();
        buildManualSortOrderAssignments(markdownFiles).forEach(assignment => {
            map.set(assignment.path, assignment.value);
        });
        return map;
    }, [markdownFiles]);
    const nonMarkdownCount = nonMarkdownFiles.length;
    const hasNoFiles = files.length === 0;

    const entries = useMemo<ManualSortEntry[]>(() => {
        return [...markdownFiles, ...nonMarkdownFiles].map(file => {
            const info = fileInfoByPath.get(file.path) ?? {};
            return {
                file,
                sortableId: file.path,
                manualValue: manualValueByPath.get(file.path) ?? null,
                info: {
                    ...info,
                    parentFolder: info.parentFolder ?? selectedFolderPath,
                    isHidden: info.isHidden ?? hiddenFileState.get(file.path)
                }
            };
        });
    }, [fileInfoByPath, hiddenFileState, manualValueByPath, markdownFiles, nonMarkdownFiles, selectedFolderPath]);
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
            getSolidBackground
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
            getSolidBackground
        ]
    );

    const moveMarkdownFile = useCallback(
        (activePath: string, overPath: string): TFile[] | null => {
            const oldIndex = markdownFiles.findIndex(file => file.path === activePath);
            const newIndex = markdownFiles.findIndex(file => file.path === overPath);
            if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
                return null;
            }

            const reorderedMarkdown = arrayMove(markdownFiles, oldIndex, newIndex);
            return [...reorderedMarkdown, ...nonMarkdownFiles];
        },
        [markdownFiles, nonMarkdownFiles]
    );

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: MANUAL_SORT_MOUSE_CONSTRAINT }),
        useSensor(TouchSensor, { activationConstraint: MANUAL_SORT_TOUCH_CONSTRAINT })
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
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

            const nextFiles = moveMarkdownFile(active.file.path, over.file.path);
            if (!nextFiles) {
                return;
            }

            onReorder(nextFiles);
        },
        [isSaving, moveMarkdownFile, onReorder, sortableRegistry]
    );

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
                        onDragEnd={handleDragEnd}
                    >
                        <div className="nn-manual-sort-list" aria-busy={isSaving ? 'true' : undefined}>
                            {entries.length > 0 ? (
                                <ManualSortGroup
                                    entries={entries}
                                    sortableIds={sortableIds}
                                    canReorder={!isSaving}
                                    rowContext={rowContext}
                                    noteShortcutKeysByPath={noteShortcutKeysByPath}
                                />
                            ) : null}
                        </div>
                    </DndContext>
                )}
            </div>
        </div>
    );
}
