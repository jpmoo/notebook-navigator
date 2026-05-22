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

import type {
    SettingDefinitionControl,
    SettingDefinitionGroup,
    SettingDefinitionRender,
    SettingDropdownControl,
    SettingFolderControl,
    SettingSliderControl,
    SettingTextControl,
    SettingToggleControl
} from 'obsidian';
import { DEFAULT_SETTINGS } from './defaultSettings';
import type { NotebookNavigatorSettings } from './types';
import { normalizeCalendarCustomRootFolder } from '../utils/calendarCustomNotePatterns';

type SettingsKeyOfType<T> = Extract<
    {
        [K in keyof NotebookNavigatorSettings]: NotebookNavigatorSettings[K] extends T ? K : never;
    }[keyof NotebookNavigatorSettings],
    string
>;

type DefinitionItems = NonNullable<SettingDefinitionGroup['items']>;
type RenderSetting = SettingDefinitionRender['render'];

interface DefinitionOptions {
    name: string;
    desc?: string | DocumentFragment;
    aliases?: string[];
    searchable?: boolean | (() => boolean);
    visible?: boolean | (() => boolean);
}

interface ControlDefinitionOptions extends DefinitionOptions {
    disabled?: boolean | (() => boolean);
}

interface DropdownDefinitionOptions<K extends string> extends ControlDefinitionOptions {
    options: Record<string, string>;
    defaultValue?: string;
    validate?: SettingDropdownControl<K>['validate'];
}

interface FolderDefinitionOptions<K extends string> extends ControlDefinitionOptions {
    placeholder?: string;
    defaultValue?: string;
    validate?: SettingFolderControl<K>['validate'];
    filter?: SettingFolderControl<K>['filter'];
    includeRoot?: SettingFolderControl<K>['includeRoot'];
}

interface SliderDefinitionOptions<K extends string> extends ControlDefinitionOptions {
    min: number;
    max: number;
    step: number;
    defaultValue?: number;
    validate?: SettingSliderControl<K>['validate'];
}

interface TextDefinitionOptions<K extends string> extends ControlDefinitionOptions {
    placeholder?: string;
    defaultValue?: string;
    validate?: SettingTextControl<K>['validate'];
}

interface ToggleDefinitionOptions extends ControlDefinitionOptions {
    defaultValue?: boolean;
}

// These keys are bound through native SettingDefinitionControl rows.
const BOOLEAN_SETTING_KEYS = [
    'confirmBeforeDelete',
    'showFolderIcons',
    'showRootFolder',
    'inheritFolderColors',
    'enableFolderNotes',
    'enableFolderNoteLinks',
    'hideFolderNoteInList',
    'pinCreatedFolderNote',
    'openFolderNotesInNewTab',
    'showTags',
    'showTagIcons',
    'showAllTagsFolder',
    'showUntagged',
    'scopeTagsToCurrentContext',
    'inheritTagColors',
    'keepEmptyTagsProperty',
    'showProperties',
    'showPropertyIcons',
    'inheritPropertyColors',
    'showAllPropertiesFolder',
    'scopePropertiesToCurrentContext',
    'showSectionIcons',
    'showShortcuts',
    'skipAutoScroll',
    'showRecentNotes',
    'pinRecentNotesWithShortcuts',
    'calendarEnabled',
    'calendarConfirmBeforeCreate',
    'calendarHighlightToday',
    'calendarShowFeatureImage',
    'calendarShowWeekNumber',
    'calendarShowQuarter',
    'calendarShowYearCalendar',
    'useFrontmatterMetadata',
    'checkForUpdatesOnStart',
    'showFileIconUnfinishedTask',
    'showFileBackgroundUnfinishedTask',
    'showFileIcons',
    'useFolderIconForFiles',
    'showFilenameMatchIcons',
    'showCategoryIcons',
    'useFolderColorForTitles',
    'showFilePreview',
    'skipHeadingsInPreview',
    'skipCodeBlocksInPreview',
    'stripHtmlInPreview',
    'stripLatexInPreview',
    'previewPropertiesFallback',
    'showFeatureImage',
    'forceSquareFeatureImage',
    'downloadExternalFeatureImages',
    'showFileTags',
    'colorFileTags',
    'prioritizeColoredFileTags',
    'showFileTagAncestors',
    'showFileTagsInCompactMode',
    'showFileProperties',
    'colorFileProperties',
    'prioritizeColoredFileProperties',
    'showFilePropertiesInCompactMode',
    'showPropertiesOnSeparateRows',
    'enablePropertyInternalLinks',
    'enablePropertyExternalLinks',
    'showFileDate',
    'showParentFolder',
    'showParentFolderFullPath',
    'parentFolderClickRevealsFile',
    'showParentFolderColor',
    'showParentFolderIcon',
    'showWordCount',
    'showWordCountPercentage',
    'showSelectedNavigationPills',
    'stickyGroupHeaders',
    'confirmBeforeManualSort',
    'filterPinnedByFolder',
    'revealFileOnListChanges',
    'hideDrawingPreviewImages',
    'showNoteCount',
    'separateNoteCounts',
    'showIndentGuides',
    'smartCollapse',
    'autoSelectFirstFileOnFocusChange',
    'autoExpandNavItems',
    'springLoadedFolders'
] as const satisfies readonly SettingsKeyOfType<boolean>[];

const STRING_SETTING_KEYS = [
    'deleteAttachments',
    'moveFileConflicts',
    'folderNoteType',
    'folderNoteName',
    'folderNoteNamePattern',
    'shortcutBadgeDisplay',
    'hideRecentNotes',
    'calendarWeekendDays',
    'calendarMonthHeadingFormat',
    'calendarTemplateFolder',
    'wordCountPlacement',
    'alphabeticalDateMode',
    'listPaneTitle',
    'defaultListMode',
    'defaultFolderSort',
    'noteGrouping',
    'propertySortSecondary',
    'manualSortNewNotePlacement',
    'collapseBehavior'
] as const satisfies readonly SettingsKeyOfType<string>[];

const NUMBER_SETTING_KEYS = [
    'recentNotesCount',
    'springLoadedFoldersInitialDelay',
    'springLoadedFoldersSubsequentDelay'
] as const satisfies readonly SettingsKeyOfType<number>[];

type NativeBooleanControlKey = (typeof BOOLEAN_SETTING_KEYS)[number];
type NativeStringControlKey = (typeof STRING_SETTING_KEYS)[number];
type NativeNumberControlKey = (typeof NUMBER_SETTING_KEYS)[number];

export type NativeSettingControlKey = NativeBooleanControlKey | NativeStringControlKey | NativeNumberControlKey;

const BOOLEAN_SETTING_KEY_SET: ReadonlySet<string> = new Set(BOOLEAN_SETTING_KEYS);
const STRING_SETTING_KEY_SET: ReadonlySet<string> = new Set(STRING_SETTING_KEYS);
const NUMBER_SETTING_KEY_SET: ReadonlySet<string> = new Set(NUMBER_SETTING_KEYS);

const STRING_SETTING_OPTIONS: Partial<Record<NativeStringControlKey, readonly string[]>> = {
    deleteAttachments: ['ask', 'always', 'never'],
    moveFileConflicts: ['ask', 'rename'],
    folderNoteType: ['ask', 'markdown', 'canvas', 'base'],
    shortcutBadgeDisplay: ['index', 'count', 'none'],
    hideRecentNotes: ['none', 'folder-notes'],
    calendarWeekendDays: ['none', 'sat-sun', 'fri-sat', 'thu-fri'],
    calendarMonthHeadingFormat: ['full', 'short'],
    wordCountPlacement: ['title', 'property'],
    alphabeticalDateMode: ['created', 'modified'],
    listPaneTitle: ['header', 'list', 'hidden'],
    defaultListMode: ['standard', 'compact'],
    defaultFolderSort: [
        'modified-desc',
        'modified-asc',
        'created-desc',
        'created-asc',
        'title-asc',
        'title-desc',
        'filename-asc',
        'filename-desc',
        'property-asc',
        'property-desc'
    ],
    noteGrouping: ['custom', 'date', 'folder'],
    propertySortSecondary: ['title', 'filename', 'created', 'modified'],
    manualSortNewNotePlacement: ['top', 'bottom', 'below-selected-note', 'unsorted'],
    collapseBehavior: ['all', 'folders-only', 'tags-only', 'properties-only']
};

const NUMBER_SETTING_RANGES: Partial<Record<NativeNumberControlKey, { min: number; max: number }>> = {
    recentNotesCount: { min: 1, max: 10 },
    springLoadedFoldersInitialDelay: { min: 0.1, max: 2 },
    springLoadedFoldersSubsequentDelay: { min: 0.1, max: 2 }
};

export const NATIVE_SETTING_DOM_STATE_REFRESH_KEYS: ReadonlySet<NativeSettingControlKey> = new Set([
    'enableFolderNotes',
    'showTags',
    'showProperties',
    'showShortcuts',
    'showRecentNotes',
    'useFrontmatterMetadata',
    'showFileBackgroundUnfinishedTask',
    'showFileIcons',
    'showFilenameMatchIcons',
    'showCategoryIcons',
    'showFilePreview',
    'showFeatureImage',
    'showFileTags',
    'colorFileTags',
    'showFileProperties',
    'colorFileProperties',
    'showFileDate',
    'showParentFolder',
    'showWordCount',
    'showNoteCount',
    'springLoadedFolders'
]);

export function createGroupDefinition(
    heading: string | undefined,
    items: DefinitionItems,
    options?: { visible?: boolean | (() => boolean) }
): SettingDefinitionGroup {
    const group: SettingDefinitionGroup = {
        type: 'group',
        items
    };

    if (heading) {
        group.heading = heading;
    }
    if (options?.visible !== undefined) {
        group.visible = options.visible;
    }

    return group;
}

export function createToggleControlDefinition<K extends string>(key: K, options: ToggleDefinitionOptions): SettingDefinitionControl<K> {
    const control: SettingToggleControl<K> = {
        type: 'toggle',
        key,
        defaultValue: options.defaultValue
    };
    applyControlState(control, options);

    return createControlDefinition({
        ...options,
        control
    });
}

export function createToggleDefinition<K extends NativeBooleanControlKey>(
    key: K,
    options: ControlDefinitionOptions
): SettingDefinitionControl<K> {
    return createToggleControlDefinition(key, {
        ...options,
        defaultValue: DEFAULT_SETTINGS[key]
    });
}

export function createDropdownControlDefinition<K extends string>(
    key: K,
    options: DropdownDefinitionOptions<K>
): SettingDefinitionControl<K> {
    const control: SettingDropdownControl<K> = {
        type: 'dropdown',
        key,
        defaultValue: options.defaultValue,
        options: options.options,
        validate: options.validate
    };
    applyControlState(control, options);

    return createControlDefinition({
        name: options.name,
        desc: options.desc,
        aliases: options.aliases,
        searchable: options.searchable,
        visible: options.visible,
        control
    });
}

export function createDropdownDefinition<K extends NativeStringControlKey>(
    key: K,
    options: DropdownDefinitionOptions<K>
): SettingDefinitionControl<K> {
    return createDropdownControlDefinition(key, {
        ...options,
        defaultValue: options.defaultValue ?? DEFAULT_SETTINGS[key]
    });
}

function createTextControlDefinition<K extends string>(key: K, options: TextDefinitionOptions<K>): SettingDefinitionControl<K> {
    const control: SettingTextControl<K> = {
        type: 'text',
        key,
        defaultValue: options.defaultValue,
        placeholder: options.placeholder,
        validate: options.validate
    };
    applyControlState(control, options);

    return createControlDefinition({
        ...options,
        control
    });
}

export function createTextDefinition<K extends NativeStringControlKey>(
    key: K,
    options: TextDefinitionOptions<K>
): SettingDefinitionControl<K> {
    return createTextControlDefinition(key, {
        ...options,
        defaultValue: options.defaultValue ?? DEFAULT_SETTINGS[key]
    });
}

export function createFolderDefinition<K extends NativeStringControlKey>(
    key: K,
    options: FolderDefinitionOptions<K>
): SettingDefinitionControl<K> {
    const control: SettingFolderControl<K> = {
        type: 'folder',
        key,
        defaultValue: options.defaultValue ?? DEFAULT_SETTINGS[key],
        placeholder: options.placeholder,
        validate: options.validate,
        filter: options.filter,
        includeRoot: options.includeRoot
    };
    applyControlState(control, options);

    return createControlDefinition({
        name: options.name,
        desc: options.desc,
        aliases: options.aliases,
        searchable: options.searchable,
        visible: options.visible,
        control
    });
}

export function createSliderDefinition<K extends NativeNumberControlKey>(
    key: K,
    options: SliderDefinitionOptions<K>
): SettingDefinitionControl<K> {
    const control: SettingSliderControl<K> = {
        type: 'slider',
        key,
        defaultValue: options.defaultValue ?? DEFAULT_SETTINGS[key],
        min: options.min,
        max: options.max,
        step: options.step,
        validate: options.validate
    };
    applyControlState(control, options);

    return createControlDefinition({
        name: options.name,
        desc: options.desc,
        aliases: options.aliases,
        searchable: options.searchable,
        visible: options.visible,
        control
    });
}

export function createRenderDefinition(options: DefinitionOptions & { render: RenderSetting }): SettingDefinitionRender {
    const setting: SettingDefinitionRender = {
        name: options.name,
        desc: options.desc,
        render: (setting, group) => options.render(setting, group)
    };

    if (options.aliases) {
        setting.aliases = options.aliases;
    }
    if (options.searchable !== undefined) {
        setting.searchable = options.searchable;
    }
    if (options.visible !== undefined) {
        setting.visible = options.visible;
    }

    return setting;
}

export function isNativeSettingControlKey(key: string): key is NativeSettingControlKey {
    return BOOLEAN_SETTING_KEY_SET.has(key) || STRING_SETTING_KEY_SET.has(key) || NUMBER_SETTING_KEY_SET.has(key);
}

export function getNativeSettingControlValue(settings: NotebookNavigatorSettings, key: NativeSettingControlKey): unknown {
    return settings[key];
}

export function applyNativeSettingControlValue(settings: NotebookNavigatorSettings, key: NativeSettingControlKey, value: unknown): boolean {
    if (isNativeBooleanControlKey(key)) {
        if (typeof value !== 'boolean') {
            return false;
        }
        settings[key] = value;
        return true;
    }

    if (isNativeStringControlKey(key)) {
        if (typeof value !== 'string') {
            return false;
        }

        const options = STRING_SETTING_OPTIONS[key];
        if (options && !options.includes(value)) {
            return false;
        }

        setStringSetting(settings, key, normalizeStringSettingValue(key, value));
        return true;
    }

    if (isNativeNumberControlKey(key)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
        }

        const range = NUMBER_SETTING_RANGES[key];
        if (range && (value < range.min || value > range.max)) {
            return false;
        }

        settings[key] = value;
        return true;
    }

    return false;
}

function createControlDefinition<K extends string>(
    options: DefinitionOptions & { control: SettingDefinitionControl<K>['control'] }
): SettingDefinitionControl<K> {
    const setting: SettingDefinitionControl<K> = {
        name: options.name,
        desc: options.desc,
        control: options.control
    };

    if (options.aliases) {
        setting.aliases = options.aliases;
    }
    if (options.searchable !== undefined) {
        setting.searchable = options.searchable;
    }
    if (options.visible !== undefined) {
        setting.visible = options.visible;
    }

    return setting;
}

function applyControlState(control: { disabled?: boolean | (() => boolean) }, options: ControlDefinitionOptions): void {
    if (options.disabled !== undefined) {
        control.disabled = options.disabled;
    }
}

function isNativeBooleanControlKey(key: NativeSettingControlKey): key is NativeBooleanControlKey {
    return BOOLEAN_SETTING_KEY_SET.has(key);
}

function isNativeStringControlKey(key: NativeSettingControlKey): key is NativeStringControlKey {
    return STRING_SETTING_KEY_SET.has(key);
}

function isNativeNumberControlKey(key: NativeSettingControlKey): key is NativeNumberControlKey {
    return NUMBER_SETTING_KEY_SET.has(key);
}

function setStringSetting(settings: NotebookNavigatorSettings, key: NativeStringControlKey, value: string): void {
    const target = settings as unknown as Record<NativeStringControlKey, string>;
    target[key] = value;
}

function normalizeStringSettingValue(key: NativeStringControlKey, value: string): string {
    if (key === 'calendarTemplateFolder') {
        return normalizeCalendarCustomRootFolder(value);
    }

    return value;
}
