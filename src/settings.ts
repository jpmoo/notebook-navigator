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

import { App, ButtonComponent, PluginSettingTab, Setting, requireApiVersion } from 'obsidian';
import NotebookNavigatorPlugin from './main';
import { showNotice } from './utils/noticeUtils';
import { strings } from './i18n';
import { TIMEOUTS } from './types/obsidian-extended';
import {
    calculateCacheStatistics,
    calculateMetadataParsingFailurePaths,
    calculateMetadataParsingStatistics,
    type CacheStatistics,
    type MetadataParsingStatistics
} from './storage/statistics';
import { renderGeneralTab } from './settings/tabs/GeneralTab';
import { renderNavigationPaneTab } from './settings/tabs/NavigationTab';
import { renderShortcutsTab } from './settings/tabs/ShortcutsTab';
import { renderCalendarTab } from './settings/tabs/CalendarTab';
import { renderFoldersTab } from './settings/tabs/FoldersTab';
import { renderTagsTab } from './settings/tabs/TagsTab';
import { renderPropertiesTab } from './settings/tabs/PropertiesTab';
import { renderListPaneTab } from './settings/tabs/ListTab';
import { renderFrontmatterTab } from './settings/tabs/FrontmatterTab';
import { renderNotesTab } from './settings/tabs/NotesTab';
import { renderIconPacksTab } from './settings/tabs/IconPacksTab';
import { renderAdvancedTab } from './settings/tabs/AdvancedTab';
import type {
    AddSettingFunction,
    DebouncedTextAreaSettingOptions,
    SettingsTabId,
    SettingsTabContext,
    SettingDescription
} from './settings/tabs/SettingsTabContext';
import { runAsyncAction } from './utils/async';
import { NOTEBOOK_NAVIGATOR_ICON_ID } from './constants/notebookNavigatorIcon';
import { getIconService } from './services/icons';
import { getDBInstanceOrNull } from './storage/fileOperations';
import { resolveFileTypeIconId } from './utils/fileIconUtils';
import { resolveUXIcon, type UXIconId } from './utils/uxIcons';

/** Identifiers for different settings tab panes */
type SettingsPaneId = SettingsTabId;

/** Top-level group buttons for settings navigation */
type SettingsGroupId = 'general' | 'navigation-pane' | 'list-pane' | 'calendar';

const SETTINGS_GROUP_IDS: SettingsGroupId[] = ['general', 'navigation-pane', 'list-pane', 'calendar'];

type SettingsTabIconDefinition =
    | { kind: 'fixed'; iconId: string }
    | { kind: 'ux'; uxIconId: UXIconId }
    | { kind: 'fileType'; fileTypeKey: string; fallbackIconId: string };

const SETTINGS_TAB_ICONS: Record<SettingsPaneId, SettingsTabIconDefinition> = {
    general: { kind: 'fixed', iconId: 'settings' },
    'navigation-pane': { kind: 'fixed', iconId: 'panel-left' },
    'list-pane': { kind: 'fixed', iconId: 'list' },
    calendar: { kind: 'fixed', iconId: 'calendar-days' },
    'icon-packs': { kind: 'fixed', iconId: 'package' },
    advanced: { kind: 'fixed', iconId: 'sliders-horizontal' },
    shortcuts: { kind: 'ux', uxIconId: 'nav-shortcuts' },
    folders: { kind: 'ux', uxIconId: 'nav-folder-closed' },
    tags: { kind: 'ux', uxIconId: 'nav-tag' },
    properties: { kind: 'ux', uxIconId: 'nav-property' },
    frontmatter: { kind: 'ux', uxIconId: 'nav-properties' },
    notes: { kind: 'fileType', fileTypeKey: 'md', fallbackIconId: 'file' }
};

const SETTINGS_GROUP_SECONDARY_TAB_IDS: Record<SettingsGroupId, SettingsPaneId[]> = {
    general: ['icon-packs', 'advanced'],
    'navigation-pane': ['shortcuts', 'folders', 'tags', 'properties'],
    'list-pane': ['frontmatter', 'notes'],
    calendar: []
};

const SETTINGS_TAB_GROUP_MAP: Record<SettingsPaneId, SettingsGroupId> = {
    general: 'general',
    'icon-packs': 'general',
    advanced: 'general',
    'navigation-pane': 'navigation-pane',
    shortcuts: 'navigation-pane',
    folders: 'navigation-pane',
    tags: 'navigation-pane',
    properties: 'navigation-pane',
    'list-pane': 'list-pane',
    frontmatter: 'list-pane',
    notes: 'list-pane',
    calendar: 'calendar'
};

const SETTINGS_SECONDARY_TAB_IDS_ORDERED: SettingsPaneId[] = [
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS.general,
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS['navigation-pane'],
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS['list-pane'],
    ...SETTINGS_GROUP_SECONDARY_TAB_IDS.calendar
];

/** Definition of a settings pane with its ID, label resolver, and render function */
interface SettingsPaneDefinition {
    id: SettingsPaneId;
    getLabel: () => string;
    render: (context: SettingsTabContext) => void;
}

const SETTINGS_PANE_DEFINITIONS: SettingsPaneDefinition[] = [
    { id: 'general', getLabel: () => strings.settings.sections.general, render: renderGeneralTab },
    { id: 'calendar', getLabel: () => strings.settings.sections.calendar, render: renderCalendarTab },
    { id: 'navigation-pane', getLabel: () => strings.settings.sections.navigationPane, render: renderNavigationPaneTab },
    { id: 'shortcuts', getLabel: () => strings.navigationPane.shortcutsHeader, render: renderShortcutsTab },
    {
        id: 'folders',
        getLabel: () => strings.settings.sections.folders,
        render: renderFoldersTab
    },
    { id: 'tags', getLabel: () => strings.settings.sections.tags, render: renderTagsTab },
    { id: 'properties', getLabel: () => strings.navigationPane.properties, render: renderPropertiesTab },
    { id: 'list-pane', getLabel: () => strings.settings.sections.listPane, render: renderListPaneTab },
    { id: 'frontmatter', getLabel: () => strings.settings.groups.notes.frontmatter, render: renderFrontmatterTab },
    { id: 'notes', getLabel: () => strings.settings.sections.notes, render: renderNotesTab },
    { id: 'icon-packs', getLabel: () => strings.settings.sections.icons, render: renderIconPacksTab },
    { id: 'advanced', getLabel: () => strings.settings.sections.advanced, render: renderAdvancedTab }
];

const SETTINGS_PANE_DEFINITION_MAP = new Map<SettingsPaneId, SettingsPaneDefinition>(
    SETTINGS_PANE_DEFINITIONS.map(definition => [definition.id, definition])
);

/**
 * Settings tab for configuring the Notebook Navigator plugin
 * Provides organized sections for different aspects of the plugin
 * Implements debounced text inputs to prevent excessive updates
 */
export class NotebookNavigatorSettingTab extends PluginSettingTab {
    plugin: NotebookNavigatorPlugin;
    // Map of active debounce timers for text inputs
    private debounceTimers: Map<string, number> = new Map();
    // Reference to stats element
    private statsTextEl: HTMLElement | null = null;
    // Reference to metadata parsing info element
    private metadataInfoEl: HTMLElement | null = null;
    // Statistics update interval ID
    private statsUpdateInterval: number | null = null;
    // Map of tab IDs to their content elements
    private tabContentMap: Map<SettingsPaneId, HTMLElement> = new Map();
    // Map of tab IDs to their button components
    private tabButtons: Map<SettingsPaneId, ButtonComponent> = new Map();
    private tabIconElements: Map<SettingsPaneId, HTMLElement> = new Map();
    private primaryNavEl: HTMLElement | null = null;
    private secondaryNavEl: HTMLElement | null = null;
    // Tracks the most recently active tab during the current session
    private lastActiveTabId: SettingsPaneId | null = null;
    // Registered listeners for show tags visibility changes
    private showTagsListeners: ((visible: boolean) => void)[] = [];
    // Current visibility state of show tags setting
    private currentShowTagsVisible = false;
    // Pending deferred statistics refresh timer
    private pendingStatisticsRefresh: number | null = null;
    // Prevent overlapping cache statistics calculations when scheduled frequently.
    private isUpdatingCacheStatistics = false;
    // Prevent overlapping metadata parsing statistics calculations when scheduled frequently.
    private isUpdatingMetadataInfo = false;
    private pendingMetadataInfoRefreshRequested = false;
    // Tracks whether a refresh is needed when the Advanced tab becomes active.
    private pendingStatisticsRefreshRequested = false;
    private metadataInfoChangeUnsubscribe: (() => void) | null = null;
    private settingsUpdateListenerId = 'settings-tab';
    private tabSettingsUpdateListeners = new Map<string, () => void>();

    private getGroupIdForTab(tabId: SettingsPaneId): SettingsGroupId {
        return SETTINGS_TAB_GROUP_MAP[tabId];
    }

    private isMetadataInfoTab(tabId: SettingsPaneId | null): boolean {
        return tabId === 'frontmatter';
    }

    private resolveTabButtonIconId(tabId: SettingsPaneId): string | null {
        const iconDefinition = SETTINGS_TAB_ICONS[tabId];
        if (!iconDefinition) {
            return null;
        }

        if (iconDefinition.kind === 'fixed') {
            return iconDefinition.iconId;
        }

        if (iconDefinition.kind === 'ux') {
            return resolveUXIcon(this.plugin.settings.interfaceIcons, iconDefinition.uxIconId);
        }

        return resolveFileTypeIconId(iconDefinition.fileTypeKey, this.plugin.settings.fileTypeIconMap) ?? iconDefinition.fallbackIconId;
    }

    private renderTabButtonIcon(tabId: SettingsPaneId): void {
        const iconEl = this.tabIconElements.get(tabId);
        if (!iconEl) {
            return;
        }

        iconEl.empty();
        const iconId = this.resolveTabButtonIconId(tabId);
        if (!iconId) {
            return;
        }

        getIconService().renderIcon(iconEl, iconId);
    }

    private refreshTabButtonIcons(): void {
        this.tabIconElements.forEach((_iconEl, tabId) => {
            this.renderTabButtonIcon(tabId);
        });
        this.updateTabRowIconVisibility();
    }

    private rowExceedsSingleLine(rowEl: HTMLElement): boolean {
        const overflowTolerance = 1;
        if (rowEl.scrollWidth - rowEl.clientWidth > overflowTolerance) {
            return true;
        }

        const buttons = Array.from(rowEl.querySelectorAll<HTMLElement>('.nn-settings-tab-button')).filter(button => {
            if (button.hasClass('is-hidden')) {
                return false;
            }
            return button.offsetParent !== null;
        });

        if (buttons.length <= 1) {
            return false;
        }

        const firstTop = buttons[0].offsetTop;
        return buttons.some(button => Math.abs(button.offsetTop - firstTop) > overflowTolerance);
    }

    private updateTabRowIconVisibilityForRow(rowEl: HTMLElement | null): void {
        if (!rowEl) {
            return;
        }

        rowEl.toggleClass('is-icons-hidden', false);
        if (rowEl.hasClass('is-hidden')) {
            return;
        }

        if (this.rowExceedsSingleLine(rowEl)) {
            rowEl.toggleClass('is-icons-hidden', true);
        }
    }

    private updateTabRowIconVisibility(): void {
        this.updateTabRowIconVisibilityForRow(this.primaryNavEl);
        this.updateTabRowIconVisibilityForRow(this.secondaryNavEl);
    }

    private updateTabNavigation(activeTabId: SettingsPaneId): void {
        const activeGroupId = this.getGroupIdForTab(activeTabId);
        this.secondaryNavEl?.toggleClass('is-hidden', SETTINGS_GROUP_SECONDARY_TAB_IDS[activeGroupId].length === 0);

        for (const groupId of SETTINGS_GROUP_IDS) {
            const groupButton = this.tabButtons.get(groupId);
            if (!groupButton) {
                continue;
            }

            const isActive = groupId === activeTabId;
            const isGroupActive = groupId === activeGroupId && !isActive;
            groupButton.buttonEl.toggleClass('is-group-active', isGroupActive);
            groupButton.buttonEl.toggleClass('is-active', isActive);
            groupButton.buttonEl.setAttribute('aria-selected', isActive ? 'true' : 'false');

            if (isActive) {
                groupButton.setCta();
            } else {
                groupButton.removeCta();
            }
        }

        for (const tabId of SETTINGS_SECONDARY_TAB_IDS_ORDERED) {
            const tabButton = this.tabButtons.get(tabId);
            if (!tabButton) {
                continue;
            }

            const isVisible = this.getGroupIdForTab(tabId) === activeGroupId;
            tabButton.buttonEl.toggleClass('is-hidden', !isVisible);

            const isActive = tabId === activeTabId;
            tabButton.buttonEl.toggleClass('is-active', isActive);
            tabButton.buttonEl.setAttribute('aria-selected', isActive ? 'true' : 'false');

            // Keep the secondary tab row in the lighter tab-button style.
            tabButton.removeCta();
        }

        this.updateTabRowIconVisibility();
    }

    /**
     * Creates a new settings tab
     * @param app - The Obsidian app instance
     * @param plugin - The plugin instance to configure
     */
    constructor(app: App, plugin: NotebookNavigatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;

        // Settings sidebar icon (Obsidian 1.11.0+)
        if (requireApiVersion('1.11.0')) {
            this.icon = NOTEBOOK_NAVIGATOR_ICON_ID;
        }
    }

    private ensureSettingsUpdateListener(): void {
        this.plugin.registerSettingsUpdateListener(this.settingsUpdateListenerId, () => {
            if (this.plugin.isExternalSettingsUpdate()) {
                this.refreshFromExternalSettingsUpdate();
                return;
            }

            this.refreshTabButtonIcons();
            const listeners = Array.from(this.tabSettingsUpdateListeners.values());
            listeners.forEach(callback => {
                try {
                    callback();
                } catch {
                    // Ignore errors from settings-tab UI callbacks
                }
            });
        });
    }

    private refreshFromExternalSettingsUpdate(): void {
        const contentWrapper = this.containerEl.querySelector<HTMLElement>('.nn-settings-tabs-content');
        const scrollTop = contentWrapper?.scrollTop ?? 0;
        this.renderSettingsTab({ focus: false, restoreScrollTop: scrollTop });
    }

    /**
     * Ensures only the most recent change for a given setting runs after the debounce delay.
     */
    private scheduleDebouncedSettingUpdate(name: string, updater: () => Promise<void> | void): void {
        const timerId = `setting-${name}`;
        const existingTimer = this.debounceTimers.get(timerId);
        if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
        }

        const timer = window.setTimeout(() => {
            runAsyncAction(async () => {
                try {
                    await updater();
                } finally {
                    this.debounceTimers.delete(timerId);
                }
            });
        }, TIMEOUTS.DEBOUNCE_SETTINGS);

        this.debounceTimers.set(timerId, timer);
    }

    private addToggleSetting(
        addSetting: AddSettingFunction,
        name: string,
        desc: string,
        getValue: () => boolean,
        setValue: (value: boolean) => void,
        onAfterUpdate?: () => void
    ): Setting {
        return addSetting(setting => {
            setting.setName(name).setDesc(desc);
            setting.addToggle(toggle =>
                toggle.setValue(getValue()).onChange(async value => {
                    setValue(value);
                    await this.plugin.saveSettingsAndUpdate();
                    onAfterUpdate?.();
                })
            );
        });
    }

    private addInfoSetting(
        addSetting: AddSettingFunction,
        cls: string | readonly string[],
        render: (descEl: HTMLElement) => void
    ): Setting {
        return addSetting(setting => {
            setting.setName('').setDesc('');

            const classNames = typeof cls === 'string' ? cls.split(/\s+/) : cls;
            for (const className of classNames) {
                if (className) {
                    setting.settingEl.addClass(className);
                }
            }

            const descEl = setting.descEl;
            descEl.empty();
            render(descEl);
        });
    }

    /**
     * Creates a text setting with debounced onChange handler
     * Prevents excessive updates while user is typing
     * Supports optional validation before applying changes
     * @param container - Container element for the setting
     * @param name - Setting display name
     * @param desc - Setting description
     * @param placeholder - Placeholder text for the input
     * @param getValue - Function to get current value
     * @param setValue - Function to set new value
     * @param validator - Optional validation function
     * @returns The created Setting instance
     */
    private createDebouncedTextSetting(
        container: HTMLElement,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        validator?: (value: string) => boolean,
        onAfterUpdate?: () => void
    ): Setting {
        return this.configureDebouncedTextSetting(
            new Setting(container),
            name,
            desc,
            placeholder,
            getValue,
            setValue,
            validator,
            onAfterUpdate
        );
    }

    private configureDebouncedTextSetting(
        setting: Setting,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        validator?: (value: string) => boolean,
        onAfterUpdate?: () => void
    ): Setting {
        return setting
            .setName(name)
            .setDesc(desc)
            .addText(text =>
                text
                    .setPlaceholder(placeholder)
                    .setValue(getValue())
                    .onChange(value => {
                        // Schedule debounced update to ensure async operations complete safely
                        this.scheduleDebouncedSettingUpdate(name, async () => {
                            const isValid = !validator || validator(value);
                            if (!isValid) {
                                return;
                            }
                            setValue(value);
                            await this.plugin.saveSettingsAndUpdate();
                            onAfterUpdate?.();
                        });
                    })
            );
    }

    /**
     * Creates a multiline text setting with debounced onChange handler
     * Uses the same debounce timers as single-line inputs
     * @param container - Container element for the setting
     * @param name - Setting display name
     * @param desc - Setting description
     * @param placeholder - Placeholder text for the textarea
     * @param getValue - Function to get current value
     * @param setValue - Function to set new value
     * @param options - Optional configuration for validation and row count
     * @returns The created Setting instance
     */
    private createDebouncedTextAreaSetting(
        container: HTMLElement,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        options?: DebouncedTextAreaSettingOptions
    ): Setting {
        return this.configureDebouncedTextAreaSetting(new Setting(container), name, desc, placeholder, getValue, setValue, options);
    }

    private configureDebouncedTextAreaSetting(
        setting: Setting,
        name: string,
        desc: SettingDescription,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string) => void,
        options?: DebouncedTextAreaSettingOptions
    ): Setting {
        const rows = options?.rows ?? 4;

        return setting
            .setName(name)
            .setDesc(desc)
            .addTextArea(textArea => {
                textArea.setPlaceholder(placeholder);
                textArea.setValue(getValue());
                textArea.inputEl.rows = rows;
                textArea.onChange(value => {
                    // Schedule debounced update to ensure async operations complete safely
                    this.scheduleDebouncedSettingUpdate(name, async () => {
                        const validator = options?.validator;
                        const isValid = !validator || validator(value);
                        if (!isValid) {
                            return;
                        }
                        setValue(value);
                        await this.plugin.saveSettingsAndUpdate();
                        options?.onAfterUpdate?.();
                    });
                });
            });
    }

    /**
     * Generate statistics text from cache stats
     */
    private generateStatisticsText(stats: CacheStatistics): string {
        if (!stats) return '';

        const sizeText = `${stats.totalSizeMB.toFixed(1)} MB`;

        return `${strings.settings.items.cacheStatistics.localCache}: ${stats.totalItems} ${strings.settings.items.cacheStatistics.items}. ${stats.itemsWithTags} ${strings.settings.items.cacheStatistics.withTags}, ${stats.itemsWithPreview} ${strings.settings.items.cacheStatistics.withPreviewText}, ${stats.itemsWithFeature} ${strings.settings.items.cacheStatistics.withFeatureImage}, ${stats.itemsWithMetadata} ${strings.settings.items.cacheStatistics.withMetadata}. ${sizeText}`;
    }

    /**
     * Generate metadata parsing info text
     */
    private generateMetadataInfoText(stats: MetadataParsingStatistics): {
        infoText: string;
        failedText: string | null;
        hasFailures: boolean;
        failurePercentage: number;
    } {
        if (!stats) return { infoText: '', failedText: null, hasFailures: false, failurePercentage: 0 };

        const nameCount = stats.itemsWithMetadataName || 0;
        const createdCount = stats.itemsWithMetadataCreated || 0;
        const modifiedCount = stats.itemsWithMetadataModified || 0;
        const iconCount = stats.itemsWithMetadataIcon || 0;
        const colorCount = stats.itemsWithMetadataColor || 0;
        const failedCreatedCount = stats.itemsWithFailedCreatedParse || 0;
        const failedModifiedCount = stats.itemsWithFailedModifiedParse || 0;

        const infoText = `${strings.settings.items.metadataInfo.successfullyParsed}: ${nameCount} ${strings.settings.items.metadataInfo.itemsWithName}, ${createdCount} ${strings.settings.items.metadataInfo.withCreatedDate}, ${modifiedCount} ${strings.settings.items.metadataInfo.withModifiedDate}, ${iconCount} ${strings.settings.items.metadataInfo.withIcon}, ${colorCount} ${strings.settings.items.metadataInfo.withColor}.`;

        // Calculate failure percentage
        const totalCreatedAttempts = createdCount + failedCreatedCount;
        const totalModifiedAttempts = modifiedCount + failedModifiedCount;
        const totalAttempts = totalCreatedAttempts + totalModifiedAttempts;
        const totalFailures = failedCreatedCount + failedModifiedCount;
        const failurePercentage = totalAttempts > 0 ? (totalFailures / totalAttempts) * 100 : 0;

        // Show failed parse counts if any
        let failedText = null;
        if (failedCreatedCount > 0 || failedModifiedCount > 0) {
            failedText = `${strings.settings.items.metadataInfo.failedToParse}: ${failedCreatedCount} ${strings.settings.items.metadataInfo.createdDates}, ${failedModifiedCount} ${strings.settings.items.metadataInfo.modifiedDates}.`;
            // Only add suggestion if more than 70% failed
            if (failurePercentage > 70) {
                failedText += ` ${strings.settings.items.metadataInfo.checkTimestampFormat}`;
            }
        }

        return { infoText, failedText, hasFailures: failedCreatedCount > 0 || failedModifiedCount > 0, failurePercentage };
    }

    /**
     * Update the cache statistics display
     */
    private async updateCacheStatistics(): Promise<void> {
        // Statistics queries scan cache state and should only run while the Advanced tab is visible.
        if (this.lastActiveTabId !== 'advanced') {
            return;
        }
        // Skip work when the tab UI has not registered any statistic targets yet.
        if (!this.statsTextEl) {
            return;
        }
        if (this.isUpdatingCacheStatistics) {
            return;
        }
        this.isUpdatingCacheStatistics = true;
        try {
            const stats = await calculateCacheStatistics(this.plugin.settings, this.plugin.getUXPreferences().showHiddenItems);
            if (!stats) {
                return;
            }

            // Update bottom statistics
            if (this.statsTextEl) {
                this.statsTextEl.setText(this.generateStatisticsText(stats));
            }
        } finally {
            this.isUpdatingCacheStatistics = false;
        }
    }

    private async updateMetadataInfo(): Promise<void> {
        if (!this.isMetadataInfoTab(this.lastActiveTabId)) {
            return;
        }
        const metadataInfoEl = this.metadataInfoEl;
        if (!metadataInfoEl) {
            return;
        }
        if (this.isUpdatingMetadataInfo) {
            this.pendingMetadataInfoRefreshRequested = true;
            return;
        }
        if (!this.plugin.settings.useFrontmatterMetadata) {
            metadataInfoEl.empty();
            return;
        }

        this.isUpdatingMetadataInfo = true;
        try {
            const stats = await calculateMetadataParsingStatistics(this.plugin.settings, this.plugin.getUXPreferences().showHiddenItems);
            if (!this.isMetadataInfoTab(this.lastActiveTabId) || this.metadataInfoEl !== metadataInfoEl) {
                return;
            }
            if (!this.plugin.settings.useFrontmatterMetadata) {
                metadataInfoEl.empty();
                return;
            }
            if (!stats) {
                return;
            }

            const { infoText, failedText, hasFailures, failurePercentage } = this.generateMetadataInfoText(stats);

            // Clear previous content
            metadataInfoEl.empty();

            // Create a flex container for the entire metadata info
            const metadataContainer = metadataInfoEl.createEl('div', {
                cls: 'nn-metadata-info-row'
            });

            // Left side: text content
            const textContainer = metadataContainer.createEl('div', {
                cls: 'nn-metadata-info-text'
            });

            // Add info text
            textContainer.createSpan({ text: infoText });

            if (failedText) {
                // Add line break and failed parse message
                textContainer.createEl('br');
                // Only apply error styling if failure percentage > 70%
                const shouldHighlight = failurePercentage > 70;
                textContainer.createSpan({
                    text: failedText,
                    cls: shouldHighlight ? 'nn-metadata-error-text' : undefined
                });
            }

            // Right side: export button (only if there are failures)
            if (hasFailures) {
                const exportButton = metadataContainer.createEl('button', {
                    text: strings.settings.items.metadataInfo.exportFailed,
                    cls: 'nn-metadata-export-button'
                });
                exportButton.onclick = () => {
                    runAsyncAction(() => this.exportFailedMetadataReport());
                };
            }
        } finally {
            this.isUpdatingMetadataInfo = false;
            if (this.pendingMetadataInfoRefreshRequested) {
                this.pendingMetadataInfoRefreshRequested = false;
                runAsyncAction(() => this.updateMetadataInfo());
            }
        }
    }

    /**
     * Schedule a deferred statistics refresh after content providers finish regeneration.
     * This ensures we reflect fresh metadata once background processing completes.
     */
    private scheduleDeferredStatisticsRefresh(): void {
        if (this.pendingStatisticsRefresh !== null) {
            window.clearTimeout(this.pendingStatisticsRefresh);
        }

        const delay = TIMEOUTS.INTERVAL_STATISTICS * 2;
        this.pendingStatisticsRefresh = window.setTimeout(() => {
            this.pendingStatisticsRefresh = null;
            runAsyncAction(() => this.updateActiveTabInfo());
        }, delay);
    }

    private requestStatisticsRefresh(): void {
        // Tabs can request a refresh while inactive; persist the request and run on activation.
        this.pendingStatisticsRefreshRequested = true;
        if (this.lastActiveTabId !== 'advanced' && !this.isMetadataInfoTab(this.lastActiveTabId)) {
            return;
        }
        this.pendingStatisticsRefreshRequested = false;
        runAsyncAction(() => this.updateActiveTabInfo());
        this.scheduleDeferredStatisticsRefresh();
    }

    private updateActiveTabInfo(): Promise<void> {
        if (this.lastActiveTabId === 'advanced') {
            return this.updateCacheStatistics();
        }
        if (this.isMetadataInfoTab(this.lastActiveTabId)) {
            return this.updateMetadataInfo();
        }
        return Promise.resolve();
    }

    /**
     * Renders the settings tab UI
     * Organizes settings into grouped tabs:
     * - General: General, Icon packs, Advanced
     * - Navigation pane: Navigation pane, Shortcuts, Folders, Tags, Properties
     * - List pane: List pane, Frontmatter, Notes
     * - Calendar: Calendar
     */
    display(): void {
        this.ensureSettingsUpdateListener();
        this.renderSettingsTab({ focus: true });
    }

    private renderSettingsTab(options?: { focus?: boolean; restoreScrollTop?: number }): void {
        const shouldFocus = options?.focus ?? false;
        const restoreScrollTop = options?.restoreScrollTop;

        // Clear any existing interval to prevent duplicates
        if (this.statsUpdateInterval !== null) {
            window.clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = null;
        }

        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('nn-settings-tab-root');

        // Reset state for new render
        this.tabContentMap.clear();
        this.tabButtons.clear();
        this.tabIconElements.clear();
        this.statsTextEl = null;
        this.metadataInfoEl = null;
        this.primaryNavEl = null;
        this.secondaryNavEl = null;
        this.tabSettingsUpdateListeners.clear();
        this.showTagsListeners = [];
        this.currentShowTagsVisible = this.plugin.settings.showTags;

        // Create tab navigation structure
        const tabsWrapper = containerEl.createDiv('nn-settings-tabs');
        const navEl = tabsWrapper.createDiv('nn-settings-tabs-nav');
        navEl.setAttribute('role', 'tablist');
        const primaryNavEl = navEl.createDiv('nn-settings-tabs-nav-row nn-settings-tabs-nav-primary');
        this.primaryNavEl = primaryNavEl;
        const secondaryNavEl = navEl.createDiv('nn-settings-tabs-nav-row nn-settings-tabs-nav-secondary');
        this.secondaryNavEl = secondaryNavEl;
        const contentWrapper = tabsWrapper.createDiv('nn-settings-tabs-content');

        const createTabButton = (container: HTMLElement, tabId: SettingsPaneId, variant: 'primary' | 'secondary'): void => {
            const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
            if (!definition) {
                return;
            }

            const buttonComponent = new ButtonComponent(container);
            buttonComponent.setButtonText(definition.getLabel());
            const iconEl = buttonComponent.buttonEl.createSpan('nn-settings-tab-icon');
            iconEl.setAttribute('aria-hidden', 'true');
            buttonComponent.buttonEl.prepend(iconEl);
            this.tabIconElements.set(tabId, iconEl);
            this.renderTabButtonIcon(tabId);
            buttonComponent.removeCta();
            buttonComponent.buttonEl.addClass('nn-settings-tab-button');
            buttonComponent.buttonEl.addClass('clickable-icon');
            buttonComponent.buttonEl.addClass(
                variant === 'primary' ? 'nn-settings-tab-button-primary' : 'nn-settings-tab-button-secondary'
            );
            buttonComponent.buttonEl.setAttribute('role', 'tab');
            buttonComponent.buttonEl.setAttribute('aria-selected', 'false');
            buttonComponent.onClick(() => {
                this.activateTab(tabId, contentWrapper);
            });
            this.tabButtons.set(tabId, buttonComponent);
        };

        SETTINGS_GROUP_IDS.forEach(groupId => {
            createTabButton(primaryNavEl, groupId, 'primary');
        });

        SETTINGS_SECONDARY_TAB_IDS_ORDERED.forEach(tabId => {
            createTabButton(secondaryNavEl, tabId, 'secondary');
        });

        // Activate previously open tab if available, otherwise default to first
        const fallbackTabId = SETTINGS_PANE_DEFINITIONS[0]?.id ?? null;
        const initialTabId =
            this.lastActiveTabId && SETTINGS_PANE_DEFINITION_MAP.has(this.lastActiveTabId) ? this.lastActiveTabId : fallbackTabId;
        if (initialTabId) {
            this.activateTab(initialTabId, contentWrapper, { focus: shouldFocus, preserveScroll: restoreScrollTop !== undefined });
        }
        if (restoreScrollTop !== undefined) {
            contentWrapper.scrollTop = restoreScrollTop;
        }
    }

    /**
     * Creates a context object for rendering settings tabs
     * Provides access to app, plugin, and utility methods for tab rendering
     */
    private createTabContext(container: HTMLElement): SettingsTabContext {
        return {
            app: this.app,
            plugin: this.plugin,
            containerEl: container,
            addToggleSetting: (addSetting, name, desc, getValue, setValue, onAfterUpdate) =>
                this.addToggleSetting(addSetting, name, desc, getValue, setValue, onAfterUpdate),
            addInfoSetting: (addSetting, cls, render) => this.addInfoSetting(addSetting, cls, render),
            createDebouncedTextSetting: (parent, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate) =>
                this.createDebouncedTextSetting(parent, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate),
            configureDebouncedTextSetting: (setting, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate) =>
                this.configureDebouncedTextSetting(setting, name, desc, placeholder, getValue, setValue, validator, onAfterUpdate),
            createDebouncedTextAreaSetting: (parent, name, desc, placeholder, getValue, setValue, options) =>
                this.createDebouncedTextAreaSetting(parent, name, desc, placeholder, getValue, setValue, options),
            configureDebouncedTextAreaSetting: (setting, name, desc, placeholder, getValue, setValue, options) =>
                this.configureDebouncedTextAreaSetting(setting, name, desc, placeholder, getValue, setValue, options),
            registerSettingsUpdateListener: (id, listener) => {
                this.tabSettingsUpdateListeners.set(id, listener);
            },
            unregisterSettingsUpdateListener: id => {
                this.tabSettingsUpdateListeners.delete(id);
            },
            registerMetadataInfoElement: element => {
                this.metadataInfoEl = element;
            },
            registerStatsTextElement: element => {
                this.statsTextEl = element;
            },
            requestStatisticsRefresh: () => {
                this.requestStatisticsRefresh();
            },
            ensureStatisticsInterval: () => {
                this.ensureStatisticsInterval();
            },
            openSettingsTab: (tabId: SettingsTabId) => {
                const contentWrapper = this.containerEl.querySelector<HTMLElement>('.nn-settings-tabs-content');
                if (!contentWrapper) {
                    return;
                }
                this.activateTab(tabId, contentWrapper, { focus: true });
            },
            registerShowTagsListener: listener => {
                this.showTagsListeners.push(listener);
                listener(this.currentShowTagsVisible);
            },
            notifyShowTagsVisibility: visible => {
                this.currentShowTagsVisible = visible;
                this.showTagsListeners.forEach(callback => callback(visible));
            }
        };
    }

    /**
     * Activates a settings tab by ID
     * Creates tab content if it doesn't exist yet (lazy loading)
     * Updates active state for both content and buttons
     */
    private activateTab(id: SettingsPaneId, contentWrapper: HTMLElement, options?: { focus?: boolean; preserveScroll?: boolean }): void {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(id);
        if (!definition) {
            return;
        }
        const shouldFocus = options?.focus ?? false;

        // Lazy load tab content on first access
        if (!this.tabContentMap.has(id)) {
            const tabContainer = contentWrapper.createDiv('nn-settings-tab');
            const context = this.createTabContext(tabContainer);
            definition.render(context);
            this.tabContentMap.set(id, tabContainer);
        }

        const previousTabId = this.lastActiveTabId;
        if (previousTabId && previousTabId !== id) {
            this.tabContentMap.get(previousTabId)?.toggleClass('is-active', false);
        }

        this.tabContentMap.get(id)?.toggleClass('is-active', true);
        this.lastActiveTabId = id;
        this.updateTabNavigation(id);
        if (!options?.preserveScroll) {
            contentWrapper.scrollTop = 0;
        }

        if (id === 'advanced') {
            // The Advanced tab owns cache statistics; start polling when visible and stop on tab switch.
            this.ensureStatisticsInterval();
        } else {
            this.stopStatisticsInterval();
        }

        if (this.isMetadataInfoTab(id)) {
            this.ensureMetadataInfoListener();
            runAsyncAction(() => this.updateMetadataInfo());
        } else {
            this.stopMetadataInfoListener();
        }

        if (this.pendingStatisticsRefreshRequested && (id === 'advanced' || this.isMetadataInfoTab(id))) {
            this.pendingStatisticsRefreshRequested = false;
            runAsyncAction(() => this.updateActiveTabInfo());
            this.scheduleDeferredStatisticsRefresh();
        }

        if (shouldFocus) {
            this.tabButtons.get(id)?.buttonEl.focus();
        }
    }

    private stopStatisticsInterval(): void {
        if (this.statsUpdateInterval !== null) {
            window.clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = null;
        }
        if (this.pendingStatisticsRefresh !== null) {
            window.clearTimeout(this.pendingStatisticsRefresh);
            this.pendingStatisticsRefresh = null;
        }
    }

    private ensureStatisticsInterval(): void {
        if (this.lastActiveTabId !== 'advanced') {
            return;
        }
        // Don't create duplicate intervals
        if (this.statsUpdateInterval !== null) {
            return;
        }

        // Update immediately
        runAsyncAction(() => this.updateCacheStatistics());
        // Schedule periodic updates
        this.statsUpdateInterval = window.setInterval(() => {
            runAsyncAction(() => this.updateCacheStatistics());
        }, TIMEOUTS.INTERVAL_STATISTICS);
        this.plugin.registerInterval(this.statsUpdateInterval);
    }

    private ensureMetadataInfoListener(): void {
        if (this.metadataInfoChangeUnsubscribe) {
            return;
        }
        const db = getDBInstanceOrNull();
        if (!db) {
            return;
        }

        this.metadataInfoChangeUnsubscribe = db.onContentChange(changes => {
            if (!this.isMetadataInfoTab(this.lastActiveTabId)) {
                return;
            }
            if (!this.metadataInfoEl || !this.plugin.settings.useFrontmatterMetadata) {
                return;
            }
            const hasMetadataChanges = changes.some(change => change.changes.metadata !== undefined);
            if (!hasMetadataChanges) {
                return;
            }

            this.scheduleDebouncedSettingUpdate('metadata-info-refresh', () => {
                return this.updateMetadataInfo();
            });
        });
    }

    private stopMetadataInfoListener(): void {
        if (this.metadataInfoChangeUnsubscribe) {
            this.metadataInfoChangeUnsubscribe();
            this.metadataInfoChangeUnsubscribe = null;
        }
    }

    /**
     * Export failed metadata parsing report to markdown file
     */
    private async exportFailedMetadataReport(): Promise<void> {
        if (!this.plugin.settings.useFrontmatterMetadata) {
            return;
        }

        const failurePaths = await calculateMetadataParsingFailurePaths(
            this.plugin.settings,
            this.plugin.getUXPreferences().showHiddenItems
        );
        if (!failurePaths) {
            showNotice(strings.settings.metadataReport.exportFailed, { variant: 'warning' });
            return;
        }

        // Generate timestamp for filename
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const readableDate = now.toLocaleString();

        // Generate filename with timestamp
        const filename = `metadata-parsing-failures-${timestamp}.md`;

        // Sort file paths alphabetically
        const failedCreatedFiles = [...failurePaths.failedCreatedFiles].sort();
        const failedModifiedFiles = [...failurePaths.failedModifiedFiles].sort();

        const lines: string[] = [];
        lines.push('# Metadata Parsing Failures', '', `Generated on: ${readableDate}`, '');
        lines.push('## Failed Created Date Parsing', `Total files: ${failedCreatedFiles.length}`, '');

        if (failedCreatedFiles.length > 0) {
            failedCreatedFiles.forEach(path => {
                lines.push(`- [[${path}]]`);
            });
        } else {
            lines.push('*No failures*');
        }

        lines.push('', '## Failed Modified Date Parsing', `Total files: ${failedModifiedFiles.length}`, '');

        if (failedModifiedFiles.length > 0) {
            failedModifiedFiles.forEach(path => {
                lines.push(`- [[${path}]]`);
            });
        } else {
            lines.push('*No failures*');
        }

        const content = `${lines.join('\n')}\n`;

        try {
            // Create the file in vault root
            await this.app.vault.create(filename, content);
            showNotice(strings.settings.metadataReport.exportSuccess.replace('{filename}', filename), { variant: 'success' });
        } catch (error) {
            console.error('Failed to export metadata report:', error);
            showNotice(strings.settings.metadataReport.exportFailed, { variant: 'warning' });
        }
    }

    /**
     * Called when settings tab is closed
     * Cleans up any pending debounce timers and intervals to prevent memory leaks
     */
    hide(): void {
        this.plugin.unregisterSettingsUpdateListener(this.settingsUpdateListenerId);

        // Clean up all pending debounce timers when settings tab is closed
        this.debounceTimers.forEach(timer => window.clearTimeout(timer));
        this.debounceTimers.clear();

        this.stopStatisticsInterval();
        this.stopMetadataInfoListener();

        // Clear references and state
        this.statsTextEl = null;
        this.metadataInfoEl = null;
        this.primaryNavEl = null;
        this.secondaryNavEl = null;
        this.tabSettingsUpdateListeners.clear();
        this.tabContentMap.clear();
        this.tabButtons.clear();
        this.tabIconElements.clear();
        this.showTagsListeners = [];
        this.containerEl.removeClass('nn-settings-tab-root');
    }
}

export type {
    NotebookNavigatorSettings,
    SortOption,
    AlphaSortOrder,
    ItemScope,
    MultiSelectModifier,
    DeleteAttachmentsSetting,
    ListPaneTitleOption,
    PropertySortSecondaryOption,
    AlphabeticalDateMode,
    NotePropertyType
} from './settings/types';
export { DEFAULT_SETTINGS } from './settings/defaultSettings';
