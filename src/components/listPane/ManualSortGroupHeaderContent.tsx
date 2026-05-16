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

import type { CSSProperties } from 'react';
import type { ManualSortGroupHeaderData } from '../../utils/manualSort';
import { shouldShowManualSortGroupHeaderWordCount } from '../../utils/manualSort';
import { ServiceIcon } from '../ServiceIcon';

type ManualSortGroupHeaderStyle = CSSProperties & {
    '--nn-manual-sort-group-header-accent'?: string;
    '--nn-manual-sort-group-header-progress'?: string;
};

interface ManualSortGroupHeaderContentProps {
    header: ManualSortGroupHeaderData;
    wordCount: number;
}

interface ManualSortGroupHeaderRenderData {
    countText: string;
    progressPercent: number | null;
    progressWidth: number | null;
    style: ManualSortGroupHeaderStyle;
}

function getProgressPercent(wordCount: number, targetWordCount: number | null): number | null {
    if (targetWordCount === null || targetWordCount <= 0) {
        return null;
    }

    const percent = Math.round((Math.max(0, Math.trunc(wordCount)) / targetWordCount) * 100);
    return Number.isFinite(percent) ? percent : 0;
}

function getManualSortGroupHeaderRenderData(header: ManualSortGroupHeaderData, wordCount: number): ManualSortGroupHeaderRenderData {
    const shouldShowWordCount = shouldShowManualSortGroupHeaderWordCount(header);
    const targetWordCount = shouldShowWordCount ? header.targetWordCount : null;
    const progressPercent = getProgressPercent(wordCount, targetWordCount);
    const progressWidth = progressPercent === null ? null : Math.min(100, Math.max(0, progressPercent));
    const formattedWordCount = Math.max(0, Math.trunc(wordCount)).toLocaleString();
    const countText = targetWordCount !== null ? `${formattedWordCount} / ${targetWordCount.toLocaleString()}` : formattedWordCount;
    const style: ManualSortGroupHeaderStyle = {};

    if (header.color) {
        style['--nn-manual-sort-group-header-accent'] = header.color;
    }
    if (progressWidth !== null) {
        style['--nn-manual-sort-group-header-progress'] = `${progressWidth}%`;
    }

    return {
        countText,
        progressPercent,
        progressWidth,
        style
    };
}

export function ManualSortGroupHeaderContent({ header, wordCount }: ManualSortGroupHeaderContentProps) {
    const shouldShowWordCount = shouldShowManualSortGroupHeaderWordCount(header);
    const { countText, progressPercent, style } = getManualSortGroupHeaderRenderData(header, wordCount);

    return (
        <div className="nn-manual-sort-group-header-content" style={style}>
            {header.iconId ? (
                <ServiceIcon iconId={header.iconId} className="nn-manual-sort-group-header-custom-icon" aria-hidden={true} />
            ) : null}
            <span className="nn-manual-sort-group-header-title">{header.title}</span>
            {shouldShowWordCount ? <span className="nn-manual-sort-group-header-count">({countText})</span> : null}
            {progressPercent !== null ? <span className="nn-manual-sort-group-header-percent">{progressPercent}%</span> : null}
        </div>
    );
}

export function ManualSortGroupHeaderProgress({ header, wordCount }: ManualSortGroupHeaderContentProps) {
    const { progressWidth, style } = getManualSortGroupHeaderRenderData(header, wordCount);

    if (progressWidth === null) {
        return null;
    }

    return (
        <div className="nn-manual-sort-group-header-progress-row" style={style} aria-hidden={true}>
            <div className="nn-manual-sort-group-header-progress">
                <div className="nn-manual-sort-group-header-progress-fill" />
            </div>
        </div>
    );
}
