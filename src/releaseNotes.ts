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

/**
 * Release Notes System
 *
 * This module manages the "What's new" feature that shows users what has changed
 * between plugin versions. The system works as follows:
 *
 * 1. On plugin load, it compares the current version with the last shown version
 * 2. If version increased, it shows all release notes between versions
 * 3. If downgraded or same version, it shows the latest 5 releases
 * 4. Individual releases can be marked with showOnUpdate: false to skip auto-display
 * 5. Users can always manually access release notes via plugin settings
 *
 * The lastShownVersion is stored in plugin settings to track what the user has seen.
 */

/**
 * Formatting in release notes
 *
 * Supported inline formats in both info and list items:
 * - Bold text: **text**
 * - Critical emphasis (red + bold): ==text==
 * - Markdown link: [label](https://example.com)
 * - Auto-link: https://example.com
 *
 * Not supported:
 * - Italics, headings, inline code, HTML
 *
 * Writing rules:
 * - Use factual, concise statements
 * - Avoid benefit language and subjective adjectives
 * - Keep to the categories: new, improved, changed, fixed
 */

/**
 * Represents a single release note entry
 */
export interface ReleaseNote {
    version: string;
    date: string;
    /** If false, skip automatic modal display for this version during startup */
    showOnUpdate?: boolean;
    /** Optional YouTube video URL shown above the release notes for this version */
    youtubeUrl?: string;
    info?: string; // General information about the release, shown at top without bullets
    new?: string[];
    improved?: string[];
    changed?: string[];
    fixed?: string[];
}

/**
 * All release notes for the plugin, ordered from newest to oldest.
 *
 * When adding a new release:
 * 1. Add it at the beginning of the array (newest first)
 * 2. Categorize features into: new, improved, changed, or fixed arrays
 */
const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: '2.4.2',
        date: '2026-02-23',
        showOnUpdate: true,
        new: [
            'Greatly improved the way you work with Properties! Firstup, a new ==Property key selection modal== was added with property search, select all/deselect all properties, and the option to choose if each property should be shown in the navigation pane, in the list pane, or both.',
            'Secondly, you can now ==rename and delete property keys== in the property tree.',
            'You can also ==create a new note directly in property view==. You can create new notes in properties using context menu, the toolbar button or using "Create new note".',
            'New setting: ==List > Delete attachments==. Optionally delete linked attachments when deleting files, works just like Obsidian 1.12.2 and later. Default value <ask>.',
            'New setting: ==List > Open new notes in new tab==. New notes open in a new tab instead of replacing the current tab. Default disabled.',
            'The command "Add to shortcuts" now removes the selected item from shortcuts if it is already pinned.'
        ],
        improved: [
            'Custom folder sort order is now applied when grouping by folder in list pane.',
            'Saving a search shortcut now shows the option: "Always start in: {path}". This means the shortcut will always start in the folder, tag or property where you saved it.',
            'Visible property keys are now saved per vault profile.',
            'Date no longer shows for pinned items when "Variable note height" is enabled.'
        ],
        changed: [
            'Property key configuration was moved from Navigation Pane to the General settings tab.',
            'In list pane, property keys with no values are no longer showing (previously the key was showing). Also if a property key is not visible in navigation pane the property is not clickable in list pane (unless it is a wiki link).'
        ],
        fixed: ["Fixed an issue where today's date and file list did not update when a new day started."]
    },
    {
        version: '2.4.1',
        date: '2026-02-18',
        showOnUpdate: false,
        fixed: [
            'Fixed an issue where the calendar could use locale week rules for custom week patterns using ISO week tokens ("W" or "G").',
            'Fixed an issue where new notes created from tag view wrote the selected tag in lowercase in note properties.'
        ]
    },
    {
        version: '2.4.0',
        date: '2026-02-18',
        showOnUpdate: true,
        new: [
            '==Property browser==. You can now browse file properties in the navigation pane. Properties are organized in a tree showing property keys and their values with file counts, just like tags. Supports custom colors, icons, context menus, and drag and drop. Just right-click "Properties" and choose "Configure property keys" to get started!',
            '==Create new note in tag==. Right-click a tag in the navigation pane and select "New note" to create a file with that tag. Respects Obsidian\'s "Default location for new notes" setting. This makes it possible to finally work 100% in the tag browser in Notebook Navigator.',
            '==Filter search: folder filters==. Filter notes by folder with "folder:" and "-folder:" tokens. Supports both wildcards "folder:notes" and specific paths "folder:/work/meetingnotes".',
            '==Filter search: extension filters==. Filter files by extension with "ext:" and "-ext:" tokens. For example, "ext:pdf" to show only PDF files or "-ext:md" to exclude markdown files. Can be combined with other filters.',
            '==Folder notes now read and write icon, color and background color to frontmatter==! A new setting List > Frontmatter > Background field is used to read and write background color.',
            'New setting: ==Shortcuts > Recent notes > Hide notes==. You can now hide folder notes from recent notes, useful if you name all your folder notes the same name.',
            "New setting: ==General > Auto reveal > Use shortest path==. Default enabled, if enabled auto-reveal will select the nearest visible ancestor folder or tag. If disabled, auto-reveal will select the file's actual folder and exact tag.",
            'New setting: ==List > Property to sort by > Secondary sort==. Defines what to sort by for files which do not have the custom property. Can be title, file name, date created or date edited.',
            'New command: ==Navigate to property==. Opens a fuzzy search modal listing all property keys and values. Selecting one navigates to it in the navigation pane.',
            'New icons for ==tags, property keys, and property values== in the navigation pane. Configurable in settings.',
            'Public API 1.3: ==Property metadata and navigation==. New methods for getting and setting property colors, background colors, and icons. New navigateToProperty() method for navigating to properties in the UI.'
        ],
        improved: [
            'Subfolder group headers in list pane ==are now clickable when grouping by folder==.',
            'The setting "Hide notes with properties" was renamed to "Hide notes with property rules". ==You can now hide properties with specific keys values==, like status=done, or published=true.',
            '==Tags and properties in File Item now show custom icons== within the pills if set. This makes it much easier to know which property is showing.'
        ],
        changed: [
            'Removed the setting ==Save icons and colors to frontmatter==. Icons and colors are now always saved to frontmatter if frontmatter metadata is enabled.',
            'Settings are now organized in a ==two-level hierarchy== with icons. Main groups (General, Navigation Pane, List Pane, Calendar) now have subtabs for easier navigation.',
            'Most placeholders now use english property names for all locales.'
        ],
        fixed: [
            'Fixed an issue where moving files did not update list pane until refreshing the view.',
            'Fixed an issue where full month calendar in navigation pane always reserved 6 lines, even if month had 4 or 5 weeks.',
            'Fixed an issue where clicking on a week in calendar view opened wrong week in some locales.'
        ]
    },
    {
        version: '2.3.1',
        date: '2026-02-10',
        showOnUpdate: false,
        fixed: ['Fixed an issue in task parsing that could freeze Obsidian during startup in vaults with large task datasets.']
    },
    {
        version: '2.3.0',
        date: '2026-02-10',
        showOnUpdate: true,
        new: [
            '==Tasks==. Notebook Navigator now keeps track of tasks for each document. You can now show notes with unfinished tasks in search, list pane and the calendar. You can also set a custom icon for notes with unfinished tasks in settings.',
            '==Custom SVG icons==. You can now use SVG images from your vault for icons. Just pick the new "Vault" tab in the icon picker.',
            '==Date filters in search==! You can now filter notes by date using the "@" symbol. Some examples: @today, @2026W02, @2026-Q1, @13/02/2026, or ranges like @2026-01-01..2026-02-07. You can specifically choose created date with @c:, modified date with @m:, or exclude date matches with -@.',
            '==Date filters in calendar==! You can CMD+Click day, week, month, quarter or year in the calendar to show all notes for that period in the list pane!',
            '==Quickly switch between filter search and Omnisearch==! Quickly switch between filter search and Omnisearch by pressing the search icon or pressing UP/DOWN when the search input is focused.',
            '==Emojis in tags==! You can now use emojis when naming and renaming tags. Inline tag operations show a warning confirmation when a tag contains characters Obsidian cannot parse inline (example: ‼ can split an inline tag). YAML frontmatter tags can contain any characters.',
            'You can now set individual colors for property values in ==Notes > Property colors==! Use property:value=color to set colors for individual property values, like status:done=green and status:todo=red. If no value color is set it will fall back to the property color if defined.',
            'New setting: ==Notes > Show icon for notes with unfinished tasks==. Enable to show an icon in listpane for notes with unfinished tasks. Tasks now will also show in the calendar for daily notes with unfinished tasks. You can also set a custom color for the task icon in Style settings.',
            'New setting: ==Folders & tags > Folder note name pattern==. You can now add prefixes and suffixes to folder note names, like _foldername to make them appear on top of alphabetically sorted lists.',
            'New setting: ==Folders & tags > Folder note template==. You can now set a template file for folder notes.',
            'New setting: ==Navigation pane > Show indent guides==. You can now show vertical indent guides in the navigation pane to better visualize the folder and tag hierarchy.',
            'New setting: ==Calendar > Single pane placement==. You can now choose to show the left sidebar calendar in the navigation pane (default) or below both panes.',
            'New command: ==Toggle compact mode==. Quickly toggle between default and compact mode in list pane. Bind it to a hot key or a button with the Commander plugin.',
            'New search filter: ==has:task==. Use this to filter notes that have unfinished tasks.',
            'Many new ==theming variables for borders==! You can now set border width and border color for most visual elements.'
        ],
        improved: [
            'Folders with folder notes can now be clicked in the list pane header! This means you can go straight from the file list to your folder note.',
            'Folder notes with "frontmatter metadata name" now show that name in the navigation pane instead of the folder name.',
            'Many visual improvements to calendar. Days with notes now show as dots, and the overall look and feel is much improved.',
            'The calendar now also shows a small circle for notes with unfinished tasks.',
            'You can now remove individual icons from the recently used icons list.',
            'Omnisearch now scopes searches to the selected folder when possible. In folder view, notes from the selected folder and its subfolders are now less likely to be pushed out by matches from other parts of the vault.',
            'Many improvements to Omnisearch match highlights in the search results.'
        ],
        changed: [
            '==Breaking change== - the setting "Folder note properties" used to set frontmatter properties for folder notes was removed. If you were using that setting, please migrate by creating a template file with the desired frontmatter properties and setting that as the new "Folder note template".',
            '==Breaking change== - The search bar now uses "-" instead of "!" to exclude terms from search to match industry standards. To exclude a term you now use "-term" instead of "!term". Saved searches will be migrated on first launch.',
            'All date format settings now use **Moment format**. Existing date-fns formats migrate automatically on first launch.',
            'Removed the settings tab **Settings > "Search & hotkeys"**. The search setting is now local and toggled in the list pane by pressing up/down or clicking the magnifying glass.'
        ],
        fixed: [
            'The setting Folders & tags > “Auto-select first note” did not work correctly and was fixed. Also significantly improved performance when navigating in navpane by debouncing file open commands just like in list pane, so scrolling through folders and tags should now be blazingly fast.',
            'Weekly periodic note patterns previously used custom calendar locale, where others like month and year used display locale. Now all note patterns use display locale for consistency. The user defined locale is now only used for week numbers and first day of the week.',
            'Fixed two display issues in Android: A small gap at the bottom of the left sidebar and text fonts were cropped on some devices.',
            'Fixed a crash/reload issue on mobile devices when generating PDF cover thumbnails for PDFs with extreme amounts of embedded images (example: PDFs with hundreds of unique images stacked on top of each other). PDF thumbnails on mobile now run a two-stage preflight before rendering: Stage A scans the raw PDF bytes for embedded image dictionaries and transparency/soft mask signals, and Stage B parses the page 1 operator list to count image paint operations. If the preflight is uncertain or the estimate exceeds the mobile memory budget, the PDF is logged and thumbnail is skipped.',
            'Fixed an issue where some emojis like Unicode keycap emojis (like 1️⃣) were not saved to frontmatter.'
        ]
    },
    {
        version: '2.2.3',
        date: '2026-02-01',
        showOnUpdate: false,
        fixed: [
            'Fixed an issue introduced in 2.2 where drag-moving a note to another folder could clear its feature image and preview text in the list pane.'
        ]
    },
    {
        version: '2.2.2',
        date: '2026-01-31',
        showOnUpdate: false,
        info: 'The new tooltips introduced in 2.2.1 caused performance issues in large vaults so they were removed in this update. To compensate I added folder and tag sort overrides so you can now sort each folder or tag individually using A to Z or Z to A in the navigation pane!',
        new: [
            'New setting: ==Folders & tags > Folder sort order==. You can now set default sort order for folders in navigation pane (A to Z, or Z to A).',
            'You can now right-click to change ==sort order for folders and tags in the navigation pane==! So if you have a folder with child folders with date as names, you can now show the latest date on top in the navigation pane.'
        ],
        improved: [
            'Further optimizations to keyboard navigation performance when holding down UP, DOWN, PAGE UP, or PAGE DOWN keys in the list pane. Notebook Navigator now debounces visual updates to improve performance even more, try it and let me know if you like it!',
            'If you hide all toolbar buttons in navigation pane and do not show vault title in header, the toolbar area is now hidden to save space.',
            'Same with the list pane - if you hide all toolbar buttons and do not show folder name in header, this toolbar area is also hidden to save space.'
        ],
        changed: [],
        fixed: [
            'Removed tooltips for truncated items in navigation pane since it caused performance issues. If you want to show tooltips for all items, enable it from Settings > General > Show tooltips.'
        ]
    },
    {
        version: '2.2.1',
        date: '2026-01-30',
        showOnUpdate: true,
        new: [
            '==Periodic notes can now use template files== (daily, weekly, monthly, quarterly, yearly). Configure templates in Settings > Calendar.',
            'New iOS / iPadOS setting: Settings > General > ==Use floating toolbars== on iOS/iPadOS. Default enabled. Disable to use fixed toolbars on iOS/iPadOS.',
            'New Style setting: Calendar > ==Right sidebar date placement==. Show dates in the calendar in the right sidebar bottom right (default) or centered.'
        ],
        improved: [
            'Weekly periodic note patterns now accept nested year/quarter/month/week folder paths.',
            'Greatly improved keyboard performance in list pane when scrolling through large lists by holding the UP or DOWN key.',
            'Folders and tags now show tooltips for truncated names on desktop devices, similar to how shortcuts and recent files works.'
        ],
        changed: [
            'Due to issues with React native, scrollbar positioning and multiple themes, ==the UI panels are no longer shown with transparency== in front of the list scrollers. Notebook Navigator now again works fine with themes like Baseline and Cupertino.'
        ],
        fixed: [
            'Fixed an issue where some customized user icons were not applying consistently to all UI elements.',
            'Increased image size limit on mobile devices for feature image thumbnails from 15 MB to 50 MB (matches desktop).',
            'Right sidebar calendar now properly sets background color to **--background-primary** on desktop for theme support.'
        ]
    },
    {
        version: '2.2.0',
        date: '2026-01-25',
        showOnUpdate: true,
        new: [
            '==Calendar now supports weekly, monthly, quarterly, and yearly notes!== Configure custom file patterns in Settings > Calendar. Click week numbers, month names, quarter labels, or year to create or open periodic notes.',
            'New setting: Calendar > ==Placement==. Display the calendar in the **left** or **right sidebar**. 🎉',
            'New setting: Notes > ==Show properties on separate rows==. Display each custom property on its own line. 🎉',
            'New setting: List pane > Keyboard navigation > ==Press Enter to open files==. 🎉 Open selected files on Enter. Configure Shift+Enter and Cmd/Ctrl+Enter to open in a new tab, to the right, or new window!',
            'New setting: ==List pane > Sort notes by > **File name** and **Property**==. You can now also sort files on file name or a custom property. 🎉 This is the first step towards custom sorting in list pane!',
            'New command: ==Search in vault root==. Selects the vault root folder and focuses the search input.',
            'New setting: Navigation pane > Appearance > ==Pin banner==. Keep the banner pinned to top or let it scroll with the navigation tree.',
            'New setting: Calendar > ==Show feature image==. Disable to hide feature images in the calendar.',
            'You can now press ==Enter to open folder notes== when a folder with folder note is selected. Shift+Enter opens in a new tab and Cmd/Ctrl+Enter opens to the right (configurable).',
            '==New commands==: Open daily note, Open weekly note, Open monthly note, Open quarterly note, Open yearly note.',
            'Public API: Added a new ==Menus API== for extending context menus. Use **registerFileMenu(callback)** and **registerFolderMenu(callback)** to add custom menu items.'
        ],
        improved: [
            'Calendar > Root folder is now stored per vault profile so you can have different periodic notes for each profile.',
            'Preview text now strips Obsidian block IDs like ^37066f and ^quote-of-the-day.',
            'Copy path now shows a submenu with options: Obsidian URL, from vault folder, from system root.',
            'Feature image thumbnails now apply image orientation for JPEG, AVIF, HEIC, and HEIF images.'
        ],
        changed: [
            'Replaced ==Property for color== setting with ==Property color map==. You can now define colors with a simple **key=color** format using a visual editor. 🎉',
            'Folders with folder notes no longer show a note icon by default.'
        ],
        fixed: [
            "Fixed an issue where the What's New modal never appeared after updating the plugin.",
            'Fixed calendar cells rendering with variable width on some devices and themes.'
        ]
    }
];

/**
 * Gets all release notes between two versions (inclusive).
 * Used when upgrading to show what's changed since the last version.
 *
 * @param fromVersion - The starting version (usually the previously shown version)
 * @param toVersion - The ending version (usually the current version)
 * @returns Array of release notes between the versions, or latest notes if versions not found
 */
export function getReleaseNotesBetweenVersions(fromVersion: string, toVersion: string): ReleaseNote[] {
    const fromIndex = RELEASE_NOTES.findIndex(note => note.version === fromVersion);
    const toIndex = RELEASE_NOTES.findIndex(note => note.version === toVersion);

    // If either version is not found, fall back to showing latest releases
    if (fromIndex === -1 || toIndex === -1) {
        return getLatestReleaseNotes();
    }

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);

    return RELEASE_NOTES.slice(startIndex, endIndex + 1);
}

/**
 * Gets the most recent release notes.
 * Used for manual "What's new" access and as fallback.
 *
 * @param count - Number of latest releases to return (defaults to 5)
 * @returns Array of the most recent release notes
 */
export function getLatestReleaseNotes(count: number = 5): ReleaseNote[] {
    return RELEASE_NOTES.slice(0, count);
}

/**
 * Compares two semantic version strings.
 *
 * @param v1 - First version string (e.g., "1.2.3")
 * @param v2 - Second version string (e.g., "1.2.4")
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }

    return 0;
}

/**
 * Determines whether release notes for the given version should appear automatically on update.
 */
export function isReleaseAutoDisplayEnabled(version: string): boolean {
    const note = RELEASE_NOTES.find(entry => entry.version === version);
    if (!note) {
        return true;
    }
    return note.showOnUpdate !== false;
}

/**
 * Determines whether release notes should appear automatically when upgrading between two versions.
 *
 * Upgrade decision rule:
 * - Evaluate release notes in the semantic range (fromVersion, toVersion]
 * - Return true when at least one note in that range has showOnUpdate not explicitly set to false
 *
 * Range resolution:
 * - If both versions exist in RELEASE_NOTES, use their index range in the ordered list
 * - If either version is missing, resolve the range by semantic version comparisons
 *
 * Non-upgrade transitions (same version or downgrade) use the target version setting.
 */
export function shouldAutoDisplayReleaseNotesForUpdate(fromVersion: string, toVersion: string): boolean {
    if (compareVersions(toVersion, fromVersion) <= 0) {
        return isReleaseAutoDisplayEnabled(toVersion);
    }

    const fromIndex = RELEASE_NOTES.findIndex(note => note.version === fromVersion);
    const toIndex = RELEASE_NOTES.findIndex(note => note.version === toVersion);

    const releaseNotesInUpgradePath =
        fromIndex === -1 || toIndex === -1
            ? RELEASE_NOTES.filter(note => compareVersions(note.version, fromVersion) > 0 && compareVersions(note.version, toVersion) <= 0)
            : RELEASE_NOTES.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex));

    if (releaseNotesInUpgradePath.length === 0) {
        return isReleaseAutoDisplayEnabled(toVersion);
    }

    return releaseNotesInUpgradePath.some(note => note.showOnUpdate !== false);
}
