# File Palette v2 — Design

## Goal

Bring the File Palette window in line with the v2 mock (`design/borgdock/project/components/file-palette.v2.jsx`): inline diff preview when a changed file is selected, scope chips that own search mode, a richer Changes section with a vs HEAD / vs main / Both toggle, worktree change-count badges in the Roots column, and the shared title + status bar chrome already used by the SQL window.

The 3-pane skeleton (`Roots | Search+Changes+Results | Preview`) and the 7 components in `src/components/file-palette/` stay. Most of the work is composition over existing pieces.

## Scope

### In

- Inline diff in the right pane for files selected from Changes (split + unified, vs HEAD / vs main, hunk nav, copy patch)
- Pop-out to existing `file-viewer` window via an explicit "Open in window" button — inline by default, full window on demand
- 5 scope chips above search (`All` / `Changes` / `Filename` / `Content >` / `Symbol @`) — chip is the source of truth for search mode
- Changes section single-toggle (vs HEAD / vs main / Both), section-level collapse caret, total +N/−N stats, per-row +N/−N stats
- Worktree change-count badges in Roots column (yellow pill, only when count > 0)
- Status bar (bottom): `{rootLabel} · {indexedCount} indexed · {N} changed vs HEAD · +X −Y vs {baseRef}` and kbd hints on the right
- Title bar via shared `WindowTitleBar` with a `Ctrl+F8` kbd hint in the `meta` slot
- Window default size 1280×760, user-resizable, no min size constraint beyond Tauri defaults
- Functional find-in-file in the file preview (strip + scan + Prev/Next + match highlight)
- SQL window adopts the same title-bar kbd-hint treatment (`Ctrl+F10`)

### Out / deferred

- Forcing a custom titlebar with non-standard window controls — we use min/max/close from `WindowControls` and skip the design's "Pinned"/"Sidebar" buttons (favorites star already covers pinning; `Tab` is the keyboard equivalent for jumping to the Roots column)
- A new "pinned roots" concept — current worktrees + custom dirs + favorites cover this

## Architecture

### Selection model

Today, `selectedResult` is a single result entry and the preview always shows file content. After:

```ts
type Selection =
  | { kind: 'diff';  source: 'changes'; path: string; baseline: 'HEAD' | 'mergeBaseDefault'; group: 'local' | 'vsBase' }
  | { kind: 'file';  source: 'results'; path: string; line?: number; symbol?: string }
  | null;
```

`PreviewPane` routes on `selection.kind`. Selecting a Changes row (any group) sets `kind='diff'` with the baseline derived from the group: `local → 'HEAD'`, `vsBase → 'mergeBaseDefault'`. Selecting a Results row sets `kind='file'`. The diff view's compare toggle can override `baseline` per file at view time without changing the selection origin.

### Backend reuse

No new Tauri commands beyond extending one. Inline diff composes existing pieces:

- `git_file_diff(path, baseline)` → `{ patch, baselineRef, inRepo }` (already exists)
- `parsePatch` from `services/diff-parser` → hunks
- `SplitDiffView` / `UnifiedDiffView` from `components/pr-detail/diff/` (lifted as-is)
- `useSyntaxHighlight` from existing hook

### Worktree change-count fetch strategy

A new hook `use-worktree-change-counts.ts` owns a `Map<rootPath, { count: number; addTotal: number; delTotal: number }>`.

- **On mount and on window focus** (existing `refreshTick`): parallel `git_changed_files` over each *visible* root in the favorites filter (favorites-only mode hides most, so we only pay for what's shown). Custom dirs that aren't git repos: silently no badge.
- **On active-root switch**: fetch only the newly-active root, do not re-sweep.
- Failures cache to "no badge" and don't block the column.
- The active root's count also feeds the bottom status bar, so we read the same map from both places.

## Component changes

### `FilePaletteApp.tsx`

- Replace `<div className="bd-fp-titlebar">…` with `<WindowTitleBar title="Files" meta={<Kbd>Ctrl+F8</Kbd>} />`
- Add `<WindowStatusBar>` at the bottom with derived left/right slots
- Selection state: replace `selectedResult` indexing with the `Selection` shape above
- Drop `changesCollapsed: { local, vsBase }`; add `changesCollapsed: boolean` (single section-level collapse) and `changesMode: 'head' | 'base' | 'both'`
- Drop the `(scope === 'all' || scope === 'changes')` rendering inside the middle pane in favor of the chip-driven layout
- Extract worktree-change-count fetcher into the new hook; consume it
- Extract scope/selection reducer into a small `palette-state.ts` to keep `FilePaletteApp.tsx` under ~300 lines (today: 448)

### `FilePaletteSearchPane.tsx`

- Replace the single read-only mode pill with the 5 scope chips
- Chip click flips the parsed prefix on the query (clicking `Content >` while query is `foo` → query becomes `>foo`; clicking `All` strips any prefix)
- Right-side kbd hints (`↑↓` `↵`) inside the input
- Hint text under the input ("Filename · prefix > for content · @ for symbol") removed — chips show this directly

### `FilePaletteRootsColumn.tsx`

- Worktree rows render a yellow pill on the right when `count > 0` (matching `var(--color-warning-badge-bg)` + `var(--color-status-yellow)` tokens)
- Custom-dirs section gets a dashed `+ Add directory…` button at the end (the toolbar's existing add button stays)
- Active root indicator unchanged

### `FilePaletteChangesSection.tsx`

- Section header with: collapse caret (left), git-commit icon, "CHANGES" label, total `+N −N` of visible groups, tri-toggle (vs HEAD / vs main / Both) on the right
- Internal grouping (`Local · uncommitted` / `Ahead of base`) preserved as sub-sections that appear/hide based on the mode
- Each row: status badge (M/A/D, colored), filename + dir, +N/−N inline mono numbers
- `onVisibleRowsChange` interface preserved (parent still does flat keyboard nav across Changes + Results)

### `FilePalettePreviewPane.tsx`

Biggest single change. Routes on `selection.kind`:

- `null` → empty state
- `kind: 'file'` → `<FilePreview>` (new internal subcomponent)
- `kind: 'diff'` → `<DiffPreview>` (new internal subcomponent)

`<DiffPreview>`:

- Action bar: file path (dir/, name bold), `+N −N` totals, vs HEAD/main `SegToggle`, Unified/Split `SegToggle`, Copy patch, **Open in window**
- Hunk nav strip below: hunk count, "uncommitted in {root}" or "since branch diverged from origin/{base}" caption, Prev/Next buttons that scroll to next hunk boundary
- Body: lifted `SplitDiffView` / `UnifiedDiffView` (no internal changes — they already accept `hunks` + `syntaxHighlights`)
- View mode persists to existing `AppSettings.ui.fileViewerDefaultViewMode` so palette and viewer stay in sync

`<FilePreview>`:

- Action bar: file path, ext pill, `{lineCount} lines · {sizeBytes}`, Copy contents, Open in window
- Find-in-file strip below action bar (`Ctrl+F` opens, `Esc` closes)
- Body: existing `FilePaletteCodeView` with new match-overlay support

### `FilePaletteCodeView.tsx`

- Accept new optional props `findMatches?: Array<{ line: number; col: number; length: number }>` and `findCurrent?: number`
- Render match ranges as overlay spans within their lines, current match in a stronger color
- Existing `scrollToLine` is reused to scroll to current match
- The line-by-line DOM scaffolding stays — we only add overlay rendering

### `FilePaletteResultsList.tsx`

- Tighter row padding to match design spacing
- No structural changes

### Backend — `src-tauri/src/git/diff.rs`

- Extend `ChangedFile`:
  ```rust
  pub struct ChangedFile {
      pub path: String,
      pub status: String,
      pub old_path: Option<String>,
      pub additions: u32,
      pub deletions: u32,
  }
  ```
- In `compute_changed_files`: after the `--name-status -z` parse, run one `git diff --numstat -z` per group:
  - Local: `git diff --numstat -z HEAD --` (working tree vs HEAD; covers staged + unstaged)
  - vs-base: `git diff --numstat -z {merge_base}..HEAD`
- Parse `--numstat -z` (`<add>\t<del>\t<path>\0`, with rename triple form `<add>\t<del>\t\0<old>\0<new>\0` for renames) and merge by path
- Untracked files have no numstat — fall back to counting lines in the file content (or simpler: 0/0 with a flag, since the design tolerates this)
- Tests:
  - Existing `parse_name_status` tests stay unchanged
  - New `numstat_populates_additions_and_deletions` integration test
  - New `parse_numstat_renames_three_records` parser test

### `src-tauri/src/file_palette/windows.rs`

- Change `inner_size(1400.0, 860.0)` → `inner_size(1280.0, 760.0)` at line 79
- No min-size constraint added (Tauri defaults are sufficient)
- Existing window placement logic untouched

### `SqlApp.tsx` — consistency tweak

- Pass `meta={<Kbd>Ctrl+F10</Kbd>}` to its `<WindowTitleBar>` so the kbd-hint treatment is consistent with the palette

## Settings keys

Added to `AppSettings.ui`:

- `filePaletteScope: 'all' | 'changes' | 'filename' | 'content' | 'symbol'` (default: `'all'`)
- `filePaletteChangesMode: 'head' | 'base' | 'both'` (default: `'both'`)

Changed in `AppSettings.ui` (breaking, no users yet):

- `filePaletteChangesCollapsed`: was `{ local: boolean; vsBase: boolean }`, now `boolean` (default: `false`)

Unchanged:

- `filePaletteActiveRootPath`, `filePaletteFavoritesOnly`, `filePaletteRootsCollapsed`, `fileViewerDefaultViewMode`

## Keyboard

| Key | Where | Effect |
|---|---|---|
| `↑` / `↓` | Anywhere in palette | Move flat selection across Changes + Results |
| `Enter` | Anywhere in palette | Open selection (diff or file in preview) |
| `Tab` | Anywhere in palette | Move focus to Roots column |
| `Ctrl+/` | Anywhere in palette | Toggle Unified/Split when a diff is shown |
| `Ctrl+D` | Anywhere in palette | Cycle vs HEAD / vs main when a diff is shown |
| `Ctrl+F` | Preview pane (file mode) | Open find-in-file strip |
| `Esc` | Find strip open | Close find strip |
| `Esc` | Find strip closed, query non-empty | Clear query |
| `Esc` | Find strip closed, query empty | Close window |
| `>` / `@` typed in search | Search input | Flip scope chip (chip is source of truth) |

## Status bar

**Left**:
```
{rootLabel} · {indexedCount} indexed · {localCount} changed vs HEAD · +{addTotal} −{delTotal} vs {baseRef}
```

Each segment hides when its data isn't available (e.g., on a non-git custom dir, the change/diff segments are dropped).

**Right**:
```
↑↓ nav · ↵ open · Tab roots · Ctrl+/ diff view · Esc
```

## Tests

- `FilePaletteRootsColumn.test.tsx`: count badge renders with value, hides at 0, hidden for non-git custom dirs
- `FilePaletteChangesSection.test.tsx`: tri-toggle visibility, totals reflect visible groups, section-level collapse hides everything below header
- `FilePalettePreviewPane.test.tsx`: routes on `selection.kind`, "Open in window" calls `open_file_viewer_window` with the right baseline, view-mode toggle persists
- `FilePaletteSearchPane.test.tsx`: chip click rewrites query prefix, prefix typed flips chip
- `useWorktreeChangeCounts.test.ts`: parallel sweep on mount, single fetch on active-root switch, focus refresh re-sweeps visible
- `FilePaletteCodeView.test.tsx`: find-match overlays render at correct line+col+length, current-match emphasis applies
- Backend `git/diff.rs`: numstat populates `additions`/`deletions`, renames parse correctly, fallback to 0/0 for untracked

## Risks / known gotchas

- **Numstat for untracked files**: `git diff --numstat` doesn't include them. We have to either inject a 0/0 fallback (simpler, accepted) or compute add count from the file body. Spec uses 0/0 with a `null` sentinel to render "−" in the UI for untracked rows; design's per-row "+N −0" reads cleanly when 0/0.
- **Worktree count sweep over many worktrees**: each `git_changed_files` is one git invocation. With 10+ favorites, parallel fetch is fine; without parallelism it'd stall. Hook fans out `Promise.allSettled` and writes to the map as each lands, so the column updates progressively.
- **Persistent file-viewer window** stays first-class. The Open-in-window button on the inline diff calls the existing `open_file_viewer_window` command — no new code path.
- **`@codemirror/search` is unused**: `FilePaletteCodeView` is a custom DOM renderer, so find-in-file is owned in TS. Avoid the temptation to migrate to CodeMirror just for find — that's a separate scope.
