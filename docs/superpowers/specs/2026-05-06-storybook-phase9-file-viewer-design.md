# Storybook Phase 9 — FileViewerApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.tsx` (the standalone file-viewer window: plain content + git diff modes with syntax highlighting). One Storybook config edit (Vite plugin to copy the tree-sitter runtime wasm) plus a new fixtures file plus the stories file. No new mock aliases. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the ninth window to be storied. FileViewerApp is the file-palette pop-out window — when the user opens a file from the palette, this window renders it with three modes (plain content / unified diff / split diff) plus baseline switching (HEAD / merge-base of origin/default). Storying it matters because:

- **Tree-sitter syntax highlighting in the Storybook iframe is unverified.** Per `CLAUDE.md`'s "Syntax highlighting" section, the highlighter is a no-op when either the runtime wasm or the grammar wasm fails to load — and the failure is silent (a `console.warn` then plain spans). Storying the file-viewer is the first phase that actually depends on this pipeline working in Storybook. We need to (a) make it work, and (b) write a probe story whose `play` function asserts the DOM has highlighted spans (not just plain text fallbacks).
- **No new mocks needed.** Audit (Task #3) confirms the only Tauri imports are `@tauri-apps/api/core` and `@tauri-apps/api/window` — both already aliased post phase 6. The toolbar's "Copy all" uses `navigator.clipboard.writeText` (browser API), not `@tauri-apps/plugin-clipboard-manager`, so even that surface isn't needed.
- **Picks up `FilePaletteCodeView` as a side-effect.** Plain-content mode renders this same component, which the upcoming File Palette phase (7) will story differently (palette-context). The phase-9 catalog gives it window-context coverage now, in advance.
- **Picks up `UnifiedDiffView` and `SplitDiffView`.** These are also rendered inside `pr-detail`'s FilesTab — phase 11 (Pr Detail) gets a head-start.
- **Mode-resolution surface.** `FileViewerApp` has a non-trivial `effectiveMode` ternary that defers to the diff response (`auto` → `diff` if patch is non-empty + inRepo, else `content`). Stories must exhaustively cover the three branches plus the URL-baseline override.

## Non-Goals

- Per-component stories for `UnifiedDiffView`, `SplitDiffView`, `DiffFileSection`, `DiffFileTree`, `DiffLineContent`, `DiffToolbar`, `FilePaletteCodeView`, `FileViewerToolbar` — deferred to the cross-cutting "component-level stories" phase noted in the roadmap. The phase-9 catalog stories the **window** end-to-end, not its parts.
- Visual regression integration / Chromatic / Storybook test-runner — still deferred.
- Hero-shot pipeline integration — later phase.
- Touching production code under `src/components/file-viewer/`, `src/components/file-palette/FilePaletteCodeView.tsx`, `src/components/pr-detail/diff/`, `src/services/syntax-highlighter.ts`, `src/services/diff-parser.ts`, `src/hooks/useSyntaxHighlight.ts`, or any production file outside the Storybook config and the new fixtures + stories paths.
- Storying the file-viewer window's `disableDefaultContextMenu()` call — it lives in `file-viewer-main.tsx` (the Tauri entry), which the stories do NOT render. Stories render `<FileViewerApp />` directly.
- Mocking the runtime tree-sitter behavior. The Storybook iframe runs the **real** highlighter against the real wasm — that is the point of the probe story. We don't stub `web-tree-sitter` because that would defeat the verification.
- Storying the editor-launch invocation (`open_in_editor`) succeeding/rejecting — the production code fires-and-forgets, so the only surface the user sees is the click. We assert via `invocations`, not via UI state.
- Storying the per-file-extension grammar matrix exhaustively. The probe covers TSX (the most common extension and the one we ship). Other extensions are covered indirectly by the diff stories using `.ts` paths.

## Constraints

- **No production code changes.** Verified at end-of-phase via `git diff origin/master...storybook-phase9-file-viewer -- src/BorgDock.Tauri/src/components/file-viewer src/BorgDock.Tauri/src/components/file-palette/FilePaletteCodeView.tsx src/BorgDock.Tauri/src/components/pr-detail/diff src/BorgDock.Tauri/src/services/syntax-highlighter.ts src/BorgDock.Tauri/src/services/diff-parser.ts src/BorgDock.Tauri/src/hooks/useSyntaxHighlight.ts src/BorgDock.Tauri/src/file-viewer-main.tsx ':(exclude)src/BorgDock.Tauri/src/components/file-viewer/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/file-viewer/*.stories.tsx'` showing zero changes.
- Storybook 9 + React-Vite + Tailwind v4 setup from Phase 1 stays as-is. Only additive changes to `.storybook/main.ts viteFinal` (one new plugin invocation).
- The control surface (`window.__borgdock_storybook_tauri`) gets **zero** new fields. We use the existing `invokeResponses`, `invocations`, and reset machinery only.
- **Parallel-execution safety.** Phases 7 (`palette-files`) and 8 (`palette-workitems`) are running concurrently against the same `.storybook/main.ts` file. Per the wave-2 audit, neither needs a new alias. My one edit (adding a `viteStaticCopy` plugin in `viteFinal`) is purely additive — `git merge` resolves cleanly with adjacent-but-non-overlapping inserts. Peers were DM'd about it before this spec.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   └── main.ts                                   # extend viteFinal: import + push viteStaticCopy plugin
└── src/components/file-viewer/
    ├── __fixtures__/
    │   └── file-viewer-data.ts                   # synthetic patches, file contents, AppSettings helper
    └── FileViewerApp.stories.tsx                 # 25 stories
```

### Storybook config edit (one place)

`.storybook/main.ts viteFinal` adds the same `vite-plugin-static-copy` invocation the production `vite.config.ts` uses. Reasoning per the audit findings on Task #3:

- The runtime tree-sitter loader calls `Parser.init({ locateFile: () => '/web-tree-sitter.wasm' })`.
- Production Vite copies `node_modules/web-tree-sitter/web-tree-sitter.wasm` to the build root via `viteStaticCopy`. Storybook's Vite config inherits everything we put in `viteFinal` but does NOT inherit `vite.config.ts` — Storybook ignores the project's `vite.config.ts` by default and merges its own.
- Without the copy, `/web-tree-sitter.wasm` 404s, the highlighter falls back silently, every story renders plain text, and the test-runner can't tell.
- Grammars (`/grammars/tree-sitter-<name>.wasm`) live in `public/grammars/` which Vite serves at root automatically — Storybook respects `public/` in dev/build mode. **No additional handling needed for grammars.**
- CSP — Storybook's dev server and built static output do NOT impose a CSP by default. There's no `preview-head.html` in `.storybook/`. `'wasm-unsafe-eval'` is implicit. **No CSP config needed.**

The plugin is added after `tailwindcss()` to keep insertion order deterministic. `vite-plugin-static-copy` is already a project dependency (used by `vite.config.ts`).

### Stories file pattern

`FileViewerApp.stories.tsx` mirrors the SQL/WhatsNew pattern: a `FileViewerHarness` wrapper, a `story()` helper, parameter-driven seeding. The harness:

1. The global preview decorator (`.storybook/preview.ts`) already calls `getControl().reset()` and applies the toolbar theme. Nothing extra to do at decorator level.
2. Mutates `window.location` synchronously in the harness function body via `history.replaceState({}, '', \`/file-viewer.html?\${searchString}\`)` so `URLSearchParams(window.location.search)` returns the right `path` (and `baseline` if specified) before `<FileViewerApp />` mounts. The harness restores the original URL on unmount via `useEffect`'s cleanup.
3. Sets the `invokeResponses` for the four commands the window calls (`load_settings`, `read_text_file`, `git_file_diff`, `open_in_editor`, plus `save_settings` for the view-mode persistence path). Function-form responses (Phase 3) discriminate by `args.path` / `args.baseline`.
4. Wraps `<FileViewerApp />` in a fixed-size box (`width: 1200, height: 720`) so the layout doesn't expand to fill the Storybook iframe.

### Fixtures

`src/components/file-viewer/__fixtures__/file-viewer-data.ts`:

```ts
import type { AppSettings } from '@/types/settings';

// Make a complete AppSettings with sensible defaults; only override what
// the calling story cares about. Mirrors the SQL fixtures' makeSettings.
export function makeSettings(overrides?: Partial<AppSettings['ui']>): AppSettings { ... }

// Source code samples for content mode.
export const TSX_SAMPLE = `...short tsx with keywords/strings/JSX...`;
export const PLAIN_TEXT_SAMPLE = `...readme-style plain text...`;
export const LARGE_TS_SAMPLE = `...100+ lines of typescript...`;

// Patches in unified-diff format (as `git_file_diff` returns them).
export const PATCH_SINGLE_HUNK_TS = `...`;
export const PATCH_ADD_ONLY_TS = `...`;
export const PATCH_DELETE_ONLY_TS = `...`;
export const PATCH_MULTI_HUNK_TS = `...`;
export const PATCH_LARGE_TS = `...`;

// Stable "good" git_file_diff response shapes.
export const DIFF_NOT_IN_REPO = { patch: '', baselineRef: '', inRepo: false };
export const DIFF_IN_REPO_NO_CHANGES = { patch: '', baselineRef: 'HEAD', inRepo: true };

// File-load error shapes the production code understands.
export const ERR_NOT_FOUND  = { kind: 'notFound' };
export const ERR_BINARY     = { kind: 'binary' };
export const ERR_TOO_LARGE  = { kind: 'tooLarge' };
```

`AppSettings` is imported from production types — never redeclared.

## Story Catalog (exhaustive — 25 stories)

### Path / URL axis (3)
1. **NoPathProvided** — URL has no `?path`; `contentState` immediately becomes `error('No file path supplied')`; `effectiveMode = 'content'` so the empty-state message renders.
2. **PathTSXFile** — URL `?path=src/components/Foo.tsx`; `read_text_file` returns `TSX_SAMPLE`; `git_file_diff` returns `DIFF_NOT_IN_REPO`. Baseline + view-mode chips visible; default baseline `HEAD`.
3. **LongPath** — URL `path` is a 200-char path; verifies the toolbar path span truncates / ellipsizes via CSS without breaking layout.

### Content load axis (4)
4. **ContentLoading** — `read_text_file` returns a never-resolving promise; toolbar visible, body shows `Loading…`. Diff result also pending → mode resolution stays in content mode.
5. **ContentNotFound** — `read_text_file` rejects with `ERR_NOT_FOUND`; body shows "File not found"; toolbar `Copy all` button disabled.
6. **ContentBinary** — `read_text_file` rejects with `ERR_BINARY`; body shows "Binary file — preview disabled".
7. **ContentTooLarge** — `read_text_file` rejects with `ERR_TOO_LARGE`; body shows "File too large to preview".

### Mode-resolution axis (3)
8. **NotInRepoPlainContent** — `git_file_diff` returns `DIFF_NOT_IN_REPO`; baseline chips disabled (title `Not in a git repository`); File chip active; content rendered.
9. **InRepoNoChangesAutoToContent** — `git_file_diff` returns `DIFF_IN_REPO_NO_CHANGES`; effectiveMode resolves to `content` (because `patch.length === 0`); File chip active; baseline chips enabled but inactive.
10. **InRepoWithDiffAutoToDiff** — `git_file_diff` returns `{ patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'HEAD', inRepo: true }`; effectiveMode resolves to `diff`; vs HEAD chip active; Unified/Split layout chips visible.

### Diff view-mode axis (4)
11. **UnifiedDiff** — same as #10 but explicit; default `unified`.
12. **SplitDiff** — `load_settings` returns `ui.fileViewerDefaultViewMode = 'split'`; mounts in split mode.
13. **UnifiedToSplitToggle** — play function clicks the `Split` chip; assertion: after click the split-diff DOM landmark exists (e.g. a side-by-side rail container class) and `save_settings` invocation includes `fileViewerDefaultViewMode: 'split'`.
14. **DiffLoadError** — `git_file_diff` rejects with `Error('git not found')`; effectiveMode auto resolves to content (because `diffState.kind !== 'ok'`); but the user can still click "vs HEAD" — when they do, the body shows the error message.

### Baseline axis (3)
15. **VsHEADActive** — `?baseline=HEAD` (or no baseline param). Default-branch label not yet known; second chip reads `vs default`.
16. **VsMergeBaseDefault** — `?baseline=mergeBaseDefault`; `git_file_diff` returns `{ patch: PATCH_SINGLE_HUNK_TS, baselineRef: 'main', inRepo: true }`; second chip reads `vs main` (from `defaultBranchLabel`).
17. **BaselineSwitchInteraction** — start in HEAD mode; play function clicks `vs default` chip; second invocation of `git_file_diff` recorded with `baseline: 'mergeBaseDefault'`.

### Toolbar action axis (4)
18. **CopyAllSuccess** — content loaded; play clicks `Copy all`; relies on browser's `navigator.clipboard.writeText` resolving (jsdom has no clipboard but Storybook's Chrome iframe does — in headless Storybook test runs we stub `navigator.clipboard` in the harness). Asserts the button label switches to `Copied`.
19. **CopyAllDisabled** — content errored (`ContentNotFound`); play asserts the `Copy all` button has the `disabled` attribute.
20. **OpenInEditorClicked** — play clicks `Open in editor`; asserts `getControl().invocations` includes `{ command: 'open_in_editor', args: { path: '...' } }`.
21. **CloseClicked** — play clicks the `X` icon; asserts `getControl().invocations` includes `{ command: 'window.close' }`.

### Diff content shape axis (3)
22. **DiffAddOnly** — `PATCH_ADD_ONLY_TS`; verifies all-green diff renders without overflow.
23. **DiffDeleteOnly** — `PATCH_DELETE_ONLY_TS`; verifies all-red diff renders.
24. **DiffMultiHunk** — `PATCH_MULTI_HUNK_TS` (3 hunks); verifies hunk headers and section names render.

### Syntax-highlight probe (1)
25. **ContentTSXSyntaxProbe** — explicit TSX content (`TSX_SAMPLE` containing keywords + strings + JSX tags); story has a `play` function that uses `waitFor` (from `storybook/test`) to assert the rendered DOM contains at least one element matching `.hl-keyword`, `.hl-string`, or `.hl-tag` (whichever the highlighter actually emits for this snippet). This is **the** acceptance check for "tree-sitter wasm works in Storybook" — if the wasm doesn't load, the highlighter falls back to plain spans and the assertion fails fast. Test-runner alone is sufficient to catch the regression because the play function makes the silent fallback a hard failure.

**Total: 25 stories.**

## Tooling additions

### `package.json`
No changes. `vite-plugin-static-copy` is already a dependency (used by `vite.config.ts`). Storybook deps installed in Phase 1 are sufficient.

### `tsconfig.json`
Existing `src/**/*.tsx` glob already covers the new fixtures and stories paths. No changes.

### Biome
Phase 1 already extended `biome.json` includes to cover `.storybook/`. Nothing to add.

### Test suites
- **Vitest:** untouched. The fixtures file is plain TypeScript that may incidentally be imported by future tests, but Phase 9 doesn't add any vitest tests.
- **Playwright:** untouched.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| **Tree-sitter runtime wasm fails to load in Storybook** (404 on `/web-tree-sitter.wasm`) | medium | The dedicated probe story (#25) asserts via `play` that highlighted spans exist in the DOM. If the runtime wasm 404s, the assertion fails immediately. The fix (add `viteStaticCopy` to `viteFinal`) is in the spec. |
| **Grammar wasm fails to load** (404 on `/grammars/tree-sitter-tsx.wasm`) | low | `public/grammars/*.wasm` is committed; Vite serves `public/` automatically. Probe story still catches this if it ever breaks. |
| **CSP blocks `WebAssembly.compile()`** in built Storybook | very low | Storybook 9 + react-vite doesn't inject a CSP. Verified by inspecting `.storybook/` and built `iframe.html` — no `<meta http-equiv="Content-Security-Policy">`. |
| **`window.location` URL state leaks between stories** | medium | Harness uses `history.replaceState` to rewrite the URL synchronously *before* the component mounts (called in the function body, not an effect). `useMemo` reads it once on mount. On unmount the harness restores the original URL via `useEffect`'s cleanup. |
| **`navigator.clipboard.writeText` not available in Storybook test-runner** (jsdom-style) | medium | Storybook test-runner uses real Chrome, not jsdom — `navigator.clipboard` exists. For belt-and-braces, the harness installs a temporary `navigator.clipboard.writeText` stub if the property is missing, restored on unmount. Stories that don't click "Copy all" don't notice. |
| **Settings persistence (`save_settings`) fires on every view-mode change** in stories that toggle the chip, polluting `invocations` | low | Only Story #13 (UnifiedToSplitToggle) tests this path; the assertion is positive (we *want* the call). For stories that mount into split mode (#12), the `viewModeHydrated` guard suppresses the save. The assertion in #13 explicitly looks for `command: 'save_settings'`. |
| **`useSyntaxHighlight` hook fires for every story regardless of mode** (it depends only on `path` + `hunks`) | low | Hook short-circuits (`if (allLines.length === 0) return`) when there are no hunks. Stories #1–#9 + #18–#21 either have no hunks or have content mode — no wasm load triggered, so they don't depend on the runtime working. Only stories #10–#17 + #22–#25 actually exercise the highlighter. |
| **Phase 7 (`palette-files`) parallel session edits `.storybook/main.ts` for an unrelated reason** | low | Both peers DM'd. Adding `viteStaticCopy` is additive inside `viteFinal`. Per the audit, neither peer needs a new alias, so the only main.ts edit on the master alongside us is theoretical. Resolvable in seconds at merge if it surfaces. |
| **Headless Chrome in Storybook's test-runner doesn't permit Wasm by default** | low | Test-runner uses real Chrome which permits Wasm. If a corporate-policy `--disable-webassembly` flag ever lands, the probe story's `play` assertion fails fast with a useful error — better than silent fallback. |
| **The probe assertion (`querySelector('.hl-keyword')`) is fragile** to highlighter category changes | low | We assert against three classes (`hl-keyword`, `hl-string`, `hl-tag`) — at least one always exists for any non-trivial TSX snippet. If a future highlighter rewrite changes class names, the probe fails loudly and the test must be updated alongside it. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 25 stories render.
2. Light/dark toolbar toggle re-renders every story without reload.
3. `npm run build-storybook` completes.
4. `npm run test` passes.
5. Production code is byte-identical: `git diff origin/master...storybook-phase9-file-viewer -- <production paths> ':(exclude)<fixtures>' ':(exclude)<stories>'` shows zero lines.
6. `.storybook/main.ts` gains exactly one new `import` (for `viteStaticCopy`) and one new plugin push inside `viteFinal`. No new alias entries.
7. The probe story's `play` function asserts that highlighted spans (`.hl-keyword` / `.hl-string` / `.hl-tag`) exist in the DOM after the highlighter runs.
8. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR: FileViewerApp moves from "Pending" to "Done" with the spec/plan/PR links. (No new mock-extensions list entries.)

## What comes next (out of scope here)

- **File Palette (Phase 7)**: stories `FilePaletteCodeView` directly in palette context.
- **Pr Detail (Phase 11)**: stories `UnifiedDiffView` / `SplitDiffView` in pr-detail context (multi-file).
- **Component-level stories** for `FileViewerToolbar` and the diff views — easier now that the window-level stories surface their states.
- **Visual regression tooling decision** — once enough screens are storied to evaluate options.
- **Per-extension highlighter probe matrix** — if we ever add `.py` / `.go` / `.md` grammar support, add stories that exercise each.
