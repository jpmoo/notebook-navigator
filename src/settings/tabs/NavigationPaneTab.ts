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

import { ButtonComponent, DropdownComponent, Setting, SliderComponent } from 'obsidian';
import { strings } from '../../i18n';
import { NavigationBannerModal } from '../../modals/NavigationBannerModal';
import { DEFAULT_SETTINGS } from '../defaultSettings';
import type { CalendarWeeksToShow, ItemScope, ShortcutBadgeDisplayMode } from '../types';
import type { SettingsTabContext } from './SettingsTabContext';
import { runAsyncAction } from '../../utils/async';
import {
    createCalendarCustomDateFormatter,
    ensureMarkdownFileName,
    isCalendarCustomDatePatternValid,
    normalizeCalendarCustomFilePattern,
    normalizeCalendarCustomRootFolder,
    normalizeCalendarVaultFolderPath,
    splitCalendarCustomPattern
} from '../../utils/calendarCustomNotePatterns';
import { getActiveVaultProfile } from '../../utils/vaultProfiles';
import { createSettingGroupFactory } from '../settingGroups';
import { addSettingSyncModeToggle } from '../syncModeToggle';
import { createSubSettingsContainer, setElementVisible, wireToggleSettingWithSubSettings } from '../subSettings';
import { getMomentApi } from '../../utils/moment';

const CALENDAR_LOCALE_SYSTEM_DEFAULT = 'system-default';

function parseCalendarWeeksToShow(value: string): CalendarWeeksToShow | null {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 6) {
        return null;
    }
    return parsed as CalendarWeeksToShow;
}

function formatCalendarWeeksOption(count: number): string {
    return strings.settings.items.calendarWeeksToShow.options.weeksCount.replace('{count}', count.toString());
}

/** Renders the navigation pane settings tab */
export function renderNavigationPaneTab(context: SettingsTabContext): void {
    const { containerEl, plugin, addToggleSetting, createDebouncedTextSetting } = context;
    const getActiveProfile = () => getActiveVaultProfile(plugin.settings);

    const createGroup = createSettingGroupFactory(containerEl);
    const behaviorGroup = createGroup(undefined);

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

    const shortcutsGroup = createGroup(strings.settings.groups.navigation.shortcutsAndRecent);

    addToggleSetting(
        shortcutsGroup.addSetting,
        strings.settings.items.showSectionIcons.name,
        strings.settings.items.showSectionIcons.desc,
        () => plugin.settings.showSectionIcons,
        value => {
            plugin.settings.showSectionIcons = value;
        }
    );

    const showShortcutsSetting = shortcutsGroup.addSetting(setting => {
        setting.setName(strings.settings.items.showShortcuts.name).setDesc(strings.settings.items.showShortcuts.desc);
    });

    const shortcutsSubSettings = wireToggleSettingWithSubSettings(
        showShortcutsSetting,
        () => plugin.settings.showShortcuts,
        async value => {
            plugin.settings.showShortcuts = value;
            await plugin.saveSettingsAndUpdate();
        }
    );

    new Setting(shortcutsSubSettings)
        .setName(strings.settings.items.shortcutBadgeDisplay.name)
        .setDesc(strings.settings.items.shortcutBadgeDisplay.desc)
        .addDropdown((dropdown: DropdownComponent) =>
            dropdown
                .addOption('index', strings.settings.items.shortcutBadgeDisplay.options.index)
                .addOption('count', strings.settings.items.shortcutBadgeDisplay.options.count)
                .addOption('none', strings.settings.items.shortcutBadgeDisplay.options.none)
                .setValue(plugin.settings.shortcutBadgeDisplay)
                .onChange(async (value: ShortcutBadgeDisplayMode) => {
                    plugin.settings.shortcutBadgeDisplay = value;
                    await plugin.saveSettingsAndUpdate();
                })
        );

    new Setting(shortcutsSubSettings)
        .setName(strings.settings.items.skipAutoScroll.name)
        .setDesc(strings.settings.items.skipAutoScroll.desc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.skipAutoScroll).onChange(async value => {
                plugin.settings.skipAutoScroll = value;
                await plugin.saveSettingsAndUpdate();
            })
        );

    const showRecentNotesSetting = shortcutsGroup.addSetting(setting => {
        setting.setName(strings.settings.items.showRecentNotes.name).setDesc(strings.settings.items.showRecentNotes.desc);
    });

    const recentNotesSubSettings = wireToggleSettingWithSubSettings(
        showRecentNotesSetting,
        () => plugin.settings.showRecentNotes,
        async value => {
            plugin.settings.showRecentNotes = value;
            await plugin.saveSettingsAndUpdate();
        }
    );

    new Setting(recentNotesSubSettings)
        .setName(strings.settings.items.pinRecentNotesWithShortcuts.name)
        .setDesc(strings.settings.items.pinRecentNotesWithShortcuts.desc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.pinRecentNotesWithShortcuts).onChange(async value => {
                plugin.settings.pinRecentNotesWithShortcuts = value;
                await plugin.saveSettingsAndUpdate();
            })
        );

    new Setting(recentNotesSubSettings)
        .setName(strings.settings.items.recentNotesCount.name)
        .setDesc(strings.settings.items.recentNotesCount.desc)
        .addSlider(slider =>
            slider
                .setLimits(1, 10, 1)
                .setValue(plugin.settings.recentNotesCount)
                .setInstant(false)
                .setDynamicTooltip()
                .onChange(async value => {
                    plugin.settings.recentNotesCount = value;
                    plugin.applyRecentNotesLimit();
                    await plugin.saveSettingsAndUpdate();
                })
        );

    const calendarGroup = createGroup(strings.navigationCalendar.ariaLabel);

    const showCalendarSetting = calendarGroup.addSetting(setting => {
        setting
            .setName(strings.settings.items.showCalendar.name)
            .setDesc(strings.settings.items.showCalendar.desc)
            .addToggle(toggle =>
                toggle.setValue(plugin.getUXPreferences().showCalendar).onChange(value => {
                    plugin.setShowCalendar(value);
                })
            );
    });

    addSettingSyncModeToggle({ setting: showCalendarSetting, plugin, settingId: 'showCalendar' });

    const momentApi = getMomentApi();
    // Offer moment locales as options; the selected locale is used for week rules (start-of-week + week numbering).
    const localeOptions = momentApi ? [...momentApi.locales()].sort((a, b) => a.localeCompare(b)) : [];

    // This is only used to show a hint in the UI for "system default".
    const systemLocale = typeof navigator !== 'undefined' ? (navigator.language ?? '').toLowerCase() : '';
    const currentLocale = momentApi?.locale() || systemLocale;

    calendarGroup
        .addSetting(setting => {
            setting.setName(strings.settings.items.calendarLocale.name).setDesc(strings.settings.items.calendarLocale.desc);
        })
        .addDropdown((dropdown: DropdownComponent) => {
            dropdown.addOption(
                CALENDAR_LOCALE_SYSTEM_DEFAULT,
                `${strings.settings.items.calendarLocale.options.systemDefault} (${currentLocale || 'en'})`
            );
            for (const locale of localeOptions) {
                dropdown.addOption(locale, locale);
            }

            dropdown.setValue(plugin.settings.calendarLocale).onChange(async value => {
                plugin.settings.calendarLocale = value;
                await plugin.saveSettingsAndUpdate();
            });
        });

    const calendarWeeksToShowSetting = calendarGroup.addSetting(setting => {
        setting.setName(strings.settings.items.calendarWeeksToShow.name).setDesc(strings.settings.items.calendarWeeksToShow.desc);
    });

    calendarWeeksToShowSetting.addDropdown((dropdown: DropdownComponent) => {
        dropdown.addOption('1', strings.settings.items.calendarWeeksToShow.options.oneWeek);
        for (let count = 2; count <= 5; count++) {
            dropdown.addOption(String(count), formatCalendarWeeksOption(count));
        }
        dropdown.addOption('6', strings.settings.items.calendarWeeksToShow.options.fullMonth);

        dropdown.setValue(String(plugin.settings.calendarWeeksToShow)).onChange(value => {
            const parsed = parseCalendarWeeksToShow(value);
            if (parsed === null) {
                return;
            }

            plugin.setCalendarWeeksToShow(parsed);
        });
    });

    addSettingSyncModeToggle({ setting: calendarWeeksToShowSetting, plugin, settingId: 'calendarWeeksToShow' });

    calendarGroup
        .addSetting(setting => {
            setting.setName(strings.settings.items.calendarHighlightToday.name).setDesc(strings.settings.items.calendarHighlightToday.desc);
        })
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.calendarHighlightToday).onChange(async value => {
                plugin.settings.calendarHighlightToday = value;
                await plugin.saveSettingsAndUpdate();
            })
        );

    calendarGroup
        .addSetting(setting => {
            setting.setName(strings.settings.items.calendarShowWeekNumber.name).setDesc(strings.settings.items.calendarShowWeekNumber.desc);
        })
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.calendarShowWeekNumber).onChange(async value => {
                plugin.settings.calendarShowWeekNumber = value;
                await plugin.saveSettingsAndUpdate();
            })
        );

    calendarGroup
        .addSetting(setting => {
            setting
                .setName(strings.settings.items.calendarConfirmBeforeCreate.name)
                .setDesc(strings.settings.items.calendarConfirmBeforeCreate.desc);
        })
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.calendarConfirmBeforeCreate).onChange(async value => {
                plugin.settings.calendarConfirmBeforeCreate = value;
                await plugin.saveSettingsAndUpdate();
            })
        );

    const calendarIntegrationGroup = createGroup(strings.settings.groups.navigation.calendarIntegration);

    const calendarIntegrationSetting = calendarIntegrationGroup.addSetting(setting => {
        setting
            .setName(strings.settings.items.calendarIntegrationMode.name)
            .setDesc(strings.settings.items.calendarIntegrationMode.desc)
            .addDropdown(dropdown =>
                dropdown
                    .addOption('daily-notes', strings.settings.items.calendarIntegrationMode.options.dailyNotes)
                    .addOption('notebook-navigator', strings.settings.items.calendarIntegrationMode.options.notebookNavigator)
                    .setValue(plugin.settings.calendarIntegrationMode)
                    .onChange(async value => {
                        if (value !== 'daily-notes' && value !== 'notebook-navigator') {
                            return;
                        }
                        plugin.settings.calendarIntegrationMode = value;
                        await plugin.saveSettingsAndUpdate();
                        renderCalendarIntegrationVisibility();
                    })
            );
    });

    const dailyNotesInfoSettingsEl = createSubSettingsContainer(calendarIntegrationSetting);
    const customCalendarSettingsEl = createSubSettingsContainer(calendarIntegrationSetting);

    const dailyNotesInfoSetting = new Setting(dailyNotesInfoSettingsEl).setName('').setDesc('');
    dailyNotesInfoSetting.settingEl.addClass('nn-setting-info-container');
    dailyNotesInfoSetting.settingEl.addClass('nn-setting-info-centered');
    dailyNotesInfoSetting.descEl.empty();
    dailyNotesInfoSetting.descEl.createDiv({ text: strings.settings.items.calendarIntegrationMode.info.dailyNotes });

    const calendarCustomRootFolderSetting = createDebouncedTextSetting(
        customCalendarSettingsEl,
        strings.settings.items.calendarCustomRootFolder.name,
        strings.settings.items.calendarCustomRootFolder.desc,
        strings.settings.items.calendarCustomRootFolder.placeholder,
        () => normalizeCalendarCustomRootFolder(plugin.settings.calendarCustomRootFolder),
        value => {
            plugin.settings.calendarCustomRootFolder = normalizeCalendarCustomRootFolder(value);
        },
        undefined,
        () => renderCalendarCustomFilePatternPreview()
    );
    calendarCustomRootFolderSetting.controlEl.addClass('nn-setting-wide-input');

    const calendarCustomFilePatternSetting = createDebouncedTextSetting(
        customCalendarSettingsEl,
        strings.settings.items.calendarCustomFilePattern.name,
        strings.settings.items.calendarCustomFilePattern.desc,
        strings.settings.items.calendarCustomFilePattern.placeholder,
        () => normalizeCalendarCustomFilePattern(plugin.settings.calendarCustomFilePattern),
        value => {
            plugin.settings.calendarCustomFilePattern = normalizeCalendarCustomFilePattern(value);
        },
        undefined,
        () => renderCalendarIntegrationVisibility()
    );
    calendarCustomFilePatternSetting.controlEl.addClass('nn-setting-wide-input');

    const calendarCustomFilePatternExampleEl = calendarCustomFilePatternSetting.descEl.createDiv();
    const calendarCustomFilePatternExampleTextEl = calendarCustomFilePatternExampleEl.createEl('strong');

    const calendarCustomFilePatternErrorEl = calendarCustomFilePatternSetting.descEl.createDiv({
        cls: 'setting-item-description nn-setting-hidden nn-setting-warning'
    });

    new Setting(customCalendarSettingsEl)
        .setName(strings.settings.items.calendarCustomPromptForTitle.name)
        .setDesc(strings.settings.items.calendarCustomPromptForTitle.desc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.calendarCustomPromptForTitle).onChange(async value => {
                plugin.settings.calendarCustomPromptForTitle = value;
                await plugin.saveSettingsAndUpdate();
            })
        );

    const rootFolderInputEl = calendarCustomRootFolderSetting.controlEl.querySelector('input');
    const filePatternInputEl = calendarCustomFilePatternSetting.controlEl.querySelector('input');

    // Read current input values while typing; the setting values are updated via debounced callbacks.
    const getInputValue = (element: Element | null, fallback: string): string => {
        if (element instanceof HTMLInputElement) {
            return element.value;
        }
        return fallback;
    };

    /** Updates the preview path shown under the custom calendar file pattern setting */
    const renderCalendarCustomFilePatternPreview = (): void => {
        const momentApi = getMomentApi();
        if (!momentApi) {
            calendarCustomFilePatternExampleTextEl.setText(strings.settings.items.calendarCustomFilePattern.example.replace('{path}', ''));
            return;
        }

        const rootFolderRaw = getInputValue(rootFolderInputEl, plugin.settings.calendarCustomRootFolder);
        const patternRaw = getInputValue(filePatternInputEl, plugin.settings.calendarCustomFilePattern);

        const rootFolder = normalizeCalendarCustomRootFolder(rootFolderRaw);
        const normalizedPattern = normalizeCalendarCustomFilePattern(patternRaw);
        const { folderPattern, filePattern } = splitCalendarCustomPattern(normalizedPattern);

        const sampleDate = momentApi('2026-01-16', 'YYYY-MM-DD', true);
        if (!sampleDate.isValid()) {
            calendarCustomFilePatternExampleTextEl.setText(strings.settings.items.calendarCustomFilePattern.example.replace('{path}', ''));
            return;
        }

        const folderFormatter = createCalendarCustomDateFormatter(folderPattern);
        const fileFormatter = createCalendarCustomDateFormatter(filePattern);

        const folderSuffix = folderFormatter(sampleDate);
        const rawFolderPath = rootFolder ? (folderSuffix ? `${rootFolder}/${folderSuffix}` : rootFolder) : folderSuffix;
        const folderPath = normalizeCalendarVaultFolderPath(rawFolderPath || '/');

        const formattedFilePattern = fileFormatter(sampleDate).trim();
        const fileName = ensureMarkdownFileName(formattedFilePattern);
        const filePath = folderPath === '/' ? fileName : `${folderPath}/${fileName}`;

        calendarCustomFilePatternExampleTextEl.setText(
            strings.settings.items.calendarCustomFilePattern.example.replace('{path}', filePath)
        );
    };

    /** Updates calendar integration sub-setting visibility and validates the custom file pattern */
    const renderCalendarIntegrationVisibility = (): void => {
        const isDailyNotes = plugin.settings.calendarIntegrationMode === 'daily-notes';
        const isCustom = plugin.settings.calendarIntegrationMode === 'notebook-navigator';

        setElementVisible(dailyNotesInfoSettingsEl, isDailyNotes);
        setElementVisible(customCalendarSettingsEl, isCustom);

        if (!isCustom) {
            setElementVisible(calendarCustomFilePatternErrorEl, false);
            return;
        }

        const patternRaw = getInputValue(filePatternInputEl, plugin.settings.calendarCustomFilePattern);
        const normalizedPattern = normalizeCalendarCustomFilePattern(patternRaw);
        const { folderPattern, filePattern } = splitCalendarCustomPattern(normalizedPattern);
        const customPattern = folderPattern ? `${folderPattern}/${filePattern}` : filePattern;
        const showError = !isCalendarCustomDatePatternValid(customPattern);
        calendarCustomFilePatternErrorEl.setText(showError ? strings.settings.items.calendarCustomFilePattern.parsingError : '');
        setElementVisible(calendarCustomFilePatternErrorEl, showError);

        renderCalendarCustomFilePatternPreview();
    };

    if (rootFolderInputEl instanceof HTMLInputElement) {
        rootFolderInputEl.addEventListener('input', () => renderCalendarIntegrationVisibility());
    }

    if (filePatternInputEl instanceof HTMLInputElement) {
        filePatternInputEl.addEventListener('input', () => renderCalendarIntegrationVisibility());
    }

    renderCalendarIntegrationVisibility();

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
}
