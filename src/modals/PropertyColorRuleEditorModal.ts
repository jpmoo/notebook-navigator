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

import { App, Modal, setIcon } from 'obsidian';
import { strings } from '../i18n';
import { MetadataService } from '../services/MetadataService';
import { ItemType } from '../types';
import { runAsyncAction } from '../utils/async';
import { addAsyncEventListener } from '../utils/domEventListeners';
import { isSupportedCssColor } from '../utils/customPropertyUtils';
import { normalizePropertyColorMapEntry, normalizePropertyColorMapRecord } from '../utils/propertyColorMapFormat';
import { sanitizeRecord } from '../utils/recordUtils';

/** Configuration options for the property color map editor modal */
interface PropertyColorRuleEditorModalOptions {
    title: string;
    initialMap: Record<string, string>;
    metadataService: MetadataService;
    onSave: (nextMap: Record<string, string>) => Promise<void> | void;
    normalizeKey: (input: string) => string;
}

/** Internal representation of a single property color mapping row */
interface RuleRow {
    id: string;
    keyInput: string;
    color: string;
}

/** DOM element references for a rendered rule row */
interface RowControls {
    rowEl: HTMLDivElement;
    inputEl: HTMLInputElement;
    colorButtonEl: HTMLButtonElement;
}

export class PropertyColorRuleEditorModal extends Modal {
    private rows: RuleRow[];
    private listEl: HTMLDivElement | null = null;
    private rowDisposers: (() => void)[] = [];
    private footerDisposers: (() => void)[] = [];
    private rowControls = new Map<string, RowControls>();
    private applyButton: HTMLButtonElement | null = null;
    private rowIdCounter = 0;

    constructor(
        app: App,
        private options: PropertyColorRuleEditorModalOptions
    ) {
        super(app);
        this.rows = this.deserializeRows(options.initialMap);
    }

    onOpen(): void {
        this.modalEl.addClass('nn-property-color-rule-editor-modal');
        this.titleEl.setText(this.options.title);
        this.contentEl.empty();

        const scrollContainer = this.contentEl.createDiv({ cls: 'nn-property-color-rule-editor-scroll' });
        this.listEl = scrollContainer.createDiv({ cls: 'nn-property-color-rule-editor-list' });
        this.renderRows();
        this.renderFooter();
        this.updateApplyButtonState();
    }

    onClose(): void {
        this.disposeRowDisposers();
        this.disposeFooterDisposers();
        this.rowControls.clear();
        this.listEl = null;
        this.applyButton = null;
        this.modalEl.removeClass('nn-property-color-rule-editor-modal');
        this.contentEl.empty();
    }

    /** Converts a property color map record into internal row representation */
    private deserializeRows(map: Record<string, string>): RuleRow[] {
        const entries = Object.entries(map)
            .filter(([key, color]) => Boolean(key) && Boolean(color))
            .sort(([a], [b]) => a.localeCompare(b));

        return entries.map(([key, color]) => ({
            id: this.nextRowId(),
            keyInput: key,
            color: color.trim()
        }));
    }

    /** Generates a unique identifier for a new row */
    private nextRowId(): string {
        this.rowIdCounter += 1;
        return `row-${this.rowIdCounter}`;
    }

    /** Cleans up event listeners attached to row elements */
    private disposeRowDisposers(): void {
        const disposers = this.rowDisposers;
        this.rowDisposers = [];
        disposers.forEach(disposer => {
            try {
                disposer();
            } catch (error) {
                console.error('[PropertyColorRuleEditorModal] Failed to dispose row handler', error);
            }
        });
    }

    /** Cleans up event listeners attached to footer buttons */
    private disposeFooterDisposers(): void {
        const disposers = this.footerDisposers;
        this.footerDisposers = [];
        disposers.forEach(disposer => {
            try {
                disposer();
            } catch (error) {
                console.error('[PropertyColorRuleEditorModal] Failed to dispose footer handler', error);
            }
        });
    }

    /** Rebuilds the rule list UI from the current rows state */
    private renderRows(): void {
        if (!this.listEl) {
            return;
        }

        this.disposeRowDisposers();
        this.rowControls.clear();
        this.listEl.empty();

        this.rows.forEach(row => {
            const rowEl = this.listEl?.createDiv({ cls: 'nn-property-color-rule-row' });
            if (!rowEl) {
                return;
            }

            const colorButtonEl = rowEl.createEl('button', {
                cls: 'nn-action-btn nn-color-swatch nn-property-color-rule-color',
                attr: { type: 'button', 'aria-label': strings.contextMenu.file.changeColor }
            });
            colorButtonEl.style.setProperty('--nn-color-swatch-color', row.color);
            this.rowDisposers.push(
                addAsyncEventListener(colorButtonEl, 'click', () => {
                    this.openColorPicker(row.id);
                })
            );

            const inputEl = rowEl.createEl('input', {
                cls: 'nn-input nn-property-color-rule-key',
                attr: {
                    type: 'text',
                    placeholder: 'Status'
                }
            });
            inputEl.value = row.keyInput;
            this.rowDisposers.push(
                addAsyncEventListener(inputEl, 'input', () => {
                    this.handleRowKeyInput(row.id, inputEl.value);
                })
            );

            const deleteBtn = rowEl.createEl('button', {
                cls: 'nn-action-btn mod-warning',
                attr: { type: 'button', 'aria-label': strings.common.delete }
            });
            setIcon(deleteBtn, 'lucide-trash-2');
            this.rowDisposers.push(
                addAsyncEventListener(deleteBtn, 'click', () => {
                    this.deleteRow(row.id);
                })
            );

            this.rowControls.set(row.id, { rowEl, inputEl, colorButtonEl });
        });

        this.updateApplyButtonState();
    }

    /** Creates the modal footer with add, cancel, and apply buttons */
    private renderFooter(): void {
        this.disposeFooterDisposers();

        const footer = this.contentEl.createDiv({ cls: 'nn-property-color-rule-editor-footer nn-button-container' });

        const addButton = footer.createEl('button', {
            attr: { type: 'button', 'aria-label': strings.modals.fileIconRuleEditor.addRuleAria }
        });
        setIcon(addButton, 'lucide-plus');
        this.footerDisposers.push(
            addAsyncEventListener(addButton, 'click', () => {
                this.addRow();
            })
        );

        const cancelButton = footer.createEl('button', { text: strings.common.cancel, attr: { type: 'button' } });
        this.footerDisposers.push(
            addAsyncEventListener(cancelButton, 'click', () => {
                this.close();
            })
        );

        this.applyButton = footer.createEl('button', {
            cls: 'mod-cta',
            text: strings.modals.colorPicker.apply,
            attr: { type: 'button' }
        });
        this.footerDisposers.push(
            addAsyncEventListener(this.applyButton, 'click', () => {
                this.applyChanges();
            })
        );
    }

    /** Appends a new empty rule row and focuses its input */
    private addRow(): void {
        this.rows.push({ id: this.nextRowId(), keyInput: '', color: '#000000' });
        this.renderRows();
        const newRow = this.rows[this.rows.length - 1];
        const controls = this.rowControls.get(newRow.id);
        controls?.inputEl.focus();
        controls?.rowEl.scrollIntoView({ block: 'nearest' });
    }

    /** Removes a rule row by its identifier */
    private deleteRow(rowId: string): void {
        this.rows = this.rows.filter(row => row.id !== rowId);
        this.renderRows();
    }

    /** Updates a row's key value when the input changes */
    private handleRowKeyInput(rowId: string, value: string): void {
        const row = this.rows.find(candidate => candidate.id === rowId);
        if (!row) {
            return;
        }
        row.keyInput = value;
        this.updateApplyButtonState();
    }

    private openColorPicker(rowId: string): void {
        const row = this.rows.find(candidate => candidate.id === rowId);
        if (!row) {
            return;
        }

        runAsyncAction(async () => {
            const { ColorPickerModal } = await import('./ColorPickerModal');

            const keyLabel = this.options.normalizeKey(row.keyInput);
            const titleLabel = keyLabel || this.options.title;

            const metadataService = this.options.metadataService;
            const colorService = {
                setTagColor: async () => Promise.resolve(),
                setFolderColor: async () => Promise.resolve(),
                setFileColor: async () => Promise.resolve(),
                removeTagColor: async () => Promise.resolve(),
                removeFolderColor: async () => Promise.resolve(),
                removeFileColor: async () => Promise.resolve(),
                setTagBackgroundColor: async () => Promise.resolve(),
                setFolderBackgroundColor: async () => Promise.resolve(),
                removeTagBackgroundColor: async () => Promise.resolve(),
                removeFolderBackgroundColor: async () => Promise.resolve(),
                getTagColor: () => undefined,
                getFolderColor: () => undefined,
                getFileColor: () => (row.color.trim().length > 0 ? row.color.trim() : undefined),
                getTagBackgroundColor: () => undefined,
                getFolderBackgroundColor: () => undefined,
                getSettingsProvider: () => metadataService.getSettingsProvider()
            };

            const picker = new ColorPickerModal(this.app, colorService, titleLabel, ItemType.FILE);
            picker.onChooseColor = async color => {
                if (color === null) {
                    this.deleteRow(rowId);
                    return { handled: true };
                }

                this.setRowColor(rowId, color);
                return { handled: true };
            };

            picker.open();
        });
    }

    private setRowColor(rowId: string, color: string): void {
        const row = this.rows.find(candidate => candidate.id === rowId);
        if (!row) {
            return;
        }

        row.color = color;
        const controls = this.rowControls.get(rowId);
        if (controls) {
            controls.colorButtonEl.style.setProperty('--nn-color-swatch-color', color);
        }
        this.updateApplyButtonState();
    }

    /** Enables or disables the apply button and highlights invalid rows */
    private updateApplyButtonState(): void {
        const state = this.computeValidationState();
        if (this.applyButton) {
            this.applyButton.disabled = !state.isValid;
        }
        state.invalidRowIds.forEach(id => {
            const controls = this.rowControls.get(id);
            controls?.rowEl.addClass('nn-property-color-rule-row-invalid');
        });
        this.rowControls.forEach((controls, id) => {
            if (!state.invalidRowIds.has(id)) {
                controls.rowEl.removeClass('nn-property-color-rule-row-invalid');
            }
        });
    }

    /** Validates all rows, detecting empty keys, invalid colors, and duplicate keys */
    private computeValidationState(): { isValid: boolean; invalidRowIds: Set<string> } {
        const invalidRowIds = new Set<string>();
        const normalizedKeyToRowIds = new Map<string, string[]>();

        this.rows.forEach(row => {
            const entry = normalizePropertyColorMapEntry(row.keyInput, row.color, this.options.normalizeKey);
            if (!entry || !isSupportedCssColor(entry.color)) {
                invalidRowIds.add(row.id);
                return;
            }

            const list = normalizedKeyToRowIds.get(entry.key) ?? [];
            list.push(row.id);
            normalizedKeyToRowIds.set(entry.key, list);
        });

        normalizedKeyToRowIds.forEach(rowIds => {
            if (rowIds.length > 1) {
                rowIds.forEach(rowId => invalidRowIds.add(rowId));
            }
        });

        return { isValid: invalidRowIds.size === 0, invalidRowIds };
    }

    /** Normalizes and persists the current rules, then closes the modal */
    private applyChanges(): void {
        const state = this.computeValidationState();
        if (!state.isValid) {
            return;
        }

        const draft = sanitizeRecord<string>(undefined);
        this.rows.forEach(row => {
            draft[row.keyInput] = row.color;
        });

        const normalized: Record<string, string> = normalizePropertyColorMapRecord(draft, this.options.normalizeKey);
        runAsyncAction(async () => {
            await this.options.onSave(normalized);
            this.close();
        });
    }
}
