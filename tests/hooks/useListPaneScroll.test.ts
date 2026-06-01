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

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileContentChange } from '../../src/storage/IndexedDBStorage';
import { createRemeasureScheduler, isListRowHeightAffectingContentChange } from '../../src/hooks/useListPaneScroll';

function createContentChange(patch: Partial<FileContentChange>): FileContentChange {
    return {
        path: 'Notes/Daily.md',
        changes: {},
        ...patch
    };
}

function installAnimationFrameStub() {
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback): number => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        callbacks.set(frameId, callback);
        return frameId;
    });
    const cancelAnimationFrame = vi.fn((frameId: number): void => {
        callbacks.delete(frameId);
    });

    vi.stubGlobal('window', {
        requestAnimationFrame,
        cancelAnimationFrame
    });

    return {
        requestAnimationFrame,
        cancelAnimationFrame,
        runNextFrame(): boolean {
            const next = callbacks.entries().next();
            if (next.done) {
                return false;
            }

            const [frameId, callback] = next.value;
            callbacks.delete(frameId);
            callback(0);
            return true;
        }
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isListRowHeightAffectingContentChange', () => {
    it('detects content fields that can change estimated list row height', () => {
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { previewStatus: 'has' } }))).toBe(true);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { previewStatus: 'none' } }))).toBe(true);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { featureImageKey: 'key' } }))).toBe(true);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { featureImageStatus: 'has' } }))).toBe(true);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { properties: [] } }))).toBe(true);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { tags: ['work'] } }))).toBe(true);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { wordCount: 123 } }))).toBe(true);
    });

    it('ignores content fields that do not change estimated row height', () => {
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { preview: 'Preview' } }))).toBe(false);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { preview: null } }))).toBe(false);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { taskTotal: 4 } }))).toBe(false);
        expect(isListRowHeightAffectingContentChange(createContentChange({ changes: { taskUnfinished: 2 } }))).toBe(false);
        expect(
            isListRowHeightAffectingContentChange(
                createContentChange({
                    changes: { metadata: { name: 'Daily note', icon: 'lucide-star', color: '#ff0000', hidden: true } },
                    metadataHiddenChanged: true,
                    metadataNameChanged: true
                })
            )
        ).toBe(false);
    });
});

describe('createRemeasureScheduler', () => {
    it('coalesces multiple schedule calls into one animation frame measure', () => {
        const animationFrameStub = installAnimationFrameStub();
        const measure = vi.fn();
        const scheduler = createRemeasureScheduler(measure);

        scheduler.schedule();
        scheduler.schedule();
        scheduler.schedule();

        expect(animationFrameStub.requestAnimationFrame).toHaveBeenCalledTimes(1);
        expect(measure).not.toHaveBeenCalled();

        expect(animationFrameStub.runNextFrame()).toBe(true);

        expect(measure).toHaveBeenCalledTimes(1);
        expect(animationFrameStub.runNextFrame()).toBe(false);
    });

    it('schedules a new measure after the pending frame runs', () => {
        const animationFrameStub = installAnimationFrameStub();
        const measure = vi.fn();
        const scheduler = createRemeasureScheduler(measure);

        scheduler.schedule();
        animationFrameStub.runNextFrame();
        scheduler.schedule();
        animationFrameStub.runNextFrame();

        expect(animationFrameStub.requestAnimationFrame).toHaveBeenCalledTimes(2);
        expect(measure).toHaveBeenCalledTimes(2);
    });

    it('cancels a pending measure before the animation frame runs', () => {
        const animationFrameStub = installAnimationFrameStub();
        const measure = vi.fn();
        const scheduler = createRemeasureScheduler(measure);

        scheduler.schedule();
        scheduler.cancel();

        expect(animationFrameStub.cancelAnimationFrame).toHaveBeenCalledWith(1);
        expect(animationFrameStub.runNextFrame()).toBe(false);
        expect(measure).not.toHaveBeenCalled();
    });
});
