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

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Notice, Platform, TFile, TFolder, normalizePath, type App } from 'obsidian';
import { getWeek, getWeekYear } from 'date-fns';
import { getCurrentLanguage, strings } from '../i18n';
import { ConfirmModal } from '../modals/ConfirmModal';
import { InputModal } from '../modals/InputModal';
import { useServices } from '../context/ServicesContext';
import { useSettingsState } from '../context/SettingsContext';
import { useFileCache } from '../context/StorageContext';
import { runAsyncAction } from '../utils/async';
import {
    createDailyNote,
    getDailyNoteFile,
    getDailyNoteFilename,
    getDailyNoteSettings as getCoreDailyNoteSettings
} from '../utils/dailyNotes';
import { getMomentApi, type MomentApi, type MomentInstance } from '../utils/moment';
import { getCalendarWeekConfig } from '../utils/calendarWeekConfig';
import { ServiceIcon } from './ServiceIcon';
import { useFileOpener } from '../hooks/useFileOpener';
import {
    createCalendarCustomDateFormatter,
    createCalendarCustomNotePathParser,
    ensureMarkdownFileName,
    type CalendarCustomParsedNotePath,
    isCalendarCustomDatePatternValid,
    normalizeCalendarCustomRootFolder,
    normalizeCalendarVaultFolderPath,
    splitCalendarCustomPattern
} from '../utils/calendarCustomNotePatterns';
import { stripForbiddenNameCharactersAllPlatforms, stripForbiddenNameCharactersWindows } from '../utils/fileNameUtils';
import { getTooltipPlacement } from '../utils/domUtils';

interface CalendarDay {
    date: MomentInstance;
    iso: string;
    inMonth: boolean;
    file: TFile | null;
    title: string;
}

interface CalendarWeek {
    key: string;
    weekNumber: number;
    days: CalendarDay[];
}

interface CalendarDayButtonProps {
    className: string;
    ariaText: string;
    dayNumber: number;
    isMobile: boolean;
    onClick: () => void;
    style: React.CSSProperties | undefined;
    tooltipEnabled: boolean;
    tooltipImageUrl: string | null;
    tooltipText: string;
    onHideTooltip: (element: HTMLElement) => void;
    onShowTooltip: (element: HTMLElement, tooltipText: string, tooltipImageUrl: string | null) => void;
}

/** Renders a calendar day button with hover tooltip support on desktop */
function CalendarDayButton({
    className,
    ariaText,
    dayNumber,
    isMobile,
    onClick,
    style,
    tooltipEnabled,
    tooltipImageUrl,
    tooltipText,
    onHideTooltip,
    onShowTooltip
}: CalendarDayButtonProps) {
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    const handleMouseEnter = useCallback(() => {
        if (isMobile || !tooltipEnabled) {
            return;
        }

        const element = buttonRef.current;
        if (!element) {
            return;
        }

        onShowTooltip(element, tooltipText, tooltipImageUrl);
    }, [isMobile, onShowTooltip, tooltipEnabled, tooltipImageUrl, tooltipText]);

    const handleMouseLeave = useCallback(() => {
        const element = buttonRef.current;
        if (!element || isMobile) {
            return;
        }

        onHideTooltip(element);
    }, [isMobile, onHideTooltip]);

    const handleClick = useCallback(() => {
        const element = buttonRef.current;
        if (element) {
            onHideTooltip(element);
        }

        onClick();
    }, [onClick, onHideTooltip]);

    useEffect(() => {
        const element = buttonRef.current;
        if (!element) {
            return;
        }

        if (isMobile) {
            return;
        }

        if (!tooltipEnabled) {
            return;
        }

        if (!element.matches(':hover')) {
            return;
        }

        onShowTooltip(element, tooltipText, tooltipImageUrl);
    }, [isMobile, onShowTooltip, tooltipEnabled, tooltipImageUrl, tooltipText]);

    return (
        <button
            ref={buttonRef}
            type="button"
            className={className}
            style={style}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
        >
            <span className="nn-navigation-calendar-day-number" aria-hidden="true">
                {dayNumber}
            </span>
            <span className="nn-visually-hidden">{ariaText}</span>
        </button>
    );
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function formatIsoDate(date: MomentInstance): string {
    return date.format('YYYY-MM-DD');
}

function resolveMomentLocale(requestedLocale: string, momentApi: MomentApi | null, fallbackLocale: string): string {
    // `moment` locale ids are not guaranteed to be canonical BCP-47 tags (and may use `_`); normalize and fall back
    // to the best available match (full tag -> lowercase -> base language).
    if (!momentApi) {
        return fallbackLocale || 'en';
    }

    const available = new Set(momentApi.locales());
    const normalized = (requestedLocale || '').replace(/_/g, '-');
    if (available.has(normalized)) {
        return normalized;
    }

    const lower = normalized.toLowerCase();
    if (available.has(lower)) {
        return lower;
    }

    const base = lower.split('-')[0];
    if (base && available.has(base)) {
        return base;
    }

    return fallbackLocale || momentApi.locale() || 'en';
}

function getDayOfWeek(date: MomentInstance): number {
    // Use the JS Date weekday (0..6, Sunday..Saturday) to avoid relying on locale-specific moment formatting tokens.
    return date.toDate().getDay();
}

function startOfWeek(date: MomentInstance, weekStartsOn: number): MomentInstance {
    // Compute week starts using date-fns locale rules (first day of week) while keeping moment for date math/formatting.
    const dayOfWeek = getDayOfWeek(date);
    const diff = (dayOfWeek - weekStartsOn + 7) % 7;
    return date.clone().subtract(diff, 'day').startOf('day');
}

/** Strips forbidden filename characters from calendar note title based on platform */
function sanitizeCalendarTitle(rawTitle: string): string {
    const trimmed = rawTitle.trim();
    if (!trimmed) {
        return '';
    }

    let sanitized = stripForbiddenNameCharactersAllPlatforms(trimmed);
    if (Platform.isWin) {
        sanitized = stripForbiddenNameCharactersWindows(sanitized);
    }

    return sanitized.trim();
}

interface CustomCalendarIndexEntry {
    file: TFile;
    title: string;
    mtime: number;
}

/** Builds an ISO->note lookup table for files in a single folder, choosing the newest file when duplicates exist */
function buildCustomCalendarFolderIndex(
    folder: TFolder,
    relativeFolderPath: string,
    parsePath: (relativePath: string) => CalendarCustomParsedNotePath | null
): Map<string, CustomCalendarIndexEntry> {
    const index = new Map<string, CustomCalendarIndexEntry>();

    for (const child of folder.children) {
        if (!(child instanceof TFile) || child.extension !== 'md') {
            continue;
        }

        const relativePath = relativeFolderPath ? `${relativeFolderPath}/${child.name}` : child.name;
        const parsed = parsePath(relativePath);
        if (!parsed) {
            continue;
        }

        const mtime = child.stat?.mtime ?? 0;
        const existing = index.get(parsed.iso);
        if (!existing || mtime > existing.mtime) {
            index.set(parsed.iso, { file: child, title: parsed.title, mtime });
        }
    }

    return index;
}

/** Converts an absolute vault folder path to a path relative to the configured custom calendar root */
function getPathRelativeToCustomCalendarRoot(folderPath: string, customRootFolder: string): string {
    if (folderPath === '/' || folderPath === customRootFolder) {
        return '';
    }

    if (!customRootFolder) {
        return folderPath === '/' ? '' : folderPath;
    }

    const prefix = `${customRootFolder}/`;
    return folderPath.startsWith(prefix) ? folderPath.slice(prefix.length) : folderPath;
}

/** Builds full file path from date, settings, and title using configured patterns */
function buildCustomCalendarFilePath(
    date: MomentInstance,
    settings: {
        calendarCustomRootFolder: string;
        calendarCustomFilePattern: string;
    },
    title: string
): { folderPath: string; fileName: string; filePath: string } {
    const customRootFolder = normalizeCalendarCustomRootFolder(settings.calendarCustomRootFolder);
    const { folderPattern: customFolderPattern, filePattern: customFilePattern } = splitCalendarCustomPattern(
        settings.calendarCustomFilePattern
    );

    const folderFormatter = createCalendarCustomDateFormatter(customFolderPattern);
    const fileFormatter = createCalendarCustomDateFormatter(customFilePattern);

    const folderSuffix = folderFormatter(date);
    const rawFolderPath = customRootFolder ? (folderSuffix ? `${customRootFolder}/${folderSuffix}` : customRootFolder) : folderSuffix;
    const folderPath = normalizeCalendarVaultFolderPath(rawFolderPath || '/');

    const formattedFilePattern = fileFormatter(date).trim();
    const titleSuffix = title ? ` ${title}` : '';
    const fileName = ensureMarkdownFileName(`${formattedFilePattern}${titleSuffix}`.trim());
    const filePath = folderPath === '/' ? fileName : normalizePath(`${folderPath}/${fileName}`);

    return { folderPath, fileName, filePath };
}

/** Creates nested folders recursively if they don't exist, returns final folder or null on failure */
async function ensureCalendarFolderExists(app: App, folderPath: string): Promise<TFolder | null> {
    if (folderPath === '/' || !folderPath) {
        return app.vault.getRoot();
    }

    const normalized = normalizePath(folderPath);
    if (!normalized || normalized === '/' || normalized === '.') {
        return app.vault.getRoot();
    }

    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const existing = app.vault.getAbstractFileByPath(current);
        if (!existing) {
            await app.vault.createFolder(current);
            continue;
        }
        if (!(existing instanceof TFolder)) {
            return null;
        }
    }

    const folder = app.vault.getAbstractFileByPath(normalized);
    return folder instanceof TFolder ? folder : null;
}

export interface NavigationPaneCalendarProps {
    onWeekCountChange?: (count: number) => void;
}

interface CalendarHoverTooltipState {
    anchorEl: HTMLElement;
    imageUrl: string | null;
    text: string;
}

export function NavigationPaneCalendar({ onWeekCountChange }: NavigationPaneCalendarProps) {
    const { app, isMobile } = useServices();
    const settings = useSettingsState();
    const { getDB } = useFileCache();
    const openFile = useFileOpener();
    const calendarLabelId = useId();

    const momentApi = getMomentApi();
    const [cursorDate, setCursorDate] = useState<MomentInstance | null>(() => (momentApi ? momentApi().startOf('day') : null));
    const todayIso = momentApi ? formatIsoDate(momentApi().startOf('day')) : null;

    const [vaultVersion, setVaultVersion] = useState(0);
    const [contentVersion, setContentVersion] = useState(0);
    const visibleDailyNotePathsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const onVaultUpdate = () => setVaultVersion(v => v + 1);
        const createRef = app.vault.on('create', onVaultUpdate);
        const deleteRef = app.vault.on('delete', onVaultUpdate);
        const renameRef = app.vault.on('rename', onVaultUpdate);

        return () => {
            app.vault.offref(createRef);
            app.vault.offref(deleteRef);
            app.vault.offref(renameRef);
        };
    }, [app.vault]);

    useEffect(() => {
        const db = getDB();
        return db.onContentChange(changes => {
            const visiblePaths = visibleDailyNotePathsRef.current;
            const hasCalendarRelevantChange = changes.some(change => {
                if (!visiblePaths.has(change.path)) {
                    return false;
                }
                return (
                    change.changes.featureImage !== undefined ||
                    change.changes.featureImageKey !== undefined ||
                    change.changes.featureImageStatus !== undefined
                );
            });

            if (hasCalendarRelevantChange) {
                setContentVersion(v => v + 1);
            }
        });
    }, [getDB]);

    useEffect(() => {
        // Obsidian exposes `window.moment` after startup; in tests (or very early) it may be unavailable.
        if (!momentApi || cursorDate) {
            return;
        }
        setCursorDate(momentApi().startOf('day'));
    }, [cursorDate, momentApi]);

    const displayLocale = useMemo(() => {
        if (!momentApi) {
            return 'en';
        }

        // Month name / weekday labels follow the current UI language by default.
        const currentLanguage = getCurrentLanguage();
        const fallback = momentApi.locale() || 'en';
        const requested = (currentLanguage || fallback).replace(/_/g, '-');

        return resolveMomentLocale(requested, momentApi, fallback);
    }, [momentApi]);

    const calendarRulesLocale = useMemo(() => {
        if (!momentApi) {
            return 'en';
        }
        // Week rules (week starts on, week number calculation) can differ from display locale; allow override.
        const requested = settings.calendarLocale === 'system-default' ? displayLocale : settings.calendarLocale;
        return resolveMomentLocale(requested, momentApi, displayLocale);
    }, [displayLocale, momentApi, settings.calendarLocale]);

    const weekConfig = useMemo(() => getCalendarWeekConfig(calendarRulesLocale), [calendarRulesLocale]);
    const weekStartsOn = weekConfig.weekStartsOn;

    const weekdays = useMemo(() => {
        if (!momentApi) {
            return [];
        }

        const firstDay = weekStartsOn;
        const labels = momentApi().locale(displayLocale).localeData().weekdaysMin();
        if (!Array.isArray(labels) || labels.length !== 7) {
            return [];
        }
        const ordered = [...labels.slice(firstDay), ...labels.slice(0, firstDay)];
        return ordered.map(label => Array.from(label.trim())[0] ?? '');
    }, [displayLocale, momentApi, weekStartsOn]);

    const dailyNoteSettings = useMemo(() => {
        // Force refresh when vault contents change so `getDailyNoteFile()` reflects created/renamed/deleted daily notes.
        void vaultVersion;
        if (settings.calendarIntegrationMode !== 'daily-notes') {
            return null;
        }
        return getCoreDailyNoteSettings(app);
    }, [app, settings.calendarIntegrationMode, vaultVersion]);

    const weeks = useMemo<CalendarWeek[]>(() => {
        if (!momentApi || !cursorDate) {
            return [];
        }

        // Force refresh when vault contents change so custom calendar resolution reflects created/renamed/deleted notes.
        void vaultVersion;

        const integrationMode = settings.calendarIntegrationMode;
        const customRootFolder = normalizeCalendarCustomRootFolder(settings.calendarCustomRootFolder);
        const { folderPattern: customFolderPattern, filePattern: customFilePattern } = splitCalendarCustomPattern(
            settings.calendarCustomFilePattern
        );
        const customPattern = customFolderPattern ? `${customFolderPattern}/${customFilePattern}` : customFilePattern;
        const customNotePathParser =
            integrationMode === 'notebook-navigator' ? createCalendarCustomNotePathParser(momentApi, customPattern) : null;
        const folderIndexCache = new Map<string, Map<string, CustomCalendarIndexEntry> | null>();
        const folderFormatter = createCalendarCustomDateFormatter(customFolderPattern);

        const weeksToShow = clamp(settings.calendarWeeksToShow, 1, 6);
        const cursor = cursorDate.clone().startOf('day');
        const cursorWeekStart = startOfWeek(cursor.clone(), weekStartsOn);
        const targetMonth = cursor.month();
        const targetYear = cursor.year();

        let windowStart: MomentInstance;
        let weekCount: number;

        if (weeksToShow === 6) {
            // `6` means "full month": render as many week rows as needed to cover the month grid (capped at 6).
            const monthStart = cursor.clone().startOf('month');
            const gridStart = startOfWeek(monthStart, weekStartsOn);
            const monthEnd = monthStart.clone().endOf('month');
            const gridEndWeekStart = startOfWeek(monthEnd, weekStartsOn);
            const totalWeeks = clamp(gridEndWeekStart.diff(gridStart, 'weeks') + 1, 1, 6);

            windowStart = gridStart;
            weekCount = totalWeeks;
        } else {
            // For 1..5 weeks: show a sliding N-week window around the cursor week (page navigation never skips weeks).
            const offset = Math.floor((weeksToShow - 1) / 2);
            windowStart = cursorWeekStart.clone().subtract(offset, 'week');
            weekCount = weeksToShow;
        }

        const visibleWeeks: CalendarWeek[] = [];
        for (let weekOffset = 0; weekOffset < weekCount; weekOffset++) {
            const weekStart = windowStart.clone().add(weekOffset, 'week');
            const weekNumber = getWeek(weekStart.toDate(), weekConfig);
            const weekYear = getWeekYear(weekStart.toDate(), weekConfig);

            const days: CalendarDay[] = [];
            for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
                const date = weekStart.clone().add(dayOffset, 'day');
                const inMonth = date.month() === targetMonth && date.year() === targetYear;
                const iso = formatIsoDate(date);
                let file: TFile | null = null;
                let title = '';

                if (integrationMode === 'notebook-navigator') {
                    const folderSuffix = folderFormatter(date);
                    const rawFolderPath = customRootFolder
                        ? folderSuffix
                            ? `${customRootFolder}/${folderSuffix}`
                            : customRootFolder
                        : folderSuffix;
                    const folderPath = normalizeCalendarVaultFolderPath(rawFolderPath || '/');
                    if (customNotePathParser) {
                        let folderIndex = folderIndexCache.get(folderPath);
                        if (folderIndex === undefined) {
                            const folder = folderPath === '/' ? app.vault.getRoot() : app.vault.getAbstractFileByPath(folderPath);
                            const relativeFolderPath = getPathRelativeToCustomCalendarRoot(folderPath, customRootFolder);
                            folderIndex =
                                folder instanceof TFolder
                                    ? buildCustomCalendarFolderIndex(folder, relativeFolderPath, customNotePathParser)
                                    : null;
                            folderIndexCache.set(folderPath, folderIndex);
                        }

                        const entry = folderIndex?.get(iso);
                        if (entry) {
                            file = entry.file;
                            title = entry.title;
                        }
                    }
                } else {
                    file = dailyNoteSettings ? getDailyNoteFile(app, date, dailyNoteSettings) : null;
                }

                days.push({ date, iso, inMonth, file, title });
            }

            visibleWeeks.push({
                key: `week-${weekYear}-W${weekNumber}`,
                weekNumber,
                days
            });
        }

        return visibleWeeks;
    }, [
        app,
        cursorDate,
        dailyNoteSettings,
        momentApi,
        vaultVersion,
        settings.calendarCustomFilePattern,
        settings.calendarCustomRootFolder,
        settings.calendarIntegrationMode,
        settings.calendarWeeksToShow,
        weekConfig,
        weekStartsOn
    ]);

    const visibleDailyNotePaths = useMemo(() => {
        const paths = new Set<string>();
        for (const week of weeks) {
            for (const day of week.days) {
                if (day.file) {
                    paths.add(day.file.path);
                }
            }
        }
        return paths;
    }, [weeks]);
    visibleDailyNotePathsRef.current = visibleDailyNotePaths;

    const featureImageKeysByIso = useMemo(() => {
        // Force refresh when calendar-relevant content changes so feature-image keys reflect the latest metadata.
        void contentVersion;

        const keys = new Map<string, string>();
        const db = getDB();

        for (const week of weeks) {
            for (const day of week.days) {
                if (!day.file) {
                    continue;
                }

                const record = db.getFile(day.file.path);
                const featureKey = record?.featureImageKey ?? null;
                const featureStatus = record?.featureImageStatus ?? null;
                if (featureStatus !== 'has' || !featureKey || featureKey === '') {
                    continue;
                }

                keys.set(day.iso, featureKey);
            }
        }

        return keys;
    }, [contentVersion, getDB, weeks]);

    useLayoutEffect(() => {
        if (weeks.length === 0) {
            return;
        }
        onWeekCountChange?.(weeks.length);
    }, [onWeekCountChange, weeks.length]);

    const featureImageUrlMapRef = useRef<Map<string, { key: string; url: string }>>(new Map());
    const [featureImageUrls, setFeatureImageUrls] = useState<Record<string, string>>({});
    // Hover tooltip state for showing feature images and titles on desktop
    const [hoverTooltip, setHoverTooltip] = useState<CalendarHoverTooltipState | null>(null);
    const [hoverTooltipStyle, setHoverTooltipStyle] = useState<React.CSSProperties | null>(null);
    const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
    const hoverTooltipAnchorRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        return () => {
            // Always release object URLs on unmount to avoid leaking blobs.
            const existing = featureImageUrlMapRef.current;
            for (const entry of existing.values()) {
                URL.revokeObjectURL(entry.url);
            }
            existing.clear();
        };
    }, []);

    useEffect(() => {
        let isActive = true;

        // Only days with a daily note AND a computed feature-image key participate in background image loading.
        const noteDays: { iso: string; file: TFile; key: string }[] = [];

        for (const week of weeks) {
            for (const day of week.days) {
                if (!day.file) {
                    continue;
                }

                const featureKey = featureImageKeysByIso.get(day.iso);
                if (!featureKey) {
                    continue;
                }

                noteDays.push({ iso: day.iso, file: day.file, key: featureKey });
            }
        }

        const db = getDB();
        const previousMap = featureImageUrlMapRef.current;
        const nextMap = new Map<string, { key: string; url: string }>();

        const createdUrls: string[] = [];

        const fetchUrls = async () => {
            try {
                await Promise.all(
                    noteDays.map(async entry => {
                        // Reuse existing object URLs when the feature image key is unchanged for that day.
                        const existing = previousMap.get(entry.iso);
                        if (existing && existing.key === entry.key) {
                            nextMap.set(entry.iso, existing);
                            return;
                        }

                        let blob: Blob | null = null;
                        try {
                            blob = await db.getFeatureImageBlob(entry.file.path, entry.key);
                        } catch {
                            return;
                        }

                        if (!blob) {
                            return;
                        }

                        const url = URL.createObjectURL(blob);
                        createdUrls.push(url);
                        nextMap.set(entry.iso, { key: entry.key, url });
                    })
                );

                if (!isActive) {
                    // Component was unmounted while blobs were loading; release newly created URLs.
                    createdUrls.forEach(url => URL.revokeObjectURL(url));
                    return;
                }

                // Release URLs that are no longer referenced by the next map.
                for (const [iso, entry] of previousMap.entries()) {
                    const next = nextMap.get(iso);
                    if (!next || next.url !== entry.url) {
                        URL.revokeObjectURL(entry.url);
                    }
                }

                featureImageUrlMapRef.current = nextMap;
                setFeatureImageUrls(Object.fromEntries([...nextMap.entries()].map(([iso, entry]) => [iso, entry.url])));
            } catch (error) {
                createdUrls.forEach(url => URL.revokeObjectURL(url));
                if (isActive) {
                    console.error('Failed to load calendar feature images', error);
                }
            }
        };

        runAsyncAction(() => fetchUrls());

        return () => {
            isActive = false;
        };
    }, [featureImageKeysByIso, getDB, weeks]);

    /** Calculates and updates tooltip position relative to anchor element, handling viewport boundaries */
    const updateHoverTooltipPosition = useCallback(() => {
        if (!hoverTooltip) {
            setHoverTooltipStyle(null);
            return;
        }

        if (typeof window === 'undefined') {
            setHoverTooltipStyle(null);
            return;
        }

        if (!hoverTooltip.anchorEl.isConnected) {
            setHoverTooltip(null);
            setHoverTooltipStyle(null);
            return;
        }

        const tooltipElement = hoverTooltipRef.current;
        if (!tooltipElement) {
            setHoverTooltipStyle({
                top: 0,
                left: 0,
                transform: 'translateY(-50%)',
                visibility: 'hidden'
            });
            return;
        }
        const tooltipWidth = tooltipElement?.offsetWidth ?? 0;
        const tooltipHeight = tooltipElement?.offsetHeight ?? 0;

        const rect = hoverTooltip.anchorEl.getBoundingClientRect();
        const preferredPlacement = getTooltipPlacement();
        const offset = 10;
        const margin = 8;

        const rawCenterY = rect.top + rect.height / 2;
        const halfHeight = tooltipHeight / 2;
        const minCenterY = margin + halfHeight;
        const maxCenterY = window.innerHeight - margin - halfHeight;
        const centerY =
            Number.isFinite(minCenterY) && Number.isFinite(maxCenterY) && maxCenterY >= minCenterY
                ? clamp(rawCenterY, minCenterY, maxCenterY)
                : clamp(rawCenterY, margin, window.innerHeight - margin);

        const availableRight = window.innerWidth - rect.right - margin;
        const availableLeft = rect.left - margin;
        const requiredWidth = tooltipWidth + offset;

        const fitsRight = availableRight >= requiredWidth;
        const fitsLeft = availableLeft >= requiredWidth;

        let placement: 'left' | 'right' = preferredPlacement;
        if (preferredPlacement === 'right' && !fitsRight && fitsLeft) {
            placement = 'left';
        } else if (preferredPlacement === 'left' && !fitsLeft && fitsRight) {
            placement = 'right';
        } else if (!fitsLeft && !fitsRight) {
            placement = availableRight >= availableLeft ? 'right' : 'left';
        }

        const minLeft = margin;
        const maxLeft = window.innerWidth - margin - tooltipWidth;
        let left: number = placement === 'right' ? rect.right + offset : rect.left - offset - tooltipWidth;
        if (Number.isFinite(minLeft) && Number.isFinite(maxLeft) && maxLeft >= minLeft) {
            left = clamp(left, minLeft, maxLeft);
        }

        setHoverTooltipStyle({
            top: centerY,
            left,
            transform: 'translateY(-50%)',
            visibility: 'visible'
        });
    }, [hoverTooltip]);

    useLayoutEffect(() => {
        updateHoverTooltipPosition();
    }, [updateHoverTooltipPosition]);

    useEffect(() => {
        if (!hoverTooltip) {
            return;
        }

        if (typeof window === 'undefined') {
            return;
        }

        let frameId: number | null = null;

        const schedulePositionUpdate = () => {
            if (frameId !== null) {
                return;
            }

            frameId = window.requestAnimationFrame(() => {
                frameId = null;
                updateHoverTooltipPosition();
            });
        };

        window.addEventListener('resize', schedulePositionUpdate);
        window.addEventListener('scroll', schedulePositionUpdate, true);
        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            window.removeEventListener('resize', schedulePositionUpdate);
            window.removeEventListener('scroll', schedulePositionUpdate, true);
        };
    }, [hoverTooltip, updateHoverTooltipPosition]);

    const handleShowTooltip = useCallback((element: HTMLElement, tooltipText: string, tooltipImageUrl: string | null) => {
        if (hoverTooltipAnchorRef.current !== element) {
            hoverTooltipAnchorRef.current = element;
            setHoverTooltipStyle(null);
        }

        setHoverTooltip(existing => {
            if (existing && existing.anchorEl === element && existing.text === tooltipText && existing.imageUrl === tooltipImageUrl) {
                return existing;
            }

            return { anchorEl: element, imageUrl: tooltipImageUrl, text: tooltipText };
        });
    }, []);

    const handleHideTooltip = useCallback((element: HTMLElement) => {
        if (hoverTooltipAnchorRef.current === element) {
            hoverTooltipAnchorRef.current = null;
            setHoverTooltipStyle(null);
        }

        setHoverTooltip(existing => {
            if (!existing || existing.anchorEl !== element) {
                return existing;
            }
            return null;
        });
    }, []);

    const headerLabel = useMemo(() => {
        if (!momentApi || !cursorDate) {
            return '';
        }
        return cursorDate.clone().locale(displayLocale).format('MMMM YYYY');
    }, [cursorDate, displayLocale, momentApi]);

    const handleNavigate = useCallback(
        (delta: number) => {
            if (!momentApi) {
                return;
            }
            setHoverTooltip(null);
            const weeksToShow = clamp(settings.calendarWeeksToShow, 1, 6);
            const unit = weeksToShow === 6 ? 'month' : 'week';
            const step = weeksToShow === 6 ? delta : delta * weeksToShow;

            setCursorDate(prev => (prev ?? momentApi().startOf('day')).clone().add(step, unit));
        },
        [momentApi, settings.calendarWeeksToShow]
    );

    const handleToday = useCallback(() => {
        if (!momentApi) {
            return;
        }
        setHoverTooltip(null);
        setCursorDate(momentApi().startOf('day'));
    }, [momentApi]);

    const collapseNavigationIfMobile = useCallback(() => {
        if (!isMobile || !app.workspace.leftSplit) {
            return;
        }
        // On mobile, opening a daily note should feel like navigating away from the sidebar.
        app.workspace.leftSplit.collapse();
    }, [app, isMobile]);

    const openOrCreateDailyNote = useCallback(
        (date: MomentInstance, existingFile: TFile | null) => {
            if (existingFile) {
                openFile(existingFile, { active: true });
                collapseNavigationIfMobile();
                return;
            }

            if (settings.calendarIntegrationMode === 'daily-notes') {
                const dailySettings = dailyNoteSettings;
                if (!dailySettings) {
                    new Notice(strings.navigationCalendar.dailyNotesNotEnabled);
                    return;
                }

                const filename = getDailyNoteFilename(date, dailySettings);

                const createFile = async () => {
                    const created = await createDailyNote(app, date, dailySettings);
                    if (!created) {
                        return;
                    }

                    setVaultVersion(v => v + 1);
                    openFile(created, { active: true });

                    collapseNavigationIfMobile();
                };

                if (settings.calendarConfirmBeforeCreate) {
                    new ConfirmModal(
                        app,
                        strings.navigationCalendar.createDailyNote.title,
                        strings.navigationCalendar.createDailyNote.message.replace('{filename}', filename),
                        createFile,
                        strings.navigationCalendar.createDailyNote.confirmButton,
                        { confirmButtonClass: 'mod-cta' }
                    ).open();
                    return;
                }

                runAsyncAction(() => createFile());
                return;
            }

            const { folderPattern, filePattern } = splitCalendarCustomPattern(settings.calendarCustomFilePattern);
            const customPattern = folderPattern ? `${folderPattern}/${filePattern}` : filePattern;
            if (!isCalendarCustomDatePatternValid(customPattern)) {
                new Notice(strings.settings.items.calendarCustomFilePattern.parsingError);
                return;
            }

            const createCustomNote = async (noteTitle: string) => {
                const { folderPath, fileName, filePath } = buildCustomCalendarFilePath(date, settings, noteTitle);
                if (!filePath) {
                    new Notice(strings.common.unknownError);
                    return;
                }

                const existing = app.vault.getAbstractFileByPath(filePath);
                if (existing instanceof TFile) {
                    openFile(existing, { active: true });
                    collapseNavigationIfMobile();
                    return;
                }

                let parentFolder: TFolder | null = null;
                try {
                    parentFolder = await ensureCalendarFolderExists(app, folderPath);
                } catch (error) {
                    console.error('Failed to create calendar folder', error);
                    new Notice(strings.common.unknownError);
                    return;
                }
                if (!parentFolder) {
                    new Notice(strings.common.unknownError);
                    return;
                }

                const baseName = fileName.replace(/\.md$/iu, '').trim();
                if (!baseName) {
                    new Notice(strings.common.unknownError);
                    return;
                }

                let created: TFile;
                try {
                    created = await app.fileManager.createNewMarkdownFile(parentFolder, baseName);
                } catch (error) {
                    console.error('Failed to create calendar note', error);
                    new Notice(strings.common.unknownError);
                    return;
                }

                setVaultVersion(v => v + 1);
                openFile(created, { active: true });
                collapseNavigationIfMobile();
            };

            const promptAndCreate = () => {
                const modal = new InputModal(
                    app,
                    strings.navigationCalendar.promptDailyNoteTitle.title,
                    strings.navigationCalendar.promptDailyNoteTitle.placeholder,
                    value => {
                        const noteTitle = sanitizeCalendarTitle(value);
                        runAsyncAction(() => createCustomNote(noteTitle));
                    },
                    '',
                    { submitButtonText: strings.navigationCalendar.createDailyNote.confirmButton }
                );
                modal.open();
            };

            const createWithoutPrompt = () => {
                const { filePath } = buildCustomCalendarFilePath(date, settings, '');
                const createFile = () => runAsyncAction(() => createCustomNote(''));

                if (settings.calendarConfirmBeforeCreate) {
                    new ConfirmModal(
                        app,
                        strings.navigationCalendar.createDailyNote.title,
                        strings.navigationCalendar.createDailyNote.message.replace('{filename}', filePath),
                        createFile,
                        strings.navigationCalendar.createDailyNote.confirmButton,
                        { confirmButtonClass: 'mod-cta' }
                    ).open();
                    return;
                }

                createFile();
            };

            if (settings.calendarCustomPromptForTitle) {
                // Title prompt acts as the confirmation step; do not show a separate confirm dialog.
                promptAndCreate();
                return;
            }

            createWithoutPrompt();
        },
        [app, collapseNavigationIfMobile, dailyNoteSettings, openFile, settings]
    );

    if (!momentApi || !cursorDate) {
        return null;
    }

    const showWeekNumbers = settings.calendarShowWeekNumber;
    const highlightToday = settings.calendarHighlightToday;

    return (
        <>
            {hoverTooltip && !isMobile
                ? createPortal(
                      <div
                          ref={hoverTooltipRef}
                          className="nn-navigation-calendar-hover-tooltip"
                          style={
                              hoverTooltipStyle ?? {
                                  top: 0,
                                  left: 0,
                                  transform: 'translateY(-50%)',
                                  visibility: 'hidden'
                              }
                          }
                          role="tooltip"
                      >
                          {hoverTooltip.imageUrl ? (
                              <div
                                  className="nn-navigation-calendar-hover-tooltip-image"
                                  style={{ backgroundImage: `url(${hoverTooltip.imageUrl})` }}
                              />
                          ) : null}
                          <div className="nn-navigation-calendar-hover-tooltip-text">{hoverTooltip.text}</div>
                      </div>,
                      document.body
                  )
                : null}
            <div
                className="nn-navigation-calendar"
                role="group"
                aria-labelledby={calendarLabelId}
                data-highlight-today={highlightToday ? 'true' : undefined}
            >
                <span id={calendarLabelId} className="nn-visually-hidden">
                    {strings.navigationCalendar.ariaLabel}
                </span>
                <div className="nn-navigation-calendar-header">
                    <div className="nn-navigation-calendar-month">{headerLabel}</div>
                    <div className="nn-navigation-calendar-nav">
                        <button
                            type="button"
                            className="nn-navigation-calendar-nav-button"
                            aria-label={strings.common.previous}
                            onClick={() => handleNavigate(-1)}
                        >
                            <ServiceIcon iconId="lucide-chevron-left" aria-hidden={true} />
                        </button>
                        <button
                            type="button"
                            className="nn-navigation-calendar-today"
                            aria-label={strings.dateGroups.today}
                            onClick={handleToday}
                        >
                            {strings.dateGroups.today}
                        </button>
                        <button
                            type="button"
                            className="nn-navigation-calendar-nav-button"
                            aria-label={strings.common.next}
                            onClick={() => handleNavigate(1)}
                        >
                            <ServiceIcon iconId="lucide-chevron-right" aria-hidden={true} />
                        </button>
                    </div>
                </div>

                <div className="nn-navigation-calendar-grid" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
                    <div className="nn-navigation-calendar-weekdays" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
                        {showWeekNumbers ? <div className="nn-navigation-calendar-weeknumber-spacer" /> : null}
                        {weekdays.map((day, index) => (
                            <div key={(weekStartsOn + index) % 7} className="nn-navigation-calendar-weekday">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="nn-navigation-calendar-weeks" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
                        {weeks.map(week => (
                            <div key={week.key} className="nn-navigation-calendar-week">
                                {showWeekNumbers ? (
                                    <div className="nn-navigation-calendar-weeknumber" aria-hidden="true">
                                        {week.weekNumber}
                                    </div>
                                ) : null}
                                {week.days.map(day => {
                                    const dayNumber = day.date.date();
                                    const hasDailyNote = Boolean(day.file);
                                    const featureImageUrl = featureImageUrls[day.iso] ?? null;
                                    const hasFeatureImageKey = featureImageKeysByIso.has(day.iso);
                                    const isToday = todayIso === day.iso;

                                    const className = [
                                        'nn-navigation-calendar-day',
                                        day.inMonth ? 'is-in-month' : 'is-outside-month',
                                        isToday ? 'is-today' : '',
                                        hasDailyNote ? 'has-daily-note' : '',
                                        hasFeatureImageKey ? 'has-feature-image-key' : '',
                                        featureImageUrl ? 'has-feature-image' : ''
                                    ]
                                        .filter(Boolean)
                                        .join(' ');

                                    const style: React.CSSProperties | undefined = featureImageUrl
                                        ? { backgroundImage: `url(${featureImageUrl})` }
                                        : undefined;

                                    const ariaLabel = day.date.clone().locale(displayLocale).format('LL');
                                    const tooltipText = day.title ? `${ariaLabel}\n${day.title}` : ariaLabel;
                                    const tooltipAriaText = tooltipText.replace(/\n+/gu, ', ');
                                    const tooltipEnabled = Boolean(day.file || featureImageUrl);

                                    return (
                                        <CalendarDayButton
                                            key={day.iso}
                                            className={className}
                                            ariaText={tooltipAriaText}
                                            style={style}
                                            tooltipEnabled={tooltipEnabled}
                                            tooltipImageUrl={featureImageUrl}
                                            tooltipText={tooltipText}
                                            dayNumber={dayNumber}
                                            isMobile={isMobile}
                                            onShowTooltip={handleShowTooltip}
                                            onHideTooltip={handleHideTooltip}
                                            onClick={() => openOrCreateDailyNote(day.date, day.file)}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
