# File Palette — Custom Roots Add/Remove UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add and remove non-repo custom folders as File Palette roots via a "+" toolbar button and a hover-revealed "×" on custom rows.

**Architecture:** All changes inside `src/components/file-palette/`. Two new `useCallback` handlers in `FilePaletteApp.tsx` follow the existing load-mutate-save shape used by `toggleFavorite`. `RootsColumn.tsx` gains a "+" toolbar IconButton and replaces the inert star-slot placeholder on custom rows with a hover-revealed "×" IconButton. The data layer (`settings.filePaletteRoots`, `buildRootEntries`'s `'custom'` source) is already in place — no migration.

**Tech Stack:** React 19, TypeScript, Vitest + RTL, Tauri 2 (`@tauri-apps/plugin-dialog` already installed at `^2.7.0`), Biome.

**Spec:** `docs/superpowers/specs/2026-04-28-file-palette-custom-roots-ui-design.md`

---

## File Structure

**Modify:**
- `src/components/file-palette/FilePaletteApp.tsx` — add `addCustomRoot` and `removeCustomRoot` callbacks; pass them to `RootsColumn`
- `src/components/file-palette/RootsColumn.tsx` — toolbar "+" button; custom-row "×" IconButton; new props
- `src/components/file-palette/__tests__/FilePaletteApp.test.tsx` — 5 new tests; mock `@tauri-apps/plugin-dialog`
- `src/styles/index.css` — hover-reveal rule for the custom-row "×"

**Create:** none.

Each task below produces a self-contained, verifiable change with a commit at the end.

---

## Task 1: Add "+" toolbar button + `addCustomRoot` happy path

This task ships the full add flow (including dedup logic) so subsequent tasks can layer additional test coverage without touching production code.

**Files:**
- Modify: `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`
- Modify: `src/components/file-palette/RootsColumn.tsx`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`

- [ ] **Step 1: Add a `@tauri-apps/plugin-dialog` mock at the top of the test file**

In `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`, add this `vi.mock` call alongside the existing mocks (after the `useBackgroundIndexer` mock at line 12-14):

```ts
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
```

Then extend the existing `beforeEach` block (currently lines 17-42) to reset the picker mock between tests. Add at the end of `beforeEach`:

```ts
const { open } = await import('@tauri-apps/plugin-dialog');
(open as ReturnType<typeof vi.fn>).mockReset();
```

- [ ] **Step 2: Write the failing happy-path test**

Append this test inside the existing `describe('FilePaletteApp', ...)` block in the same file:

```ts
it('clicking + adds the picked folder and makes it active', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  const { open } = await import('@tauri-apps/plugin-dialog');
  (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/some/new/scratch');

  render(<FilePaletteApp />);
  await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());

  const addBtn = screen.getByLabelText('Add custom path');
  await act(async () => {
    fireEvent.click(addBtn);
  });

  await waitFor(() => {
    const saves = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd]) => cmd === 'save_settings',
    );
    // First save adds the new root; second save (from selectRoot) sets it active.
    expect(saves.length).toBeGreaterThanOrEqual(2);
    const firstSaveArgs = saves[0]![1];
    expect(firstSaveArgs.settings.filePaletteRoots).toEqual([{ path: '/some/new/scratch' }]);
    const lastSaveArgs = saves[saves.length - 1]![1];
    expect(lastSaveArgs.settings.ui.filePaletteActiveRootPath).toBe('/some/new/scratch');
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
cd src/BorgDock.Tauri
npm test -- src/components/file-palette/__tests__/FilePaletteApp.test.tsx -t "clicking \\+ adds"
```

Expected: FAIL — `getByLabelText('Add custom path')` throws because the button doesn't exist yet.

- [ ] **Step 4: Add the `+` button and `onAddCustomRoot` prop to `RootsColumn`**

In `src/components/file-palette/RootsColumn.tsx`, add `onAddCustomRoot` to the props interface (around line 13-23):

```ts
interface RootsColumnProps {
  roots: RootEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
  favoritePaths: Set<string>;
  onToggleFavorite: (root: RootEntry) => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAddCustomRoot: () => void;
}
```

Destructure it in the function signature (around line 25-35):

```ts
export function RootsColumn({
  roots,
  activePath,
  onSelect,
  favoritePaths,
  onToggleFavorite,
  favoritesOnly,
  onToggleFavoritesOnly,
  collapsed,
  onToggleCollapsed,
  onAddCustomRoot,
}: RootsColumnProps) {
```

Then in the toolbar actions (currently around line 83-127), prepend a new IconButton **before** the favorites-star button:

```tsx
<div className="bd-fp-roots-toolbar-actions">
  <IconButton
    icon={
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8 3v10M3 8h10" />
      </svg>
    }
    tooltip="Add custom path"
    aria-label="Add custom path"
    size={22}
    onClick={onAddCustomRoot}
  />
  <IconButton
    icon={ /* existing favorites-star svg, unchanged */ }
    /* ...existing props unchanged... */
  />
  <IconButton
    icon={ /* existing collapse-caret svg, unchanged */ }
    /* ...existing props unchanged... */
  />
</div>
```

(Keep the favorites star and collapse-caret IconButtons exactly as they are — only insert the new `+` IconButton at the top of the cluster.)

- [ ] **Step 5: Add the `addCustomRoot` handler in `FilePaletteApp` and pass it down**

In `src/components/file-palette/FilePaletteApp.tsx`, after the `selectRoot` callback (currently lines 99-115), add:

```ts
const addCustomRoot = useCallback(async () => {
  let chosen: string | null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ directory: true, multiple: false });
    chosen = typeof result === 'string' ? result : null;
  } catch (e) {
    console.error('addCustomRoot: picker failed', e);
    return;
  }
  if (!chosen) return;

  const norm = chosen.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const isDup = roots.some((r) => {
    const n = r.path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    return n === norm;
  });
  if (isDup) return;

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
    console.error('addCustomRoot: save failed', e);
  }
}, [roots, selectRoot]);
```

Then pass it to `RootsColumn` (currently around lines 314-324):

```tsx
<RootsColumn
  roots={roots}
  activePath={activeRoot}
  onSelect={selectRoot}
  favoritePaths={favoritePaths}
  onToggleFavorite={toggleFavorite}
  favoritesOnly={favoritesOnly}
  onToggleFavoritesOnly={toggleFavoritesOnly}
  collapsed={rootsCollapsed}
  onToggleCollapsed={toggleRootsCollapsed}
  onAddCustomRoot={addCustomRoot}
/>
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
cd src/BorgDock.Tauri
npm test -- src/components/file-palette/__tests__/FilePaletteApp.test.tsx -t "clicking \\+ adds"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/RootsColumn.tsx \
        src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx \
        src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx
git commit -m "feat(file-palette): + toolbar button to add a custom root folder"
```

---

## Task 2: Cover dedup and cancel cases

The Task 1 implementation already includes dedup and cancel handling. These tests lock that behavior in.

**Files:**
- Modify: `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`

- [ ] **Step 1: Add the dedup-against-worktree test**

Append to the same `describe` block:

```ts
it('does not add a path that is already an existing worktree', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  const { open } = await import('@tauri-apps/plugin-dialog');
  (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/repo/.worktrees/wt1');

  render(<FilePaletteApp />);
  await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());

  const beforeCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([cmd]) => cmd === 'save_settings',
  ).length;

  await act(async () => {
    fireEvent.click(screen.getByLabelText('Add custom path'));
  });
  // Allow the picker promise + dedup short-circuit to run.
  await new Promise((r) => setTimeout(r, 30));

  const afterCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([cmd]) => cmd === 'save_settings',
  ).length;
  expect(afterCount).toBe(beforeCount);
});
```

- [ ] **Step 2: Add the dedup-against-existing-custom test**

Append:

```ts
it('does not add a path that is already a custom root', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  // Override load_settings for this test only — start with one custom root.
  (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
    if (cmd === 'load_settings') {
      return Promise.resolve({
        repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
        ui: {},
        filePaletteRoots: [{ path: '/my/scratch' }],
      });
    }
    if (cmd === 'list_worktrees_bare') {
      return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
    }
    if (cmd === 'list_root_files') return Promise.resolve({ entries: [], truncated: false });
    if (cmd === 'save_settings') return Promise.resolve(null);
    return Promise.reject(new Error(`unexpected ${cmd}`));
  });

  const { open } = await import('@tauri-apps/plugin-dialog');
  (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/my/scratch');

  render(<FilePaletteApp />);
  await waitFor(() => expect(screen.getByText('scratch')).toBeTruthy());

  const beforeCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([cmd]) => cmd === 'save_settings',
  ).length;

  await act(async () => {
    fireEvent.click(screen.getByLabelText('Add custom path'));
  });
  await new Promise((r) => setTimeout(r, 30));

  const afterCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([cmd]) => cmd === 'save_settings',
  ).length;
  expect(afterCount).toBe(beforeCount);
});
```

- [ ] **Step 3: Add the cancel test**

Append:

```ts
it('does not save when the picker is cancelled', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  const { open } = await import('@tauri-apps/plugin-dialog');
  (open as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

  render(<FilePaletteApp />);
  await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());

  const beforeCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([cmd]) => cmd === 'save_settings',
  ).length;

  await act(async () => {
    fireEvent.click(screen.getByLabelText('Add custom path'));
  });
  await new Promise((r) => setTimeout(r, 30));

  const afterCount = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([cmd]) => cmd === 'save_settings',
  ).length;
  expect(afterCount).toBe(beforeCount);
});
```

- [ ] **Step 4: Run all three new tests; expect them to pass on the existing implementation**

```bash
cd src/BorgDock.Tauri
npm test -- src/components/file-palette/__tests__/FilePaletteApp.test.tsx
```

Expected: all three new tests PASS along with the originals. If a dedup test fails, the dedup logic in `addCustomRoot` is wrong — recheck the path-normalization step in Task 1 Step 5.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx
git commit -m "test(file-palette): dedup + cancel coverage for custom-root add"
```

---

## Task 3: Add "×" remove button + `removeCustomRoot` handler

**Files:**
- Modify: `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`
- Modify: `src/components/file-palette/RootsColumn.tsx`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`
- Modify: `src/styles/index.css`

- [ ] **Step 1: Write the failing remove test**

Append to `FilePaletteApp.test.tsx`:

```ts
it('clicking × on a custom row removes it from filePaletteRoots', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
    if (cmd === 'load_settings') {
      return Promise.resolve({
        repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
        ui: {},
        filePaletteRoots: [{ path: '/my/scratch' }],
      });
    }
    if (cmd === 'list_worktrees_bare') {
      return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
    }
    if (cmd === 'list_root_files') return Promise.resolve({ entries: [], truncated: false });
    if (cmd === 'save_settings') return Promise.resolve(null);
    return Promise.reject(new Error(`unexpected ${cmd}`));
  });

  render(<FilePaletteApp />);
  await waitFor(() => expect(screen.getByText('scratch')).toBeTruthy());

  await act(async () => {
    fireEvent.click(screen.getByLabelText('Remove custom path'));
  });

  await waitFor(() => {
    const saves = (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([cmd, a]) =>
        cmd === 'save_settings' && Array.isArray((a as any).settings?.filePaletteRoots),
    );
    expect(saves.length).toBeGreaterThanOrEqual(1);
    const last = saves[saves.length - 1]![1];
    expect(last.settings.filePaletteRoots).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd src/BorgDock.Tauri
npm test -- src/components/file-palette/__tests__/FilePaletteApp.test.tsx -t "clicking × on a custom row"
```

Expected: FAIL — `getByLabelText('Remove custom path')` throws.

- [ ] **Step 3: Add `onRemoveCustomRoot` prop to `RootsColumn` and render the × on custom rows**

In `src/components/file-palette/RootsColumn.tsx`:

(a) Extend the props interface:

```ts
interface RootsColumnProps {
  roots: RootEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
  favoritePaths: Set<string>;
  onToggleFavorite: (root: RootEntry) => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAddCustomRoot: () => void;
  onRemoveCustomRoot: (root: RootEntry) => void;
}
```

(b) Destructure it in the function header:

```ts
export function RootsColumn({
  roots,
  activePath,
  onSelect,
  favoritePaths,
  onToggleFavorite,
  favoritesOnly,
  onToggleFavoritesOnly,
  collapsed,
  onToggleCollapsed,
  onAddCustomRoot,
  onRemoveCustomRoot,
}: RootsColumnProps) {
```

(c) Update the CUSTOM section's `RootRow` call to pass the remove callback (currently around line 152-162):

```tsx
{custom.length > 0 && (
  <div className="bd-fp-roots-section">
    <div className="bd-fp-roots-heading">CUSTOM</div>
    {custom.map((root) => (
      <RootRow
        key={root.path}
        root={root}
        active={activePath === root.path}
        favorite={false}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        showStar={false}
        onRemove={() => onRemoveCustomRoot(root)}
      />
    ))}
  </div>
)}
```

(d) Extend `RootRowProps` and the `RootRow` body (currently around lines 172-224). Replace the whole block from `interface RootRowProps` through the end of `RootRow` with:

```tsx
interface RootRowProps {
  root: RootEntry;
  active: boolean;
  favorite: boolean;
  onSelect: (path: string) => void;
  onToggleFavorite: (root: RootEntry) => void;
  showStar: boolean;
  onRemove?: () => void;
}

function RootRow({
  root,
  active,
  favorite,
  onSelect,
  onToggleFavorite,
  showStar,
  onRemove,
}: RootRowProps) {
  return (
    <div className={`bd-fp-root-row-wrap${active ? ' bd-fp-root-row-wrap--active' : ''}`}>
      {showStar ? (
        <IconButton
          icon={
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill={favorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
            </svg>
          }
          active={favorite}
          tooltip={favorite ? 'Unmark as favorite' : 'Mark as favorite'}
          aria-pressed={favorite}
          aria-label={favorite ? `Unmark ${root.label} as favorite` : `Mark ${root.label} as favorite`}
          size={22}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(root);
          }}
        />
      ) : onRemove ? (
        <IconButton
          className="bd-fp-root-remove-btn"
          icon={
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          }
          tooltip="Remove custom path"
          aria-label="Remove custom path"
          size={22}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      ) : (
        <span className="bd-fp-root-star-placeholder" aria-hidden />
      )}
      <button
        type="button"
        className="bd-fp-root-row"
        onClick={() => onSelect(root.path)}
        title={root.path}
      >
        <span className="bd-fp-root-label">{root.label}</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Add the hover-reveal CSS rule**

In `src/styles/index.css`, locate the existing `.bd-fp-root-star-placeholder` block (around line 2619). Append immediately after it:

```css
  .bd-fp-root-remove-btn {
    opacity: 0;
    transition: opacity 80ms ease;
  }
  .bd-fp-root-row-wrap:hover .bd-fp-root-remove-btn,
  .bd-fp-root-remove-btn:focus-visible {
    opacity: 1;
  }
```

(The two-rule pattern keeps the button accessible to keyboard users — focus reveals it the same way hover does.)

- [ ] **Step 5: Add the `removeCustomRoot` handler in `FilePaletteApp` and pass it down**

In `src/components/file-palette/FilePaletteApp.tsx`, immediately after the `addCustomRoot` callback you added in Task 1 Step 5, add:

```ts
const removeCustomRoot = useCallback(async (root: RootEntry) => {
  if (root.source !== 'custom') return;
  try {
    const s = await invoke<AppSettings>('load_settings');
    const next: AppSettings = {
      ...s,
      filePaletteRoots: (s.filePaletteRoots ?? []).filter((r) => r.path !== root.path),
    };
    await invoke('save_settings', { settings: next });
    setSettings(next);
  } catch (e) {
    console.error('removeCustomRoot: save failed', e);
  }
}, []);
```

If `RootEntry` is not already imported into this file, add the import at the top:

```ts
import { buildRootEntries, RootsColumn, type RootEntry } from './RootsColumn';
```

(It's already imported via this exact line — confirm and skip if already present.)

Then pass `removeCustomRoot` into the `<RootsColumn ...>` JSX, joining `onAddCustomRoot`:

```tsx
<RootsColumn
  /* ...existing props... */
  onAddCustomRoot={addCustomRoot}
  onRemoveCustomRoot={removeCustomRoot}
/>
```

- [ ] **Step 6: Run the remove test to confirm it passes**

```bash
cd src/BorgDock.Tauri
npm test -- src/components/file-palette/__tests__/FilePaletteApp.test.tsx -t "clicking × on a custom row"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/RootsColumn.tsx \
        src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx \
        src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx \
        src/BorgDock.Tauri/src/styles/index.css
git commit -m "feat(file-palette): × button to remove a custom root from the list"
```

---

## Task 4: Verify active-root fallback after remove

The existing `useEffect` at `FilePaletteApp.tsx:81-94` reassigns `activeRoot` whenever the active path is no longer in `roots`. This task adds a regression test for that interaction with `removeCustomRoot`. No production code change is expected.

**Files:**
- Modify: `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`

- [ ] **Step 1: Add the fallback test**

Append:

```ts
it('removing the active custom root falls back to the first remaining root', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
    if (cmd === 'load_settings') {
      return Promise.resolve({
        repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
        ui: { filePaletteActiveRootPath: '/my/scratch' },
        filePaletteRoots: [{ path: '/my/scratch' }],
      });
    }
    if (cmd === 'list_worktrees_bare') {
      return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
    }
    if (cmd === 'list_root_files') return Promise.resolve({ entries: [], truncated: false });
    if (cmd === 'save_settings') return Promise.resolve(null);
    return Promise.reject(new Error(`unexpected ${cmd}`));
  });

  render(<FilePaletteApp />);
  // Custom root starts active.
  await waitFor(() => {
    const row = screen.getByText('scratch').closest('.bd-fp-root-row-wrap');
    expect(row?.className).toContain('bd-fp-root-row-wrap--active');
  });

  await act(async () => {
    fireEvent.click(screen.getByLabelText('Remove custom path'));
  });

  // After remove: scratch row is gone, wt1 row is active.
  await waitFor(() => {
    expect(screen.queryByText('scratch')).toBeNull();
    const wt = screen.getByText('wt1').closest('.bd-fp-root-row-wrap');
    expect(wt?.className).toContain('bd-fp-root-row-wrap--active');
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd src/BorgDock.Tauri
npm test -- src/components/file-palette/__tests__/FilePaletteApp.test.tsx -t "falls back to the first"
```

Expected: PASS (the existing fallback effect handles it once `setSettings(next)` re-derives `roots`). If it fails, the most likely cause is `removeCustomRoot` forgetting to call `setSettings(next)` — recheck Task 3 Step 5.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx
git commit -m "test(file-palette): active-root fallback when custom root is removed"
```

---

## Task 5: Final verification

**Files:** none modified.

- [ ] **Step 1: Run the full Vitest suite**

```bash
cd src/BorgDock.Tauri
npm test
```

Expected: all tests pass — the five new tests plus the rest of the suite.

- [ ] **Step 2: Run Biome lint**

```bash
cd src/BorgDock.Tauri
npm run lint
```

Expected: no new diagnostics. If the existing codebase has pre-existing warnings, they should be unchanged in count.

- [ ] **Step 3: Run TypeScript typecheck**

```bash
cd src/BorgDock.Tauri
npx tsc --noEmit
```

Expected: zero errors. If there's an error about `RootEntry` not being exported or `setSettings` typing, recheck imports and the `next: AppSettings` annotations from Task 1 Step 5 / Task 3 Step 5.

- [ ] **Step 4: Manual smoke test**

```bash
cd src/BorgDock.Tauri
npm run tauri dev
```

Open the File Palette (default hotkey or via the tray menu). Verify:

1. The ROOTS toolbar shows the new `+` icon at the leading position (before the favorites star and the collapse caret).
2. Clicking `+` opens a native folder picker. Pick a folder outside any tracked repo.
3. The new folder appears in the CUSTOM section, the ROOTS column collapses, and the picked folder is the active root (file index loads).
4. Reopen the palette and re-expand ROOTS. Hover the custom row — the `×` icon appears in the slot to the left of the label.
5. Click `×`. The custom row disappears; the active root falls back to the first worktree (or the next remaining root). No prompt or confirmation.
6. Click `+` again, pick a folder that's already a worktree of one of your repos. Nothing should happen — no duplicate row appears, no error toast.
7. Click `+` and cancel the picker. Nothing changes.

If any of the above misbehaves, the failing case maps directly to one of Tasks 1-4; revisit the corresponding test.

- [ ] **Step 5: Final commit (only if Steps 1-4 surfaced any small fix-ups)**

If smoke testing surfaces a small CSS or aria-label tweak, fix and commit:

```bash
git add <files>
git commit -m "fix(file-palette): <what>"
```

If everything works as-is, no commit needed — Tasks 1-4's commits are the deliverable.
