# Notebook Navigator Storage Architecture

Updated: January 8, 2026

## Table of Contents

- [Overview](#overview)
- [Storage Containers](#storage-containers)
  - [IndexedDB](#1-indexeddb-persistent-local-storage)
  - [Local Storage](#2-local-storage-persistent-local-storage)
  - [Memory Cache](#3-memory-cache-temporary-storage)
  - [Settings](#4-settings-synchronized-storage)
  - [Icon Assets Database](#5-icon-assets-database-device-specific-storage)
- [Data Flow Patterns](#data-flow-patterns)
  - [Initial Load](#initial-load-cold-boot)
  - [File Change](#file-change-during-session)
  - [Settings Change](#settings-change)
  - [UI State Change](#ui-state-change)
- [Hidden Pattern Rules](#hidden-pattern-rules)
- [Storage Selection Guidelines](#storage-selection-guidelines)
- [Performance Considerations](#performance-considerations)
- [Version Management](#version-management)

## Overview

The Notebook Navigator plugin uses five storage containers with distinct scopes and lifecycles. The stack consists of the
IndexedDB cache, in-memory caches for synchronous reads (file records plus bounded preview text and feature image LRU
caches), vault-scoped localStorage, synchronized settings in `data.json`, and a dedicated icon asset database.

## Storage Containers

### 1. IndexedDB (Persistent Local Storage)

**Purpose**: Stores file metadata and generated content locally on the device. Data is derived from the vault and can be rebuilt.

**Location**: Browser's IndexedDB storage (device-specific)

**Synchronization**: Not synchronized - each device maintains its own cache

**Data Stored**:

- File modification time (`mtime`)
- Provider processed mtimes (`markdownPipelineMtime`, `tagsMtime`, `metadataMtime`, `fileThumbnailsMtime`)
- Tags (`tags`)
- Preview status in the main record (`previewStatus`) + preview text strings stored separately (`filePreviews`)
- Feature image key/status in the main record (`featureImageKey`, `featureImageStatus`) + thumbnail blobs stored separately (`featureImageBlobs`)
- Custom property value (`customProperty`)
- Frontmatter metadata (`metadata.name`, `metadata.created`, `metadata.modified`, `metadata.icon`, `metadata.color`)
- Hidden flag (`metadata.hidden`)

**Key Characteristics**:

- Persists across Obsidian restarts
- Can store large amounts of data (typically gigabytes)
- Asynchronous API requires careful handling
- Stores are cleared when a rebuild is required (content version changes, stored version keys missing, schema downgrade, or schema upgrades that clear legacy payloads)
- Database name: `notebooknavigator/cache/{appId}` (vault-specific)
- Object stores: `keyvaluepairs` (main records), `filePreviews` (preview text), `featureImageBlobs` (feature image blobs)

**Lifecycle Management**:

- Initialized early in Plugin.onload() via `initializeDatabase(appId)`
- Database connection owned by plugin, not React components
- Shutdown in Plugin.onunload() via `shutdownDatabase()`
- Idempotent operations prevent issues with rapid enable/disable cycles
- StorageContext checks availability but doesn't manage lifecycle

**Implementation**: `src/storage/IndexedDBStorage.ts`

```typescript
export type FeatureImageStatus = 'unprocessed' | 'none' | 'has';
export type PreviewStatus = 'unprocessed' | 'none' | 'has';

export interface FileData {
  // Vault mtime for the file path
  mtime: number;

  // Provider processed mtimes (used to detect stale provider output)
  markdownPipelineMtime: number;
  tagsMtime: number;
  metadataMtime: number;
  fileThumbnailsMtime: number;

  // Generated content (null means not generated yet)
  tags: string[] | null;
  customProperty: string | null;

  // Preview text is stored in a dedicated store keyed by file path
  previewStatus: PreviewStatus;

  // Always null in the main record; thumbnail blobs live in the featureImageBlobs store
  featureImage: Blob | null;
  featureImageStatus: FeatureImageStatus;
  featureImageKey: string | null;
  metadata: {
    name?: string;
    // 0 = field not configured, -1 = parse failed
    created?: number;
    // 0 = field not configured, -1 = parse failed
    modified?: number;
    icon?: string;
    color?: string;
    hidden?: boolean;
  } | null;
}
```

### 2. Local Storage (Persistent Local Storage)

**Purpose**: Stores UI state and preferences that should persist across sessions but remain local to each device. This
allows users to have different UI layouts on desktop vs mobile, for example.

**Location**: Browser's localStorage (device-specific, vault-specific)

**Synchronization**: Not synchronized - each device maintains its own UI state

**Data Stored**:

- Navigation pane width and height
- Dual-pane preference and orientation
- Selected folder, tag, file, and multi-select state
- Expanded folders, tags, and virtual folders
- Navigation section order and collapsed state for shortcuts and recent notes
- UX preferences (search toggle, descendant scope, hidden item visibility, pinned shortcuts)
- Recent note history and recent icon usage
- Database version numbers (for detecting schema changes)
- Cache rebuild progress marker
- Local storage schema version marker

**Key Characteristics**:

- Persists across Obsidian restarts
- Limited to ~5-10MB total storage
- Synchronous API for immediate access
- Uses Obsidian's vault-specific storage methods
- Automatically cleaned up when plugin is uninstalled

**Implementation**: `src/types.ts` (`STORAGE_KEYS`), `src/utils/localStorage.ts` (vault-scoped wrapper)

```typescript
export const STORAGE_KEYS: LocalStorageKeys = {
  expandedFoldersKey: 'notebook-navigator-expanded-folders',
  expandedTagsKey: 'notebook-navigator-expanded-tags',
  expandedVirtualFoldersKey: 'notebook-navigator-expanded-virtual-folders',
  selectedFolderKey: 'notebook-navigator-selected-folder',
  selectedFileKey: 'notebook-navigator-selected-file',
  selectedFilesKey: 'notebook-navigator-selected-files',
  selectedTagKey: 'notebook-navigator-selected-tag',
  navigationPaneWidthKey: 'notebook-navigator-navigation-pane-width',
  navigationPaneHeightKey: 'notebook-navigator-navigation-pane-height',
  dualPaneOrientationKey: 'notebook-navigator-dual-pane-orientation',
  dualPaneKey: 'notebook-navigator-dual-pane',
  uiScaleKey: 'notebook-navigator-ui-scale',
  shortcutsExpandedKey: 'notebook-navigator-shortcuts-expanded',
  recentNotesExpandedKey: 'notebook-navigator-recent-notes-expanded',
  recentNotesKey: 'notebook-navigator-recent-notes',
  recentIconsKey: 'notebook-navigator-recent-icons',
  navigationSectionOrderKey: 'notebook-navigator-section-order',
  pinnedShortcutsMaxHeightKey: 'notebook-navigator-pinned-shortcuts-max-height',
  uxPreferencesKey: 'notebook-navigator-ux-preferences',
  fileCacheKey: 'notebook-navigator-file-cache',
  databaseSchemaVersionKey: 'notebook-navigator-db-schema-version',
  databaseContentVersionKey: 'notebook-navigator-db-content-version',
  cacheRebuildNoticeKey: 'notebook-navigator-cache-rebuild-notice',
  localStorageVersionKey: 'notebook-navigator-localstorage-version',
  vaultProfileKey: 'notebook-navigator-vault-profile',
  releaseCheckTimestampKey: 'notebook-navigator-release-check-timestamp',
  latestKnownReleaseKey: 'notebook-navigator-latest-known-release',
  searchProviderKey: 'notebook-navigator-search-provider',
  tagSortOrderKey: 'notebook-navigator-tag-sort-order',
  recentColorsKey: 'notebook-navigator-recent-colors'
};
```

### 3. Memory Cache (Temporary Storage)

**Purpose**: Provides synchronous access to all file data during rendering. This in-memory mirror of IndexedDB
eliminates async operations in React components, preventing layout shifts and enabling smooth scrolling in virtualized
lists.

**Location**: JavaScript heap memory (RAM)

**Synchronization**: Automatically synced with IndexedDB changes

**Data Stored**: Main file records (no preview text strings or feature image blobs), plus bounded in-memory LRU caches for preview text and feature image blobs

**Key Characteristics**:

- Cleared when plugin reloads or Obsidian restarts
- Provides synchronous reads for UI rendering
- Preview text and feature image blobs are loaded on demand from IndexedDB and cached in bounded LRUs
- Hydrated from the main store on startup and updated with every database write

**Implementation**: `src/storage/MemoryFileCache.ts`

## Hidden Pattern Rules

Hidden patterns are stored in the active vault profile and applied when building the file cache and tag tree.
Implementation:

- Folder filtering: `src/utils/fileFilters.ts`, `src/utils/vaultProfiles.ts`
- Tag filtering: `src/utils/tagPrefixMatcher.ts`
- Shared path parsing: `src/utils/pathPatternMatcher.ts`

Rules:

- Folder name patterns (no leading `/`) match folder names and are evaluated against each path segment (supports `prefix*` and `*suffix`).
- Folder path patterns start with `/` and use segment patterns:
  - `*` matches one path segment
  - `prefix*` matches a path segment prefix
  - `/Projects/*` matches descendants of `/Projects` but not `/Projects` itself
- Tag patterns are normalized by removing a leading `#`, trimming slashes, and lowercasing.
  - Path rules like `projects/*` match tag paths and support the same segment patterns as folders.
  - Name rules `prefix*` and `*suffix` match tag names at any depth.
- Patterns with multiple wildcards in a segment or wildcards in the middle of a segment are ignored.

### 4. Settings (Synchronized Storage)

**Purpose**: Stores user preferences and configuration that should be consistent across all devices. When using Obsidian
Sync, these settings are automatically synchronized.

**Location**: `.obsidian/plugins/notebook-navigator/data.json`

**Synchronization**: Synchronized via Obsidian Sync (if enabled)

**Data Stored**:

- Feature toggles and display preferences (folder visibility, preview rows, grouping, date/time formats, quick actions)
- Frontmatter field mappings and metadata extraction options
- Folder metadata:
  - Colors and background colors (custom palette per folder)
  - Icons (custom icon per folder)
  - Sort overrides (custom sort order per folder)
  - Custom appearance (titleRows, previewRows, showDate, showPreview, showImage)
  - Pinned notes (list of pinned files per folder)
- Tag metadata:
  - Colors and background colors (custom palette per tag)
  - Icons (custom icon per tag)
  - Sort overrides (custom sort order per tag)
  - Custom appearance (titleRows, previewRows, showDate, showPreview, showImage)
- File metadata overrides:
  - Icons (custom icon per file)
  - Colors (custom color per file)
- Shortcut definitions and keyboard shortcut configuration
- External icon provider enablement flags
- Recent color palette, release notice tracking, and sync timestamps
- Root folder order, root tag order, and custom vault name
- Homepage configuration for desktop and mobile

**Key Characteristics**:

- JSON file in the vault
- Synchronized across devices with Obsidian Sync
- Loaded once at startup, cached in memory
- Changes trigger UI re-renders via React context
- Must be kept small to avoid sync conflicts

**Implementation**: `src/settings.ts`, `src/settings/types.ts`

```typescript
export interface NotebookNavigatorSettings {
  vaultProfiles: VaultProfile[];
  vaultProfile: string;

  // ... many settings omitted

  // Runtime state and cached data
  pinnedNotes: Record<string, string[]>;
  fileIcons: Record<string, string>;
  fileColors: Record<string, string>;
  folderIcons: Record<string, string>;
  folderColors: Record<string, string>;
  folderBackgroundColors: Record<string, string>;
  tagIcons: Record<string, string>;
  tagColors: Record<string, string>;
  tagBackgroundColors: Record<string, string>;
  rootFolderOrder: string[];
  rootTagOrder: string[];
}
```

### 5. Icon Assets Database (Device-Specific Storage)

**Purpose**: Stores downloaded icon pack assets locally on each device. This allows users to have extensive icon
libraries without bloating the vault or sync system.

**Location**: Browser's IndexedDB storage (device-specific)

**Synchronization**: Not synchronized - each device downloads its own icon packs

**Data Stored**:

- Icon font binary data (ArrayBuffer)
- Metadata manifests with icon identifiers and keywords
- Font MIME type
- Metadata format indicator (currently JSON)
- Provider version and last updated timestamp

**Key Characteristics**:

- Persists across Obsidian restarts
- Asynchronous download and storage
- Automatic version management
- Database name: `notebooknavigator/icons/{appId}`
- Records keyed by provider ID (one entry per installed pack)
- Separate from main cache database

**Icon Pack Management**:

- Settings only store which packs are enabled (small metadata)
- Each device checks settings and downloads needed packs
- Packs can be installed/removed independently per device
- Updates handled automatically when new versions available

**Available Icon Packs**:

- Bootstrap Icons
- Font Awesome
- Material Icons
- Phosphor Icons
- RPG Awesome
- Simple Icons

**Implementation**: `src/services/icons/external/IconAssetDatabase.ts`

```typescript
interface IconAssetRecord {
  id: string;
  version: string;
  mimeType: string;
  data: ArrayBuffer;
  metadataFormat: 'json';
  metadata: string;
  updated: number;
}
```

## Data Flow Patterns

### Initial Load (Cold Boot)

1. **Settings** loaded from data.json
2. **IndexedDB** opened, schema migrations applied, and stores cleared when a rebuild is required
3. Main **IndexedDB** records hydrated into the in-memory cache (preview text and blobs load on demand)
4. **Local Storage** read for pane layout, selections, UX preferences, and recent data
5. StorageContext diffs vault files and writes additions, updates, and removals to **IndexedDB**
6. Tag tree rebuilt from cached tag data (IndexedDB + memory cache)
7. Content providers queue pending file-derived content (preview, tags, metadata, feature images, custom property) while UI renders from the memory cache

### File Change (During Session)

1. Obsidian emits vault event (create, delete, rename, modify)
2. StorageContext diffs vault files and updates **IndexedDB** (adds new files, removes deleted entries, preserves
   renamed data)
3. **ContentProviderRegistry** queues affected files for content regeneration
4. Providers write updates through **IndexedDBStorage**, keeping the memory cache in sync and notifying listeners
5. React components re-render with the refreshed in-memory data

### Settings Change

1. User modifies setting in UI
2. New setting → **Settings** (data.json)
3. **Settings** context broadcasts updates to React tree
4. StorageContext compares old and new settings, marks affected files for regeneration, and queues content providers
5. Components re-render with updated configuration
6. If Obsidian Sync enabled → synced to other devices

### UI State Change

1. User resizes a pane, changes selection, or toggles a UX preference
2. New state → **Local Storage** (immediate writes for layout/selection, debounced writes for recent data)
3. State persists for the next session on that device
4. Each device maintains independent UI and recent history

## Storage Selection Guidelines

### Use IndexedDB When:

- Storing file-derived data that can be regenerated
- Data is large or numerous (thousands of entries)
- Data should not sync between devices
- Async access is acceptable

### Use Local Storage When:

- Storing UI state that should persist locally
- Data is small (< 100KB total)
- Synchronous access is required
- Device-specific preferences are needed

### Use Memory Cache When:

- Data needs synchronous access during rendering
- Performance is critical (virtual scrolling)
- Data already exists in IndexedDB
- Temporary storage during session is sufficient

### Use Settings When:

- User preferences should sync between devices
- Data configures plugin behavior
- Changes should trigger UI updates
- Data is small and JSON-serializable

### Use Icon Assets Database When:

- Storing large binary assets (icon fonts)
- Data is too large for settings sync
- Device-specific resources are acceptable
- Content can be re-downloaded if needed

## Performance Considerations

### IndexedDB

- **Batch Operations**: Group multiple updates in single transaction
- **Async Processing**: Use deferred scheduling for background updates
- **Version Management**: Increment versions carefully to avoid unnecessary cache clears

### Local Storage

- **Size Limits**: Keep under 5MB total across all keys
- **JSON Parsing**: Cache parsed values to avoid repeated parsing
- **Cleanup**: Remove obsolete keys during migration
- **Debounced Writes**: RecentStorageService batches writes (~1s delay) to reduce churn for recent data

### Memory Cache

- **Memory Usage**: Scales with file count and LRU cache sizes
- **Synchronization**: Keep perfectly synced with IndexedDB
- **Initialization**: File records load on startup; preview text warmup is incremental

### Settings

- **File Size**: Keep under 1MB to avoid sync conflicts
- **Metadata Cleanup**: Remove orphaned metadata via settings for files deleted outside Obsidian
- **Change Detection**: Use React context for efficient re-renders

## Version Management

### Schema Changes

When IndexedDB schema changes:

1. Increment `DB_SCHEMA_VERSION`
2. Schema upgrades run via `onupgradeneeded` (may clear stores when legacy payloads cannot be migrated)
3. Schema downgrades delete and recreate the database
4. If stores are cleared, content is rebuilt from vault files and providers

### Content Format Changes

When content generation logic changes:

1. Increment `DB_CONTENT_VERSION`
2. Database data cleared (structure preserved)
3. Content regenerated for all files
4. Gradual population via background processing

Current values: `DB_SCHEMA_VERSION = 3`, `DB_CONTENT_VERSION = 2`.

### Settings Updates

When settings structure changes:

1. Load existing settings
2. Apply new structure in `loadSettings()`
3. Save updated settings
4. Sync propagates to other devices

### Local Storage Updates

When storage keys change:

1. Check for old keys
2. Copy data to new keys
3. Delete old keys
4. Handle missing data gracefully
5. Update `LOCALSTORAGE_VERSION` so migrations run only once
