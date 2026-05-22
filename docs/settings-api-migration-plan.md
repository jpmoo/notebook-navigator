# Obsidian 1.13 Settings API Migration Plan

Updated: May 22, 2026

## Purpose

Notebook Navigator is being used as a showcase for the Obsidian 1.13 settings API. The settings code should read as a
reference implementation for plugin developers:

- Prefer native Obsidian settings definitions over custom DOM structure.
- Keep custom CSS to the minimum needed by existing plugin-specific controls.
- Use `SettingDefinitionElement` nowhere.
- Use `display()` only as the legacy fallback while `manifest.json` supports Obsidian versions before 1.13.
- Keep desktop and mobile behavior equivalent to the current settings UI.

## Reference Pattern

`src/settings/tabs/AppearanceBehaviorTab.ts` is the first template.

Each migrated pane should expose two paths while `minAppVersion` remains below `1.13.0`:

- `createXSettingDefinitions(context): SettingDefinitionItem[]` for Obsidian 1.13.
- `renderXTab(context): void` in `src/settings/tabs/legacy/*LegacyTab.ts` for the legacy fallback.

Register the native path in `src/settings/SettingsPaneDefinitions.ts` with `createDefinitions`.

Use native `control` definitions first:

```ts
{
    name: strings.settings.items.showInfoButtons.name,
    desc: strings.settings.items.showInfoButtons.desc,
    control: {
        type: 'toggle',
        key: 'showInfoButtons',
        defaultValue: DEFAULT_SETTINGS.showInfoButtons
    }
}
```

Use native `render` definitions only when the 1.13 declarative control cannot express the row:

- modal-launch buttons
- extra buttons such as sync-mode controls
- custom button grids
- dynamic status text
- custom suggesters not covered by native `file` or `folder` controls
- controls that write through plugin methods instead of a simple settings key

`render` is part of the 1.13 API. The legacy-only API is `display()`.

## File Layout

Keep native reference code in the normal tab modules:

- `src/settings/tabs/NotesTab.ts`
- `src/settings/tabs/ListTab.ts`
- `src/settings/tabs/NavigationTab.ts`

Keep pre-1.13 fallback renderers in `src/settings/tabs/legacy/`:

- `src/settings/tabs/legacy/NotesLegacyTab.ts`
- `src/settings/tabs/legacy/ListLegacyTab.ts`
- `src/settings/tabs/legacy/NavigationLegacyTab.ts`

Only move fallback entry points and helpers that are used solely by the fallback path. `SettingDefinitionRender` helpers
belong with the native definitions because they are part of the 1.13 API.

## Migration Order

1. Stabilize the template.
   - Keep `AppearanceBehaviorTab.ts` as the reference.
   - Confirm every simple toggle/dropdown in that pane uses `control`.
   - Confirm custom rows use `render` with standard `Setting` methods.
   - Keep `legacy/AppearanceBehaviorLegacyTab.ts` isolated.

2. Migrate low-risk panes.
   - `NotesTab`
   - `FilesTab`
   - `DisplayFiltersTab`
   - simple sections of `ListTab`
   - simple sections of `NavigationTab`

3. Migrate panes with dependent visibility.
   - `CalendarTab`
   - `FoldersTab`
   - `ShortcutsTab`
   - remaining `ListTab`
   - remaining `NavigationTab`

   Use `visible` predicates for dependent rows. Call `refreshSettingsDomState()` after changing a setting that controls
   another row's visibility.

4. Migrate custom-heavy panes last.
   - `FrontmatterTab`
   - `IconPacksTab`
   - `AdvancedTab`
   - metadata-heavy parts of `TagsTab` and `PropertiesTab`

   Keep custom controls as `render` rows inside native groups or pages.

5. Remove legacy renderers only after the minimum Obsidian version is raised to `1.13.0`.

## Per-Pane Workflow

For each pane:

1. Inventory rows as native `control`, native `render`, or legacy-only.
2. Add `createXSettingDefinitions(context)`.
3. Convert simple toggles, dropdowns, text, textarea, number, slider, color, file, and folder rows to `control`.
4. Move dependent sections to `visible` predicates when possible.
5. Keep plugin-specific controls as `render`.
6. Register `createDefinitions` in `SettingsPaneDefinitions.ts`.
7. Run verification.
8. Review the resulting code as documentation, not only as working code.

## Subagent Strategy

Do not assign one subagent per settings module by default. This migration needs a single, consistent reference style more
than broad parallel throughput.

Use subagents only for bounded side tasks:

- Inventory a pane and classify each row as `control` or `render`.
- Compare a migrated pane against the reference checklist.
- Audit for deprecated API usage.
- Migrate a clearly independent, low-risk pane after the reference pattern is stable.

Avoid parallel code changes across many settings files until the first two or three panes are accepted. Otherwise small
style differences will accumulate and make the reference implementation harder to follow.

## Verification

Run after each migration batch:

```bash
rg -n "SettingDefinitionElement|\\belement\\s*:" src/settings.ts src/settings/SettingsPaneDefinitions.ts src/settings/tabs
./scripts/build.sh
```

The build must finish with:

- ESLint passed
- Stylelint passed
- TypeScript valid
- no unused imports
- no dead code
- formatting clean
- unit tests passed
- production build completed
- `No warnings`

Manual Obsidian checks:

- settings page navigation
- settings search
- dependent visibility
- persistence after reload
- desktop and mobile layout
- sync-mode buttons where present
- modal-launch rows
- no unexpected custom styling

## Acceptance Criteria

A migrated pane is complete when:

- simple rows use native `control` definitions
- custom rows use native `render` definitions
- no `SettingDefinitionElement` is used
- no new CSS is added unless there is no native Obsidian equivalent
- pre-1.13 fallback behavior is preserved
- the code reads as a concise example plugin developers can copy from
- `./scripts/build.sh` passes with `No warnings`
