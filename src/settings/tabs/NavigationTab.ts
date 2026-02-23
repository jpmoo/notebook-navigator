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

import { ButtonComponent, Platform, Setting, SliderComponent } from 'obsidian';
import { strings } from '../../i18n';
import { NavigationBannerModal } from '../../modals/NavigationBannerModal';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import type { ItemScope } from '../types';
import type { SettingsTabContext } from './SettingsTabContext';
import { runAsyncAction } from '../../utils/async';
import { getActiveVaultProfile } from '../../utils/vaultProfiles';
import { createSettingGroupFactory } from '../settingGroups';
import { addSettingSyncModeToggle } from '../syncModeToggle';
import { createSubSettingsContainer, wireToggleSettingWithSubSettings } from '../subSettings';

/** Renders the navigation pane settings tab */
export function renderNavigationPaneTab(context: SettingsTabContext): void {
    const { containerEl, plugin, addToggleSetting } = context;
    const getActiveProfile = () => getActiveVaultProfile(plugin.settings);

    const createGroup = createSettingGroupFactory(containerEl);
    const appearanceGroup = createGroup(strings.settings.groups.navigation.appearance);

    const navigationBannerSetting = appearanceGroup.addSetting(setting => {
        setting.setName(strings.settings.items.navigationBanner.name);
    });
    navigationBannerSetting.setDesc('');

    const navigationBannerDescEl = navigationBannerSetting.descEl;
    navigationBannerDescEl.empty();
    navigationBannerDescEl.createDiv({ text: strings.settings.items.navigationBanner.desc });

    const navigationBannerValueEl = navigationBannerDescEl.createDiv();
    let clearNavigationBannerButton: ButtonComponent | null = null;

    const renderNavigationBannerValue = () => {
        const navigationBanner = getActiveProfile().navigationBanner;
        navigationBannerValueEl.setText('');
        if (navigationBanner) {
            navigationBannerValueEl.setText(strings.settings.items.navigationBanner.current.replace('{path}', navigationBanner));
        }

        if (clearNavigationBannerButton) {
            clearNavigationBannerButton.setDisabled(!navigationBanner);
        }
    };

    navigationBannerSetting.addButton(button => {
        button.setButtonText(strings.settings.items.navigationBanner.chooseButton);
        button.onClick(() => {
            new NavigationBannerModal(context.app, file => {
                getActiveProfile().navigationBanner = file.path;
                renderNavigationBannerValue();
                // Save navigation banner setting without blocking the UI
                runAsyncAction(() => plugin.saveSettingsAndUpdate());
            }).open();
        });
    });

    navigationBannerSetting.addButton(button => {
        button.setButtonText(strings.common.clear);
        clearNavigationBannerButton = button;
        button.setDisabled(!getActiveProfile().navigationBanner);
        // Clear navigation banner without blocking the UI
        button.onClick(() => {
            runAsyncAction(async () => {
                const activeProfile = getActiveProfile();
                if (!activeProfile.navigationBanner) {
                    return;
                }
                activeProfile.navigationBanner = null;
                renderNavigationBannerValue();
                await plugin.saveSettingsAndUpdate();
            });
        });
    });

    renderNavigationBannerValue();
    context.registerSettingsUpdateListener('navigation-pane-navigation-banner', () => {
        renderNavigationBannerValue();
    });

    const navigationBannerSubSettingsEl = createSubSettingsContainer(navigationBannerSetting);
    const pinNavigationBannerSetting = new Setting(navigationBannerSubSettingsEl)
        .setName(strings.settings.items.pinNavigationBanner.name)
        .setDesc(strings.settings.items.pinNavigationBanner.desc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.pinNavigationBanner).onChange(value => {
                plugin.setPinNavigationBanner(value);
            })
        );
    addSettingSyncModeToggle({ setting: pinNavigationBannerSetting, plugin, settingId: 'pinNavigationBanner' });

    const showNoteCountSetting = appearanceGroup.addSetting(setting => {
        setting.setName(strings.settings.items.showNoteCount.name).setDesc(strings.settings.items.showNoteCount.desc);
    });

    const noteCountSubSettingsEl = wireToggleSettingWithSubSettings(
        showNoteCountSetting,
        () => plugin.settings.showNoteCount,
        async value => {
            plugin.settings.showNoteCount = value;
            await plugin.saveSettingsAndUpdate();
        }
    );

    new Setting(noteCountSubSettingsEl)
        .setName(strings.settings.items.separateNoteCounts.name)
        .setDesc(strings.settings.items.separateNoteCounts.desc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.separateNoteCounts).onChange(async value => {
                plugin.settings.separateNoteCounts = value;
                await plugin.saveSettingsAndUpdate();
            })
        );

    appearanceGroup.addSetting(setting => {
        setting
            .setName(strings.settings.items.showIndentGuides.name)
            .setDesc(strings.settings.items.showIndentGuides.desc)
            .addToggle(toggle =>
                toggle.setValue(plugin.settings.showIndentGuides).onChange(async value => {
                    plugin.settings.showIndentGuides = value;
                    await plugin.saveSettingsAndUpdate();
                })
            );
    });

    let rootSpacingSlider: SliderComponent;
    appearanceGroup.addSetting(setting => {
        setting
            .setName(strings.settings.items.navRootSpacing.name)
            .setDesc(strings.settings.items.navRootSpacing.desc)
            .addSlider(slider => {
                rootSpacingSlider = slider
                    .setLimits(0, 6, 1)
                    .setValue(plugin.settings.rootLevelSpacing)
                    .setInstant(false)
                    .setDynamicTooltip()
                    .onChange(async value => {
                        plugin.settings.rootLevelSpacing = value;
                        await plugin.saveSettingsAndUpdate();
                    });
                return slider;
            })
            .addExtraButton(button =>
                button
                    .setIcon('lucide-rotate-ccw')
                    .setTooltip('Restore to default (0px)')
                    .onClick(() => {
                        // Reset root spacing to default without blocking the UI
                        runAsyncAction(async () => {
                            const defaultValue = DEFAULT_SETTINGS.rootLevelSpacing;
                            rootSpacingSlider.setValue(defaultValue);
                            plugin.settings.rootLevelSpacing = defaultValue;
                            await plugin.saveSettingsAndUpdate();
                        });
                    })
            );
    });

    let indentationSlider: SliderComponent;
    const navIndentSetting = appearanceGroup.addSetting(setting => {
        setting
            .setName(strings.settings.items.navIndent.name)
            .setDesc(strings.settings.items.navIndent.desc)
            .addSlider(slider => {
                indentationSlider = slider
                    .setLimits(10, 24, 1)
                    .setValue(plugin.settings.navIndent)
                    .setInstant(false)
                    .setDynamicTooltip()
                    .onChange(value => {
                        plugin.setNavIndent(value);
                    });
                return slider;
            })
            .addExtraButton(button =>
                button
                    .setIcon('lucide-rotate-ccw')
                    .setTooltip('Restore to default (16px)')
                    .onClick(() => {
                        // Reset indentation to default without blocking the UI
                        runAsyncAction(() => {
                            const defaultValue = DEFAULT_SETTINGS.navIndent;
                            indentationSlider.setValue(defaultValue);
                            plugin.setNavIndent(defaultValue);
                        });
                    })
            );
    });

    addSettingSyncModeToggle({ setting: navIndentSetting, plugin, settingId: 'navIndent' });

    let lineHeightSlider: SliderComponent;
    const navItemHeightSetting = appearanceGroup.addSetting(setting => {
        setting
            .setName(strings.settings.items.navItemHeight.name)
            .setDesc(strings.settings.items.navItemHeight.desc)
            .addSlider(slider => {
                lineHeightSlider = slider
                    .setLimits(20, 28, 1)
                    .setValue(plugin.settings.navItemHeight)
                    .setInstant(false)
                    .setDynamicTooltip()
                    .onChange(value => {
                        plugin.setNavItemHeight(value);
                    });
                return slider;
            })
            .addExtraButton(button =>
                button
                    .setIcon('lucide-rotate-ccw')
                    .setTooltip('Restore to default (28px)')
                    .onClick(() => {
                        // Reset line height to default without blocking the UI
                        runAsyncAction(() => {
                            const defaultValue = DEFAULT_SETTINGS.navItemHeight;
                            lineHeightSlider.setValue(defaultValue);
                            plugin.setNavItemHeight(defaultValue);
                        });
                    })
            );
    });

    addSettingSyncModeToggle({ setting: navItemHeightSetting, plugin, settingId: 'navItemHeight' });

    const navItemHeightSettingsEl = createSubSettingsContainer(navItemHeightSetting);

    const navItemHeightScaleTextSetting = new Setting(navItemHeightSettingsEl)
        .setName(strings.settings.items.navItemHeightScaleText.name)
        .setDesc(strings.settings.items.navItemHeightScaleText.desc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.navItemHeightScaleText).onChange(value => {
                plugin.setNavItemHeightScaleText(value);
            })
        );

    addSettingSyncModeToggle({ setting: navItemHeightScaleTextSetting, plugin, settingId: 'navItemHeightScaleText' });

    const behaviorGroup = createGroup(strings.settings.groups.general.behavior);

    behaviorGroup.addSetting(setting => {
        setting
            .setName(strings.settings.items.collapseBehavior.name)
            .setDesc(strings.settings.items.collapseBehavior.desc)
            .addDropdown(dropdown =>
                dropdown
                    .addOption('all', strings.settings.items.collapseBehavior.options.all)
                    .addOption('folders-only', strings.settings.items.collapseBehavior.options.foldersOnly)
                    .addOption('tags-only', strings.settings.items.collapseBehavior.options.tagsOnly)
                    .setValue(plugin.settings.collapseBehavior)
                    .onChange(async (value: ItemScope) => {
                        plugin.settings.collapseBehavior = value;
                        await plugin.saveSettingsAndUpdate();
                    })
            );
    });

    addToggleSetting(
        behaviorGroup.addSetting,
        strings.settings.items.smartCollapse.name,
        strings.settings.items.smartCollapse.desc,
        () => plugin.settings.smartCollapse,
        value => {
            plugin.settings.smartCollapse = value;
        }
    );

    if (!Platform.isMobile) {
        addToggleSetting(
            behaviorGroup.addSetting,
            strings.settings.items.autoSelectFirstFileOnFocusChange.name,
            strings.settings.items.autoSelectFirstFileOnFocusChange.desc,
            () => plugin.settings.autoSelectFirstFileOnFocusChange,
            value => {
                plugin.settings.autoSelectFirstFileOnFocusChange = value;
            }
        );
    }

    addToggleSetting(
        behaviorGroup.addSetting,
        strings.settings.items.autoExpandNavItems.name,
        strings.settings.items.autoExpandNavItems.desc,
        () => plugin.settings.autoExpandNavItems,
        value => {
            plugin.settings.autoExpandNavItems = value;
        }
    );

    if (!Platform.isMobile) {
        const springLoadedFoldersSetting = behaviorGroup.addSetting(setting => {
            setting.setName(strings.settings.items.springLoadedFolders.name).setDesc(strings.settings.items.springLoadedFolders.desc);
        });
        const springLoadedFoldersSubSettings = wireToggleSettingWithSubSettings(
            springLoadedFoldersSetting,
            () => plugin.settings.springLoadedFolders,
            async value => {
                plugin.settings.springLoadedFolders = value;
                await plugin.saveSettingsAndUpdate();
            }
        );

        new Setting(springLoadedFoldersSubSettings)
            .setName(strings.settings.items.springLoadedFoldersInitialDelay.name)
            .setDesc(strings.settings.items.springLoadedFoldersInitialDelay.desc)
            .addSlider(slider =>
                slider
                    .setLimits(0.1, 2, 0.1)
                    .setValue(plugin.settings.springLoadedFoldersInitialDelay)
                    .setInstant(false)
                    .setDynamicTooltip()
                    .onChange(async value => {
                        plugin.settings.springLoadedFoldersInitialDelay = Math.round(value * 10) / 10;
                        await plugin.saveSettingsAndUpdate();
                    })
            );

        new Setting(springLoadedFoldersSubSettings)
            .setName(strings.settings.items.springLoadedFoldersSubsequentDelay.name)
            .setDesc(strings.settings.items.springLoadedFoldersSubsequentDelay.desc)
            .addSlider(slider =>
                slider
                    .setLimits(0.1, 2, 0.1)
                    .setValue(plugin.settings.springLoadedFoldersSubsequentDelay)
                    .setInstant(false)
                    .setDynamicTooltip()
                    .onChange(async value => {
                        plugin.settings.springLoadedFoldersSubsequentDelay = Math.round(value * 10) / 10;
                        await plugin.saveSettingsAndUpdate();
                    })
            );
    }
}
