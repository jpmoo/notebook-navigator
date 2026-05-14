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

import { App, FuzzyMatch } from 'obsidian';
import { strings } from '../i18n';
import { type MaybePromise } from '../utils/async';
import { isValidManualSortPropertyKey, normalizeManualSortPropertyKey } from '../utils/manualSort';
import { casefold } from '../utils/recordUtils';
import { naturalCompare } from '../utils/sortUtils';
import { BaseSuggestModal } from './BaseSuggestModal';

interface PropertySortKeySuggestion {
    key: string;
    label: string;
    searchText: string;
    isCreateOption: boolean;
}

function hasExactPropertyKeySuggestionMatch(input: string, suggestions: readonly FuzzyMatch<PropertySortKeySuggestion>[]): boolean {
    const normalizedInput = casefold(input);
    if (!normalizedInput) {
        return false;
    }

    return suggestions.some(suggestion => casefold(suggestion.item.key) === normalizedInput);
}

export class PropertySortKeySuggestModal extends BaseSuggestModal<PropertySortKeySuggestion> {
    private readonly configuredKeys: readonly string[];
    private currentInput: string = '';

    constructor(
        app: App,
        configuredKeys: readonly string[],
        onChoosePropertyKey: (propertyKey: string) => MaybePromise,
        placeholderText: string,
        actionText: string
    ) {
        super(
            app,
            suggestion => {
                return onChoosePropertyKey(suggestion.key);
            },
            placeholderText,
            {
                navigate: strings.modals.propertySortKeySuggest.instructions.navigate,
                action: actionText,
                dismiss: strings.modals.propertySortKeySuggest.instructions.dismiss
            }
        );

        this.configuredKeys = [...configuredKeys]
            .map(key => normalizeManualSortPropertyKey(key))
            .filter(key => key.length > 0)
            .sort(naturalCompare);
    }

    getSuggestions(query: string): FuzzyMatch<PropertySortKeySuggestion>[] {
        this.currentInput = normalizeManualSortPropertyKey(query);
        const suggestions = super.getSuggestions(query);

        if (!isValidManualSortPropertyKey(this.currentInput)) {
            return suggestions;
        }

        if (hasExactPropertyKeySuggestionMatch(this.currentInput, suggestions)) {
            return suggestions;
        }

        const createMatch: FuzzyMatch<PropertySortKeySuggestion> = {
            item: {
                key: this.currentInput,
                label: strings.modals.propertySortKeySuggest.createNewProperty.replace('{property}', this.currentInput),
                searchText: this.currentInput,
                isCreateOption: true
            },
            match: {
                score: -1,
                matches: []
            }
        };

        return [createMatch, ...suggestions];
    }

    getItems(): PropertySortKeySuggestion[] {
        return this.configuredKeys.map(key => ({
            key,
            label: key,
            searchText: key,
            isCreateOption: false
        }));
    }

    getItemText(item: PropertySortKeySuggestion): string {
        return item.searchText;
    }

    protected getDisplayPath(item: PropertySortKeySuggestion): string {
        if (item.isCreateOption) {
            return item.label;
        }

        return item.key;
    }

    protected getItemClass(): string {
        return 'nn-property-suggest-item';
    }
}
