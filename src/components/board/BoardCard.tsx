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

import React, { useEffect, useState } from 'react';
import { type App, TFile } from 'obsidian';
import { getDBInstanceOrNull } from '../../storage/fileOperations';
import { isRasterImageExtension, isSvgExtension } from '../../utils/fileTypeUtils';
import type { BoardCardModel } from '../../utils/boardCards';

interface BoardCardProps {
    app: App;
    card: BoardCardModel;
    collapsed: boolean;
    accentColor?: string;
    backgroundColor?: string;
    onOpen: (path: string) => void;
}

/** Strips a leading YAML frontmatter block so the card body shows note content. */
function stripFrontmatter(content: string): string {
    if (!content.startsWith('---')) {
        return content;
    }
    const end = content.indexOf('\n---', 3);
    if (end === -1) {
        return content;
    }
    const afterClosing = content.indexOf('\n', end + 1);
    return afterClosing === -1 ? '' : content.slice(afterClosing + 1).replace(/^\s+/, '');
}

/**
 * Resolves a full-resolution image URL from a feature-image key when the source is
 * a renderable image (a vault image embed `f:<path>@<mtime>` or an external `e:<url>`).
 * Returns null for sources that have no full-res equivalent (PDF covers, YouTube,
 * drawings), which fall back to the cached thumbnail blob.
 */
function resolveFullResImageUrl(app: App, featureImageKey: string): string | null {
    if (featureImageKey.startsWith('e:')) {
        return featureImageKey.slice(2);
    }
    if (featureImageKey.startsWith('f:')) {
        const atIndex = featureImageKey.lastIndexOf('@');
        const sourcePath = featureImageKey.slice(2, atIndex > 2 ? atIndex : undefined);
        const extension = sourcePath.includes('.') ? sourcePath.slice(sourcePath.lastIndexOf('.') + 1) : '';
        if (isRasterImageExtension(extension) || isSvgExtension(extension)) {
            const source = app.vault.getAbstractFileByPath(sourcePath);
            if (source instanceof TFile) {
                return app.vault.getResourcePath(source);
            }
        }
    }
    return null;
}

/**
 * Presentational board card: title, optional feature image, preview snippet and tag
 * pills, with a folder-color left accent and (when set) the folder's background color.
 * Image embeds and external images are shown at full resolution; only sources without
 * a full-res equivalent fall back to the cached thumbnail blob (resolved into an
 * object URL and revoked on unmount).
 */
export function BoardCard({ app, card, collapsed, accentColor, backgroundColor, onOpen }: BoardCardProps) {
    const { featureImageUrl, featureImageKey, featureImageStatus } = card;
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
    // Expanded cards show the full note body; loaded lazily and cached so toggling is instant.
    const [fullText, setFullText] = useState<string | null>(null);

    useEffect(() => {
        if (collapsed || fullText !== null) {
            return;
        }
        const file = app.vault.getAbstractFileByPath(card.path);
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return;
        }
        let active = true;
        void app.vault.cachedRead(file).then(content => {
            if (active) {
                setFullText(stripFrontmatter(content));
            }
        });
        return () => {
            active = false;
        };
    }, [app, card.path, collapsed, fullText]);

    const bodyText = !collapsed && fullText !== null ? fullText : card.previewText;

    useEffect(() => {
        // 1. Direct raster image notes already carry a full-resolution resource URL.
        if (featureImageUrl) {
            setResolvedUrl(featureImageUrl);
            return;
        }
        if (featureImageStatus !== 'has' || !featureImageKey) {
            setResolvedUrl(null);
            return;
        }

        // 2. Prefer the full-resolution source for image embeds / external images.
        const fullRes = resolveFullResImageUrl(app, featureImageKey);
        if (fullRes) {
            setResolvedUrl(fullRes);
            return;
        }

        // 3. Fall back to the cached thumbnail blob (PDF covers, YouTube, drawings).
        const db = getDBInstanceOrNull();
        if (!db) {
            setResolvedUrl(null);
            return;
        }

        let active = true;
        let createdUrl: string | null = null;
        void db.getFeatureImageBlob(card.path, featureImageKey).then(blob => {
            if (!active || !blob) {
                return;
            }
            createdUrl = URL.createObjectURL(blob);
            setResolvedUrl(createdUrl);
        });

        return () => {
            active = false;
            if (createdUrl) {
                URL.revokeObjectURL(createdUrl);
            }
        };
    }, [app, card.path, featureImageUrl, featureImageKey, featureImageStatus]);

    const cardStyle: React.CSSProperties = {};
    if (accentColor) {
        (cardStyle as Record<string, string>)['--nn-board-accent'] = accentColor;
    }
    if (backgroundColor) {
        cardStyle.background = backgroundColor;
    }

    return (
        <div
            className="nn-board-card"
            style={cardStyle}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(card.path)}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen(card.path);
                }
            }}
        >
            {resolvedUrl ? (
                <div className="nn-board-card-image">
                    <img src={resolvedUrl} alt="" loading="lazy" />
                </div>
            ) : null}
            <div className="nn-board-card-title">{card.title}</div>
            {bodyText ? <div className="nn-board-card-preview">{bodyText}</div> : null}
            {card.tags.length > 0 ? (
                <div className="nn-board-card-tags">
                    {card.tags.map(tag => (
                        <span key={tag} className="nn-board-tag">
                            {tag.startsWith('#') ? tag : `#${tag}`}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
