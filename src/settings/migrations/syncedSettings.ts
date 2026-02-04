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

// Imports
import type { NotebookNavigatorSettings } from '../types';
import type { LocalStorageKeys } from '../../types';
import type { FolderAppearance } from '../../hooks/useListPaneAppearance';
import { localStorage } from '../../utils/localStorage';
import { isPlainObjectRecordValue } from '../../utils/recordUtils';
import { cloneShortcuts, DEFAULT_VAULT_PROFILE_ID } from '../../utils/vaultProfiles';
import { ShortcutType, type ShortcutEntry } from '../../types/shortcuts';
import { isCustomPropertyType } from '../types';
import { normalizeCalendarCustomRootFolder } from '../../utils/calendarCustomNotePatterns';

// Types/Interfaces
export interface LegacyVisibilityMigration {
    hiddenFolders: string[];
    hiddenFileProperties: string[];
    hiddenTags: string[];
    navigationBanner: string | null;
    shouldApplyToProfiles: boolean;
}

// Migrates legacy synced settings fields into the current settings schema.
// This runs before local-only settings are resolved from localStorage.
export function migrateLegacySyncedSettings(params: {
    settings: NotebookNavigatorSettings;
    storedData: Record<string, unknown> | null;
    keys: LocalStorageKeys;
    defaultSettings: NotebookNavigatorSettings;
}): void {
    const { settings, storedData, keys, defaultSettings } = params;

    // Remove deprecated fields from settings object
    const mutableSettings = settings as unknown as Record<string, unknown>;
    delete mutableSettings.recentNotes;
    delete mutableSettings.recentIcons;
    delete mutableSettings.searchActive;
    delete mutableSettings.showHiddenItems;
    delete mutableSettings.hiddenTags;
    delete mutableSettings.fileVisibility;
    delete mutableSettings.preventInvalidCharacters;
    delete mutableSettings.mobileBackground;

    const storedNoteGrouping = storedData ? storedData['noteGrouping'] : undefined;

    // Migrates legacy showIcons boolean to separate icon settings for sections, folders, tags, and pinned items
    const legacyShowIcons = mutableSettings.showIcons;
    if (typeof legacyShowIcons === 'boolean') {
        if (typeof storedData?.['showSectionIcons'] === 'undefined') {
            settings.showSectionIcons = legacyShowIcons;
        }
        if (typeof storedData?.['showFolderIcons'] === 'undefined') {
            settings.showFolderIcons = legacyShowIcons;
        }
        if (typeof storedData?.['showTagIcons'] === 'undefined') {
            settings.showTagIcons = legacyShowIcons;
        }
        if (typeof storedData?.['showPinnedIcon'] === 'undefined') {
            settings.showPinnedIcon = legacyShowIcons;
        }
    }
    delete mutableSettings.showIcons;

    // Migrate legacy parent folder visibility flag
    const legacyShowParentFolderNames = mutableSettings['showParentFolderNames'];
    if (typeof legacyShowParentFolderNames === 'boolean' && typeof storedData?.['showParentFolder'] === 'undefined') {
        settings.showParentFolder = legacyShowParentFolderNames;
    }
    delete mutableSettings['showParentFolderNames'];

    // Migrate legacy parent folder color toggle
    const legacyShowParentFolderColors = mutableSettings['showParentFolderColors'];
    if (typeof legacyShowParentFolderColors === 'boolean' && typeof storedData?.['showParentFolderColor'] === 'undefined') {
        settings.showParentFolderColor = legacyShowParentFolderColors;
    }
    delete mutableSettings['showParentFolderColors'];

    // Migrate legacy groupByDate boolean to noteGrouping dropdown
    const legacyGroupByDate = mutableSettings.groupByDate;
    if (typeof legacyGroupByDate === 'boolean' && typeof storedNoteGrouping === 'undefined') {
        settings.noteGrouping = legacyGroupByDate ? 'date' : 'none';
    }
    delete mutableSettings.groupByDate;

    // Validate noteGrouping value and reset to default if invalid
    if (settings.noteGrouping !== 'none' && settings.noteGrouping !== 'date' && settings.noteGrouping !== 'folder') {
        settings.noteGrouping = defaultSettings.noteGrouping;
    }

    // Validate shortcutBadgeDisplay value and reset to default if invalid
    if (
        settings.shortcutBadgeDisplay !== 'index' &&
        settings.shortcutBadgeDisplay !== 'count' &&
        settings.shortcutBadgeDisplay !== 'none'
    ) {
        settings.shortcutBadgeDisplay = defaultSettings.shortcutBadgeDisplay;
    }

    if (!isCustomPropertyType(settings.customPropertyType)) {
        settings.customPropertyType = defaultSettings.customPropertyType;
    }

    if (typeof settings.customPropertyFields !== 'string') {
        settings.customPropertyFields = defaultSettings.customPropertyFields;
    }

    if (typeof settings.showCustomPropertiesOnSeparateRows !== 'boolean') {
        settings.showCustomPropertiesOnSeparateRows = defaultSettings.showCustomPropertiesOnSeparateRows;
    }

    delete mutableSettings['customPropertyColorFields'];

    if (!isPlainObjectRecordValue(settings.customPropertyColorMap)) {
        settings.customPropertyColorMap = defaultSettings.customPropertyColorMap;
    }

    if (typeof settings.showCustomPropertyInCompactMode !== 'boolean') {
        settings.showCustomPropertyInCompactMode = defaultSettings.showCustomPropertyInCompactMode;
    }

    type LegacyAppearance = FolderAppearance & {
        showDate?: boolean;
        showPreview?: boolean;
        showImage?: boolean;
    };

    const migrateLegacyAppearanceMode = (appearance: LegacyAppearance | undefined): FolderAppearance | undefined => {
        if (!appearance) {
            return appearance;
        }

        const isLegacyCompact =
            appearance.mode === undefined &&
            appearance.showDate === false &&
            appearance.showPreview === false &&
            appearance.showImage === false;

        if (isLegacyCompact) {
            const migrated: FolderAppearance = { ...appearance, mode: 'compact' };
            delete (migrated as LegacyAppearance).showDate;
            delete (migrated as LegacyAppearance).showPreview;
            delete (migrated as LegacyAppearance).showImage;
            return migrated;
        }

        return appearance;
    };

    const migrateLegacyAppearances = (collection: Record<string, FolderAppearance> | undefined) => {
        if (!collection) {
            return;
        }

        Object.entries(collection).forEach(([key, appearance]) => {
            const migratedAppearance = migrateLegacyAppearanceMode(appearance);
            if (migratedAppearance) {
                collection[key] = migratedAppearance;
            }
        });
    };

    migrateLegacyAppearances(settings.folderAppearances);
    migrateLegacyAppearances(settings.tagAppearances);

    const legacyColorFileTags = mutableSettings['applyTagColorsToFileTags'];
    if (typeof legacyColorFileTags === 'boolean') {
        settings.colorFileTags = legacyColorFileTags;
    }
    delete mutableSettings['applyTagColorsToFileTags'];

    const legacySlimItemHeight = mutableSettings['slimItemHeight'];
    if (typeof legacySlimItemHeight === 'number' && Number.isFinite(legacySlimItemHeight)) {
        const storedLocalCompactItemHeight = localStorage.get<unknown>(keys.compactItemHeightKey);
        if (typeof storedData?.['compactItemHeight'] === 'undefined' && storedLocalCompactItemHeight === null) {
            localStorage.set(keys.compactItemHeightKey, legacySlimItemHeight);
        }
    }
    delete mutableSettings['slimItemHeight'];

    const legacySlimItemHeightScaleText = mutableSettings['slimItemHeightScaleText'];
    if (typeof legacySlimItemHeightScaleText === 'boolean') {
        const storedLocalCompactItemHeightScaleText = localStorage.get<unknown>(keys.compactItemHeightScaleTextKey);
        if (typeof storedData?.['compactItemHeightScaleText'] === 'undefined' && storedLocalCompactItemHeightScaleText === null) {
            localStorage.set(keys.compactItemHeightScaleTextKey, legacySlimItemHeightScaleText);
        }
    }
    delete mutableSettings['slimItemHeightScaleText'];

    const legacyShowFileTagsInSlimMode = mutableSettings['showFileTagsInSlimMode'];
    if (typeof legacyShowFileTagsInSlimMode === 'boolean') {
        if (typeof storedData?.['showFileTagsInCompactMode'] === 'undefined') {
            settings.showFileTagsInCompactMode = legacyShowFileTagsInSlimMode;
        }
    }
    delete mutableSettings['showFileTagsInSlimMode'];
}

// Migrates folderNoteProperties to the normalized string block format.
export function migrateFolderNotePropertiesSetting(params: {
    settings: NotebookNavigatorSettings;
    defaultSettings: NotebookNavigatorSettings;
}): void {
    const { settings, defaultSettings } = params;

    const normalizeFolderNoteBlock = (input: string): string =>
        input
            .replace(/\r\n/g, '\n')
            .replace(/^---\s*\n?/, '')
            .replace(/\n?---\s*$/, '')
            .trim();

    const folderNotePropertiesSetting = settings.folderNoteProperties;
    if (Array.isArray(folderNotePropertiesSetting)) {
        const migratedProperties = folderNotePropertiesSetting
            .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(entry => entry.length > 0)
            .map(entry => `${entry}: true`)
            .join('\n');
        settings.folderNoteProperties = normalizeFolderNoteBlock(migratedProperties);
    } else if (typeof folderNotePropertiesSetting === 'string') {
        settings.folderNoteProperties = normalizeFolderNoteBlock(folderNotePropertiesSetting);
    } else {
        settings.folderNoteProperties = defaultSettings.folderNoteProperties;
    }
}

// Initializes newly added settings with defaults for existing users.
export function applyExistingUserDefaults(params: { settings: NotebookNavigatorSettings }): void {
    const { settings } = params;

    // Initialize update check setting with default value for existing users
    if (typeof settings.checkForUpdatesOnStart !== 'boolean') {
        settings.checkForUpdatesOnStart = true;
    }
}

// Extracts legacy shortcuts from old settings format for migration to vault profiles
export function extractLegacyShortcuts(params: { storedData: Record<string, unknown> | null }): ShortcutEntry[] | null {
    const { storedData } = params;
    if (!storedData) {
        return null;
    }

    const raw = storedData['shortcuts'];
    if (!Array.isArray(raw)) {
        return null;
    }

    const entries: ShortcutEntry[] = [];
    raw.forEach(value => {
        if (!value || typeof value !== 'object') {
            return;
        }
        const typed = value as ShortcutEntry;
        const shortcutType = (typed as { type?: unknown }).type;
        // Validates that shortcut type is one of the recognized types
        if (
            shortcutType !== ShortcutType.FOLDER &&
            shortcutType !== ShortcutType.NOTE &&
            shortcutType !== ShortcutType.TAG &&
            shortcutType !== ShortcutType.SEARCH
        ) {
            return;
        }
        entries.push({ ...typed });
    });

    if (entries.length === 0) {
        return [];
    }

    return entries;
}

// Migrates legacy shortcuts to vault profile system
export function applyLegacyShortcutsMigration(params: {
    settings: NotebookNavigatorSettings;
    legacyShortcuts: ShortcutEntry[] | null;
}): void {
    const { settings, legacyShortcuts } = params;

    // Removes legacy shortcuts property from settings object
    const settingsRecord = settings as unknown as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(settingsRecord, 'shortcuts')) {
        delete settingsRecord['shortcuts'];
    }

    if (!legacyShortcuts || legacyShortcuts.length === 0) {
        return;
    }

    // Copies legacy shortcuts to all vault profiles that don't have shortcuts yet
    const template = cloneShortcuts(legacyShortcuts);
    settings.vaultProfiles.forEach(profile => {
        if (Array.isArray(profile.shortcuts) && profile.shortcuts.length > 0) {
            return;
        }
        profile.shortcuts = cloneShortcuts(template);
    });
}

// Extracts legacy exclusion settings from old format and prepares them for migration to vault profiles
export function extractLegacyVisibilitySettings(params: {
    settings: NotebookNavigatorSettings;
    storedData: Record<string, unknown> | null;
}): LegacyVisibilityMigration {
    const { settings, storedData } = params;

    // Converts unknown value to a deduplicated list of non-empty strings
    const toUniqueStringList = (value: unknown): string[] => {
        if (!Array.isArray(value)) {
            return [];
        }
        const sanitized = value.map(entry => (typeof entry === 'string' ? entry.trim() : '')).filter(entry => entry.length > 0);
        return Array.from(new Set(sanitized));
    };

    const mutableSettings = settings as unknown as Record<string, unknown>;
    const legacyHiddenFolders = toUniqueStringList(mutableSettings['excludedFolders']);
    const legacyHiddenFileProperties = toUniqueStringList(mutableSettings['excludedFiles']);
    delete mutableSettings['excludedFolders'];
    delete mutableSettings['excludedFiles'];

    const storedHiddenTags = toUniqueStringList(storedData?.['hiddenTags']);
    // Legacy hidden tags are captured for migration but not applied to top-level settings

    const rawNavigationBanner = mutableSettings['navigationBanner'];
    const legacyNavigationBanner = typeof rawNavigationBanner === 'string' ? rawNavigationBanner : null;
    const storedNavigationBannerPath = storedData?.['navigationBannerPath'];
    const legacyBannerPath = typeof storedNavigationBannerPath === 'string' ? storedNavigationBannerPath : null;
    const navigationBanner =
        legacyNavigationBanner && legacyNavigationBanner.length > 0
            ? legacyNavigationBanner
            : legacyBannerPath && legacyBannerPath.length > 0
              ? legacyBannerPath
              : null;

    delete mutableSettings['navigationBanner'];
    delete mutableSettings['navigationBannerPath'];

    return {
        hiddenFolders: legacyHiddenFolders,
        hiddenFileProperties: legacyHiddenFileProperties,
        hiddenTags: storedHiddenTags,
        navigationBanner,
        shouldApplyToProfiles: !Array.isArray(storedData?.['vaultProfiles'])
    };
}

// Applies legacy hidden folder, file, and tag settings to the active vault profile
export function applyLegacyVisibilityMigration(params: {
    settings: NotebookNavigatorSettings;
    migration: LegacyVisibilityMigration;
}): void {
    const { settings, migration } = params;

    const hasNavigationBanner = typeof migration.navigationBanner === 'string' && migration.navigationBanner.length > 0;

    if (
        !migration.shouldApplyToProfiles ||
        (!hasNavigationBanner &&
            migration.hiddenFolders.length === 0 &&
            migration.hiddenFileProperties.length === 0 &&
            migration.hiddenTags.length === 0)
    ) {
        return;
    }

    const targetProfile =
        settings.vaultProfiles.find(profile => profile.id === settings.vaultProfile) ??
        settings.vaultProfiles.find(profile => profile.id === DEFAULT_VAULT_PROFILE_ID) ??
        settings.vaultProfiles[0];

    if (!targetProfile) {
        return;
    }

    if (migration.hiddenFolders.length > 0) {
        targetProfile.hiddenFolders = [...migration.hiddenFolders];
    }

    if (migration.hiddenFileProperties.length > 0) {
        targetProfile.hiddenFileProperties = [...migration.hiddenFileProperties];
    }

    if (migration.hiddenTags.length > 0) {
        targetProfile.hiddenTags = [...migration.hiddenTags];
    }

    if (hasNavigationBanner) {
        targetProfile.navigationBanner = migration.navigationBanner;
    }
}

export function extractLegacyPeriodicNotesFolder(params: { settings: NotebookNavigatorSettings }): string | null {
    const { settings } = params;
    const settingsRecord = settings as unknown as Record<string, unknown>;
    const rawCalendarCustomRootFolder = settingsRecord['calendarCustomRootFolder'];
    if (Object.prototype.hasOwnProperty.call(settingsRecord, 'calendarCustomRootFolder')) {
        delete settingsRecord['calendarCustomRootFolder'];
    }

    if (typeof rawCalendarCustomRootFolder !== 'string') {
        return null;
    }

    const normalized = normalizeCalendarCustomRootFolder(rawCalendarCustomRootFolder);
    return normalized.length > 0 ? normalized : null;
}

export function applyLegacyPeriodicNotesFolderMigration(params: {
    settings: NotebookNavigatorSettings;
    legacyPeriodicNotesFolder: string | null;
}): void {
    const { settings, legacyPeriodicNotesFolder } = params;
    if (!legacyPeriodicNotesFolder) {
        return;
    }

    if (!Array.isArray(settings.vaultProfiles) || settings.vaultProfiles.length === 0) {
        return;
    }

    settings.vaultProfiles.forEach(profile => {
        if (typeof profile.periodicNotesFolder === 'string' && profile.periodicNotesFolder.length > 0) {
            return;
        }
        profile.periodicNotesFolder = legacyPeriodicNotesFolder;
    });
}
