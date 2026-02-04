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

import type { Day, FirstWeekContainsDate, Locale } from 'date-fns';
import * as locales from 'date-fns/locale';

type LocalesMap = typeof locales & Record<string, Locale>;

const localeCache = new Map<string, Locale>();

function normalizeLanguageCode(language: string): string {
    // Accept Obsidian/moment style ids (may include `_`) and normalize to lowercase `xx` / `xx-yy`.
    return (language || 'en').replace(/_/g, '-').toLowerCase();
}

function toTitleCase(value: string): string {
    if (!value) {
        return '';
    }
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function toDateFnsLocaleKey(normalizedLanguage: string): string | null {
    const parts = normalizedLanguage.split('-').filter(Boolean);
    if (parts.length === 0) {
        return null;
    }
    if (parts.length === 1) {
        return parts[0] ?? null;
    }

    const [language, ...rest] = parts;
    const suffix = rest
        .map(part => {
            // Region subtags: `en-au` -> `enAU`, `ar-dz` -> `arDZ`
            if (/^[a-z]{2}$/u.test(part)) {
                return part.toUpperCase();
            }
            // Numeric region: `es-419` -> `es419`
            if (/^[0-9]{3}$/u.test(part)) {
                return part;
            }
            // Script/variants: `sr-latn` -> `srLatn`, `be-tarask` -> `beTarask`, `ja-hira` -> `jaHira`
            return toTitleCase(part);
        })
        .join('');

    return `${language}${suffix}`;
}

const LOCALE_EXCEPTIONS: Record<string, string> = {
    // date-fns locale module names don't always match BCP-47 language tags.
    // Keep this list focused to the cases where the export key differs from the normalized tag.
    en: 'enUS',
    'en-us': 'enUS',
    'en-gb': 'enGB',
    zh: 'zhCN',
    'zh-cn': 'zhCN',
    'zh-tw': 'zhTW',
    pt: 'pt',
    'pt-br': 'ptBR',
    no: 'nb'
};

export function getDateFnsLocale(language: string): Locale {
    // Calendar and date formatting use date-fns Locale objects; fall back to enUS if the locale isn't available.
    const normalized = normalizeLanguageCode(language);
    const cached = localeCache.get(normalized);
    if (cached) {
        return cached;
    }
    const localesMap = locales as LocalesMap;

    const candidates = new Set<string>();
    const addCandidate = (candidate: string | null) => {
        if (!candidate) {
            return;
        }
        candidates.add(candidate);
    };

    addCandidate(LOCALE_EXCEPTIONS[normalized] ?? normalized);
    addCandidate(toDateFnsLocaleKey(normalized));

    const baseLanguage = normalized.split('-')[0] ?? '';
    if (baseLanguage && baseLanguage !== normalized) {
        addCandidate(LOCALE_EXCEPTIONS[baseLanguage] ?? baseLanguage);
        addCandidate(toDateFnsLocaleKey(baseLanguage));
    }

    for (const candidate of candidates) {
        if (!Object.prototype.hasOwnProperty.call(localesMap, candidate)) {
            continue;
        }
        const locale = localesMap[candidate];
        if (locale) {
            localeCache.set(normalized, locale);
            return locale;
        }
    }

    localeCache.set(normalized, locales.enUS);
    return locales.enUS;
}

export interface CalendarWeekConfig {
    weekStartsOn: Day;
    firstWeekContainsDate: FirstWeekContainsDate;
}

function toDay(value: unknown, fallback: Day): Day {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6 ? (value as Day) : fallback;
}

function toFirstWeekContainsDate(value: unknown, fallback: FirstWeekContainsDate): FirstWeekContainsDate {
    return value === 1 || value === 4 ? value : fallback;
}

export function getCalendarWeekConfig(language: string): CalendarWeekConfig {
    const locale = getDateFnsLocale(language);
    const options = locale.options ?? {};

    return {
        weekStartsOn: toDay(options.weekStartsOn, 1),
        firstWeekContainsDate: toFirstWeekContainsDate(options.firstWeekContainsDate, 4)
    };
}
