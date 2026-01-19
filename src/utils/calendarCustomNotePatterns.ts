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

import { normalizePath } from 'obsidian';

export const DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN = 'YYYY/YYYYMMDD';

const CALENDAR_CUSTOM_SUPPORTED_DATE_TOKENS = ['YYYY', 'YY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D'] as const;
const CALENDAR_CUSTOM_ALLOWED_DATE_TOKENS = ['YYYY', 'MM', 'DD', 'M', 'D'] as const;

/** Appends .md extension to file name if not already present */
export function ensureMarkdownFileName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    return /\.md$/iu.test(trimmed) ? trimmed : `${trimmed}.md`;
}

/** Normalizes and sanitizes calendar root folder path, stripping leading/trailing slashes */
export function normalizeCalendarCustomRootFolder(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return '';
    }
    const normalized = normalizePath(trimmed);
    if (!normalized || normalized === '/' || normalized === '.') {
        return '';
    }
    return normalized.replace(/^\/+/u, '').replace(/\/+$/u, '');
}

/** Normalizes file pattern, ensuring .md extension and returning default if invalid */
export function normalizeCalendarCustomFilePattern(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN;
    }

    const normalized = normalizePath(trimmed)
        .replace(/ ?\{title\}/gu, '')
        .replace(/\.md$/iu, '');
    if (!normalized || normalized === '/' || normalized === '.') {
        return DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN;
    }

    const normalizedWithoutLeadingSlashes = normalized.replace(/^\/+/u, '');
    const slashIndex = normalizedWithoutLeadingSlashes.lastIndexOf('/');

    if (slashIndex === -1) {
        const fileName = normalizedWithoutLeadingSlashes.trim();
        return fileName || DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN;
    }

    const folderPart = normalizedWithoutLeadingSlashes.slice(0, slashIndex);
    const filePart = normalizedWithoutLeadingSlashes.slice(slashIndex + 1);
    const filePartTrimmed = filePart.trim();
    if (!filePartTrimmed) {
        return DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN;
    }

    return folderPart ? `${folderPart}/${filePartTrimmed}` : filePartTrimmed;
}

/** Splits file pattern into folder and file components based on last slash */
export function splitCalendarCustomPattern(value: string): { folderPattern: string; filePattern: string } {
    const normalized = normalizeCalendarCustomFilePattern(value);
    const slashIndex = normalized.lastIndexOf('/');
    if (slashIndex === -1) {
        return { folderPattern: '', filePattern: normalized };
    }
    return {
        folderPattern: normalized.slice(0, slashIndex),
        filePattern: normalized.slice(slashIndex + 1)
    };
}

/** Normalizes folder path for vault operations, returning '/' for root */
export function normalizeCalendarVaultFolderPath(value: string): string {
    const normalized = normalizePath(value);
    if (!normalized || normalized === '.' || normalized === '/') {
        return '/';
    }
    return normalized.replace(/^\/+/u, '');
}

/**
 * Returns true when a custom calendar pattern (folder + filename, without extension) can be parsed as a full date
 * (year, month, day) using supported tokens.
 */
export function isCalendarCustomDatePatternValid(pattern: string): boolean {
    const normalized = pattern
        .trim()
        .replace(/\.md$/iu, '')
        .replace(/ ?\{title\}/gu, '');
    if (!normalized || normalized === '/' || normalized === '.') {
        return false;
    }

    let hasYear = false;
    let hasMonth = false;
    let hasDay = false;

    for (let index = 0; index < normalized.length; ) {
        const remaining = normalized.slice(index);
        const token = CALENDAR_CUSTOM_SUPPORTED_DATE_TOKENS.find(entry => remaining.startsWith(entry));
        if (!token) {
            index += 1;
            continue;
        }

        if (token === 'MMMM' || token === 'MMM' || token === 'YY') {
            return false;
        }

        if (token === 'YYYY') {
            hasYear = true;
            index += token.length;
            continue;
        }

        if (token === 'MM' || token === 'M') {
            hasMonth = true;
            index += token.length;
            continue;
        }

        if (token === 'DD' || token === 'D') {
            hasDay = true;
            index += token.length;
            continue;
        }
    }

    return hasYear && hasMonth && hasDay;
}

export interface CalendarCustomParsedNotePath {
    iso: string;
    title: string;
}

interface MomentFormatLike {
    format: (format?: string) => string;
}

interface MomentParseResult {
    isValid: () => boolean;
    format: (format?: string) => string;
}

interface MomentParseApi {
    (input?: string, format?: string, strict?: boolean): MomentParseResult;
}

function buildCalendarCustomMomentFormat(pattern: string): string {
    if (!pattern) {
        return '';
    }

    let result = '';
    let literalBuffer = '';

    for (let index = 0; index < pattern.length; ) {
        const remaining = pattern.slice(index);
        const token = CALENDAR_CUSTOM_ALLOWED_DATE_TOKENS.find(entry => remaining.startsWith(entry));
        if (token) {
            if (literalBuffer) {
                result += `[${literalBuffer}]`;
                literalBuffer = '';
            }

            result += token;
            index += token.length;
            continue;
        }

        const char = pattern[index] ?? '';
        if (char === ']') {
            if (literalBuffer) {
                result += `[${literalBuffer}]`;
                literalBuffer = '';
            }
            result += char;
            index += 1;
            continue;
        }

        literalBuffer += char;
        index += 1;
    }

    if (literalBuffer) {
        result += `[${literalBuffer}]`;
    }

    return result;
}

export function createCalendarCustomDateFormatter(pattern: string): (date: MomentFormatLike) => string {
    const normalized = pattern
        .trim()
        .replace(/\.md$/iu, '')
        .replace(/ ?\{title\}/gu, '');
    if (!normalized) {
        return () => '';
    }

    const format = buildCalendarCustomMomentFormat(normalized);
    if (!format) {
        return () => '';
    }

    return (date: MomentFormatLike) => date.format(format);
}

function stripMarkdownExtension(value: string): string | null {
    return /\.md$/iu.test(value) ? value.replace(/\.md$/iu, '') : null;
}

function tryParseCalendarCustomMoment(momentApi: MomentParseApi, input: string, format: string): string | null {
    const parsed = momentApi(input, format, true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

/**
 * Creates a parser for calendar note paths (relative to the configured root folder) that extracts ISO dates and
 * optional title suffixes.
 */
export function createCalendarCustomNotePathParser(
    momentApi: MomentParseApi,
    datePattern: string
): ((relativePath: string) => CalendarCustomParsedNotePath | null) | null {
    const trimmedPattern = datePattern
        .trim()
        .replace(/\.md$/iu, '')
        .replace(/ ?\{title\}/gu, '');
    if (!trimmedPattern || !isCalendarCustomDatePatternValid(trimmedPattern)) {
        return null;
    }

    const format = buildCalendarCustomMomentFormat(trimmedPattern);
    if (!format) {
        return null;
    }

    return (relativePath: string): CalendarCustomParsedNotePath | null => {
        const withoutExt = stripMarkdownExtension(relativePath);
        if (!withoutExt) {
            return null;
        }

        const directIso = tryParseCalendarCustomMoment(momentApi, withoutExt, format);
        if (directIso) {
            return { iso: directIso, title: '' };
        }

        const slashIndex = withoutExt.lastIndexOf('/');
        const folderPrefix = slashIndex === -1 ? '' : withoutExt.slice(0, slashIndex + 1);
        const filePart = slashIndex === -1 ? withoutExt : withoutExt.slice(slashIndex + 1);

        const whitespacePattern = /[ \t]+/gu;
        const matches = [...filePart.matchAll(whitespacePattern)];
        for (let index = matches.length - 1; index >= 0; index--) {
            const match = matches[index];
            const start = match.index;
            if (start === undefined) {
                continue;
            }

            const title = filePart.slice(start + match[0].length).trim();
            if (!title) {
                continue;
            }

            const candidateFile = filePart.slice(0, start);
            if (!candidateFile) {
                continue;
            }

            const candidatePath = `${folderPrefix}${candidateFile}`;
            const iso = tryParseCalendarCustomMoment(momentApi, candidatePath, format);
            if (!iso) {
                continue;
            }

            return { iso, title };
        }

        return null;
    };
}
