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

import { mergeRanges, NumericRange } from './arrayUtils';

/**
 * Utilities for locating code ranges in Markdown-like text.
 *
 * These helpers intentionally avoid a full markdown parser. They scan raw text and return character
 * ranges so callers can:
 * - skip fenced code blocks when generating previews
 * - preserve inline code spans while stripping markdown formatting
 *
 * The returned ranges use `[start, end)` indexing (end is exclusive).
 */

/**
 * Counts `>` characters in a prefix that contains only blockquote markers and whitespace.
 *
 * This is used for fences inside blockquotes so a fence opened under a certain quote depth must be
 * closed at the same depth.
 */
function countBlockquoteDepth(prefix: string): number {
    if (!prefix.includes('>')) {
        return 0;
    }
    return (prefix.match(/>/g) ?? []).length;
}

type FencedSegmentKind = 'text' | 'fenced';

interface FencedSegment {
    kind: FencedSegmentKind;
    start: number;
    end: number;
}

const REGEX_FENCE_OPEN_LINE = /^(\s*)((?:>\s*)*)\s*([`~]{3,}).*$/u;
const REGEX_FENCE_CLOSE_LINE = /^(\s*)((?:>\s*)*)\s*([`~]{3,})\s*$/u;

function scanFencedCodeSegments(
    content: string,
    onSegment: (segment: FencedSegment) => boolean | void,
    options?: { emitText?: boolean }
): void {
    const emitText = options?.emitText ?? false;
    let index = 0;
    let inFence = false;
    let fenceStart = 0;
    let fenceChar: string | null = null;
    let fenceLength = 0;
    let fenceDepth = 0;

    while (index < content.length) {
        const lineEnd = content.indexOf('\n', index);
        const line = lineEnd === -1 ? content.slice(index) : content.slice(index, lineEnd);
        const segmentEnd = lineEnd === -1 ? content.length : lineEnd + 1;
        const match = inFence ? line.match(REGEX_FENCE_CLOSE_LINE) : line.match(REGEX_FENCE_OPEN_LINE);

        if (!inFence) {
            if (match && match[3]) {
                inFence = true;
                fenceStart = index;
                fenceChar = match[3][0] ?? null;
                fenceLength = match[3].length;
                fenceDepth = countBlockquoteDepth(match[2] ?? '');
            } else if (emitText) {
                const keepGoing = onSegment({ kind: 'text', start: index, end: segmentEnd });
                if (keepGoing === false) {
                    return;
                }
            }
        } else if (match && match[3]) {
            const currentDepth = countBlockquoteDepth(match[2] ?? '');
            const matchChar = match[3][0] ?? null;
            if (currentDepth === fenceDepth && matchChar === fenceChar && match[3].length >= fenceLength) {
                const keepGoing = onSegment({ kind: 'fenced', start: fenceStart, end: segmentEnd });
                if (keepGoing === false) {
                    return;
                }

                inFence = false;
                fenceChar = null;
                fenceLength = 0;
                fenceDepth = 0;
            }
        }

        if (lineEnd === -1) {
            break;
        }
        index = lineEnd + 1;
    }

    if (inFence && fenceStart < content.length) {
        onSegment({ kind: 'fenced', start: fenceStart, end: content.length });
    }
}

/**
 * Finds fenced code block ranges (```...``` or ~~~...~~~) in the provided content.
 *
 * Behavior:
 * - Recognizes fences at the start of a line, allowing optional leading whitespace.
 * - Recognizes fences inside blockquotes, allowing any number of `>` markers before the fence.
 * - Closing fences must use the same fence character (` or ~) and be at least as long as the opener.
 * - Closing fences may contain trailing whitespace but no other characters.
 * - Closing fences must appear at the same blockquote depth as the opener.
 * - If an opening fence is never closed, the range runs to the end of the string.
 *
 * Known limitations:
 * - The scan is line-based and does not attempt to validate markdown indentation rules.
 * - Only fenced blocks are detected (no indented code blocks).
 */
export function findFencedCodeBlockRanges(content: string): NumericRange[] {
    const ranges: NumericRange[] = [];
    scanFencedCodeSegments(
        content,
        segment => {
            if (segment.kind !== 'fenced') {
                return;
            }
            ranges.push({
                start: segment.start,
                end: segment.end
            });
        },
        { emitText: false }
    );

    return ranges;
}

/**
 * Collects the first `maxVisibleLength` characters while skipping fenced code blocks.
 *
 * Intended for preview extraction when code blocks are skipped, so very large fences do not dominate
 * the preview window.
 */
export function collectVisibleTextSkippingFencedCodeBlocks(content: string, maxVisibleLength: number, maxScanLength?: number): string {
    if (maxVisibleLength <= 0 || content.length === 0) {
        return '';
    }

    const scanSource = maxScanLength && content.length > maxScanLength ? content.slice(0, maxScanLength) : content;
    if (!scanSource.includes('```') && !scanSource.includes('~~~')) {
        return scanSource.length > maxVisibleLength ? scanSource.slice(0, maxVisibleLength) : scanSource;
    }

    let output = '';

    scanFencedCodeSegments(
        scanSource,
        segment => {
            if (output.length >= maxVisibleLength) {
                return false;
            }

            if (segment.kind === 'text') {
                const remaining = maxVisibleLength - output.length;
                const segmentLength = segment.end - segment.start;
                if (segmentLength <= remaining) {
                    output += scanSource.slice(segment.start, segment.end);
                    return;
                }

                output += scanSource.slice(segment.start, segment.start + remaining);
                return false;
            }

            const needsLeadingSpace = output.length > 0 && !/\s$/.test(output);
            const nextChar = scanSource[segment.end] ?? '';
            const needsTrailingSpace = nextChar !== '' && !/\s/.test(nextChar);
            if (needsLeadingSpace && needsTrailingSpace && output.length < maxVisibleLength) {
                output += ' ';
            }

            return;
        },
        { emitText: true }
    );

    return output;
}

/**
 * Finds the range containing the provided index within sorted ranges.
 *
 * Expects `ranges` to be sorted by start and non-overlapping. Returns null when the index is not
 * contained in any range.
 */
export function findRangeContainingIndex(index: number, ranges: readonly NumericRange[]): NumericRange | null {
    let left = 0;
    let right = ranges.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const range = ranges[mid];
        if (index < range.start) {
            right = mid - 1;
        } else if (index >= range.end) {
            left = mid + 1;
        } else {
            return range;
        }
    }

    return null;
}

/**
 * Locates the closing backtick sequence matching the opener's length, skipping excluded ranges.
 *
 * This is used to find inline code spans like:
 * - `code`
 * - ``code with ` inside``
 *
 * Behavior:
 * - The closing run must be exactly `tickCount` long.
 * - Any backticks that fall inside `excluded` ranges are ignored.
 * - Returns -1 when no valid closing run is found.
 */
function findClosingBacktick(content: string, startIndex: number, tickCount: number, excluded: readonly NumericRange[]): number {
    let searchIndex = startIndex;

    while (searchIndex < content.length) {
        const nextBacktick = content.indexOf('`', searchIndex);
        if (nextBacktick === -1) {
            return -1;
        }

        const containing = findRangeContainingIndex(nextBacktick, excluded);
        if (containing) {
            searchIndex = containing.end;
            continue;
        }

        let runLength = 1;
        while (nextBacktick + runLength < content.length && content[nextBacktick + runLength] === '`') {
            runLength += 1;
        }

        if (runLength === tickCount) {
            return nextBacktick;
        }

        searchIndex = nextBacktick + runLength;
    }

    return -1;
}

/**
 * Finds inline code ranges, respecting backtick sequence lengths and excluding nested ranges.
 *
 * Typical usage is to pass fenced code block ranges as `excluded` so backticks inside fenced code
 * blocks are not considered inline code delimiters.
 *
 * Behavior:
 * - Scans for runs of backticks and looks for a closing run of the same length.
 * - Unclosed openers are ignored.
 * - Returned ranges are merged and sorted.
 */
export function findInlineCodeRanges(content: string, excluded: readonly NumericRange[] = []): NumericRange[] {
    const ranges: NumericRange[] = [];
    const mergedExcluded = mergeRanges([...excluded]);
    let searchIndex = 0;

    while (searchIndex < content.length) {
        const nextBacktick = content.indexOf('`', searchIndex);
        if (nextBacktick === -1) {
            break;
        }

        const containing = findRangeContainingIndex(nextBacktick, mergedExcluded);
        if (containing) {
            searchIndex = containing.end;
            continue;
        }

        let tickCount = 1;
        while (nextBacktick + tickCount < content.length && content[nextBacktick + tickCount] === '`') {
            tickCount += 1;
        }

        const closingIndex = findClosingBacktick(content, nextBacktick + tickCount, tickCount, mergedExcluded);
        if (closingIndex === -1) {
            searchIndex = nextBacktick + tickCount;
            continue;
        }

        const rangeEnd = closingIndex + tickCount;
        ranges.push({
            start: nextBacktick,
            end: rangeEnd
        });
        searchIndex = rangeEnd;
    }

    return mergeRanges(ranges);
}

/** Returns true if the index falls within any of the provided ranges */
export function isIndexInRanges(index: number, ranges: readonly NumericRange[]): boolean {
    return findRangeContainingIndex(index, ranges) !== null;
}
