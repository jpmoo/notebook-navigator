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

import { useEffect, useMemo, useState } from 'react';
import type { App, TFile } from 'obsidian';
import {
    isExcalidrawSourceFile,
    resolveExcalidrawFeatureImageFile,
    subscribeExcalidrawFeatureImageChange
} from '../utils/excalidrawFeatureImages';
import { useThemeMode } from './useThemeMode';
import { getVersionedResourcePath } from '../utils/resourcePath';

export interface ExcalidrawFeatureImageState {
    isExcalidraw: boolean;
    isMissing: boolean;
    key: string | null;
    url: string | null;
}

export function useExcalidrawFeatureImage(params: {
    app: App;
    file: TFile;
    enabled: boolean;
    isExcalidraw?: boolean;
    metadataVersion: number;
}): ExcalidrawFeatureImageState {
    const { app, file, enabled, isExcalidraw: isExcalidrawOverride, metadataVersion } = params;
    const [changeVersion, setChangeVersion] = useState(0);
    const isExcalidraw = useMemo(() => {
        void metadataVersion;
        if (typeof isExcalidrawOverride === 'boolean') {
            return isExcalidrawOverride;
        }
        return isExcalidrawSourceFile(app, file);
    }, [app, file, isExcalidrawOverride, metadataVersion]);
    const themeMode = useThemeMode(app, enabled && isExcalidraw);

    useEffect(() => {
        if (!enabled || !isExcalidraw) {
            return;
        }

        return subscribeExcalidrawFeatureImageChange(file.path, () => {
            setChangeVersion(version => version + 1);
        });
    }, [enabled, file.path, isExcalidraw]);

    return useMemo(() => {
        if (!enabled || !isExcalidraw) {
            return {
                isExcalidraw,
                isMissing: false,
                key: null,
                url: null
            };
        }

        const companionImage = resolveExcalidrawFeatureImageFile(app, file, themeMode);
        if (!companionImage) {
            return {
                isExcalidraw,
                isMissing: true,
                key: `${file.path}:missing:${themeMode}:${changeVersion}`,
                url: null
            };
        }

        let url: string | null = null;
        try {
            url = getVersionedResourcePath(app, companionImage);
        } catch {
            url = null;
        }

        return {
            isExcalidraw,
            isMissing: url === null,
            key: `${companionImage.path}@${companionImage.stat.mtime}:${themeMode}:${changeVersion}`,
            url
        };
    }, [app, changeVersion, enabled, file, isExcalidraw, themeMode]);
}
