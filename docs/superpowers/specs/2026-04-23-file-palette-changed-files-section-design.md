# File Palette — Changed Files section

## Context

The File Palette (`src/components/file-palette/`) lets a user browse and search files within a chosen root (worktree or custom path). The middle pane currently shows one flat list driven by search modes (filename / `>` content / `@` symbol). When the user switches to a worktree root, there is no quick way to see "what's changed in this branch" — they have to fall back to a terminal or an editor.

We are adding a persistent **Changes** section between the search bar and the results list. It surfaces two groups — **Local** (uncommitted working-tree changes) and **vs `<default branch>`** (committed delta since the branch diverged) — so a user can glance at a worktree and immediately see both in-progress work and committed work.

Clicks open the existing file viewer, which already auto-selects diff mode (see `docs/superpowers/specs/2026-04-23-file-viewer-focus-diff-design.md` / `components/file-viewer/FileViewerApp.tsx`). The only viewer change is an optional `?baseline=` URL param so "vs master" rows open with the matching baseline preselected.

## Approach

### Rust — new command

Add `git_changed_files(root: String)` to `src-tauri/src/git/diff.rs` (next to the existing `git_file_diff`). Register in `lib.rs::invoke_handler`.

Return shape:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFilesOutput {
    pub local: Vec<ChangedFile>,
    pub vs_base: Vec<ChangedFile>,
    pub base_ref: String,   // e.g. "master"; empty when !in_repo
    pub in_repo: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,           // repo-relative, forward slashes
    pub status: String,         // "M" | "A" | "D" | "R" | "U" | "?" | "C"
    pub old_path: Option<String>, // only for renames / copies
}
```

Implementation:

1. Resolve the repo toplevel from `root` using the existing `repo_toplevel()` helper. If not a git repo → return `{ local: [], vs_base: [], base_ref: "", in_repo: false }`.
2. `local`: run `git status --porcelain=v1 -z` inside the toplevel, parse two-character status codes (`XY path`). Untracked files (`??`) keep status `"?"`; renames (`R  old -> new` in `-z` mode) populate `old_path`.
3. `vs_base`: resolve the default branch with the existing `default_branch_cache()` / `resolve_default_branch()` helpers, compute `git merge-base HEAD origin/<default>`, then `git diff --name-status -z <merge-base>..HEAD`. Parsing reuses whatever helper ends up extracted for `status -z` (see "Shared parsing" below).
4. **Dedup**: after both lists are built, remove any `vs_base` entry whose `path` also appears in `local`. This keeps "vs master" meaning "committed-and-still-changed-vs-base, excluding current uncommitted work."
5. Wrap in `tokio::task::spawn_blocking` (same pattern as `git_file_diff`).

**Shared parsing.** `git status -z` and `git diff --name-status -z` share NUL-separated record format but differ slightly (status column widths, rename record splits across two records for `-z`). Implement one helper `parse_name_status(bytes: &[u8], mode: NameStatusMode) -> Vec<ChangedFile>` and unit-test it.

### Frontend — new component

`src/components/file-palette/ChangesSection.tsx` — presentational component rendered by `FilePaletteApp` inside `fp-middle`, between `SearchPane` and the existing results block.

Props:

```ts
interface ChangesSectionProps {
  rootPath: string | null;
  query: string;                  // from palette; used for filtering
  queryMode: SearchMode;          // only filter when mode === 'filename'
  selectedIndex: number;          // palette-wide selection
  baseIndex: number;              // where this section starts in the flat nav list
  onSelect: (globalIdx: number) => void;
  onOpen: (file: ChangedFileEntry, group: 'local' | 'vsBase') => void;
  localCollapsed: boolean;
  vsBaseCollapsed: boolean;
  onToggleCollapse: (group: 'local' | 'vsBase') => void;
  refreshTick: number;            // parent increments to force refetch
}
```

- Fetches via `invoke<ChangedFilesOutput>('git_changed_files', { root: rootPath })` on `rootPath` change and whenever `refreshTick` increments.
- `FilePaletteApp` bumps `refreshTick` on:
  - root selection
  - window focus (`getCurrentWindow().onFocusChanged` → bump when focused).
  - user click on the section header `⟳` button.
- Filtering: when `queryMode === 'filename'` and `query` is non-empty, each subgroup's rows pass through the same substring matcher used by `useFileIndex` (case-insensitive contains on path). Content / symbol modes leave the section unfiltered.
- Collapse state persists in settings as `ui.filePaletteChangesCollapsed: { local: boolean; vsBase: boolean }` (wired through the same `load_settings`/`save_settings` path as `filePaletteRootsCollapsed`).
- Empty / non-git handling:
  - `inRepo === false` → render one muted line: "Not a git repo".
  - `inRepo === true` and both lists empty (post-filter) → "No changes on this branch".
- Row rendering: status letter badge (colors match the existing PR diff `statusBadgeColor`) + path. For renames, show `oldPath → path` truncated at both ends.

### Unified keyboard navigation

`FilePaletteApp` already tracks `selectedIndex` against a single flat `results` array. Extend that concept:

```
flat = [...localRows, ...vsBaseRows, ...results]  // when section is expanded
```

- `selectedIndex` now indexes into the flat array.
- ArrowUp / ArrowDown cycle through the whole flat list, skipping over subheaders and the refresh button.
- `Enter` dispatches: if the selected index falls inside `ChangesSection`'s range, call its `onOpen`; otherwise the existing `openResult(selectedIndex - sectionLength)`.
- The `rowRefs` map is extended to include section rows so `scrollIntoView` still works.

Collapsed subgroups contribute zero rows to `flat`.

### Viewer: optional baseline query param

`components/file-viewer/FileViewerApp.tsx` reads the existing `?path=` from the URL. Add:

```ts
const initialBaseline: Baseline =
  (new URLSearchParams(window.location.search).get('baseline') as Baseline | null)
  === 'mergeBaseDefault' ? 'mergeBaseDefault' : 'HEAD';
```

and use it as the initial state for `baseline`. Update `src-tauri/src/file_palette/windows.rs::open_file_viewer_window` to accept an optional `baseline: Option<String>` arg and append `&baseline=mergeBaseDefault` when set. Callers that don't pass it keep current behavior (HEAD default).

`FilePaletteApp.openResult` stays on HEAD; `ChangesSection.onOpen('vsBase', …)` passes `baseline: 'mergeBaseDefault'`.

## Files to modify / create

- `src-tauri/src/git/diff.rs` — add `git_changed_files`, `ChangedFilesOutput`, `ChangedFile`, `parse_name_status` + tests.
- `src-tauri/src/git/mod.rs` — `pub use diff::git_changed_files;`.
- `src-tauri/src/lib.rs::invoke_handler` — register `git::diff::git_changed_files`.
- `src-tauri/src/file_palette/windows.rs::open_file_viewer_window` — accept optional `baseline` arg, propagate to URL.
- `src/components/file-palette/ChangesSection.tsx` — new component.
- `src/components/file-palette/FilePaletteApp.tsx` — render `ChangesSection`, extend `selectedIndex` flattening, focus-based refresh, baseline-aware `openResult`.
- `src/components/file-palette/__tests__/` — tests for flat-nav index math and query filtering.
- `src/components/file-viewer/FileViewerApp.tsx` — read initial `baseline` from URL.
- `src/types/settings.ts` — add `ui.filePaletteChangesCollapsed: { local: boolean; vsBase: boolean }`.
- `src/styles/file-palette.css` — styles for the section (match PR diff status badge colors).

## Reused code

- `src-tauri/src/git/diff.rs::repo_toplevel`, `resolve_default_branch`, `default_branch_cache` — do not duplicate.
- `src-tauri/src/git/hidden_command` / `run_git_raw` pattern — keep for subprocess spawning.
- `components/pr-detail/diff/DiffFileSection.statusBadgeColor` equivalent — extract to a tiny shared util if it isn't already, rather than inline-duplicating.
- `useFileIndex` substring matcher — reuse the helper it exports internally for filename fuzzy matching so both panes feel identical.
- `open_file_viewer_window` — same command, new optional arg.

## Scope boundaries (not in v1)

- No stage / unstage / commit / discard actions. Display only.
- No "Changes across all worktrees" aggregate view — one root at a time.
- No binary diff preview handling beyond the viewer's existing binary-file error.
- No file-count pagination; if a branch has hundreds of committed files the section scrolls.
- No inline row preview — click always opens the viewer window.
- No content-mode search filtering (`>`, `@`) applied to the Changes section.

## Verification

1. **Cold open**
   - Launch `npm run tauri dev`, open the File Palette, pick a clean worktree root.
   - Expected: Changes section shows "No changes on this branch" (or empty Local + a populated "vs master" if the worktree already has committed-ahead changes).

2. **Local changes appear**
   - With the palette open, in another window `echo test > /worktree/src/foo.ts` (modification) and `touch /worktree/src/bar.ts` (untracked).
   - Click the palette window (triggering focus refresh) and hit the refresh button.
   - Expected: `Local` now shows `M src/foo.ts` and `? src/bar.ts`.

3. **Dedup**
   - Commit an edit to `src/foo.ts` on the branch, then edit it again uncommitted.
   - Expected: `src/foo.ts` appears in **Local only**, not also under "vs master".

4. **vs base**
   - On a branch with several committed files and a clean working tree, open the palette.
   - Expected: `vs master` lists exactly those committed files; Local is empty.

5. **Filter**
   - With 10 changed files, type `foo` in the search box.
   - Expected: Both subgroups filter to paths containing `foo`; the regular results list below filters to all `foo`-matching files.

6. **Click behavior**
   - Click a `Local` row → viewer opens in diff-vs-HEAD mode.
   - Click a `vs master` row → viewer opens in diff-vs-`master` mode (segment "vs master" preselected, patch visible).

7. **Keyboard**
   - ArrowDown from the search box walks `Local` rows → `vs master` rows → regular results. `Enter` opens the focused row.
   - Collapsing "vs master" removes those rows from the nav sequence.

8. **Non-git root**
   - Configure a custom file-palette root pointing at a plain folder, select it.
   - Expected: Changes section renders "Not a git repo"; no rows to navigate.

9. **Rust tests**
   - `parse_name_status` handles: plain `M\0path\0`, rename `R\0old\0new\0`, untracked `??\0path\0` (status-mode only), deletion `D\0path\0`.
   - `git_changed_files` against a temp repo with mixed states produces the expected lists and dedup behavior.

10. **Frontend tests**
    - Flat-index math: `selectedIndex` at section boundaries dispatches to the right handler.
    - Query filter: empty query → full lists; non-empty filename query → filtered; content/symbol query → unfiltered.
