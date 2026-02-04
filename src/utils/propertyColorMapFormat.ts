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

import { casefold } from './recordUtils';

/** Normalizes a property color map key by trimming, unquoting, and converting to lowercase */
export function normalizePropertyColorMapKey(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        return '';
    }

    const unquoted = tryUnquoteQuotedText(trimmed);
    return casefold(unquoted ?? trimmed);
}

interface NormalizedPropertyColorMapEntry {
    key: string;
    color: string;
}

export interface PropertyColorMapParseResult {
    map: Record<string, string>;
    invalidLines: string[];
}

export function normalizePropertyColorMapEntry(
    key: string,
    color: string,
    normalizeKey: (input: string) => string
): NormalizedPropertyColorMapEntry | null {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
        return null;
    }

    const trimmedColor = color.trim();
    if (!trimmedColor) {
        return null;
    }

    return { key: normalizedKey, color: trimmedColor };
}

export function normalizePropertyColorMapRecord(
    record: Record<string, string>,
    normalizeKey: (input: string) => string
): Record<string, string> {
    const normalized = Object.create(null) as Record<string, string>;

    Object.entries(record).forEach(([key, value]) => {
        if (typeof value !== 'string') {
            return;
        }

        const normalizedEntry = normalizePropertyColorMapEntry(key, value, normalizeKey);
        if (!normalizedEntry) {
            return;
        }

        normalized[normalizedEntry.key] = normalizedEntry.color;
    });

    return normalized;
}

export function serializePropertyColorMapRecord(map: Record<string, string>): string {
    const entries = Object.entries(map)
        .filter(([key, color]) => Boolean(key) && Boolean(color))
        .sort(([a], [b]) => a.localeCompare(b));

    return entries
        .map(([key, color]) => {
            const serializedKey = shouldQuotePropertyColorMapKey(key) ? `'${escapeSingleQuotedText(key)}'` : key;
            return `${serializedKey}=${color}`;
        })
        .join('\n');
}

export function parsePropertyColorMapText(value: string, normalizeKey: (input: string) => string): PropertyColorMapParseResult {
    const map = Object.create(null) as Record<string, string>;
    const invalidLines: string[] = [];

    const lines = value.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const splitIndex = findPropertyColorMapSeparatorIndex(trimmed);
        if (splitIndex === -1) {
            invalidLines.push(trimmed);
            continue;
        }

        const rawKey = trimmed.substring(0, splitIndex).trim();
        const rawColor = trimmed.substring(splitIndex + 1).trim();

        const normalizedEntry = normalizePropertyColorMapEntry(rawKey, rawColor, normalizeKey);
        if (!normalizedEntry) {
            invalidLines.push(trimmed);
            continue;
        }

        map[normalizedEntry.key] = normalizedEntry.color;
    }

    return { map, invalidLines };
}

/** Returns true if the key needs to be wrapped in single quotes for serialization */
function shouldQuotePropertyColorMapKey(key: string): boolean {
    return /\s/.test(key) || key.startsWith('#');
}

/** Escapes backslashes and single quotes for embedding in a single-quoted string */
function escapeSingleQuotedText(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function tryUnquoteQuotedText(value: string): string | null {
    if (value.length < 2) {
        return null;
    }

    const quote = value[0];
    if (quote !== "'" && quote !== '"') {
        return null;
    }

    if (value[value.length - 1] !== quote) {
        return null;
    }

    return unescapeQuotedText(value.slice(1, -1), quote);
}

function unescapeQuotedText(value: string, quote: "'" | '"'): string {
    let result = '';
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '\\' && i + 1 < value.length) {
            const next = value[i + 1];
            if (next === quote || next === '\\') {
                result += next;
                i += 1;
                continue;
            }
        }
        result += ch;
    }
    return result;
}

function findPropertyColorMapSeparatorIndex(value: string): number {
    let firstColonIndex = -1;
    let activeQuote: "'" | '"' | null = null;

    for (let i = 0; i < value.length; i++) {
        const ch = value[i];

        if (activeQuote) {
            if (ch === '\\') {
                i += 1;
                continue;
            }

            if (ch === activeQuote) {
                activeQuote = null;
            }
            continue;
        }

        if (ch === "'" || ch === '"') {
            activeQuote = ch;
            continue;
        }

        if (ch === '=') {
            return i;
        }

        if (ch === ':' && firstColonIndex === -1) {
            firstColonIndex = i;
        }
    }

    return firstColonIndex;
}
