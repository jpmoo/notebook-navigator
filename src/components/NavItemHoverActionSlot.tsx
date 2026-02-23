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

import React, { useCallback, useMemo } from 'react';
import { ObsidianIcon } from './ObsidianIcon';

interface NavItemHoverActionSlotProps {
    label?: string;
    actionLabel: string;
    icon: string;
    onClick: () => void;
}

export function NavItemHoverActionSlot({ label, actionLabel, icon, onClick }: NavItemHoverActionSlotProps) {
    const shouldRenderLabel = useMemo(() => typeof label === 'string' && label.length > 0, [label]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const handleMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const handleClick = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        },
        [onClick]
    );

    return (
        <span className="nn-navitem-hover-action-slot">
            {shouldRenderLabel ? (
                <span className="nn-navitem-count nn-navitem-hover-action-count">{label}</span>
            ) : (
                <span className="nn-navitem-count nn-navitem-hover-action-placeholder" aria-hidden={true} />
            )}
            <button
                type="button"
                className="nn-icon-button nn-navitem-hover-action-button"
                aria-label={actionLabel}
                tabIndex={-1}
                onPointerDown={handlePointerDown}
                onMouseDown={handleMouseDown}
                onClick={handleClick}
            >
                <ObsidianIcon name={icon} aria-hidden={true} />
            </button>
        </span>
    );
}
