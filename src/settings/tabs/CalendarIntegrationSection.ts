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

import { DropdownComponent, Setting } from 'obsidian';
import { getCurrentLanguage, strings } from '../../i18n';
import {
    getMomentApi,
    resolveCalendarLocales,
    resolveCalendarPeriodicNotesLocale,
    resolveDailyNoteLocale,
    type MomentApi
} from '../../utils/moment';
import { getActiveVaultProfile } from '../../utils/vaultProfiles';
import type { createSettingGroupFactory } from '../settingGroups';
import { createDependentSettingsSection, setElementVisible } from '../dependentSettings';
import { isCalendarPeriodicNotesLocaleSource } from '../types';
import { renderCalendarCustomPatternSection, type CalendarSelectedLocales } from './CalendarCustomPatternSection';
import type { SettingsTabContext } from './SettingsTabContext';

type CreateSettingGroup = ReturnType<typeof createSettingGroupFactory>;

interface CalendarIntegrationSectionOptions {
    calendarLocaleWarningEl: HTMLElement;
}

function formatLocaleWeekdayExample(locale: string): string {
    const currentMomentApi = getMomentApi();
    const sampleDate = currentMomentApi?.('2026-01-19', 'YYYY-MM-DD', true).locale(locale);
    if (!sampleDate?.isValid()) {
        return '';
    }

    const formatted = sampleDate.format('dddd').trim();
    const [first = '', ...rest] = Array.from(formatted);
    return first ? `${first.toLocaleUpperCase()}${rest.join('')}` : '';
}

function formatPeriodicNotesLocaleOption(label: string, locale: string): string {
    const example = formatLocaleWeekdayExample(locale);
    return example ? `${label} - ${locale} (${example})` : `${label} - ${locale}`;
}

export function renderCalendarIntegrationSection(
    context: SettingsTabContext,
    createGroup: CreateSettingGroup,
    options: CalendarIntegrationSectionOptions
): () => void {
    const { calendarLocaleWarningEl } = options;
    const { plugin } = context;
    const getActiveProfile = () => getActiveVaultProfile(plugin.settings);

    const resolveSelectedCalendarLocales = (momentApi: MomentApi | null): CalendarSelectedLocales => {
        const locales = resolveCalendarLocales(plugin.settings.calendarLocale, momentApi, getCurrentLanguage());
        return {
            calendarRulesLocale: locales.calendarRulesLocale,
            periodicNotesLocale: resolveCalendarPeriodicNotesLocale(
                plugin.settings.calendarPeriodicNotesLocaleSource,
                locales.calendarRulesLocale,
                momentApi
            )
        };
    };

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

    const dailyNotesInfoSettingsEl = createDependentSettingsSection(calendarIntegrationSetting);
    const customCalendarSettingsEl = createDependentSettingsSection(calendarIntegrationSetting);

    const dailyNotesInfoSetting = new Setting(dailyNotesInfoSettingsEl).setName('').setDesc('');
    dailyNotesInfoSetting.settingEl.addClass('nn-setting-info-container');
    dailyNotesInfoSetting.settingEl.addClass('nn-setting-info-centered');
    dailyNotesInfoSetting.descEl.empty();
    dailyNotesInfoSetting.descEl.createDiv({ text: strings.settings.items.calendarIntegrationMode.info.dailyNotes });

    let calendarPeriodicNotesLocaleDropdown: DropdownComponent | null = null;

    const renderCalendarPeriodicNotesLocaleOptions = (): void => {
        if (!calendarPeriodicNotesLocaleDropdown) {
            return;
        }

        const currentMomentApi = getMomentApi();
        const { calendarRulesLocale } = resolveSelectedCalendarLocales(currentMomentApi);
        const obsidianLocale = resolveDailyNoteLocale(currentMomentApi);
        const optionLabels = {
            calendar: formatPeriodicNotesLocaleOption(
                strings.settings.items.calendarPeriodicNotesLocale.options.calendar,
                calendarRulesLocale
            ),
            obsidian: formatPeriodicNotesLocaleOption(strings.settings.items.calendarPeriodicNotesLocale.options.obsidian, obsidianLocale)
        };

        Object.entries(optionLabels).forEach(([value, label]) => {
            const optionEl = calendarPeriodicNotesLocaleDropdown?.selectEl.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
            if (optionEl) {
                optionEl.text = label;
            }
        });
    };

    new Setting(customCalendarSettingsEl)
        .setName(strings.settings.items.calendarPeriodicNotesLocale.name)
        .setDesc(strings.settings.items.calendarPeriodicNotesLocale.desc)
        .addDropdown(dropdown => {
            calendarPeriodicNotesLocaleDropdown = dropdown;
            dropdown
                .addOption('calendar', strings.settings.items.calendarPeriodicNotesLocale.options.calendar)
                .addOption('obsidian', strings.settings.items.calendarPeriodicNotesLocale.options.obsidian)
                .setValue(plugin.settings.calendarPeriodicNotesLocaleSource)
                .onChange(async value => {
                    if (!isCalendarPeriodicNotesLocaleSource(value)) {
                        return;
                    }

                    plugin.settings.calendarPeriodicNotesLocaleSource = value;
                    renderCalendarIntegrationVisibility();
                    await plugin.saveSettingsAndUpdate();
                });
            renderCalendarPeriodicNotesLocaleOptions();
        });

    const customPatternController = renderCalendarCustomPatternSection({
        context,
        containerEl: customCalendarSettingsEl,
        calendarLocaleWarningEl,
        getActiveProfile,
        resolveSelectedCalendarLocales,
        requestVisibilityRefresh: () => renderCalendarIntegrationVisibility()
    });

    const renderCalendarIntegrationVisibility = (): void => {
        const isDailyNotes = plugin.settings.calendarIntegrationMode === 'daily-notes';
        const isCustom = plugin.settings.calendarIntegrationMode === 'notebook-navigator';

        renderCalendarPeriodicNotesLocaleOptions();
        setElementVisible(dailyNotesInfoSettingsEl, isDailyNotes);
        setElementVisible(customCalendarSettingsEl, isCustom);

        if (!isCustom) {
            customPatternController.hideMessages();
            return;
        }

        customPatternController.refresh();
    };

    context.registerSettingsUpdateListener('calendar-tab-calendar-integration', () => {
        renderCalendarIntegrationVisibility();
    });

    return renderCalendarIntegrationVisibility;
}
