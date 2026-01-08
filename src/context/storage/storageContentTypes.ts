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

import { NotebookNavigatorSettings } from '../../settings';
import type { ContentProviderType, FileContentType } from '../../interfaces/IContentProvider';
import { isCustomPropertyEnabled } from '../../utils/customPropertyUtils';
import { getActiveHiddenFiles } from '../../utils/vaultProfiles';

/**
 * Returns provider types that require Obsidian's metadata cache to be ready.
 */
export function getMetadataDependentTypes(settings: NotebookNavigatorSettings): ContentProviderType[] {
    const types: ContentProviderType[] = [];
    const customPropertyEnabled = isCustomPropertyEnabled(settings);

    if (settings.showFilePreview || settings.showFeatureImage || customPropertyEnabled) {
        types.push('markdownPipeline');
    }
    if (settings.showTags) {
        types.push('tags');
    }

    const hiddenFiles = getActiveHiddenFiles(settings);
    if (settings.useFrontmatterMetadata || hiddenFiles.length > 0) {
        types.push('metadata');
    }

    return types;
}

/**
 * Returns content types expected to be rebuilt during a full cache rebuild.
 */
export function getCacheRebuildProgressTypes(settings: NotebookNavigatorSettings): FileContentType[] {
    const types = new Set<FileContentType>();

    if (settings.showFilePreview) {
        types.add('preview');
    }
    if (settings.showFeatureImage) {
        types.add('featureImage');
    }

    const customPropertyEnabled = isCustomPropertyEnabled(settings);
    if (customPropertyEnabled) {
        types.add('customProperty');
    }

    for (const providerType of getMetadataDependentTypes(settings)) {
        if (providerType === 'tags' || providerType === 'metadata') {
            types.add(providerType);
        }
    }

    return Array.from(types);
}

/**
 * Filters provider types to those currently enabled in settings.
 */
export function resolveMetadataDependentTypes(
    settings: NotebookNavigatorSettings,
    requested?: ContentProviderType[]
): ContentProviderType[] {
    const baseTypes = requested ?? getMetadataDependentTypes(settings);
    const customPropertyEnabled = isCustomPropertyEnabled(settings);

    return baseTypes.filter(type => {
        if (type === 'markdownPipeline') {
            return settings.showFilePreview || settings.showFeatureImage || customPropertyEnabled;
        }
        if (type === 'tags') {
            return settings.showTags;
        }
        if (type === 'metadata') {
            return settings.useFrontmatterMetadata || getActiveHiddenFiles(settings).length > 0;
        }
        return false;
    });
}

/**
 * Compares two string arrays for deep equality, handling null/undefined cases.
 */
export function haveStringArraysChanged(prev?: string[] | null, next?: string[] | null): boolean {
    if (prev === next) {
        return false;
    }
    if (!prev || !next) {
        return (prev?.length ?? 0) !== (next?.length ?? 0);
    }
    if (prev.length !== next.length) {
        return true;
    }
    for (let index = 0; index < prev.length; index += 1) {
        if (prev[index] !== next[index]) {
            return true;
        }
    }
    return false;
}
