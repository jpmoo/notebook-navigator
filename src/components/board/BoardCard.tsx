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
import { getDBInstanceOrNull } from '../../storage/fileOperations';
import type { BoardCardModel } from '../../utils/boardCards';

interface BoardCardProps {
    card: BoardCardModel;
    accentColor?: string;
    onOpen: (path: string) => void;
}

/**
 * Presentational board card: title, optional feature image, preview snippet and tag
 * pills, with a folder-color left accent. Feature images that are stored as cached
 * blobs (non-raster sources) are resolved lazily into object URLs and revoked on
 * unmount; raster files already arrive with a ready-to-use resource URL.
 */
export function BoardCard({ card, accentColor, onOpen }: BoardCardProps) {
    const { featureImageUrl, featureImageKey, featureImageStatus } = card;
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        // Direct (raster) images already carry a usable URL; nothing to resolve.
        if (featureImageUrl || featureImageStatus !== 'has' || !featureImageKey) {
            setBlobUrl(null);
            return;
        }

        const db = getDBInstanceOrNull();
        if (!db) {
            return;
        }

        let active = true;
        let createdUrl: string | null = null;
        void db.getFeatureImageBlob(card.path, featureImageKey).then(blob => {
            if (!active || !blob) {
                return;
            }
            createdUrl = URL.createObjectURL(blob);
            setBlobUrl(createdUrl);
        });

        return () => {
            active = false;
            if (createdUrl) {
                URL.revokeObjectURL(createdUrl);
            }
        };
    }, [card.path, featureImageUrl, featureImageKey, featureImageStatus]);

    const imageUrl = featureImageUrl ?? blobUrl;
    const accentStyle = accentColor ? ({ '--nn-board-accent': accentColor } as React.CSSProperties) : undefined;

    return (
        <div
            className="nn-board-card"
            style={accentStyle}
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
            {imageUrl ? (
                <div className="nn-board-card-image">
                    <img src={imageUrl} alt="" loading="lazy" />
                </div>
            ) : null}
            <div className="nn-board-card-title">{card.title}</div>
            {card.previewText ? <div className="nn-board-card-preview">{card.previewText}</div> : null}
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
