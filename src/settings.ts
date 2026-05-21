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

import * as Obsidian from 'obsidian';
import { App, ButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import type {
    SettingDefinitionGroup,
    SettingDefinitionItem,
    SettingDefinitionPage,
    SettingDefinitionRender,
    SettingGroupItem
} from 'obsidian';
import NotebookNavigatorPlugin from './main';
import { TIMEOUTS } from './types/obsidian-extended';
import type {
    AddSettingFunction,
    DebouncedTextAreaSettingOptions,
    SettingsTabContext,
    SettingDescription
} from './settings/tabs/SettingsTabContext';
import { strings } from './i18n';
import { createStartResourcesSettingDefinitions } from './settings/tabs/StartResourcesSection';
import { createVaultSetupSettingDefinitions } from './settings/tabs/VaultSetupSection';
import { createSettingGroupFactory } from './settings/settingGroups';
import { runAsyncAction } from './utils/async';
import { NOTEBOOK_NAVIGATOR_ICON_ID } from './constants/notebookNavigatorIcon';
import { SettingsDiagnosticsController } from './settings/SettingsDiagnosticsController';
import {
    SETTINGS_PAGE_DESCRIPTION_GETTERS,
    SETTINGS_PAGE_GROUP_DEFINITIONS,
    SETTINGS_PANE_DEFINITION_MAP,
    type SettingsPaneId
} from './settings/SettingsPaneDefinitions';

/**
 * Settings tab for configuring the Notebook Navigator plugin
 * Provides organized sections for different aspects of the plugin
 * Implements debounced text inputs to prevent excessive updates
 */
export class NotebookNavigatorSettingTab extends PluginSettingTab {
    plugin: NotebookNavigatorPlugin;
    // Map of active debounce timers for text inputs
    private debounceTimers: Map<string, number> = new Map();
    // Registered listeners for show tags visibility changes
    private showTagsListeners: ((visible: boolean) => void)[] = [];
    // Current visibility state of show tags setting
    private currentShowTagsVisible = false;
    private settingsUpdateListenerId = 'settings-tab';
    private tabSettingsUpdateListeners = new Map<string, () => void>();
    private readonly diagnosticsController: SettingsDiagnosticsController;
    private settingsRenderContainerEl: HTMLElement | null = null;
    private activeSettingsPage: { tabId: SettingsPaneId; containerEl: HTMLElement } | null = null;
    private isFallbackSettingsDisplay = false;
    private legacySettingsLandingScrollTop = 0;

    /**
     * Creates a new settings tab
     * @param app - The Obsidian app instance
     * @param plugin - The plugin instance to configure
     */
    constructor(app: App, plugin: NotebookNavigatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.diagnosticsController = new SettingsDiagnosticsController({
            app: this.app,
            plugin: this.plugin,
            registerInterval: intervalId => this.plugin.registerInterval(intervalId),
            scheduleDebouncedUpdate: (name, updater) => this.scheduleDebouncedSettingUpdate(name, updater)
        });

        this.icon = NOTEBOOK_NAVIGATOR_ICON_ID;
    }

    private ensureSettingsUpdateListener(): void {
        this.plugin.registerSettingsUpdateListener(this.settingsUpdateListenerId, () => {
            if (this.plugin.isExternalSettingsUpdate()) {
                this.refreshFromExternalSettingsUpdate();
                return;
            }

            this.refreshNativeSettingsDomState();
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

    private refreshNativeSettingsDomState(): void {
        const refreshDomState: unknown = Reflect.get(this, 'refreshDomState');
        if (typeof refreshDomState === 'function') {
            refreshDomState.call(this);
        }
    }

    private refreshFromExternalSettingsUpdate(): void {
        const renderContainerEl = this.settingsRenderContainerEl ?? this.containerEl;
        const scrollTop = renderContainerEl.scrollTop;

        if (this.isFallbackSettingsDisplay) {
            const activeLegacyTabId = this.activeSettingsPage?.containerEl === this.containerEl ? this.activeSettingsPage.tabId : null;
            if (activeLegacyTabId) {
                this.renderLegacySettingsPage(activeLegacyTabId);
            } else {
                this.renderLegacySettingsLanding();
            }
            this.containerEl.scrollTop = scrollTop;
            return;
        }

        if (this.activeSettingsPage?.containerEl.isConnected) {
            const { tabId, containerEl } = this.activeSettingsPage;
            this.renderNativeSettingsPage(tabId, containerEl);
            containerEl.scrollTop = scrollTop;
            return;
        }

        this.updateNativeSettingsDefinitions();
        renderContainerEl.scrollTop = scrollTop;
    }

    private updateNativeSettingsDefinitions(): void {
        const update: unknown = Reflect.get(this, 'update');
        if (typeof update === 'function') {
            update.call(this);
        }
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
     * Fallback used by Obsidian versions before native settings pages.
     */
    display(): void {
        this.renderLegacySettingsLanding();
    }

    private renderLegacySettingsLanding(): void {
        this.ensureSettingsUpdateListener();
        this.isFallbackSettingsDisplay = true;
        this.activeSettingsPage = null;
        this.prepareSettingsRender(this.containerEl);

        const generalDefinition = SETTINGS_PANE_DEFINITION_MAP.get('general');
        generalDefinition?.render(this.createTabContext(this.containerEl));

        const createGroup = createSettingGroupFactory(this.containerEl);
        SETTINGS_PAGE_GROUP_DEFINITIONS.forEach(group => {
            const pageGroup = createGroup(group.getHeading());
            group.items.forEach(tabId => {
                this.addLegacySettingsPageLink(pageGroup.addSetting, tabId);
            });
        });
    }

    private addLegacySettingsPageLink(addSetting: AddSettingFunction, tabId: SettingsPaneId): void {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
        if (!definition) {
            return;
        }

        const name = definition.getLabel();
        const setting = addSetting(setting => {
            setting.setName(name).setDesc(SETTINGS_PAGE_DESCRIPTION_GETTERS[tabId]());
            setting.addExtraButton(button =>
                button
                    .setIcon('lucide-chevron-right')
                    .setTooltip(name)
                    .onClick(() => this.openLegacySettingsPage(tabId))
            );
        });

        setting.settingEl.addClass('nn-settings-legacy-page-link');
        setting.settingEl.tabIndex = 0;
        setting.settingEl.setAttr('role', 'button');
        setting.settingEl.setAttr('aria-label', name);
        setting.settingEl.addEventListener('click', event => {
            if (isLegacySettingsInteractiveTarget(event.target)) {
                return;
            }
            this.openLegacySettingsPage(tabId);
        });
        setting.settingEl.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            event.preventDefault();
            this.openLegacySettingsPage(tabId);
        });
    }

    private openLegacySettingsPage(tabId: SettingsPaneId): void {
        this.legacySettingsLandingScrollTop = this.containerEl.scrollTop;
        this.renderLegacySettingsPage(tabId);
    }

    private returnToLegacySettingsLanding(): void {
        const scrollTop = this.legacySettingsLandingScrollTop;
        this.renderLegacySettingsLanding();
        this.containerEl.scrollTop = scrollTop;
    }

    private renderLegacySettingsPage(tabId: SettingsPaneId): void {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
        if (!definition) {
            return;
        }

        this.ensureSettingsUpdateListener();
        this.isFallbackSettingsDisplay = true;
        this.prepareSettingsRender(this.containerEl);
        this.activeSettingsPage = { tabId, containerEl: this.containerEl };
        this.renderLegacySettingsPageTitle(definition.getLabel());
        this.diagnosticsController.handleTabActivation(tabId);
        definition.render(this.createTabContext(this.containerEl));
        this.containerEl.scrollTop = 0;
    }

    private renderLegacySettingsPageTitle(title: string): void {
        const titleSetting = new Setting(this.containerEl).setName(title).setHeading();
        titleSetting.settingEl.addClass('nn-settings-legacy-titlebar');
        titleSetting.nameEl.empty();
        const backButton = new ButtonComponent(titleSetting.nameEl);
        backButton
            .setIcon('lucide-chevron-left')
            .setTooltip(strings.commands.navigateBack)
            .onClick(() => this.returnToLegacySettingsLanding());
        backButton.buttonEl.addClass('clickable-icon');
        backButton.buttonEl.addClass('nn-settings-legacy-back-button');
        backButton.buttonEl.setAttr('aria-label', strings.commands.navigateBack);
        titleSetting.nameEl.createSpan({ text: title });
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        this.isFallbackSettingsDisplay = false;
        const context = this.createTabContext(this.containerEl);

        const items: SettingDefinitionItem[] = [
            ...createStartResourcesSettingDefinitions(context),
            ...createVaultSetupSettingDefinitions(context),
            ...SETTINGS_PAGE_GROUP_DEFINITIONS.map(group => ({
                type: 'group' as const,
                heading: group.getHeading(),
                items: group.items.map(tabId => this.createNativeSettingsPageDefinition(tabId))
            }))
        ];

        return this.createNativeDefinitionItems(
            items,
            () => this.prepareNativeSettingsIndexRender(),
            () => this.finishNativeSettingsIndexRender()
        );
    }

    private createNativeSettingsPageDefinition(tabId: SettingsPaneId): SettingDefinitionPage {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
        const name = definition?.getLabel() ?? tabId;

        return {
            type: 'page' as const,
            name,
            desc: SETTINGS_PAGE_DESCRIPTION_GETTERS[tabId](),
            page: () =>
                createNativeSettingsPage({
                    title: name,
                    display: containerEl => this.renderNativeSettingsPage(tabId, containerEl),
                    hide: containerEl => this.hideNativeSettingsPage(containerEl)
                })
        };
    }

    private createNativeDefinitionItems(
        items: SettingDefinitionItem[],
        onFirstRender: () => void,
        onLastCleanup: () => void
    ): SettingDefinitionItem[] {
        let activeRenderCount = 0;

        const beginRender = (): void => {
            if (activeRenderCount === 0) {
                onFirstRender();
            }
            activeRenderCount += 1;
        };

        const endRender = (): void => {
            activeRenderCount = Math.max(0, activeRenderCount - 1);
            if (activeRenderCount === 0) {
                onLastCleanup();
            }
        };

        const wrapRenderDefinition = (item: SettingDefinitionRender): SettingDefinitionRender => {
            const render = item.render;
            return {
                ...item,
                render: (setting, group) => {
                    beginRender();
                    const cleanup = render(setting, group);
                    return () => {
                        cleanup?.();
                        endRender();
                    };
                }
            };
        };

        const wrapGroupItem = (item: SettingGroupItem): SettingGroupItem => {
            if ('type' in item) {
                return item;
            }

            if ('render' in item && typeof item.render === 'function') {
                return wrapRenderDefinition(item);
            }

            return item;
        };

        const wrapItem = (item: SettingDefinitionItem): SettingDefinitionItem => {
            if ('type' in item) {
                if (item.type !== 'group') {
                    return item;
                }

                const group: SettingDefinitionGroup = {
                    ...item,
                    items: item.items?.map(groupItem => wrapGroupItem(groupItem))
                };
                return group;
            }

            if ('render' in item && typeof item.render === 'function') {
                return wrapRenderDefinition(item);
            }

            return item;
        };

        return items.map(item => wrapItem(item));
    }

    private renderNativeSettingsPage(tabId: SettingsPaneId, containerEl: HTMLElement): void {
        const definition = SETTINGS_PANE_DEFINITION_MAP.get(tabId);
        if (!definition) {
            return;
        }

        this.ensureSettingsUpdateListener();
        this.settingsRenderContainerEl = containerEl;
        this.activeSettingsPage = { tabId, containerEl };
        containerEl.empty();
        containerEl.addClass('nn-settings-tab-root');
        this.resetRenderedSettingsState();
        this.diagnosticsController.handleTabActivation(tabId);
        definition.render(this.createTabContext(containerEl));
    }

    private hideNativeSettingsPage(containerEl: HTMLElement): void {
        containerEl.removeClass('nn-settings-tab-root');
        if (this.settingsRenderContainerEl === containerEl) {
            this.settingsRenderContainerEl = null;
        }
        if (this.activeSettingsPage?.containerEl === containerEl) {
            this.activeSettingsPage = null;
        }
        this.resetRenderedSettingsState();
    }

    private prepareSettingsRender(containerEl: HTMLElement): void {
        this.settingsRenderContainerEl = containerEl;
        containerEl.empty();
        containerEl.addClass('nn-settings-tab-root');

        this.resetRenderedSettingsState();
    }

    private prepareNativeSettingsIndexRender(): void {
        this.ensureSettingsUpdateListener();
        this.activeSettingsPage = null;
        this.settingsRenderContainerEl = this.containerEl;
        this.containerEl.addClass('nn-settings-tab-root');
        this.resetRenderedSettingsState();
    }

    private finishNativeSettingsIndexRender(): void {
        this.resetRenderedSettingsState();
    }

    private resetRenderedSettingsState(): void {
        this.diagnosticsController.prepareForRender();
        this.tabSettingsUpdateListeners.clear();
        this.showTagsListeners = [];
        this.currentShowTagsVisible = this.plugin.settings.showTags;
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
            registerMetadataInfoElement: (element, exportButton) => {
                this.diagnosticsController.registerMetadataInfoElement(element, exportButton);
            },
            registerStatsTextElement: element => {
                this.diagnosticsController.registerStatsTextElement(element);
            },
            requestStatisticsRefresh: () => {
                this.diagnosticsController.requestRefresh();
            },
            refreshSettingsDomState: () => {
                this.refreshNativeSettingsDomState();
            },
            ensureStatisticsInterval: () => {
                this.diagnosticsController.ensureStatisticsInterval();
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
     * Called when settings tab is closed
     * Cleans up any pending debounce timers and intervals to prevent memory leaks
     */
    hide(): void {
        this.plugin.unregisterSettingsUpdateListener(this.settingsUpdateListenerId);

        // Clean up all pending debounce timers when settings tab is closed
        this.debounceTimers.forEach(timer => window.clearTimeout(timer));
        this.debounceTimers.clear();

        this.diagnosticsController.dispose();

        // Clear references and state
        this.tabSettingsUpdateListeners.clear();
        this.showTagsListeners = [];
        this.activeSettingsPage = null;
        this.settingsRenderContainerEl?.removeClass('nn-settings-tab-root');
        this.settingsRenderContainerEl = null;
        this.containerEl.removeClass('nn-settings-tab-root');
    }
}

function isLegacySettingsInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(target.closest('button, a, input, select, textarea, .clickable-icon, [contenteditable="true"]'));
}

interface NotebookNavigatorSettingsPageOptions {
    title: string;
    display(containerEl: HTMLElement): void;
    hide(containerEl: HTMLElement): void;
}

type NativeSettingPage = ReturnType<NonNullable<SettingDefinitionPage['page']>>;
type NativeSettingPageConstructor = new () => NativeSettingPage;

function isNativeSettingPageConstructor(value: unknown): value is NativeSettingPageConstructor {
    return typeof value === 'function';
}

/* eslint-disable obsidianmd/no-unsupported-api -- SettingPage is looked up lazily and used only by native settings pages on Obsidian 1.13+. */
function getNativeSettingPageConstructor(): NativeSettingPageConstructor {
    const settingPageConstructor = Obsidian.SettingPage;
    if (!isNativeSettingPageConstructor(settingPageConstructor)) {
        throw new Error('Obsidian SettingPage API is unavailable.');
    }

    return settingPageConstructor;
}

function createNativeSettingsPage(options: NotebookNavigatorSettingsPageOptions): NativeSettingPage {
    const SettingPageBase = getNativeSettingPageConstructor();

    return new (class NotebookNavigatorSettingsPage extends SettingPageBase {
        constructor() {
            super();
            this.title = options.title;
        }

        display(): void {
            options.display(this.containerEl);
        }

        hide(): void {
            super.hide();
            options.hide(this.containerEl);
        }
    })();
}
/* eslint-enable obsidianmd/no-unsupported-api */

export type {
    NotebookNavigatorSettings,
    SortOption,
    ListSortOverride,
    ListSortOverrideValue,
    AlphaSortOrder,
    ItemScope,
    MultiSelectModifier,
    DeleteAttachmentsSetting,
    FeatureImagePixelSizeSetting,
    FeatureImageSizeSetting,
    ListPaneTitleOption,
    PropertySortSecondaryOption,
    AlphabeticalDateMode
} from './settings/types';
export { DEFAULT_SETTINGS } from './settings/defaultSettings';
