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

import { App, Modal, Setting } from 'obsidian';
import { strings } from '../i18n';
import { runAsyncAction, type MaybePromise } from '../utils/async';
import {
    parseManualSortGroupHeaderTargetWordCount,
    type ManualSortGroupHeaderData,
    type ManualSortGroupHeaderWriteValue
} from '../utils/manualSort';

interface ManualSortGroupHeaderModalOptions {
    propertyKey: string;
}

export class ManualSortGroupHeaderModal extends Modal {
    private headerInputEl: HTMLInputElement | null = null;
    private targetInputEl: HTMLInputElement | null = null;
    private showWordCount = false;
    private isSubmitting = false;

    constructor(
        app: App,
        private readonly initialValue: ManualSortGroupHeaderData | null,
        private readonly onSubmit: (value: ManualSortGroupHeaderWriteValue) => MaybePromise,
        private readonly options: ManualSortGroupHeaderModalOptions
    ) {
        super(app);
        this.showWordCount = initialValue?.showWordCount ?? false;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText(strings.modals.manualSortGroupHeader.title);

        contentEl.createDiv({
            cls: 'nn-input-description',
            text: strings.modals.manualSortGroupHeader.description.replace('{property}', this.options.propertyKey)
        });

        new Setting(contentEl).setName(strings.modals.manualSortGroupHeader.headerLabel).addText(text => {
            this.headerInputEl = text.inputEl;
            text.setPlaceholder(strings.modals.manualSortGroupHeader.placeholder).setValue(this.initialValue?.title ?? '');
            return text;
        });

        new Setting(contentEl).setName(strings.modals.manualSortGroupHeader.showWordCount).addToggle(toggle =>
            toggle.setValue(this.showWordCount).onChange(value => {
                this.showWordCount = value;
            })
        );

        new Setting(contentEl).setName(strings.modals.manualSortGroupHeader.targetWordCount).addText(text => {
            this.targetInputEl = text.inputEl;
            this.targetInputEl.inputMode = 'numeric';
            text.setPlaceholder(strings.modals.manualSortGroupHeader.targetWordCountPlaceholder).setValue(
                this.initialValue?.targetWordCount?.toString() ?? ''
            );
            this.targetInputEl.addEventListener('input', this.filterTargetInput);
            return text;
        });

        const buttonContainer = contentEl.createDiv('nn-button-container');
        const cancelBtn = buttonContainer.createEl('button', { text: strings.common.cancel });
        cancelBtn.addEventListener('click', this.handleCancelClick);

        const submitBtn = buttonContainer.createEl('button', {
            text: strings.common.submit,
            cls: 'mod-cta'
        });
        submitBtn.addEventListener('click', this.handleSubmitClick);

        this.scope.register([], 'Enter', event => {
            const activeElement = activeDocument.activeElement;
            if (!(activeElement instanceof HTMLElement) || !this.contentEl.contains(activeElement)) {
                return;
            }

            event.preventDefault();
            this.handleSubmit();
        });

        this.headerInputEl?.focus();
        if (this.initialValue?.title) {
            this.headerInputEl?.select();
        }
    }

    onClose(): void {
        this.targetInputEl?.removeEventListener('input', this.filterTargetInput);
        this.contentEl.empty();
    }

    private readonly filterTargetInput = (): void => {
        if (!this.targetInputEl) {
            return;
        }

        this.targetInputEl.value = this.targetInputEl.value.replace(/[^\d,]/g, '');
    };

    private readonly handleCancelClick = (): void => {
        this.close();
    };

    private readonly handleSubmitClick = (): void => {
        this.handleSubmit();
    };

    private handleSubmit(): void {
        if (this.isSubmitting) {
            return;
        }

        const targetWordCount = parseManualSortGroupHeaderTargetWordCount(this.targetInputEl?.value ?? '');
        const value: ManualSortGroupHeaderWriteValue = {
            title: this.headerInputEl?.value ?? '',
            showWordCount: this.showWordCount,
            targetWordCount
        };

        this.isSubmitting = true;
        this.close();
        runAsyncAction(async () => {
            try {
                await this.onSubmit(value);
            } finally {
                this.isSubmitting = false;
            }
        });
    }
}
