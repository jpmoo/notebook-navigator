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
import { Menu, Notice, TFile } from 'obsidian';
import { getWeek, getWeekYear } from 'date-fns';
import { getCurrentLanguage, strings } from '../i18n';
import { ConfirmModal } from '../modals/ConfirmModal';
import { useServices } from '../context/ServicesContext';
import { useSettingsState } from '../context/SettingsContext';
import { useFileCacheOptional } from '../context/StorageContext';
import { getDBInstanceOrNull } from '../storage/fileOperations';
import { runAsyncAction } from '../utils/async';
import { DateUtils } from '../utils/dateUtils';
import {
    createDailyNote,
    getDailyNoteFile,
    getDailyNoteFilename,
    getDailyNoteSettings as getCoreDailyNoteSettings
} from '../utils/dailyNotes';
import { getMomentApi, resolveMomentLocale, type MomentInstance } from '../utils/moment';
import { getCalendarWeekConfig } from '../utils/dateFnsLocale';
import { ServiceIcon } from './ServiceIcon';
import { useFileOpener } from '../hooks/useFileOpener';
import { extractFrontmatterName } from '../utils/metadataExtractor';
import {
    buildCustomCalendarFilePathForPattern,
    buildCustomCalendarMomentPattern,
    createCalendarMarkdownFile,
    getCalendarNoteConfig,
    getCalendarTemplatePath,
    type CalendarNoteConfig,
    type CalendarNoteKind
} from '../utils/calendarNotes';
import {
    createCalendarCustomDateFormatter,
    ensureMarkdownFileName,
    getCalendarCustomWeekAnchorDate,
    isCalendarCustomDatePatternValid,
    normalizeCalendarVaultFolderPath,
    splitCalendarCustomPattern
} from '../utils/calendarCustomNotePatterns';
import { getTooltipPlacement } from '../utils/domUtils';
import { resolveUXIconForMenu } from '../utils/uxIcons';
import { getActiveVaultProfile } from '../utils/vaultProfiles';
import type { CalendarWeeksToShow, CalendarWeekendDays } from '../settings/types';

interface CalendarHoverTooltipData {
    imageUrl: string | null;
    title: string;
    dateTimestamp: number;
    previewPath: string | null;
    previewEnabled: boolean;
    showDate: boolean;
}

interface CalendarDay {
    date: MomentInstance;
    iso: string;
    inMonth: boolean;
    file: TFile | null;
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
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
    style: React.CSSProperties | undefined;
    tooltipEnabled: boolean;
    tooltipData: CalendarHoverTooltipData;
    onHideTooltip: (element: HTMLElement) => void;
    onShowTooltip: (element: HTMLElement, tooltipData: CalendarHoverTooltipData) => void;
}

/** Renders a calendar day button with hover tooltip support on desktop */
function CalendarDayButton({
    className,
    ariaText,
    dayNumber,
    isMobile,
    onClick,
    onContextMenu,
    style,
    tooltipEnabled,
    tooltipData,
    onHideTooltip,
    onShowTooltip
}: CalendarDayButtonProps) {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const { dateTimestamp, imageUrl, previewEnabled, previewPath, showDate, title } = tooltipData;
    const tooltipDataMemo = useMemo<CalendarHoverTooltipData>(
        () => ({
            imageUrl,
            title,
            dateTimestamp,
            previewPath,
            previewEnabled,
            showDate
        }),
        [dateTimestamp, imageUrl, previewEnabled, previewPath, showDate, title]
    );

    const handleMouseEnter = useCallback(() => {
        if (isMobile || !tooltipEnabled) {
            return;
        }

        const element = buttonRef.current;
        if (!element) {
            return;
        }

        onShowTooltip(element, tooltipDataMemo);
    }, [isMobile, onShowTooltip, tooltipDataMemo, tooltipEnabled]);

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

        onShowTooltip(element, tooltipDataMemo);
    }, [isMobile, onShowTooltip, tooltipDataMemo, tooltipEnabled]);

    return (
        <button
            ref={buttonRef}
            type="button"
            className={className}
            style={style}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onContextMenu={onContextMenu}
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

function isWeekendDay(dayOfWeek: number, weekendDays: CalendarWeekendDays): boolean {
    switch (weekendDays) {
        case 'none':
            return false;
        case 'fri-sat':
            return dayOfWeek === 5 || dayOfWeek === 6;
        case 'thu-fri':
            return dayOfWeek === 4 || dayOfWeek === 5;
        case 'sat-sun':
        default:
            return dayOfWeek === 0 || dayOfWeek === 6;
    }
}

export interface NavigationPaneCalendarProps {
    onWeekCountChange?: (count: number) => void;
    onNavigationAction?: () => void;
    layout?: 'overlay' | 'panel';
    weeksToShowOverride?: CalendarWeeksToShow;
}

interface CalendarHoverTooltipState {
    anchorEl: HTMLElement;
    tooltipData: CalendarHoverTooltipData;
}

type CustomCalendarNoteKind = CalendarNoteKind;
type CustomCalendarNoteConfig = CalendarNoteConfig;

export function NavigationPaneCalendar({
    onWeekCountChange,
    onNavigationAction,
    layout = 'overlay',
    weeksToShowOverride
}: NavigationPaneCalendarProps) {
    const { app, fileSystemOps, isMobile } = useServices();
    const settings = useSettingsState();
    const periodicNotesFolder = getActiveVaultProfile(settings).periodicNotesFolder;
    const customCalendarRootFolderSettings = useMemo(() => ({ calendarCustomRootFolder: periodicNotesFolder }), [periodicNotesFolder]);
    const weeksToShowSetting = weeksToShowOverride ?? settings.calendarWeeksToShow;
    const fileCache = useFileCacheOptional();
    const [dbFallback, setDbFallback] = useState(() => getDBInstanceOrNull());
    const db = fileCache?.getDB() ?? dbFallback;
    const openFile = useFileOpener();
    const calendarLabelId = useId();

    const momentApi = getMomentApi();
    const [cursorDate, setCursorDate] = useState<MomentInstance | null>(() => (momentApi ? momentApi().startOf('day') : null));
    const todayIso = momentApi ? formatIsoDate(momentApi().startOf('day')) : null;

    const [vaultVersion, setVaultVersion] = useState(0);
    const [contentVersion, setContentVersion] = useState(0);
    const [metadataVersion, setMetadataVersion] = useState(0);
    const visibleDailyNotePathsRef = useRef<Set<string>>(new Set());
    const hoverTooltipStateRef = useRef<CalendarHoverTooltipState | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (fileCache) {
            return;
        }

        if (dbFallback) {
            return;
        }

        let isActive = true;
        const intervalId = window.setInterval(() => {
            if (!isActive) {
                return;
            }

            const instance = getDBInstanceOrNull();
            if (!instance) {
                return;
            }

            window.clearInterval(intervalId);
            setDbFallback(instance);
        }, 250);

        return () => {
            isActive = false;
            window.clearInterval(intervalId);
        };
    }, [dbFallback, fileCache]);

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
        if (!db) {
            return;
        }

        return db.onContentChange(changes => {
            const visiblePaths = visibleDailyNotePathsRef.current;
            const hasCalendarRelevantChange = changes.some(change => {
                if (!visiblePaths.has(change.path)) {
                    return false;
                }
                return (
                    change.changes.preview !== undefined ||
                    change.changes.featureImage !== undefined ||
                    change.changes.featureImageKey !== undefined ||
                    change.changes.featureImageStatus !== undefined
                );
            });

            if (hasCalendarRelevantChange) {
                setContentVersion(v => v + 1);
            }
        });
    }, [db]);

    useEffect(() => {
        if (!settings.useFrontmatterMetadata) {
            return;
        }

        const offref = app.metadataCache.on('changed', file => {
            if (!file) {
                return;
            }
            if (!visibleDailyNotePathsRef.current.has(file.path)) {
                return;
            }
            setMetadataVersion(v => v + 1);
        });

        return () => {
            app.metadataCache.offref(offref);
        };
    }, [app.metadataCache, settings.useFrontmatterMetadata]);

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
        const localeData = momentApi().locale(displayLocale).localeData();
        const labels = layout === 'panel' ? localeData.weekdaysShort() : localeData.weekdaysMin();
        if (!Array.isArray(labels) || labels.length !== 7) {
            return [];
        }
        const ordered = [...labels.slice(firstDay), ...labels.slice(0, firstDay)];
        if (layout === 'panel') {
            return ordered.map(label => {
                const normalized = label.trim().replace(/\./g, '');
                return normalized.length > 3 ? normalized.slice(0, 3) : normalized;
            });
        }
        return ordered.map(label => Array.from(label.trim())[0] ?? '');
    }, [displayLocale, layout, momentApi, weekStartsOn]);

    const dailyNoteSettings = useMemo(() => {
        // Force refresh when vault contents change so `getDailyNoteFile()` reflects created/renamed/deleted daily notes.
        void vaultVersion;
        if (settings.calendarIntegrationMode !== 'daily-notes') {
            return null;
        }
        return getCoreDailyNoteSettings(app);
    }, [app, settings.calendarIntegrationMode, vaultVersion]);

    const customCalendarDayPathBuilder = useMemo(() => {
        const { folderPattern, filePattern } = splitCalendarCustomPattern(settings.calendarCustomFilePattern);
        const folderFormatter = createCalendarCustomDateFormatter(folderPattern);
        const fileFormatter = createCalendarCustomDateFormatter(filePattern);
        const customRootFolder = periodicNotesFolder;
        const momentPattern = folderPattern ? `${folderPattern}/${filePattern}` : filePattern;

        const filePathForDate = (date: MomentInstance): string => {
            const folderSuffix = folderFormatter(date);
            const rawFolderPath = customRootFolder
                ? folderSuffix
                    ? `${customRootFolder}/${folderSuffix}`
                    : customRootFolder
                : folderSuffix;
            const folderPath = normalizeCalendarVaultFolderPath(rawFolderPath || '/');

            const formattedFilePattern = fileFormatter(date).trim();
            const fileName = ensureMarkdownFileName(formattedFilePattern);
            return folderPath === '/' ? fileName : `${folderPath}/${fileName}`;
        };

        return { filePathForDate, momentPattern };
    }, [settings.calendarCustomFilePattern, periodicNotesFolder]);

    const weeks = useMemo<CalendarWeek[]>(() => {
        if (!momentApi || !cursorDate) {
            return [];
        }

        // Force refresh when vault contents change so custom calendar resolution reflects created/renamed/deleted notes.
        void vaultVersion;

        const integrationMode = settings.calendarIntegrationMode;
        const canResolveCustomDayNotes =
            integrationMode === 'notebook-navigator' &&
            isCalendarCustomDatePatternValid(customCalendarDayPathBuilder.momentPattern, momentApi);

        const weeksToShow = clamp(weeksToShowSetting, 1, 6);
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

                if (canResolveCustomDayNotes) {
                    const filePath = customCalendarDayPathBuilder.filePathForDate(date);
                    const existing = app.vault.getAbstractFileByPath(filePath);
                    file = existing instanceof TFile ? existing : null;
                } else {
                    file = dailyNoteSettings ? getDailyNoteFile(app, date, dailyNoteSettings) : null;
                }

                days.push({ date, iso, inMonth, file });
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
        settings.calendarIntegrationMode,
        weeksToShowSetting,
        customCalendarDayPathBuilder,
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

        if (!settings.calendarShowFeatureImage) {
            return new Map<string, string>();
        }

        if (!db) {
            return new Map<string, string>();
        }

        const keys = new Map<string, string>();

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
    }, [contentVersion, db, settings.calendarShowFeatureImage, weeks]);

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
    const lastHoverTooltipPreviewVisibleRef = useRef<boolean | null>(null);

    const hoverTooltipPreviewText =
        hoverTooltip && db && hoverTooltip.tooltipData.previewEnabled && hoverTooltip.tooltipData.previewPath
            ? db.getCachedPreviewText(hoverTooltip.tooltipData.previewPath)
            : '';
    const shouldShowHoverTooltipPreview = hoverTooltipPreviewText.trim().length > 0;
    const hoverTooltipDateText =
        hoverTooltip && hoverTooltip.tooltipData.showDate
            ? DateUtils.formatDate(hoverTooltip.tooltipData.dateTimestamp, settings.dateFormat)
            : '';

    const frontmatterTitlesByPath = useMemo(() => {
        void metadataVersion;
        if (!settings.useFrontmatterMetadata) {
            return new Map<string, string>();
        }

        const titles = new Map<string, string>();
        for (const week of weeks) {
            for (const day of week.days) {
                const file = day.file;
                if (!file) {
                    continue;
                }

                const title = extractFrontmatterName(app, file, settings.frontmatterNameField).trim();
                if (!title) {
                    continue;
                }

                titles.set(file.path, title);
            }
        }

        return titles;
    }, [app, metadataVersion, settings.frontmatterNameField, settings.useFrontmatterMetadata, weeks]);

    const clearFeatureImageUrls = useCallback((resetState: boolean) => {
        const existing = featureImageUrlMapRef.current;
        if (existing.size === 0) {
            if (resetState) {
                setFeatureImageUrls(previous => (Object.keys(previous).length === 0 ? previous : {}));
            }
            return;
        }

        for (const entry of existing.values()) {
            URL.revokeObjectURL(entry.url);
        }
        existing.clear();

        if (resetState) {
            setFeatureImageUrls(previous => (Object.keys(previous).length === 0 ? previous : {}));
        }
    }, []);

    useEffect(() => {
        return () => {
            // Always release object URLs on unmount to avoid leaking blobs.
            clearFeatureImageUrls(false);
        };
    }, [clearFeatureImageUrls]);

    useEffect(() => {
        let isActive = true;

        if (!db || !settings.calendarShowFeatureImage) {
            clearFeatureImageUrls(true);
            return () => {
                isActive = false;
            };
        }

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
    }, [clearFeatureImageUrls, db, featureImageKeysByIso, settings.calendarShowFeatureImage, weeks]);

    useEffect(() => {
        hoverTooltipStateRef.current = hoverTooltip;
    }, [hoverTooltip]);

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

    useLayoutEffect(() => {
        if (!hoverTooltip || isMobile) {
            lastHoverTooltipPreviewVisibleRef.current = null;
            return;
        }

        const previous = lastHoverTooltipPreviewVisibleRef.current;
        lastHoverTooltipPreviewVisibleRef.current = shouldShowHoverTooltipPreview;

        if (previous === null || previous === shouldShowHoverTooltipPreview) {
            return;
        }

        updateHoverTooltipPosition();
    }, [hoverTooltip, isMobile, shouldShowHoverTooltipPreview, updateHoverTooltipPosition]);

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

    const handleShowTooltip = useCallback(
        (element: HTMLElement, tooltipData: CalendarHoverTooltipData) => {
            if (hoverTooltipAnchorRef.current !== element) {
                hoverTooltipAnchorRef.current = element;
                setHoverTooltipStyle(null);
            }

            const existing = hoverTooltipStateRef.current;
            const current = existing && existing.anchorEl === element ? existing.tooltipData : null;
            const isUnchanged =
                current !== null &&
                current.imageUrl === tooltipData.imageUrl &&
                current.title === tooltipData.title &&
                current.dateTimestamp === tooltipData.dateTimestamp &&
                current.previewPath === tooltipData.previewPath &&
                current.previewEnabled === tooltipData.previewEnabled &&
                current.showDate === tooltipData.showDate;

            const previewPath = tooltipData.previewPath;
            if (!isUnchanged && tooltipData.previewEnabled && previewPath && db) {
                runAsyncAction(() => db.ensurePreviewTextLoaded(previewPath));
            }

            setHoverTooltip(existing => {
                if (existing && existing.anchorEl === element) {
                    const current = existing.tooltipData;
                    if (
                        current.imageUrl === tooltipData.imageUrl &&
                        current.title === tooltipData.title &&
                        current.dateTimestamp === tooltipData.dateTimestamp &&
                        current.previewPath === tooltipData.previewPath &&
                        current.previewEnabled === tooltipData.previewEnabled &&
                        current.showDate === tooltipData.showDate
                    ) {
                        return existing;
                    }
                }

                return { anchorEl: element, tooltipData };
            });
        },
        [db]
    );

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

    const handleNavigate = useCallback(
        (delta: number) => {
            if (!momentApi) {
                return;
            }
            setHoverTooltip(null);
            const weeksToShow = clamp(weeksToShowSetting, 1, 6);
            const unit = weeksToShow === 6 ? 'month' : 'week';
            const step = weeksToShow === 6 ? delta : delta * weeksToShow;

            setCursorDate(prev => (prev ?? momentApi().startOf('day')).clone().add(step, unit));
            onNavigationAction?.();
        },
        [momentApi, onNavigationAction, weeksToShowSetting]
    );

    const handleToday = useCallback(() => {
        if (!momentApi) {
            return;
        }
        setHoverTooltip(null);
        setCursorDate(momentApi().startOf('day'));
        onNavigationAction?.();
    }, [momentApi, onNavigationAction]);

    const collapseNavigationIfMobile = useCallback(() => {
        if (!isMobile || !app.workspace.leftSplit) {
            return;
        }
        // On mobile, opening a daily note should feel like navigating away from the sidebar.
        app.workspace.leftSplit.collapse();
    }, [app, isMobile]);

    const getCustomCalendarNoteConfig = useCallback(
        (kind: CustomCalendarNoteKind): CustomCalendarNoteConfig => getCalendarNoteConfig(kind, settings),
        [settings]
    );

    const getExistingCustomCalendarNoteFile = useCallback(
        (kind: CustomCalendarNoteKind, date: MomentInstance): TFile | null => {
            const config = getCustomCalendarNoteConfig(kind);
            const momentPattern = buildCustomCalendarMomentPattern(config.calendarCustomFilePattern, config.fallbackPattern);
            if (!config.isPatternValid(momentPattern, momentApi)) {
                return null;
            }
            const dateForPath = kind === 'week' ? getCalendarCustomWeekAnchorDate(date, momentPattern, calendarRulesLocale) : date;
            const { filePath } = buildCustomCalendarFilePathForPattern(
                dateForPath,
                customCalendarRootFolderSettings,
                config.calendarCustomFilePattern,
                config.fallbackPattern
            );
            const existing = app.vault.getAbstractFileByPath(filePath);
            return existing instanceof TFile ? existing : null;
        },
        [app, calendarRulesLocale, customCalendarRootFolderSettings, getCustomCalendarNoteConfig, momentApi]
    );

    const openOrCreateCustomCalendarNote = useCallback(
        (kind: CustomCalendarNoteKind, date: MomentInstance, existingFile: TFile | null) => {
            if (existingFile) {
                openFile(existingFile, { active: true });
                collapseNavigationIfMobile();
                return;
            }

            const config = getCustomCalendarNoteConfig(kind);
            const momentPattern = buildCustomCalendarMomentPattern(config.calendarCustomFilePattern, config.fallbackPattern);
            if (!config.isPatternValid(momentPattern, momentApi)) {
                new Notice(config.parsingErrorText);
                return;
            }

            setHoverTooltip(null);

            const dateForPath = kind === 'week' ? getCalendarCustomWeekAnchorDate(date, momentPattern, calendarRulesLocale) : date;

            const { folderPath, fileName, filePath } = buildCustomCalendarFilePathForPattern(
                dateForPath,
                customCalendarRootFolderSettings,
                config.calendarCustomFilePattern,
                config.fallbackPattern
            );

            const existing = app.vault.getAbstractFileByPath(filePath);
            if (existing instanceof TFile) {
                openFile(existing, { active: true });
                collapseNavigationIfMobile();
                return;
            }

            const createCustomNote = async () => {
                let created: TFile;
                try {
                    const templatePath = getCalendarTemplatePath(kind, settings);
                    created = await createCalendarMarkdownFile(app, folderPath, fileName, templatePath);
                } catch (error) {
                    console.error('Failed to create calendar note', error);
                    new Notice(strings.common.unknownError);
                    return;
                }

                setVaultVersion(v => v + 1);
                openFile(created, { active: true });
                collapseNavigationIfMobile();
            };

            const createFile = () => runAsyncAction(() => createCustomNote());

            if (settings.calendarConfirmBeforeCreate) {
                new ConfirmModal(
                    app,
                    strings.paneHeader.newNote,
                    strings.navigationCalendar.createDailyNote.message.replace('{filename}', filePath),
                    createFile,
                    strings.navigationCalendar.createDailyNote.confirmButton,
                    { confirmButtonClass: 'mod-cta' }
                ).open();
                return;
            }

            createFile();
        },
        [
            app,
            calendarRulesLocale,
            collapseNavigationIfMobile,
            customCalendarRootFolderSettings,
            getCustomCalendarNoteConfig,
            momentApi,
            openFile,
            settings,
            setHoverTooltip
        ]
    );

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
                        () => {
                            runAsyncAction(createFile);
                        },
                        strings.navigationCalendar.createDailyNote.confirmButton,
                        { confirmButtonClass: 'mod-cta' }
                    ).open();
                    return;
                }

                runAsyncAction(() => createFile());
                return;
            }

            openOrCreateCustomCalendarNote('day', date, null);
        },
        [app, collapseNavigationIfMobile, dailyNoteSettings, openFile, openOrCreateCustomCalendarNote, settings]
    );

    const showCalendarNoteContextMenu = useCallback(
        (
            event: React.MouseEvent<HTMLElement>,
            target: {
                kind: CustomCalendarNoteKind;
                date: MomentInstance;
                existingFile: TFile | null;
                canCreate: boolean;
            }
        ) => {
            event.preventDefault();
            event.stopPropagation();

            setHoverTooltip(null);

            const menu = new Menu();

            const existingFile = target.existingFile;
            if (existingFile) {
                menu.addItem(item => {
                    item.setTitle(strings.contextMenu.file.deleteNote)
                        .setIcon('lucide-trash')
                        .onClick(() => {
                            runAsyncAction(() =>
                                fileSystemOps.deleteFile(existingFile, settings.confirmBeforeDelete, () => {
                                    setVaultVersion(v => v + 1);
                                    collapseNavigationIfMobile();
                                })
                            );
                        });
                });
            } else {
                menu.addItem(item => {
                    item.setTitle(strings.contextMenu.folder.newNote)
                        .setIcon(resolveUXIconForMenu(settings.interfaceIcons, 'list-new-note', 'lucide-pen-box'))
                        .setDisabled(!target.canCreate)
                        .onClick(() => {
                            if (!target.canCreate) {
                                return;
                            }

                            if (target.kind === 'day') {
                                runAsyncAction(() => openOrCreateDailyNote(target.date, null));
                                return;
                            }

                            runAsyncAction(() => openOrCreateCustomCalendarNote(target.kind, target.date, null));
                        });
                });
            }

            menu.showAtMouseEvent(event.nativeEvent);
        },
        [
            fileSystemOps,
            collapseNavigationIfMobile,
            openOrCreateCustomCalendarNote,
            openOrCreateDailyNote,
            setHoverTooltip,
            setVaultVersion,
            settings.confirmBeforeDelete,
            settings.interfaceIcons
        ]
    );

    const showWeekNumbers = settings.calendarShowWeekNumber;
    const highlightToday = settings.calendarHighlightToday;

    const isCustomCalendar = settings.calendarIntegrationMode === 'notebook-navigator';
    const weekNotesEnabled = isCustomCalendar && settings.calendarCustomWeekPattern.trim() !== '';
    const monthNotesEnabled = isCustomCalendar && settings.calendarCustomMonthPattern.trim() !== '';
    const quarterNotesEnabled = isCustomCalendar && settings.calendarCustomQuarterPattern.trim() !== '';
    const yearNotesEnabled = isCustomCalendar && settings.calendarCustomYearPattern.trim() !== '';

    const headerPeriodNoteFiles = useMemo(() => {
        void vaultVersion;
        if (!momentApi || !cursorDate) {
            return { month: null, quarter: null, year: null };
        }

        const date = cursorDate.clone().locale(displayLocale);

        const month = monthNotesEnabled ? getExistingCustomCalendarNoteFile('month', date) : null;
        const year = yearNotesEnabled ? getExistingCustomCalendarNoteFile('year', date) : null;
        const quarter = settings.calendarShowQuarter && quarterNotesEnabled ? getExistingCustomCalendarNoteFile('quarter', date) : null;

        return { month, quarter, year };
    }, [
        cursorDate,
        displayLocale,
        getExistingCustomCalendarNoteFile,
        momentApi,
        monthNotesEnabled,
        quarterNotesEnabled,
        settings.calendarShowQuarter,
        vaultVersion,
        yearNotesEnabled
    ]);

    const weekNoteFilesByKey = useMemo(() => {
        void vaultVersion;
        if (!momentApi || !cursorDate) {
            return new Map<string, TFile | null>();
        }

        if (!showWeekNumbers || !weekNotesEnabled) {
            return new Map<string, TFile | null>();
        }

        const entries = new Map<string, TFile | null>();
        for (const week of weeks) {
            const weekStart = week.days[0]?.date;
            if (!weekStart) {
                continue;
            }

            const weekDate = weekStart.clone().locale(calendarRulesLocale);
            const file = getExistingCustomCalendarNoteFile('week', weekDate);

            entries.set(week.key, file);
        }

        return entries;
    }, [
        calendarRulesLocale,
        cursorDate,
        getExistingCustomCalendarNoteFile,
        momentApi,
        showWeekNumbers,
        vaultVersion,
        weekNotesEnabled,
        weeks
    ]);

    if (!momentApi || !cursorDate) {
        return null;
    }

    const monthYearHeaderDate = cursorDate.clone().locale(displayLocale);
    const monthLabel = monthYearHeaderDate.format('MMMM');
    const yearLabel = monthYearHeaderDate.format('YYYY');
    const quarterLabel = monthYearHeaderDate.format('[Q]Q');

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
                          {hoverTooltip.tooltipData.imageUrl ? (
                              <div
                                  className="nn-navigation-calendar-hover-tooltip-image"
                                  style={{ backgroundImage: `url(${hoverTooltip.tooltipData.imageUrl})` }}
                              />
                          ) : null}
                          <div className="nn-compact-file-text-content">
                              <div
                                  className="nn-file-name"
                                  style={{ '--filename-rows': 2, height: 'auto', minHeight: 0 } as React.CSSProperties}
                              >
                                  {hoverTooltip.tooltipData.title}
                              </div>
                              {shouldShowHoverTooltipPreview ? (
                                  <div className="nn-file-preview" style={{ '--preview-rows': 2 } as React.CSSProperties}>
                                      {hoverTooltipPreviewText}
                                  </div>
                              ) : null}
                              {hoverTooltipDateText ? <div className="nn-file-date">{hoverTooltipDateText}</div> : null}
                          </div>
                      </div>,
                      document.body
                  )
                : null}
            <div
                className="nn-navigation-calendar"
                role="group"
                aria-labelledby={calendarLabelId}
                data-highlight-today={highlightToday ? 'true' : undefined}
                data-layout={layout}
                data-weeknumbers={showWeekNumbers ? 'true' : undefined}
            >
                <span id={calendarLabelId} className="nn-visually-hidden">
                    {strings.navigationCalendar.ariaLabel}
                </span>
                <div className="nn-navigation-calendar-header">
                    <div className="nn-navigation-calendar-month">
                        {monthNotesEnabled ? (
                            <button
                                type="button"
                                className={[
                                    'nn-navigation-calendar-period-button',
                                    'nn-navigation-calendar-period-month',
                                    headerPeriodNoteFiles.month ? 'has-period-note' : ''
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                onClick={() =>
                                    openOrCreateCustomCalendarNote(
                                        'month',
                                        cursorDate.clone().locale(displayLocale),
                                        headerPeriodNoteFiles.month
                                    )
                                }
                                onContextMenu={event =>
                                    showCalendarNoteContextMenu(event, {
                                        kind: 'month',
                                        date: cursorDate.clone().locale(displayLocale),
                                        existingFile: headerPeriodNoteFiles.month,
                                        canCreate: monthNotesEnabled
                                    })
                                }
                            >
                                {monthLabel}
                            </button>
                        ) : (
                            <span
                                className="nn-navigation-calendar-period-label nn-navigation-calendar-period-month"
                                onContextMenu={event =>
                                    showCalendarNoteContextMenu(event, {
                                        kind: 'month',
                                        date: cursorDate.clone().locale(displayLocale),
                                        existingFile: headerPeriodNoteFiles.month,
                                        canCreate: monthNotesEnabled
                                    })
                                }
                            >
                                {monthLabel}
                            </span>
                        )}

                        {yearNotesEnabled ? (
                            <button
                                type="button"
                                className={[
                                    'nn-navigation-calendar-period-button',
                                    'nn-navigation-calendar-period-year',
                                    headerPeriodNoteFiles.year ? 'has-period-note' : ''
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                onClick={() =>
                                    openOrCreateCustomCalendarNote(
                                        'year',
                                        cursorDate.clone().locale(displayLocale),
                                        headerPeriodNoteFiles.year
                                    )
                                }
                                onContextMenu={event =>
                                    showCalendarNoteContextMenu(event, {
                                        kind: 'year',
                                        date: cursorDate.clone().locale(displayLocale),
                                        existingFile: headerPeriodNoteFiles.year,
                                        canCreate: yearNotesEnabled
                                    })
                                }
                            >
                                {yearLabel}
                            </button>
                        ) : (
                            <span
                                className="nn-navigation-calendar-period-label nn-navigation-calendar-period-year"
                                onContextMenu={event =>
                                    showCalendarNoteContextMenu(event, {
                                        kind: 'year',
                                        date: cursorDate.clone().locale(displayLocale),
                                        existingFile: headerPeriodNoteFiles.year,
                                        canCreate: yearNotesEnabled
                                    })
                                }
                            >
                                {yearLabel}
                            </span>
                        )}

                        {settings.calendarShowQuarter ? (
                            quarterNotesEnabled ? (
                                <button
                                    type="button"
                                    className={[
                                        'nn-navigation-calendar-period-button',
                                        'nn-navigation-calendar-quarter-button',
                                        headerPeriodNoteFiles.quarter ? 'has-period-note' : ''
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    onClick={() =>
                                        openOrCreateCustomCalendarNote(
                                            'quarter',
                                            cursorDate.clone().locale(displayLocale),
                                            headerPeriodNoteFiles.quarter
                                        )
                                    }
                                    onContextMenu={event =>
                                        showCalendarNoteContextMenu(event, {
                                            kind: 'quarter',
                                            date: cursorDate.clone().locale(displayLocale),
                                            existingFile: headerPeriodNoteFiles.quarter,
                                            canCreate: settings.calendarShowQuarter && quarterNotesEnabled
                                        })
                                    }
                                >
                                    <span aria-hidden="true">(</span>
                                    {quarterLabel}
                                    <span aria-hidden="true">)</span>
                                </button>
                            ) : (
                                <span
                                    className="nn-navigation-calendar-period-label nn-navigation-calendar-quarter-label"
                                    onContextMenu={event =>
                                        showCalendarNoteContextMenu(event, {
                                            kind: 'quarter',
                                            date: cursorDate.clone().locale(displayLocale),
                                            existingFile: headerPeriodNoteFiles.quarter,
                                            canCreate: settings.calendarShowQuarter && quarterNotesEnabled
                                        })
                                    }
                                >
                                    <span aria-hidden="true">(</span>
                                    {quarterLabel}
                                    <span aria-hidden="true">)</span>
                                </span>
                            )
                        ) : null}
                    </div>
                    <div className="nn-navigation-calendar-nav">
                        <button
                            type="button"
                            className="nn-navigation-calendar-nav-button nn-navigation-calendar-nav-prev"
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
                            className="nn-navigation-calendar-nav-button nn-navigation-calendar-nav-next"
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
                        {showWeekNumbers ? <div className="nn-navigation-calendar-weeknumber-divider" aria-hidden="true" /> : null}
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
                                    <>
                                        {weekNotesEnabled ? (
                                            <button
                                                type="button"
                                                className={[
                                                    'nn-navigation-calendar-weeknumber',
                                                    'nn-navigation-calendar-weeknumber-button',
                                                    weekNoteFilesByKey.get(week.key) ? 'has-period-note' : ''
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                                onClick={() => {
                                                    const weekStart = week.days[0]?.date;
                                                    if (!weekStart) {
                                                        return;
                                                    }

                                                    openOrCreateCustomCalendarNote(
                                                        'week',
                                                        weekStart.clone().locale(calendarRulesLocale),
                                                        weekNoteFilesByKey.get(week.key) ?? null
                                                    );
                                                }}
                                                onContextMenu={event => {
                                                    const weekStart = week.days[0]?.date;
                                                    if (!weekStart) {
                                                        return;
                                                    }

                                                    showCalendarNoteContextMenu(event, {
                                                        kind: 'week',
                                                        date: weekStart.clone().locale(calendarRulesLocale),
                                                        existingFile: weekNoteFilesByKey.get(week.key) ?? null,
                                                        canCreate: weekNotesEnabled
                                                    });
                                                }}
                                            >
                                                {week.weekNumber}
                                            </button>
                                        ) : (
                                            <div
                                                className="nn-navigation-calendar-weeknumber"
                                                aria-hidden="true"
                                                onContextMenu={event => {
                                                    const weekStart = week.days[0]?.date;
                                                    if (!weekStart) {
                                                        return;
                                                    }

                                                    showCalendarNoteContextMenu(event, {
                                                        kind: 'week',
                                                        date: weekStart.clone().locale(calendarRulesLocale),
                                                        existingFile: null,
                                                        canCreate: weekNotesEnabled
                                                    });
                                                }}
                                            >
                                                {week.weekNumber}
                                            </div>
                                        )}
                                        <div className="nn-navigation-calendar-weeknumber-divider" aria-hidden="true" />
                                    </>
                                ) : null}
                                {week.days.map(day => {
                                    const dayNumber = day.date.date();
                                    const hasDailyNote = Boolean(day.file);
                                    const featureImageUrl = featureImageUrls[day.iso] ?? null;
                                    const hasFeatureImageKey = featureImageKeysByIso.has(day.iso);
                                    const isToday = todayIso === day.iso;
                                    const dayOfWeek = day.date.toDate().getDay();
                                    const isWeekend = isWeekendDay(dayOfWeek, settings.calendarWeekendDays);

                                    const className = [
                                        'nn-navigation-calendar-day',
                                        day.inMonth ? 'is-in-month' : 'is-outside-month',
                                        isToday ? 'is-today' : '',
                                        isWeekend ? 'is-weekend' : 'is-weekday',
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
                                    const dateTimestamp = day.date.toDate().getTime();
                                    const frontmatterTitle = day.file ? (frontmatterTitlesByPath.get(day.file.path) ?? '') : '';
                                    const hasFrontmatterTitle = frontmatterTitle.trim().length > 0;
                                    const tooltipTitle = hasFrontmatterTitle
                                        ? frontmatterTitle
                                        : DateUtils.formatDate(dateTimestamp, settings.dateFormat);
                                    const showDate = hasFrontmatterTitle;
                                    const tooltipAriaText = hasFrontmatterTitle ? `${ariaLabel}, ${frontmatterTitle}` : ariaLabel;
                                    const tooltipEnabled = Boolean(day.file || featureImageUrl);
                                    const tooltipData: CalendarHoverTooltipData = {
                                        imageUrl: featureImageUrl,
                                        title: tooltipTitle || ariaLabel,
                                        dateTimestamp,
                                        previewPath: day.file?.path ?? null,
                                        previewEnabled: Boolean(day.file && day.file.extension === 'md'),
                                        showDate
                                    };

                                    return (
                                        <CalendarDayButton
                                            key={day.iso}
                                            className={className}
                                            ariaText={tooltipAriaText}
                                            style={style}
                                            tooltipEnabled={tooltipEnabled}
                                            tooltipData={tooltipData}
                                            dayNumber={dayNumber}
                                            isMobile={isMobile}
                                            onShowTooltip={handleShowTooltip}
                                            onHideTooltip={handleHideTooltip}
                                            onClick={() => openOrCreateDailyNote(day.date, day.file)}
                                            onContextMenu={event =>
                                                showCalendarNoteContextMenu(event, {
                                                    kind: 'day',
                                                    date: day.date,
                                                    existingFile: day.file,
                                                    canCreate:
                                                        settings.calendarIntegrationMode !== 'daily-notes' || Boolean(dailyNoteSettings)
                                                })
                                            }
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
