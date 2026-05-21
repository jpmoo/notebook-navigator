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

import { ExtraButtonComponent, Setting } from 'obsidian';
import { MOMENT_FORMAT_DOCS_URL } from '../../constants/urls';
import { strings } from '../../i18n';
import { CalendarTemplateModal } from '../../modals/CalendarTemplateModal';
import { runAsyncAction } from '../../utils/async';
import {
    createCalendarCustomDateFormatter,
    DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_MONTH_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_QUARTER_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_WEEK_PATTERN,
    DEFAULT_CALENDAR_CUSTOM_YEAR_PATTERN,
    doesCalendarCustomWeekPatternMixWeekTokenTypes,
    doesCalendarCustomWeekPatternUseDifferentWeekRules,
    ensureMarkdownFileName,
    isCalendarCustomDatePatternValid,
    isCalendarCustomMonthPatternValid,
    isCalendarCustomQuarterPatternValid,
    isCalendarCustomWeekPatternValid,
    isCalendarCustomYearPatternValid,
    normalizeCalendarCustomFilePattern,
    normalizeCalendarCustomRootFolder,
    normalizeCalendarVaultFolderPath,
    splitCalendarCustomPattern,
    type CalendarCustomWeekRules
} from '../../utils/calendarCustomNotePatterns';
import { resolveCalendarCustomNotePathDate, type CalendarNoteKind } from '../../utils/calendarNotes';
import { getMomentApi, type MomentApi } from '../../utils/moment';
import { setElementVisible } from '../subSettings';
import { createInlineExternalLinkText } from './externalLink';
import type { SettingsTabContext } from './SettingsTabContext';

export interface CalendarSelectedLocales {
    calendarRulesLocale: string;
    periodicNotesLocale: string;
}

interface CalendarCustomPatternSectionOptions {
    context: SettingsTabContext;
    containerEl: HTMLElement;
    calendarLocaleWarningEl: HTMLElement;
    getActiveProfile: () => { periodicNotesFolder: string };
    resolveSelectedCalendarLocales: (momentApi: MomentApi | null) => CalendarSelectedLocales;
    requestVisibilityRefresh: () => void;
}

interface CalendarCustomPatternSectionController {
    refresh: () => void;
    hideMessages: () => void;
}

interface CalendarCustomPatternSetting {
    setting: Setting;
    descEl: HTMLElement;
    exampleEl: HTMLElement;
    exampleTextEl: HTMLElement;
    templateEl: HTMLElement;
    templateTextEl: HTMLElement;
    templateButton: ExtraButtonComponent | null;
    inputEl: HTMLInputElement | null;
    getTemplatePath: () => string | null;
}

function getInputValue(element: HTMLInputElement | null, fallback: string): string {
    return element?.value ?? fallback;
}

function buildCustomPattern(value: string, fallback: string): string {
    const { folderPattern, filePattern } = splitCalendarCustomPattern(value, fallback);
    return folderPattern ? `${folderPattern}/${filePattern}` : filePattern;
}

function getLocaleWeekRules(momentApi: MomentApi, locale: string): CalendarCustomWeekRules {
    const localeData = momentApi().locale(locale).localeData();
    return {
        firstDayOfWeek: localeData.firstDayOfWeek(),
        firstDayOfYear: localeData.firstDayOfYear?.() ?? null
    };
}

function getTemplateFileName(value: string): string {
    const parts = value.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : value;
}

function setExampleText(target: { exampleEl: HTMLElement; exampleTextEl: HTMLElement }, text: string): void {
    target.exampleTextEl.setText(text);
    setElementVisible(target.exampleEl, text.trim() !== '');
}

export function renderCalendarCustomPatternSection(options: CalendarCustomPatternSectionOptions): CalendarCustomPatternSectionController {
    const { context, containerEl, calendarLocaleWarningEl, getActiveProfile, resolveSelectedCalendarLocales, requestVisibilityRefresh } =
        options;
    const { plugin, createDebouncedTextSetting } = context;

    const calendarCustomRootFolderSetting = createDebouncedTextSetting(
        containerEl,
        strings.settings.items.calendarCustomRootFolder.name,
        strings.settings.items.calendarCustomRootFolder.desc,
        strings.settings.items.calendarCustomRootFolder.placeholder,
        () => getActiveProfile().periodicNotesFolder,
        value => {
            getActiveProfile().periodicNotesFolder = normalizeCalendarCustomRootFolder(value);
        }
    );
    calendarCustomRootFolderSetting.controlEl.addClass('nn-setting-wide-input');
    const calendarCustomRootFolderInputEl = calendarCustomRootFolderSetting.controlEl.querySelector<HTMLInputElement>('input');

    const createCalendarCustomPatternSetting = (params: {
        name: string;
        placeholder: string;
        getValue: () => string;
        setValue: (value: string) => void;
        getTemplatePath: () => string | null;
        setTemplatePath: (value: string | null) => void;
        onAfterUpdate?: () => void;
    }): CalendarCustomPatternSetting => {
        const setting = createDebouncedTextSetting(
            containerEl,
            params.name,
            '',
            params.placeholder,
            params.getValue,
            params.setValue,
            undefined,
            params.onAfterUpdate
        );
        setting.controlEl.addClass('nn-setting-wide-input');

        const descEl = setting.descEl;
        descEl.empty();

        const exampleEl = descEl.createDiv({ cls: 'nn-setting-calendar-pattern-example nn-setting-hidden' });
        const exampleTextEl = exampleEl.createSpan({ cls: 'nn-setting-calendar-pattern-example-text' });
        const templateEl = descEl.createDiv({ cls: 'nn-setting-calendar-template-file nn-setting-hidden' });
        const templateTextEl = templateEl.createSpan({ cls: 'nn-setting-calendar-pattern-example-text' });
        const inputEl = setting.controlEl.querySelector<HTMLInputElement>('input');

        let templateButton: ExtraButtonComponent | null = null;
        setting.addExtraButton(button => {
            templateButton = button;
            button.onClick(() => {
                const templatePath = params.getTemplatePath();
                if (templatePath) {
                    runAsyncAction(async () => {
                        params.setTemplatePath(null);
                        requestVisibilityRefresh();
                        await plugin.saveSettingsAndUpdate();
                    });
                    return;
                }

                const templateFolder = plugin.settings.calendarTemplateFolder;
                new CalendarTemplateModal(context.app, templateFolder, async file => {
                    params.setTemplatePath(file.path);
                    requestVisibilityRefresh();
                    await plugin.saveSettingsAndUpdate();
                }).open();
            });
        });

        return {
            setting,
            descEl,
            exampleEl,
            exampleTextEl,
            templateEl,
            templateTextEl,
            templateButton,
            inputEl,
            getTemplatePath: params.getTemplatePath
        };
    };

    const calendarCustomFilePattern = createCalendarCustomPatternSetting({
        name: strings.settings.items.calendarCustomFilePattern.name,
        placeholder: strings.settings.items.calendarCustomFilePattern.placeholder,
        getValue: () => normalizeCalendarCustomFilePattern(plugin.settings.calendarCustomFilePattern),
        setValue: value => {
            plugin.settings.calendarCustomFilePattern = normalizeCalendarCustomFilePattern(value);
        },
        getTemplatePath: () => plugin.settings.calendarCustomFileTemplate,
        setTemplatePath: value => {
            plugin.settings.calendarCustomFileTemplate = value;
        },
        onAfterUpdate: () => requestVisibilityRefresh()
    });

    const calendarCustomFilePatternErrorEl = calendarCustomFilePattern.descEl.createDiv({
        cls: 'setting-item-description nn-setting-hidden nn-setting-warning'
    });

    const calendarCustomWeekPattern = createCalendarCustomPatternSetting({
        name: strings.settings.items.calendarCustomWeekPattern.name,
        placeholder: DEFAULT_CALENDAR_CUSTOM_WEEK_PATTERN,
        getValue: () => normalizeCalendarCustomFilePattern(plugin.settings.calendarCustomWeekPattern, ''),
        setValue: value => {
            plugin.settings.calendarCustomWeekPattern = normalizeCalendarCustomFilePattern(value, '');
        },
        getTemplatePath: () => plugin.settings.calendarCustomWeekTemplate,
        setTemplatePath: value => {
            plugin.settings.calendarCustomWeekTemplate = value;
        },
        onAfterUpdate: () => renderCalendarCustomPatternPreviews()
    });

    const calendarCustomWeekPatternErrorEl = calendarCustomWeekPattern.descEl.createDiv({
        cls: 'setting-item-description nn-setting-hidden nn-setting-warning'
    });

    const calendarCustomWeekPatternWarningEl = calendarCustomWeekPattern.descEl.createDiv({
        cls: 'setting-item-description nn-setting-hidden nn-setting-warning'
    });

    const calendarCustomMonthPattern = createCalendarCustomPatternSetting({
        name: strings.settings.items.calendarCustomMonthPattern.name,
        placeholder: DEFAULT_CALENDAR_CUSTOM_MONTH_PATTERN,
        getValue: () => normalizeCalendarCustomFilePattern(plugin.settings.calendarCustomMonthPattern, ''),
        setValue: value => {
            plugin.settings.calendarCustomMonthPattern = normalizeCalendarCustomFilePattern(value, '');
        },
        getTemplatePath: () => plugin.settings.calendarCustomMonthTemplate,
        setTemplatePath: value => {
            plugin.settings.calendarCustomMonthTemplate = value;
        },
        onAfterUpdate: () => renderCalendarCustomPatternPreviews()
    });

    const calendarCustomMonthPatternErrorEl = calendarCustomMonthPattern.descEl.createDiv({
        cls: 'setting-item-description nn-setting-hidden nn-setting-warning'
    });

    const calendarCustomQuarterPattern = createCalendarCustomPatternSetting({
        name: strings.settings.items.calendarCustomQuarterPattern.name,
        placeholder: DEFAULT_CALENDAR_CUSTOM_QUARTER_PATTERN,
        getValue: () => normalizeCalendarCustomFilePattern(plugin.settings.calendarCustomQuarterPattern, ''),
        setValue: value => {
            plugin.settings.calendarCustomQuarterPattern = normalizeCalendarCustomFilePattern(value, '');
        },
        getTemplatePath: () => plugin.settings.calendarCustomQuarterTemplate,
        setTemplatePath: value => {
            plugin.settings.calendarCustomQuarterTemplate = value;
        },
        onAfterUpdate: () => renderCalendarCustomPatternPreviews()
    });

    const calendarCustomQuarterPatternErrorEl = calendarCustomQuarterPattern.descEl.createDiv({
        cls: 'setting-item-description nn-setting-hidden nn-setting-warning'
    });

    const calendarCustomYearPattern = createCalendarCustomPatternSetting({
        name: strings.settings.items.calendarCustomYearPattern.name,
        placeholder: DEFAULT_CALENDAR_CUSTOM_YEAR_PATTERN,
        getValue: () => normalizeCalendarCustomFilePattern(plugin.settings.calendarCustomYearPattern, ''),
        setValue: value => {
            plugin.settings.calendarCustomYearPattern = normalizeCalendarCustomFilePattern(value, '');
        },
        getTemplatePath: () => plugin.settings.calendarCustomYearTemplate,
        setTemplatePath: value => {
            plugin.settings.calendarCustomYearTemplate = value;
        },
        onAfterUpdate: () => renderCalendarCustomPatternPreviews()
    });

    const calendarCustomYearPatternErrorEl = calendarCustomYearPattern.descEl.createDiv({
        cls: 'setting-item-description nn-setting-hidden nn-setting-warning'
    });

    const calendarCustomPatternInfoSetting = new Setting(containerEl).setName('').setDesc('');
    calendarCustomPatternInfoSetting.settingEl.addClass('nn-setting-info-container');
    calendarCustomPatternInfoSetting.settingEl.addClass('nn-setting-info-centered');
    calendarCustomPatternInfoSetting.descEl.empty();
    calendarCustomPatternInfoSetting.descEl.append(
        createInlineExternalLinkText({
            prefix: strings.settings.items.calendarCustomFilePattern.momentDescPrefix,
            link: { text: strings.settings.items.calendarCustomFilePattern.momentLinkText, href: MOMENT_FORMAT_DOCS_URL },
            suffix: strings.settings.items.calendarCustomFilePattern.momentDescSuffix
        })
    );

    const customPatternTargets = [
        calendarCustomFilePattern,
        calendarCustomWeekPattern,
        calendarCustomMonthPattern,
        calendarCustomQuarterPattern,
        calendarCustomYearPattern
    ] as const;

    const renderCalendarTemplateIndicators = (): void => {
        customPatternTargets.forEach(target => {
            const templatePath = target.getTemplatePath();
            const hasTemplate = Boolean(templatePath);
            target.templateButton?.setIcon(hasTemplate ? 'file-x' : 'file-plus');
            if (target.templateButton) {
                target.templateButton.extraSettingsEl.style.color = hasTemplate ? 'var(--text-normal)' : 'var(--text-muted)';
            }

            const templateName = templatePath ? getTemplateFileName(templatePath) : '-';
            target.templateTextEl.setText(strings.settings.items.calendarTemplateFile.current.replace('{name}', templateName));
            setElementVisible(target.templateEl, true);
        });
    };

    const renderCalendarCustomPatternPreviews = (): void => {
        const momentApi = getMomentApi();
        const exampleTemplate = strings.settings.items.calendarCustomFilePattern.example;

        const clearExamples = (): void => {
            customPatternTargets.forEach(target => setExampleText(target, ''));
        };

        if (!momentApi) {
            clearExamples();
            return;
        }

        const { periodicNotesLocale } = resolveSelectedCalendarLocales(momentApi);

        const sampleDate = momentApi('2026-01-19', 'YYYY-MM-DD', true);
        if (!sampleDate.isValid()) {
            clearExamples();
            return;
        }

        const formatExample = (kind: CalendarNoteKind, patternRaw: string, fallback: string): string => {
            const normalized = normalizeCalendarCustomFilePattern(patternRaw, fallback);
            if (!normalized) {
                return '';
            }
            const slashIndex = normalized.lastIndexOf('/');
            const folderPattern = slashIndex === -1 ? '' : normalized.slice(0, slashIndex);
            const filePattern = slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
            const folderFormatter = createCalendarCustomDateFormatter(folderPattern);
            const fileFormatter = createCalendarCustomDateFormatter(filePattern);

            const momentPattern = folderPattern ? `${folderPattern}/${filePattern}` : filePattern;
            const dateForPath = resolveCalendarCustomNotePathDate(
                kind,
                sampleDate,
                momentPattern,
                periodicNotesLocale,
                periodicNotesLocale
            );
            const folderSuffix = folderFormatter(dateForPath);
            const folderPath = normalizeCalendarVaultFolderPath(folderSuffix || '/');
            const folderPathRelative = folderPath === '/' ? '' : folderPath;

            const formattedFilePattern = fileFormatter(dateForPath).trim();
            const fileName = ensureMarkdownFileName(formattedFilePattern);
            if (!fileName) {
                return '';
            }
            return folderPathRelative ? `${folderPathRelative}/${fileName}` : fileName;
        };

        const dailyPatternRaw = getInputValue(calendarCustomFilePattern.inputEl, plugin.settings.calendarCustomFilePattern);
        const dailyExamplePath = formatExample('day', dailyPatternRaw, DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN);
        setExampleText(calendarCustomFilePattern, dailyExamplePath ? exampleTemplate.replace('{path}', dailyExamplePath) : '');

        const weekPatternRaw = getInputValue(calendarCustomWeekPattern.inputEl, plugin.settings.calendarCustomWeekPattern);
        const weekExamplePath = formatExample('week', weekPatternRaw, '');
        setExampleText(calendarCustomWeekPattern, weekExamplePath ? exampleTemplate.replace('{path}', weekExamplePath) : '');

        const monthPatternRaw = getInputValue(calendarCustomMonthPattern.inputEl, plugin.settings.calendarCustomMonthPattern);
        const monthExamplePath = formatExample('month', monthPatternRaw, '');
        setExampleText(calendarCustomMonthPattern, monthExamplePath ? exampleTemplate.replace('{path}', monthExamplePath) : '');

        const quarterPatternRaw = getInputValue(calendarCustomQuarterPattern.inputEl, plugin.settings.calendarCustomQuarterPattern);
        const quarterExamplePath = formatExample('quarter', quarterPatternRaw, '');
        setExampleText(calendarCustomQuarterPattern, quarterExamplePath ? exampleTemplate.replace('{path}', quarterExamplePath) : '');

        const yearPatternRaw = getInputValue(calendarCustomYearPattern.inputEl, plugin.settings.calendarCustomYearPattern);
        const yearExamplePath = formatExample('year', yearPatternRaw, '');
        setExampleText(calendarCustomYearPattern, yearExamplePath ? exampleTemplate.replace('{path}', yearExamplePath) : '');
    };

    const renderCalendarWeekCompatibilityWarnings = (): void => {
        calendarLocaleWarningEl.setText('');
        calendarCustomWeekPatternWarningEl.setText('');
        setElementVisible(calendarLocaleWarningEl, false);
        setElementVisible(calendarCustomWeekPatternWarningEl, false);

        if (plugin.settings.calendarIntegrationMode !== 'notebook-navigator') {
            return;
        }

        const momentApi = getMomentApi();
        if (!momentApi) {
            return;
        }

        const weekPatternRaw = getInputValue(calendarCustomWeekPattern.inputEl, plugin.settings.calendarCustomWeekPattern);
        if (weekPatternRaw.trim() === '') {
            return;
        }

        const weekCustomPattern = buildCustomPattern(weekPatternRaw, '');
        if (!isCalendarCustomWeekPatternValid(weekCustomPattern, momentApi)) {
            return;
        }

        const { calendarRulesLocale, periodicNotesLocale } = resolveSelectedCalendarLocales(momentApi);
        const showWarning = doesCalendarCustomWeekPatternUseDifferentWeekRules(
            weekCustomPattern,
            getLocaleWeekRules(momentApi, calendarRulesLocale),
            getLocaleWeekRules(momentApi, periodicNotesLocale)
        );
        if (!showWarning) {
            return;
        }

        calendarLocaleWarningEl.setText(strings.settings.items.calendarLocale.weekPathMismatchWarning);
        calendarCustomWeekPatternWarningEl.setText(
            doesCalendarCustomWeekPatternMixWeekTokenTypes(weekCustomPattern)
                ? strings.settings.items.calendarCustomWeekPattern.mixedWeekTokensWarning
                : strings.settings.items.calendarCustomWeekPattern.weekPathMismatchWarning
        );
        setElementVisible(calendarLocaleWarningEl, true);
        setElementVisible(calendarCustomWeekPatternWarningEl, true);
    };

    const hideMessages = (): void => {
        setElementVisible(calendarCustomFilePatternErrorEl, false);
        setElementVisible(calendarCustomWeekPatternErrorEl, false);
        setElementVisible(calendarCustomWeekPatternWarningEl, false);
        setElementVisible(calendarCustomMonthPatternErrorEl, false);
        setElementVisible(calendarCustomQuarterPatternErrorEl, false);
        setElementVisible(calendarCustomYearPatternErrorEl, false);
        setElementVisible(calendarLocaleWarningEl, false);
    };

    const refresh = (): void => {
        const activeProfile = getActiveProfile();
        if (calendarCustomRootFolderInputEl && activeDocument.activeElement !== calendarCustomRootFolderInputEl) {
            calendarCustomRootFolderInputEl.value = activeProfile.periodicNotesFolder;
        }

        const momentApi = getMomentApi();

        const dailyPatternRaw = getInputValue(calendarCustomFilePattern.inputEl, plugin.settings.calendarCustomFilePattern);
        const dailyCustomPattern = buildCustomPattern(dailyPatternRaw, DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN);
        const showDailyError = !isCalendarCustomDatePatternValid(dailyCustomPattern, momentApi);
        calendarCustomFilePatternErrorEl.setText(showDailyError ? strings.settings.items.calendarCustomFilePattern.parsingError : '');
        setElementVisible(calendarCustomFilePatternErrorEl, showDailyError);

        const weekPatternRaw = getInputValue(calendarCustomWeekPattern.inputEl, plugin.settings.calendarCustomWeekPattern);
        const weekCustomPattern = buildCustomPattern(weekPatternRaw, '');
        const showWeekError = weekPatternRaw.trim() !== '' && !isCalendarCustomWeekPatternValid(weekCustomPattern, momentApi);
        calendarCustomWeekPatternErrorEl.setText(showWeekError ? strings.settings.items.calendarCustomWeekPattern.parsingError : '');
        setElementVisible(calendarCustomWeekPatternErrorEl, showWeekError);

        const monthPatternRaw = getInputValue(calendarCustomMonthPattern.inputEl, plugin.settings.calendarCustomMonthPattern);
        const monthCustomPattern = buildCustomPattern(monthPatternRaw, '');
        const showMonthError = monthPatternRaw.trim() !== '' && !isCalendarCustomMonthPatternValid(monthCustomPattern, momentApi);
        calendarCustomMonthPatternErrorEl.setText(showMonthError ? strings.settings.items.calendarCustomMonthPattern.parsingError : '');
        setElementVisible(calendarCustomMonthPatternErrorEl, showMonthError);

        const quarterPatternRaw = getInputValue(calendarCustomQuarterPattern.inputEl, plugin.settings.calendarCustomQuarterPattern);
        const quarterCustomPattern = buildCustomPattern(quarterPatternRaw, '');
        const showQuarterError = quarterPatternRaw.trim() !== '' && !isCalendarCustomQuarterPatternValid(quarterCustomPattern, momentApi);
        calendarCustomQuarterPatternErrorEl.setText(
            showQuarterError ? strings.settings.items.calendarCustomQuarterPattern.parsingError : ''
        );
        setElementVisible(calendarCustomQuarterPatternErrorEl, showQuarterError);

        const yearPatternRaw = getInputValue(calendarCustomYearPattern.inputEl, plugin.settings.calendarCustomYearPattern);
        const yearCustomPattern = buildCustomPattern(yearPatternRaw, '');
        const showYearError = yearPatternRaw.trim() !== '' && !isCalendarCustomYearPatternValid(yearCustomPattern, momentApi);
        calendarCustomYearPatternErrorEl.setText(showYearError ? strings.settings.items.calendarCustomYearPattern.parsingError : '');
        setElementVisible(calendarCustomYearPatternErrorEl, showYearError);

        renderCalendarWeekCompatibilityWarnings();
        renderCalendarCustomPatternPreviews();
        renderCalendarTemplateIndicators();
    };

    const previewInputs = [
        calendarCustomFilePattern.inputEl,
        calendarCustomWeekPattern.inputEl,
        calendarCustomMonthPattern.inputEl,
        calendarCustomQuarterPattern.inputEl,
        calendarCustomYearPattern.inputEl
    ];
    previewInputs.forEach(input => {
        input?.addEventListener('input', () => requestVisibilityRefresh());
    });

    return {
        refresh,
        hideMessages
    };
}
