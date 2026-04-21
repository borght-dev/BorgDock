# File Palette — Design

**Date:** 2026-04-21
**Status:** Proposed
**Branch:** `master` (at commit `ec29714`)

## Goal

A fast, keyboard-driven way to find, preview, and copy from source files across the set of directories a user works in regularly — without leaving PRDock and without opening a full IDE. Triggered by **Ctrl+F8**.

The user's stated priority is speed of finding the right piece of code. The three things they reach for most: find a file by name, find text across files, and jump to the implementation of a method (not the interface, not a call site — the definition with a body).

## Non-goals

- Editing files. The viewer is read-only.
- A full language-server experience. No renames, no find-all-references, no hover-docs.
- Indexing arbitrary repos with full-fidelity semantics. Tree-sitter + `.gitignore`-aware walking is the extent of the static analysis.
- File watching / live invalidation in v1. Manual refresh only.
- Markdown / SQL / JSON / YAML symbol search. No grammars for "definitions" there, and it isn't what the user needs.

## User flow

1. User presses **Ctrl+F8**. The file palette window appears (centered on primary monitor, 1100 × 600 logical px, resizable). If it's already open, the hotkey closes it — same as the worktree and command palettes.
2. Left column shows the **roots**: every enabled repo's worktrees (discovered via the existing `list_worktrees_bare` command against `RepoSettings.worktreeBasePath`) *plus* any paths manually added under the new `filePaletteRoots` settings field. Worktrees come first; user-added roots below, separated by a faint rule. Root rows are deduplicated by normalized absolute path.
3. The most recently selected root (persisted as `filePaletteActiveRootPath`) is auto-selected. Arrow keys (while focus is on the roots column) or Tab (from anywhere) cycle roots.
4. Middle column is the **search input** and **results list**. The search input is focused on open. Default: filename fuzzy search. Prefix `>` switches to content search. Prefix `@` switches to symbol-implementation search. Both use a discreet pill next to the input to show the active mode.
5. Right column is the **preview pane** — a `CodeView` component that renders the currently-highlighted result's file with syntax highlighting and line numbers. The preview tracks arrow-key movement through the results (a short debounce avoids hammering the filesystem during rapid navigation).
6. **Enter** pops the currently-previewed file into a standalone **viewer window**. The viewer window is a first-class OS window: it appears in Alt+Tab and the Windows taskbar, and it stays open until the user closes it — it does not auto-dismiss on blur or when another file is opened. One window per path (labeled `file-viewer-<hash>`); re-opening an already-open path focuses the existing window instead of creating a duplicate.
7. **Esc** clears the search query if there is one; on an empty query it closes the palette (worktree-palette parity).

## Settings additions

New types added to `src/types/settings.ts`. All fields optional; existing settings untouched.

```ts
export interface FilePaletteRoot {
  path: string;        // absolute folder path
  label?: string;      // optional display label; falls back to basename
}

// Added to AppSettings
filePaletteRoots?: FilePaletteRoot[];

// Added to UiSettings
filePaletteWidth?: number;
filePaletteHeight?: number;
filePaletteActiveRootPath?: string;
```

The union of worktree paths (derived at runtime from `settings.repos`) and `filePaletteRoots` populates the left column. `save_settings` / `load_settings` commands need no changes — they serialize the whole `AppSettings` blob already.

Viewer window size is not persisted in v1 — every viewer opens at the default 900 × 720 and the user can resize for that session only. Adding per-path or per-viewer size memory is a v2 follow-up.

## Windows, capabilities, hotkey

**Vite entries.** Add to the rollup `input` map in `vite.config.ts`:

```ts
filepalette: 'file-palette.html',
fileviewer:  'file-viewer.html',
```

**HTML shells.** Two new files next to `palette.html`, each mirroring the existing theme-detect script block, CSS reset, and a single `<div id="root">`. One loads `/src/file-palette-main.tsx`; the other loads `/src/file-viewer-main.tsx`.

**Capabilities.**

- `src-tauri/capabilities/file-palette.json`: identifier `file-palette-capability`, `"windows": ["file-palette"]`. Permissions: `core:window:allow-start-dragging`, `allow-close`, `allow-set-position`, `allow-set-focus`, `allow-set-size`, `allow-inner-size`, `core:app:allow-current-monitor`.
- `src-tauri/capabilities/file-viewer.json`: identifier `file-viewer-capability`, `"windows": ["file-viewer-*"]` (Tauri 2 supports glob patterns on labels). Permissions: same set as the palette. "Copy all" uses `navigator.clipboard.writeText` which is a browser API and needs no Tauri capability; no clipboard plugin dependency.

**Hotkey.** `src-tauri/src/platform/hotkey.rs` registers `Ctrl+F8` alongside the existing `Ctrl+F7` and `Ctrl+F9` handlers. The shortcut callback calls `app.run_on_main_thread(...)` (matching the Ctrl+F7 / Ctrl+F9 handlers) and inside that closure invokes `WebviewWindowBuilder` with `skip_taskbar(true)`, `always_on_top(true)`, `decorations(false)`, `center()` on first open, `resizable(true)`. Close-on-reopen is handled the same way the worktree palette does it — if `get_webview_window("file-palette")` returns `Some`, call `close()` and return.

**Rust command `open_file_viewer_window(path: String)`** in `src-tauri/src/file_palette/windows.rs`:

- Follows the `run_on_main_thread` + `tokio::sync::oneshot` pattern documented in the project's CLAUDE.md (to avoid the known cross-thread deadlock when building `WebviewWindow` from a Tauri command).
- Window label is `file-viewer-<blake3-16>` of the normalized absolute path. Existing label → `set_focus()` and return; otherwise build with `skip_taskbar(false)`, `always_on_top(false)`, `decorations(false)` (custom titlebar), `resizable(true)`, size 900 × 720. URL is `file-viewer.html?path=<urlencoded>`; the React app reads the query string on mount.
- Viewer does not auto-close on blur. It closes only when the user clicks its close button, presses Ctrl+W (wired in the React app), or the Tauri process exits.

## Frontend structure

```
src/file-palette-main.tsx
src/components/file-palette/
  FilePaletteApp.tsx
  RootsColumn.tsx
  SearchPane.tsx
  ResultsList.tsx
  PreviewPane.tsx
  CodeView.tsx                ← reusable, used by preview AND viewer
  parse-query.ts              ← "foo" | ">foo" | "@foo"
  use-file-index.ts           ← filename index hook (per root)
  use-content-search.ts       ← debounced ripgrep hook
  use-symbol-index.ts         ← Tree-sitter symbol builder + lookup
  use-background-indexer.ts   ← requestIdleCallback-chunked indexer
  queries/
    typescript.scm            ← definitions-with-body, excludes interfaces
    javascript.scm            ← same for JS/JSX
    rust.scm                  ← fn and impl blocks; excludes trait sigs
    c_sharp.scm               ← class/struct methods; excludes interface sigs

src/file-viewer-main.tsx
src/components/file-viewer/
  FileViewerApp.tsx
  FileViewerToolbar.tsx       ← path, Copy-all, Open-in-editor, close
  (imports CodeView from ../file-palette/CodeView)

src/styles/file-palette.css
src/styles/file-viewer.css
```

`CodeView` is the only substantial shared piece. Its props:

```ts
interface CodeViewProps {
  path: string;                   // drives syntax-highlighter language selection
  content: string;
  scrollToLine?: number;          // 1-based
  highlightedLines?: number[];    // subtle row background for content-search hits
  onIdentifierJump?: (word: string) => void;  // triggered on F12 / Ctrl+click
}
```

Internally: one `<pre>` with a two-column grid. Gutter is `user-select: none`; code column is `user-select: text`. Syntax tokens are rendered by the existing `highlightLines` service (same one the diff viewer uses). `scrollToLine` uses an `IntersectionObserver`-free approach — just a direct `scrollTop` calculation based on `line-height * (line - 1) - clientHeight / 3`, same idiom as the existing diff viewer's jump logic.

**Keyboard model.**

| Key | Palette (search focused) | Viewer |
|---|---|---|
| ↑ / ↓ | Navigate results | (native scroll) |
| ← / → on roots column | Cycle roots | — |
| Tab | Cycle roots | — |
| Enter | Open file in viewer window | — |
| Esc | Clear query, then close palette | — |
| F12 / Ctrl+click on a word in preview | Run `@<word>` | Run `@<word>`, focus palette with results |
| Ctrl+C | Native selection copy | Native selection copy |
| Ctrl+Shift+C | Copy entire file | Copy entire file |
| Ctrl+W | — | Close viewer |
| F3 / Shift+F3 | Next / prev match within current file (for `>` mode) | Next / prev match |

## Backend architecture

**New Rust module:** `src-tauri/src/file_palette/` with submodules `files.rs`, `content_search.rs`, `read_file.rs`, `windows.rs`, `mod.rs`. `mod.rs` registers all commands in `tauri::generate_handler!`.

**Cargo additions:**

```toml
ignore = "0.4"
grep-searcher = "0.1"
grep-regex = "0.1"
grep-matcher = "0.1"
blake3 = "1"              # already a common transitive dep; used for viewer-window label hashing
```

`tree-sitter` is **not** added to the Rust side — symbol indexing runs in the webview using the `web-tree-sitter` runtime the project already ships.

### `files.rs` — filename indexing

```rust
#[derive(Serialize)]
pub struct FileEntry {
    pub rel_path: String,   // forward-slash, relative to root
    pub size: u64,
}

#[derive(Serialize)]
pub struct ListFilesResult {
    pub entries: Vec<FileEntry>,
    pub truncated: bool,    // true if we hit the limit
}

#[tauri::command]
pub async fn list_root_files(root: String, limit: Option<usize>) -> Result<ListFilesResult, String>
```

Implementation:

- `tokio::task::spawn_blocking(...)` to run the walk off the runtime.
- `ignore::WalkBuilder::new(&root).hidden(false).build()` — respects `.gitignore`, `.ignore`, and `.git/info/exclude`.
- Filter in-walk: allowlist of extensions (everything `EXT_TO_GRAMMAR` in `syntax-highlighter.ts` knows about + `.md`, `.txt`, `.ini`, `.env`, `.sh`, `.bat`, `.ps1`, `.dockerfile`, `.gitignore`, `.editorconfig`). Files with extensions outside the allowlist are still included in the filename list — the filter is mostly to avoid `.dll`, `.exe`, `.png`, etc. The preview fetch uses `read_text_file`'s own binary detection to return a `Binary` error for anything that slipped through, which the UI renders as "binary file — preview disabled."
- Default `limit`: 50_000. On overflow, return `truncated: true` and a truncated list; UI shows a banner.

### `content_search.rs` — ripgrep-as-library

```rust
#[derive(Serialize)]
pub struct ContentMatch {
    pub line: u32,             // 1-based
    pub preview: String,       // trimmed, max ~200 chars
}

#[derive(Serialize)]
pub struct ContentFileResult {
    pub rel_path: String,
    pub match_count: u32,
    pub matches: Vec<ContentMatch>,  // capped at 5
}

#[tauri::command]
pub async fn search_content(
    root: String,
    pattern: String,
    cancel_token: u32,
) -> Result<Vec<ContentFileResult>, String>
```

Implementation:

- Build a `grep_regex::RegexMatcher` with "smart case" (insensitive if pattern is all-lowercase).
- `ignore::WalkBuilder::new(&root).build_parallel()` feeds workers. Each worker uses `grep_searcher::Searcher` with a sink that groups matches by file.
- Cap at **200 files with matches** and **5 preview matches per file** — the first 5 lines retain their preview text; remaining matches only bump `match_count`.
- Periodically compare `cancel_token` against the module-level `AtomicU32` current-token; abort if stale. Each new call to `search_content` bumps the global counter before dispatch, so a stale search short-circuits as soon as it next checks.
- Binary files skipped via `grep_searcher::BinaryDetection::quit(b'\x00')`.

Frontend side (`use-content-search.ts`): debounce 180 ms; on new query, increment a local token and pass it along; ignore results whose token doesn't match the latest.

### `read_file.rs` — read file for preview

```rust
#[tauri::command]
pub async fn read_text_file(path: String, max_bytes: Option<u64>)
    -> Result<String, ReadFileError>

#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum ReadFileError {
    NotFound { path: String },
    TooLarge { size: u64, limit: u64 },
    Binary,
    Io { message: String },
}
```

Default `max_bytes` = 1_048_576 (1 MB). Binary detection: read first 8 KB, count non-printable non-UTF-8 bytes; refuse if > 10 %.

### Symbol indexing (webview-side)

In `use-background-indexer.ts`:

- On root select, fetch `list_root_files(root)`.
- Group by extension. Supported languages: `.ts`, `.tsx`, `.js`, `.jsx`, `.cs`, `.rs`.
- Using `web-tree-sitter`, load the grammar for each language (cached; already used by the diff highlighter). Note that `tree-sitter-wasms` ships `typescript` and `tsx` as separate grammars — `typescript.scm` targets both (the function/method node kinds are identical between the two trees); `javascript.scm` covers `.js` and `.jsx`. For each file, read its content via `read_text_file`, parse with the matching grammar, and run the language's query.
- The queries capture **definitions with a body**. For example, in TypeScript the query matches `function_declaration`, `method_definition` with a non-empty `statement_block`, and `variable_declarator` whose value is an `arrow_function` with a block body — while explicitly skipping `interface_declaration` and ambient declarations.
- Populate a `Map<string, SymbolEntry[]>` (symbol name → locations), keyed per root. LRU-evict old roots when a fourth appears.
- Indexer runs in `requestIdleCallback` chunks of 50 files. Progress events update a tiny "Indexing… 230 / 5 200" indicator in the `@` search mode placeholder.

`@foo` queries the in-memory index case-insensitively and returns `[{ symbol: 'foo', rel_path, line }, ...]` that the results list renders exactly like filename results (path + line number on the right).

## Error handling & empty states

| Situation | UX |
|---|---|
| No roots configured | "Add roots under Settings → File palette roots" with a button that opens Settings to the right tab |
| Root path doesn't exist on disk | Root row shows a red "missing" badge; selecting shows an error banner in the results pane |
| `list_root_files` failed | Error banner with Rust error string and a Retry button |
| Filename search before index arrives | Results list empty; input placeholder says "Loading index…" |
| `>content` no matches | "No matches for 'xyz' in this root" |
| `@symbol` while indexing | "Indexing symbols… N / M" + partial results that grow as indexing finishes |
| `@symbol` no match after full scan | "No implementations found for 'foo' in this root. v1 supports TS, JS, C#, Rust." |
| Preview file read failed | "Couldn't read file" with the error; results list stays usable |
| Binary or too-large file | "Binary file — preview disabled" or "File too large (1.3 MB > 1 MB) — open in editor", each with an Open-in-editor button invoking the existing `open_in_editor` command |

## Testing

**Rust** (in `src-tauri/tests/file_palette/`):

- `fixtures/` directory with: a mini repo containing a nested `.gitignore`, an actual binary file, a 1.5 MB text file, files in multiple supported extensions, and a dotfile directory.
- `files_tests.rs`: walk respects `.gitignore`; extension allowlist; truncation past limit.
- `content_search_tests.rs`: smart case; regex syntax; binary skip; match-count grouping; per-file preview cap at 5; cancellation via `AtomicU32`.
- `read_file_tests.rs`: happy path, NotFound, TooLarge, Binary error variants.

**React** (Vitest):

- `parse-query.test.ts`: mode parsing (empty, plain word, `>`, `@`, prefix-only-no-query).
- `FilePaletteApp.test.tsx`: roots render, arrow keys move selection, Enter invokes mock `open_file_viewer_window`, mode switching updates results source.
- `CodeView.test.tsx`: line numbers render, syntax-highlighter is called with correct filename, `scrollToLine` scrolls, Ctrl+Shift+C triggers clipboard write.
- Tree-sitter–driven code is covered by a small integration test with a fixture file per language — assert that the TS query finds the function with a body and skips the `interface` method sig; same shape for the other three languages.

**Manual smoke test** after implementation:

- Open palette on example-repo's real worktree list. Verify all three search modes. Pop out a file, verify it appears in Alt+Tab, leave it open, open another file, verify both stay open. Press F12 on a method call and verify it jumps to the implementation, not the interface declaration. Close palette, reopen — last-used root is preselected.

## Defaults applied without further questions

| Default | Value |
|---|---|
| Palette initial size | 1100 × 600 logical px, resizable |
| Viewer initial size | 900 × 720 logical px, resizable |
| `skipTaskbar` | palette: `true`; viewer: `false` |
| Filename index cache | per-root in-memory (React state), rebuilt on Refresh button |
| Symbol index cache | LRU of 3 roots |
| Content-search debounce | 180 ms |
| Content-search caps | 200 files, 5 preview matches per file |
| Ignore rules | `.gitignore` + `.ignore` + defaults from `ignore` crate + extension allowlist |
| Hidden files | shown |
| Max preview file size | 1 MB |
| Copy-all shortcut | Ctrl+Shift+C |
| Theme | inherits from `localStorage['prdock-theme']`, same script block as other palettes |
| File watcher | not in v1 (manual Refresh only) |
| Out of v1 scope | symbol search for SQL/YAML/JSON/Markdown; multi-root unified search; fuzzy-match highlight in filename results |

## Risks

- **Tree-sitter startup cost for the symbol indexer on first root-pick in a session.** The grammar WASM has to be loaded and a few thousand files parsed. Mitigated by chunked `requestIdleCallback` work and partial `@` results, but a cold first query on a large monorepo will feel slow. Acceptable for v1; a file-watcher + persistent symbol cache on disk is a v2 follow-up.
- **Symbol-query accuracy across language dialects.** Rust proc macros, C# partial classes and top-level statements, TypeScript decorators — edge cases exist. The queries are small files we can iterate on; I'll start with the common shapes and expand based on what trips over real code.
- **Windows path normalization** across UI display (forward slashes), Tauri command arguments, and the `ignore` crate (native separators). Settle on "always normalize to forward slashes in `rel_path` fields; only join with the root using `PathBuf` internally." This matches the worktree-palette's existing approach.
