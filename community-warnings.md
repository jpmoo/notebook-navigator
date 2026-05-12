# Notebook Navigator – Community plugin page warnings

Source: https://community.obsidian.md/plugins/notebook-navigator

Total warnings reported on page: **433**

Note: locations below are extracted from the static HTML of the page. The page lazy-loads additional location items; in
particular only the first 49 of the 272 `!important` locations are present in the saved HTML.

## Avoid !important — override styles by increasing selector specificity or using CSS variables instead.

Reported count: **272** (49 locations visible in saved HTML)

- `styles.css`: 750, 751, 800, 805, 952, 957, 1054, 1059, 1060, 1061, 1066, 1071, 1072, 1158, 1160, 1161, 1162, 1163,
  1169, 1174, 1179, 1184, 1185, 1189, 1266, 1267, 1342, 1395, 1396, 1397, 1405, 1406, 1439, 1450, 1451, 1456, 2067,
  2081, 2086, 2087, 2092, 2098, 2166, 2167, 2168, 2169, 2170, 2171, 2235

## Avoid :has — it can cause significant performance issues due to broad selector invalidation.

Reported count: **32**

- `src/styles/sections/list-files.css`: 122, 123, 127, 128, 134
- `src/styles/sections/navigation-tree.css`: 67, 79, 87, 94, 95, 101
- `src/styles/sections/settings-metadata-info.css`: 32, 35
- `styles.css`: 1857, 1869, 1877, 1884, 1885, 1891, 3713, 3714, 3718, 3719, 3725, 8137, 8140

## Use 'window.requestAnimationFrame()' instead of 'requestAnimationFrame()' for popout window compatibility.

Reported count: **30**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/components/ListPane.tsx`: 451, 452
- `src/components/NavigationPaneHeader.tsx`: 170, 193
- `src/components/NavigationToolbar.tsx`: 87, 109
- `src/components/NotebookNavigatorComponent.tsx`: 819, 820, 1234
- `src/components/SearchInput.tsx`: 112, 132
- `src/components/navigationPane/NavigationPaneContent.tsx`: 672, 673
- `src/hooks/navigationPane/useNavigationPaneShortcutActions.ts`: 98, 99
- `src/hooks/useListPaneScroll.ts`: 757, 760, 925
- `src/hooks/useListPaneSearch.ts`: 464
- `src/hooks/useNavigationPaneScroll.ts`: 394, 397, 638, 737, 789
- `src/hooks/useSurfaceColorVariables.ts`: 128, 254, 275
- `src/modals/WelcomeModal.ts`: 97
- `src/modals/WhatsNewModal.ts`: 292
- `src/services/operations/OperationBatchUtils.ts`: 37

## Use the full 6-digit hex format for consistency.

Reported count: **28**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/styles/sections/modal-color-picker.css`: 121, 122, 127, 133, 134, 135
- `styles.css`: 6937, 6938, 6943, 6949, 6950, 6951

## Plugin might make requests to 17 external domains

Reported count: **17**

_No file locations listed on the page._

## Use 'window.setTimeout()' instead of 'activeWindow.setTimeout()'. Timer functions should use 'window'.

Reported count: **15**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/components/ListPane.tsx`: 457
- `src/components/NotebookNavigatorComponent.tsx`: 825
- `src/components/SearchInput.tsx`: 207
- `src/components/calendar/Calendar.tsx`: 276
- `src/components/navigationPane/NavigationPaneContent.tsx`: 678
- `src/hooks/navigationPane/useNavigationPaneShortcutActions.ts`: 104
- `src/main.ts`: 1467, 1515
- `src/services/content/BaseContentProvider.ts`: 99, 330
- `src/services/fileSystem/FileDeletionService.ts`: 275
- `src/services/operations/OperationBatchUtils.ts`: 40
- `src/settings/tabs/GeneralTab.ts`: 114
- `src/storage/fileOperations.ts`: 192
- `src/utils/dragGhost.ts`: 240

## Unexpected browser feature "text-decoration" is only partially supported by Obsidian 1.11.4,144,146,148

Reported count: **8**

- `src/styles/sections/calendar.css`: 208, 209, 218, 219
- `styles.css`: 2675, 2676, 2685, 2686

## Unexpected undescribed directive comment. Include descriptions to explain why the comment is necessary.

Reported count: **4**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/components/FileItem.tsx`: 403, 612
- `src/components/FolderItem.tsx`: 179
- `src/hooks/useListPaneData.ts`: 222

## Unexpected browser feature "multicolumn" is only partially supported by Obsidian 1.11.4,144,146,148

Reported count: **4**

- `src/styles/sections/calendar.css`: 644, 674
- `styles.css`: 3111, 3141

## Expected "8px 8px" to be "8px"

Reported count: **4**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/styles/sections/modal-icon-picker.css`: 98
- `src/styles/sections/ui-headers.css`: 9
- `styles.css`: 820, 5863

## "emoji-regex" should be replaced with an alternative package.

Reported count: **2**

- `src/utils/emojiUtils.ts`: 26

## Unexpected browser feature "css-display-contents" is only partially supported by Obsidian 1.11.4,144,146,148

Reported count: **2**

- `src/styles/sections/mobile-tab-bars.css`: 37
- `styles.css`: 7461

## Unexpected duplicate selector ".nn-virtual-nav-item:has(

Reported count: **2**

- `src/styles/sections/navigation-tree.css`: 101-104
- `styles.css`: 1891-1894

## Unexpected duplicate selector ".modal.nn-icon-picker-modal .modal-content", first used at line 5779

Reported count: **2**

- `styles.css`: 5792, 7979

## Expected "0 10px 6px 10px" to be "0 10px 6px"

Reported count: **2**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/styles/sections/ui-headers.css`: 304
- `styles.css`: 1115

## Expected "0 0 4px 0" to be "0 0 4px"

Reported count: **2**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/styles/sections/modal-whats-new.css`: 54
- `styles.css`: 5527

## Expected "8px 12px 0 12px" to be "8px 12px 0"

Reported count: **2**

Status: ✅ Finished in mechanical pass on 2026-05-12. Verified by local scan and `./scripts/build.sh`.

- `src/styles/sections/icons-system.css`: 151
- `styles.css`: 8052

## 2 release assets are missing a GitHub artifact attestation

Reported count: **2**

_No file locations listed on the page._

## License `GPL-3.0` is a copyleft license

_No file locations listed on the page._

## Found `atob()`/`btoa()` base64 calls (1 total). May be used to obscure strings.

_No file locations listed on the page._

## The release contains additional files: `multiple.intoto.jsonl`. Only `main.js`, `manifest.json`, and `styles.css` are supported.

_No file locations listed on the page._

## "builtin-modules" should be replaced with an alternative package.

Status: ✅ Finished in mechanical pass on 2026-05-12. Removed the direct dependency and switched the build config to
Node's `builtinModules`.

_No file locations listed on the page._

## "eslint-plugin-react" should be replaced with an alternative package.

_No file locations listed on the page._

## Unexpected duplicate selector ".nn-split-container.nn-orientation-vertical .nn-navigation-pane", first used at line 680

- `styles.css`: 693

## Unexpected duplicate selector ".notebook-navigator-mobile .nn-navigation-pane", first used at line 672

- `styles.css`: 798

## Unexpected duplicate selector ".notebook-navigator-mobile .nn-search-clear-button", first used at line 1276

- `styles.css`: 1329

## Unexpected duplicate selector ".notebook-navigator-mobile .nn-search-input-icon", first used at line 1271

- `styles.css`: 1363

## Unexpected duplicate selector ".nn-navitem:is:has )", first used at line 1857

- `styles.css`: 1869-1871

## Unexpected duplicate selector ".modal.nn-icon-picker-modal", first used at line 5773

- `styles.css`: 5787

## Unexpected duplicate selector ".notebook-navigator-ios.notebook-navigator-ios-floating-toolbars .nn-mobile-toolbar-pill, .notebook-navigator-ios.notebook-navigator-ios-floating-toolbars .nn-mobile-toolbar-circle", first used at line 7633

- `styles.css`: 7662-7663

## Unexpected duplicate selector ".nn-emoji-icon", first used at line 7915

- `styles.css`: 7942

## Unexpected duplicate selector ".nn-icon-section-header", first used at line 5842

- `styles.css`: 8095

## Unexpected duplicate selector ".nn-emoji-icon", first used at line 14

- `src/styles/sections/icons-system.css`: 41

## Unexpected duplicate selector ".nn-split-container.nn-orientation-vertical .nn-navigation-pane", first used at line 61

- `src/styles/sections/layout-panes.css`: 74

## Unexpected duplicate selector ".notebook-navigator-mobile .nn-navigation-pane", first used at line 53

- `src/styles/sections/layout-panes.css`: 179

## Unexpected duplicate selector ".modal.nn-icon-picker-modal", first used at line 8

- `src/styles/sections/modal-icon-picker.css`: 22

## Unexpected duplicate selector ".modal.nn-icon-picker-modal .modal-content", first used at line 14

- `src/styles/sections/modal-icon-picker.css`: 27

## Unexpected duplicate selector ".nn-navitem:is:has )", first used at line 67

- `src/styles/sections/navigation-tree.css`: 79-81

## Unexpected duplicate selector ".notebook-navigator-ios.notebook-navigator-ios-floating-toolbars .nn-mobile-toolbar-pill, .notebook-navigator-ios.notebook-navigator-ios-floating-toolbars .nn-mobile-toolbar-circle", first used at line 89

- `src/styles/sections/platform-ios.css`: 118-119

## Unexpected duplicate selector ".notebook-navigator-mobile .nn-search-clear-button", first used at line 41

- `src/styles/sections/ui-search.css`: 94

## Unexpected duplicate selector ".notebook-navigator-mobile .nn-search-input-icon", first used at line 36

- `src/styles/sections/ui-search.css`: 128

## Found 3 dynamic `\u003cscript\u003e` element creations

_No file locations listed on the page._
