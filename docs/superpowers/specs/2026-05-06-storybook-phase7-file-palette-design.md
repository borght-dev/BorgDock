# Storybook Phase 7 — FilePaletteApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx` (the file-palette window mounted by `file-palette-main.tsx`). Extends the existing mock layer with a new `getCurrentWindow().onFocusChanged` method on `tauri-api-window.ts`. No new aliases, no new fixture-data modules outside the file-palette folder. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the seventh window to be storied (M-size, wave-2a). FilePaletteApp is the canonical "developer palette" window — search files / content / symbols across worktrees and custom roots, preview the selection, jump to a heavier viewer. Storying it lands several axes that wave-1 didn't cover:

- **Three search modes (filename / content / symbol)** plus a scope segmented control. Each mode hits a different async data source (`list_root_files`, `search_content`, the `useBackgroundIndexer` tree-sitter loop) and renders a different empty-state copy.
- **Two-pane preview shape (file vs diff)** that reuses `FilePaletteCodeView` and `parsePatch` plus the heavy `SplitDiffView` / `UnifiedDiffView`. Storying this here is the first time the diff renderer appears in the catalog — File Viewer (Phase 9) will reuse the same scaffolding.
- **The Changes section** with three modes (head / base / both), the "vs HEAD" / "vs main" pill toggle, and the "not in repo" empty state.
- **Window-focus re-fetch.** `onFocusChanged` was missing from the cumulative mock list (the wave-2 plan's pre-flight said "no mock gaps" — pre-flight audit confirmed otherwise). Storying File Palette forces us to extend `tauri-api-window.ts` with the synthetic `__window.onFocusChanged` channel pattern Phase 4's `onMoved` established. Cheap to add, immediately reusable.
- **Tree-sitter wasm in the Storybook iframe** is unverified before this phase. `FilePaletteCodeView` calls `@/services/syntax-highlighter` and `useBackgroundIndexer` dynamically imports `web-tree-sitter` and loads grammars from `/grammars/tree-sitter-*.wasm`. Storybook's Vite config already serves `public/` at root, so it *should* "just work" — but we add a probe story that mounts a small `.tsx` fixture and surfaces any `[syntax-highlighter]` console warnings. File Viewer (Phase 9) will inherit the answer.

## Non-Goals

- Per-component stories for `FilePaletteRootsColumn`, `FilePaletteSearchPane`, `FilePaletteResultsList`, `FilePalettePreviewPane`, `FilePaletteChangesSection`, `FilePaletteCodeView`, `DiffPreview`, `FilePreview` — deferred to the cross-cutting "component-level stories" phase noted in the roadmap.
- Visual regression integration / Chromatic / Storybook test-runner — still deferred.
- Hero-shot pipeline integration — later phase.
- Mocking `web-tree-sitter` itself. We rely on the real wasm-backed module via the production-served grammar files. If the iframe can't load grammars, the syntax-highlighter logs a warning and falls back to plain text — that's the same fail-soft behavior the production app exhibits, and stories don't depend on the colors being right.
- Storying the Changes section's drag-to-stage / right-click menu — those flows aren't implemented in production, no states to capture.
- Touching any production file under `src/components/file-palette/`, `src/components/shared/WindowTitleBar.tsx`, `src/components/shared/chrome/`, `src/services/syntax-highlighter.ts`, `src/services/diff-parser.ts`, `src/components/pr-detail/diff/`, `src/hooks/useSyntaxHighlight.ts`, `src/types/settings.ts`, `src/utils/parse-error.ts`, `src/file-palette-main.tsx`.
- A separate alias for `@/services/syntax-highlighter`. The real module is safe to import from Storybook — it doesn't touch Tauri (only the wasm runtime via `web-tree-sitter`). Aliasing it would also defeat the probe story.
- Mocking `disableDefaultContextMenu()` — that runs in `file-palette-main.tsx` (the Tauri entry), which the stories do NOT render. Stories render `<FilePaletteApp />` directly.

## Constraints

- **No production code changes.** Verified via:
  ```bash
  git diff origin/master...storybook-phase7-file-palette -- \
    src/BorgDock.Tauri/src/components/file-palette \
    src/BorgDock.Tauri/src/components/shared/WindowTitleBar.tsx \
    src/BorgDock.Tauri/src/components/shared/chrome \
    src/BorgDock.Tauri/src/services/syntax-highlighter.ts \
    src/BorgDock.Tauri/src/services/diff-parser.ts \
    src/BorgDock.Tauri/src/components/pr-detail/diff \
    src/BorgDock.Tauri/src/hooks/useSyntaxHighlight.ts \
    src/BorgDock.Tauri/src/types/settings.ts \
    src/BorgDock.Tauri/src/utils/parse-error.ts \
    src/BorgDock.Tauri/src/file-palette-main.tsx \
    ':(exclude)src/BorgDock.Tauri/src/components/file-palette/__fixtures__' \
    ':(exclude)src/BorgDock.Tauri/src/components/file-palette/*.stories.tsx'
  ```
  showing zero lines.
- Storybook 9 + React-Vite + Tailwind v4 setup from Phase 1 stays as-is. Only additive changes to `.storybook/`.
- The `tauri-api-window.ts` mock gains one new method on the `MockWindow` returned by `getCurrentWindow()`: `onFocusChanged(cb)`. No new control-surface fields, no new aliases in `main.ts`. All existing stories continue to render unmodified.
- **Parallel-execution safety.** The other two wave-2a teammates (`palette-workitems` Phase 8 and `viewer-files` Phase 9) don't touch the same `tauri-api-window.ts` surface — neither uses `onFocusChanged`. The DM-then-add coordination protocol is followed (DM proposing the shape sent to both peers; commit lands BEFORE the story commits in this branch's history).

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   └── mocks/
│       └── tauri-api-window.ts                # extend MockWindow with onFocusChanged
└── src/components/file-palette/
    ├── __fixtures__/
    │   └── file-palette-data.ts               # synthetic factories + curated scenarios
    └── FilePaletteApp.stories.tsx             # 25 stories
```

### Mock additions

#### `tauri-api-window.ts` extension

Add to `MockWindow`:

```ts
interface MockWindow {
  // existing methods...
  onFocusChanged(
    cb: (event: { payload: boolean }) => void,
  ): Promise<() => void>;
}
```

And to the `getCurrentWindow()` return:

```ts
async onFocusChanged(cb) {
  let set = ctrl.channels.get('__window.onFocusChanged');
  if (!set) {
    set = new Set();
    ctrl.channels.set('__window.onFocusChanged', set);
  }
  const wrapped: ChannelListener = (event) =>
    cb(event as { payload: boolean });
  set.add(wrapped);
  return () => {
    set?.delete(wrapped);
  };
},
```

Mirrors Phase 4's `onMoved` pattern — registers the listener under a synthetic channel name (the `__window.` prefix is reserved for `getCurrentWindow()` listener emulation). Stories drive focus events with `getControl().emit('__window.onFocusChanged', focused)`. No new control-surface fields.

#### No new aliases / mocks

`@tauri-apps/plugin-dialog` (used for `addCustomRoot`'s directory picker) was already aliased in Phase 6. The dynamic `import('@tauri-apps/plugin-dialog')` resolves through the Vite alias same as a static one. Stories that exercise the picker set `getControl().pluginDialog.openResponse` to either a path string or `null`.

`navigator.clipboard.writeText(...)` from `FilePaletteCodeView` / `DiffPreview` / `FilePreview` is the browser API, not Tauri's `plugin-clipboard-manager`. No mock needed.

### Stories file pattern

`FilePaletteApp.stories.tsx` mirrors the Phase 3 (Worktree) and Phase 6 (WorkItemDetail) patterns: a `FilePaletteHarness` wrapper, a `story()` helper, parameter-driven seeding via `parameters.filePalette.*`. The harness:

1. Calls `getControl().reset()` (already done by the global preview decorator).
2. Sets `getControl().invokeResponses[...]` from `params.invokeResponses` — both static values and function-form `(args) => T` are supported (Phase 3's widening).
3. Sets `getControl().pluginDialog.openResponse = params.pluginDialogOpenResponse` if specified.
4. Renders `<FilePaletteApp />` inside a fixed-size box (~960×600 — wider than worktree because the palette has three columns).

`canonicalSettings(...)` lives in the new `__fixtures__/file-palette-data.ts` file. We do NOT reuse Phase 6's `canonicalSettings` from `components/work-items/__fixtures__/` — coupling the two folders' fixtures across an unrelated surface would create cross-phase rebase pain. Each window-folder owns its own `canonicalSettings()` factory. The bodies are similar but evolve independently.

### Theme

Existing global toolbar (`light` / `dark` / `system`) covers it. `FilePaletteApp` uses Tailwind `dark:` modifiers and CSS custom properties — no per-story wiring needed.

### Fixtures

`src/components/file-palette/__fixtures__/file-palette-data.ts`:

```ts
import type { AppSettings, RepoSettings, FilePaletteRoot } from '@/types/settings';
import type { ContentFileResult } from '../use-content-search';
import type { ChangedFileEntry } from '../FilePaletteChangesSection';
import type { FileEntry } from '../use-file-index';

export interface WorktreeEntry { path: string; branchName: string; isMainWorktree: boolean; }
interface ChangedFilesOutput {
  local: ChangedFileEntry[];
  vsBase: ChangedFileEntry[];
  baseRef: string;
  inRepo: boolean;
}

export function canonicalSettings(overrides?: Partial<AppSettings>): AppSettings;
export function makeRepo(overrides?: Partial<RepoSettings>): RepoSettings;
export function makeFileEntry(rel: string, size?: number): FileEntry;
export function makeWorktree(overrides?: Partial<WorktreeEntry>): WorktreeEntry;
export function makeContentResult(rel: string, hits: number[]): ContentFileResult;
export function makeChangedFile(path: string, status?: string, add?: number, del?: number): ChangedFileEntry;

// Curated repo + worktree shapes
export const repoBorgDock:        RepoSettings;       // borght-dev/BorgDock with worktreeBasePath
export const repoFspHorizon:      RepoSettings;       // gomocha/fsp-horizon, second repo
export const repoCustomFavs:      RepoSettings;       // favoriteWorktreePaths populated

export const wtMainBorgDock:      WorktreeEntry;
export const wtFeatureBorgDock:   WorktreeEntry;
export const wtMainFsp:           WorktreeEntry;

// Curated file indexes (sized to keep tree-sitter indexer fast)
export const tinyFileIndex:        FileEntry[];        // 5 .tsx files (probes syntax highlighter)
export const mediumFileIndex:      FileEntry[];        // 50 mixed-extension files
export const largeFileIndexCapped: FileEntry[];        // 600 files → triggers truncated:true

// Curated content-search fixtures
export const contentResultsForFoo: ContentFileResult[];   // 4 files, 12 total hits

// Curated changed-files fixtures
export const changedFilesEmpty:     ChangedFilesOutput;   // inRepo:true, both lists empty
export const changedFilesNotInRepo: ChangedFilesOutput;   // inRepo:false
export const changedFilesLocalOnly: ChangedFilesOutput;   // 4 local, 0 vsBase
export const changedFilesBoth:      ChangedFilesOutput;   // 4 local, 3 vsBase

// Curated read_text_file payloads (for the preview pane)
export const tsxFileSample:    string;                  // ~30 lines of plausible TSX (highlighter probe)
export const tooLargeError:    { kind: 'tooLarge'; size: number; limit: number };
export const binaryError:      { kind: 'binary' };
export const notFoundError:    { kind: 'notFound' };

// Curated git_file_diff payload
export const sampleDiffPatch:  string;                  // unified-diff text, 2 hunks
```

`AppSettings`, `RepoSettings`, and `FilePaletteRoot` are imported from `@/types/settings` — never redeclared. `FileEntry`, `ContentFileResult`, `ChangedFileEntry` are imported from the local production hooks/sections. `WorktreeEntry` is mirrored locally (the production interface is non-exported inside `FilePaletteApp.tsx`); the duplication is one shape, three fields, and stable.

## Story Catalog (exhaustive — 25 stories)

### Bootstrap / load axis (2)
1. **Loading** — `invokeResponses['load_settings']` set to a never-resolving promise. Component renders the chrome but no roots / results yet.
2. **SettingsLoadFailed** — `load_settings` rejects; component sets `loadError`. The middle column shows "Load error: …". Documents the load-error path.

### Roots-column axis (3)
3. **SingleWorktreeRoot** — one repo with one worktree; the roots column shows ROOTS header + one row.
4. **MultipleRootsActive** — two repos, four worktrees total + one custom root. First worktree is the active root.
5. **FavoritesOnly** — `settings.ui.filePaletteFavoritesOnly = true`, two favorite worktrees marked, the rest hidden. The toolbar's filter pill is "on".

### Search-modes axis (4)
6. **DefaultMixed** — query="", scope="all"; results column shows the file index list (top 500 of `mediumFileIndex`).
7. **FilenameSearchActive** — query="App"; the filename filter narrows the index. Multiple results.
8. **ContentSearchActive** — query=">foo"; `search_content` returns `contentResultsForFoo`. Each row shows match count + first-line preview.
9. **SymbolSearchActive** — query="@func"; `useBackgroundIndexer` runs against `tinyFileIndex` (5 .tsx files) — exercises the live tree-sitter loop. The probe story.

### Results-state axis (2)
10. **ResultsEmptyNoMatch** — query="zzznosuchstring"; "No filenames matching 'zzznosuchstring'." copy.
11. **ResultsTruncated** — `largeFileIndexCapped` (600 files); `truncated: true` flag plus the 500-result cap.

### Changes-section axis (4)
12. **ChangesLocalOnly** — `git_changed_files` returns `changedFilesLocalOnly`; only the LOCAL group rows visible. Mode pill defaults to "both" but the empty `vsBase` group hides.
13. **ChangesBothGroups** — `changedFilesBoth`; both groups render with their counts.
14. **ChangesNotInRepo** — `changedFilesNotInRepo`; the section renders the "not a git repository" empty.
15. **ChangesCollapsed** — `settings.ui.filePaletteChangesCollapsed = true`; the section header is rendered but the body is hidden.

### Preview-pane axis (5)
16. **PreviewEmpty** — no selection; "Select a file to preview" copy in the right pane.
17. **PreviewFileLoading** — `read_text_file` set to a never-resolving promise; "Loading…" empty in the file preview.
18. **PreviewFileOk** — `read_text_file` returns `tsxFileSample`; `FilePaletteCodeView` renders with line numbers. The syntax-highlighter probe — if grammars load, you see token colors; if they don't, you see plain text + a console warning. Story passes either way (the layout is the assertion, not the colors).
19. **PreviewFileBinary** — `read_text_file` rejects with `binaryError`; the "Binary file — preview disabled" copy and "Open in editor" button render.
20. **PreviewDiffOk** — Selection is a Changes row; `git_file_diff` returns `sampleDiffPatch` (2 hunks). `UnifiedDiffView` renders with `+/−` totals in the action bar.

### Interaction axis (5)
21. **AddCustomRoot** — `play` clicks the "+ root" icon; `pluginDialog.openResponse` is `/Users/storybook/extra-root`; `getControl().invocations` includes the `plugin:dialog.open` and `save_settings` records, and the new root appears in the column.
22. **PaletteReshown** — `play` calls `getControl().emit('palette-shown', null)`; query field clears; second `load_settings`-class triggered indirectly via `refreshTick++` (validated by the `invocations` array growing).
23. **WindowFocusRefresh** — `play` calls `getControl().emit('__window.onFocusChanged', true)`; the change-counts hook re-fetches (`git_changed_files` invocation count increases by 1).
24. **EscHidesWindow** — `play` presses Escape with empty query; `getControl().invocations` ends with `{ command: 'window.hide' }`.
25. **EnterOpensViewer** — `play` arrows to a result row, presses Enter; `getControl().invocations` ends with `{ command: 'open_file_viewer_window', args: { path: '...' } }`.

**Total: 25 stories.**

## Tooling additions

### `package.json`
No changes. Storybook deps installed in Phase 1 are sufficient. `@tauri-apps/plugin-dialog` is already in `dependencies`; the dynamic `import('@tauri-apps/plugin-dialog')` inside `addCustomRoot` resolves through the existing Vite alias to `mocks/tauri-plugin-dialog.ts`.

### `tsconfig.json`
Existing `src/**/*.tsx` glob covers the new fixtures and stories. No changes.

### Biome
Phase 1 already extended `biome.json` includes to cover `.storybook/`. Nothing to add.

### Test suites
- **Vitest:** untouched. Existing `__tests__/FilePaletteApp.test.tsx` and friends use their own `vi.mock(...)` blocks; the new fixtures are plain TypeScript that may incidentally be imported by a future test, but Phase 7 doesn't add any vitest tests.
- **Playwright:** untouched.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Tree-sitter wasm fails to load in the Storybook iframe | medium | The probe story (`SymbolSearchActive` + `PreviewFileOk`) is small enough that a wasm failure surfaces as a console warning rather than a crash. Production code already fail-softs to plain text. Storybook serves `public/` at root so `/grammars/tree-sitter-*.wasm` paths work the same as in the running app. |
| `useBackgroundIndexer`'s synchronous `for…of` loop ties up the iframe when given a large file list | medium | Symbol-mode story (`SymbolSearchActive`) uses `tinyFileIndex` (5 files). The 500-cap result list is just a data array — not indexed for symbols. |
| `addCustomRoot` story's dialog mock returns `/Users/storybook/extra-root`; the deduplication `roots.some(...)` check might fail on Windows-vs-posix path normalization | low | The fixture path uses forward slashes; the production deduplication normalizes both sides. Story passes on macOS and Windows runners. |
| `FilePaletteCodeView`'s syntax-highlighter loads on every story render → adds ~200ms to story switch | low | Storybook lazy-renders one story at a time. The grammar loader caches across renders inside the same iframe session. |
| `WindowFocusRefresh` story emits before listener registration completes (the `useEffect` is async) | medium | The `play` function awaits `findByRole('textbox')` first to confirm the component has mounted past its async listener-setup `useEffect`. |
| Phase 6's `pluginDialog.openResponse` interacts with directory-picker semantics (single string vs string[] vs null) | low | The production code accepts `string \| null` and treats anything else as cancelled. The mock handles that exact contract. |
| Stories that drive `palette-shown` race against the production code's `useEffect` that registers the listener | medium | Same mitigation as `WindowFocusRefresh` — `play` awaits an interactable element first. |
| `tooLarge` / `binary` errors must be thrown — not returned — to be caught by the `.catch(normalizeError)` | low | The `invokeResponses` value is set to a function that throws (sync) or rejects (Promise). Documented in the story comments. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 25 File-Palette stories render alongside Phase 1–6 stories (no regressions).
2. Light/dark toolbar toggle re-renders every File-Palette story without reload.
3. `npm run build-storybook` completes cleanly (timeout: 600000).
4. `npm run test` passes (timeout: 600000).
5. **Production code is byte-identical** — verified via the `git diff origin/master...HEAD --` command above showing zero lines.
6. The `.storybook/mocks/tauri-api-window.ts` extension adds exactly one method (`onFocusChanged`) to `MockWindow` and the returned object — no other lines change beyond the documented JSDoc/comment update describing the addition.
7. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR: the File Palette row moves from "Pending" to "Done" with spec/plan/PR links; the mock-extensions section gains a one-line note that `tauri-api-window` now also exposes `getCurrentWindow().onFocusChanged`.
8. Story count: `grep -c "^export const " src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.stories.tsx` returns `25`.

## What comes next (out of scope here)

- **File Viewer (Phase 9):** consumes the same syntax-highlighter probe — if Phase 7 confirms tree-sitter works in Storybook, Phase 9 can story the standalone viewer without re-running the probe.
- **Work Item Palette (Phase 8):** mirrors the palette UX. The `__window.onFocusChanged` mock is also reusable if Work Item Palette adopts focus-based refresh.
- **Component-level stories** for `FilePaletteRootsColumn`, `DiffPreview`, `FilePreview`, `FilePaletteCodeView` — easier now that the window-level catalog has captured every state.
- **Visual regression decision** — five windows storied (Flyout, WhatsNew, Worktree, Agent Overview, SQL, WorkItemDetail, FilePalette = seven once this lands) is well over the ≥3 threshold from the roadmap. Cross-cutting workstream candidate after wave 2a closes.
