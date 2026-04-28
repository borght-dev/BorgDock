# File Palette — Custom roots add/remove UI

**Status:** Design approved · 2026-04-28
**Owner:** Koen
**Scope:** `src/BorgDock.Tauri/src/components/file-palette/`

## Problem

The File Palette can index and search any folder, not just git worktrees. The data layer already supports arbitrary "custom" roots — `settings.filePaletteRoots: FilePaletteRoot[]` flows through `buildRootEntries` and renders under a `CUSTOM` section in `RootsColumn`. What's missing is a UI to add or remove entries from that list. Today, the only way to populate `filePaletteRoots` is by hand-editing the settings JSON.

The user's concrete need: a folder of reference files that lives outside any tracked repo, accessed often enough to deserve a top-level entry alongside the worktrees.

## Goals

- Let the user pick a folder via a native dialog and add it as a custom root.
- Let the user remove a custom root from inside the palette.
- Match the existing palette UX idioms (IconButton toolbar actions, hover-revealed row actions, silent persistence).

## Non-goals

- **Renaming** custom roots. Auto-derived basename labels are sufficient; relabeling can be added later if a need emerges.
- **Settings flyout management.** The palette is the only consumer; surfacing this in the main settings flyout is unnecessary surface area.
- **Validation feedback.** Adding a duplicate or already-known path is a silent no-op, not a toast or error message.
- **Migration.** The `filePaletteRoots` field already exists; no schema change.

## UX

### Adding

A new `+` IconButton joins the existing ROOTS toolbar at the leading position:

```
[ + ]   [ ★ ]   [ ‹ ]
add     fav     collapse
```

- Tooltip: `"Add custom path…"`. `aria-label` matches.
- Clicking opens the Tauri folder picker (`open({ directory: true, multiple: false })`).
- On selection, the path is appended to `settings.filePaletteRoots`, the new root auto-becomes active, and the ROOTS column collapses — same behavior as clicking an existing root via `selectRoot`.

The button is always visible (including before any custom root exists), so discovery doesn't depend on first navigating to a non-empty CUSTOM section.

### Removing

Custom rows reuse the slot currently occupied by `bd-fp-root-star-placeholder` (worktrees show a favorites star there; custom rows currently show an empty placeholder). For custom rows this slot becomes a hover-revealed `×` IconButton.

- Tooltip: `"Remove from list"`. `aria-label` matches.
- Single click removes — no confirmation. Removal is non-destructive (the folder on disk is untouched).
- If the removed root was the active root, the existing fallback effect (`FilePaletteApp.tsx:81-94`) reassigns `activeRoot` to the first available root.

## Architecture

No new modules. Two surgical edits:

### `FilePaletteApp.tsx`

Adds two `useCallback` handlers, following the same load-mutate-save shape as the existing `toggleFavorite` (lines 172-203):

```ts
const addCustomRoot = useCallback(async () => {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const chosen = await open({ directory: true, multiple: false });
  if (typeof chosen !== 'string') return;

  // Normalize identically to buildRootEntries to dedup correctly.
  const norm = chosen.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  if (roots.some(r => r.path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === norm)) return;

  try {
    const s = await invoke<AppSettings>('load_settings');
    const next: AppSettings = {
      ...s,
      filePaletteRoots: [...(s.filePaletteRoots ?? []), { path: chosen }],
    };
    await invoke('save_settings', { settings: next });
    setSettings(next);
    await selectRoot(chosen);
  } catch (e) {
    console.error('addCustomRoot failed', e);
  }
}, [roots, selectRoot]);

const removeCustomRoot = useCallback(async (root: RootEntry) => {
  if (root.source !== 'custom') return;
  try {
    const s = await invoke<AppSettings>('load_settings');
    const next: AppSettings = {
      ...s,
      filePaletteRoots: (s.filePaletteRoots ?? []).filter(r => r.path !== root.path),
    };
    await invoke('save_settings', { settings: next });
    setSettings(next);
  } catch (e) {
    console.error('removeCustomRoot failed', e);
  }
}, []);
```

Both are passed down to `RootsColumn` as new props.

### `RootsColumn.tsx`

- Add two new props: `onAddCustomRoot: () => void`, `onRemoveCustomRoot: (root: RootEntry) => void`.
- Add a `+` IconButton at the start of the `bd-fp-roots-toolbar-actions` cluster.
- In `RootRow`, when `root.source === 'custom'`, render a hover-revealed `×` IconButton in the slot currently occupied by `bd-fp-root-star-placeholder`. Worktree rows continue to show the existing favorites star; the slot remains exclusive (one icon per row).
- The hover-reveal uses CSS (`:hover` on `.bd-fp-root-row-wrap`); no new state.

The function signature of `RootRow` gains an `onRemove?: () => void` plus a discriminator (or stays slot-driven via `showStar` plus a sibling `showRemove` flag — implementation detail to settle in the plan).

### Data layer

Unchanged. `settings.filePaletteRoots: FilePaletteRoot[]` already exists; `buildRootEntries` already merges custom roots into the rendered list and silently dedups against worktree paths.

## Error handling

- **Picker cancel** (`open()` returns `null`): silently return.
- **Picker import/throw**: caught with `console.error`; no toast. Matches the codebase's silent-catch idiom for similar `invoke` failures.
- **Duplicate path**: silently no-op. Dedup is computed against the rendered `roots` array (covers both worktrees and existing custom roots in one pass).
- **`save_settings` failure**: do not call `setSettings(next)` — the UI stays in its previous state. No optimistic update to roll back.
- **Removed root was active**: handled implicitly by the existing `useEffect` at `FilePaletteApp.tsx:81-94`, which reassigns `activeRoot` whenever it's no longer present in `roots`.
- **Non-git custom roots**: `ChangesSection` already handles `inRepo: false` gracefully (`ChangesSection.tsx:138`); no work needed.

## Testing

Tests live in `src/components/file-palette/__tests__/FilePaletteApp.test.tsx` alongside existing integration tests. Vitest + React Testing Library, mocking `invoke` and `@tauri-apps/plugin-dialog`.

1. **Add — happy path:** click `+` → picker resolves to `/some/new/path` → `save_settings` called once with `filePaletteRoots` extended by `{ path: '/some/new/path' }`, then a second `save_settings` call from `selectRoot` persists `filePaletteActiveRootPath` to that path.
2. **Add — dedup against existing worktree:** picker returns a path that's already in `worktreePathsByRepo` → `save_settings` not called with a mutated `filePaletteRoots`.
3. **Add — dedup against existing custom root:** picker returns a path already in `filePaletteRoots` → no save.
4. **Add — cancel:** picker resolves `null` → no save, no `selectRoot`.
5. **Remove:** click `×` on a custom row → `save_settings` called with that entry filtered out of `filePaletteRoots`.
6. **Remove active:** removing the currently active root → after rerender, `activeRoot` is the first remaining root (assertion on the rendered active state, not the effect itself).

The toolbar `+` IconButton render and the hover-revealed `×` are exercised implicitly by the integration tests via fireEvent on the visible elements; no separate `RootsColumn.test.tsx` is added.

## Out of scope / future

- Reordering custom roots.
- Per-root labels editable in the UI.
- Surfacing custom root management in the Settings flyout.
- Indicating in the UI when a custom root path no longer exists on disk (the file index will surface "0 files" naturally).
