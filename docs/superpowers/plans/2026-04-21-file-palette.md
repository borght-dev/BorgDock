# File Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Ctrl+F8 palette that searches across configured worktrees and custom roots with three modes (filename, `>content`, `@symbol-implementation`), shows a live syntax-highlighted preview, and pops files out into persistent viewer windows reachable via Alt+Tab.

**Architecture:** New Tauri window (`file-palette`) mirroring the worktree/command palette pattern. Rust backend adds a `file_palette` module with three commands (`list_root_files`, `search_content`, `read_text_file`) powered by the `ignore` and `grep-*` crates from ripgrep. Frontend adds a React app with an always-split 3-column layout (roots ∥ search+results ∥ preview) and reuses the existing `web-tree-sitter` runtime for symbol indexing. Viewer window (`file-viewer-<hash>`) is a first-class OS window — one instance per file path, `skipTaskbar: false`, does not auto-close.

**Tech Stack:** Rust (Tauri 2, `ignore` 0.4, `grep-searcher/regex/matcher` 0.1, `blake3` 1), TypeScript/React 19, Vite, `web-tree-sitter`, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-21-file-palette-design.md`

---

## File Structure

### Rust (new)

- `src-tauri/src/file_palette/mod.rs` — module root, re-exports commands
- `src-tauri/src/file_palette/files.rs` — `list_root_files` command + walker
- `src-tauri/src/file_palette/content_search.rs` — `search_content` command + ripgrep-as-library
- `src-tauri/src/file_palette/read_file.rs` — `read_text_file` command + binary detection
- `src-tauri/src/file_palette/windows.rs` — `open_file_viewer_window` command

### Rust tests (new)

- `src-tauri/src/file_palette/files.rs` — inline `#[cfg(test)] mod tests`
- `src-tauri/src/file_palette/content_search.rs` — inline tests
- `src-tauri/src/file_palette/read_file.rs` — inline tests
- Fixture helpers written into each test module using `tempfile`

### Rust (modify)

- `src-tauri/Cargo.toml` — add `ignore`, `grep-searcher`, `grep-regex`, `grep-matcher`, `blake3`, `tempfile` (dev), `urlencoding` (already present)
- `src-tauri/src/lib.rs` — register `pub mod file_palette;`, register new commands in `generate_handler!`
- `src-tauri/src/platform/hotkey.rs` — register Ctrl+F8 shortcut

### Tauri config (new)

- `src-tauri/capabilities/file-palette.json`
- `src-tauri/capabilities/file-viewer.json`
- `file-palette.html` (at package root)
- `file-viewer.html` (at package root)

### Tauri config (modify)

- `vite.config.ts` — add `filepalette` and `fileviewer` entries to rollup input

### Frontend (new)

- `src/file-palette-main.tsx` — React entry
- `src/file-viewer-main.tsx` — React entry
- `src/styles/file-palette.css`
- `src/styles/file-viewer.css`
- `src/components/file-palette/FilePaletteApp.tsx`
- `src/components/file-palette/RootsColumn.tsx`
- `src/components/file-palette/SearchPane.tsx`
- `src/components/file-palette/ResultsList.tsx`
- `src/components/file-palette/PreviewPane.tsx`
- `src/components/file-palette/CodeView.tsx` — reusable line-numbered code viewer
- `src/components/file-palette/parse-query.ts` — parses `"foo"` | `">foo"` | `"@foo"`
- `src/components/file-palette/use-file-index.ts`
- `src/components/file-palette/use-content-search.ts`
- `src/components/file-palette/use-symbol-index.ts`
- `src/components/file-palette/use-background-indexer.ts`
- `src/components/file-palette/queries/typescript.scm`
- `src/components/file-palette/queries/javascript.scm`
- `src/components/file-palette/queries/rust.scm`
- `src/components/file-palette/queries/c_sharp.scm`
- `src/components/file-viewer/FileViewerApp.tsx`
- `src/components/file-viewer/FileViewerToolbar.tsx`

### Frontend tests (new)

- `src/components/file-palette/__tests__/parse-query.test.ts`
- `src/components/file-palette/__tests__/CodeView.test.tsx`
- `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`
- `src/components/file-palette/__tests__/use-file-index.test.ts`
- `src/components/file-palette/__tests__/use-content-search.test.ts`
- `src/components/file-palette/__tests__/use-symbol-index.test.ts`
- `src/components/file-viewer/__tests__/FileViewerApp.test.tsx`

### Frontend (modify)

- `src/types/settings.ts` — add `FilePaletteRoot`, extend `UiSettings` and `AppSettings`
- `vite.config.ts` — already listed above

### Working-directory convention

All paths below are relative to `src/BorgDock.Tauri/`. When a cargo command is needed, use Git Bash with the MSYS bypass from `CLAUDE.md`:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Substitute `cargo test --lib file_palette` where relevant. npm/vitest commands run from `src/BorgDock.Tauri/`.

---

## Task 1: Extend settings types

**Files:**
- Modify: `src/types/settings.ts:24-46` (add types) and `:111-124` (extend `AppSettings`)

- [ ] **Step 1: Add `FilePaletteRoot` type and extend `UiSettings` / `AppSettings`**

Open `src/types/settings.ts`. After the `RepoSettings` interface (ends at line 32) add:

```ts
export interface FilePaletteRoot {
  path: string;
  label?: string;
}
```

In `UiSettings` (starts at line 34), add the four new optional fields at the end, after `worktreePaletteFavoritesOnly?`:

```ts
  filePaletteWidth?: number;
  filePaletteHeight?: number;
  filePaletteActiveRootPath?: string;
```

In `AppSettings` (starts at line 111), after `repoPriority: Record<string, RepoPriority>;` add one field:

```ts
  filePaletteRoots?: FilePaletteRoot[];
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit -p .`
Expected: exit code 0. No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/types/settings.ts
git commit -m "feat(file-palette): add FilePaletteRoot + UiSettings fields"
```

---

## Task 2: Add Rust dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml` — `[dependencies]` section (ends around line 49) and add `[dev-dependencies]` section

- [ ] **Step 1: Add file-palette crates to `[dependencies]`**

Append these lines inside `[dependencies]` (after `base64 = "0.22"`):

```toml
ignore = "0.4"
grep-searcher = "0.1"
grep-regex = "0.1"
grep-matcher = "0.1"
blake3 = "1"
```

- [ ] **Step 2: Add `[dev-dependencies]` section**

If `[dev-dependencies]` does not exist in `src-tauri/Cargo.toml`, append a new block before `[target.'cfg(windows)'.dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
```

If the section does exist, add `tempfile = "3"` to it.

- [ ] **Step 3: Verify `cargo check` succeeds**

Run from `src/BorgDock.Tauri/`:

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: exits 0. The new crates are downloaded and compiled.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/Cargo.toml src/BorgDock.Tauri/src-tauri/Cargo.lock
git commit -m "chore(file-palette): add ignore + grep-* + blake3 crates"
```

---

## Task 3: Scaffold `file_palette` Rust module

**Files:**
- Create: `src-tauri/src/file_palette/mod.rs`
- Create: `src-tauri/src/file_palette/files.rs`
- Create: `src-tauri/src/file_palette/content_search.rs`
- Create: `src-tauri/src/file_palette/read_file.rs`
- Create: `src-tauri/src/file_palette/windows.rs`
- Modify: `src-tauri/src/lib.rs:11` — add `pub mod file_palette;`

- [ ] **Step 1: Create empty submodules**

Create `src-tauri/src/file_palette/mod.rs`:

```rust
pub mod content_search;
pub mod files;
pub mod read_file;
pub mod windows;
```

Create `src-tauri/src/file_palette/files.rs`:

```rust
// Filename walker; exposes `list_root_files` Tauri command.
```

Create `src-tauri/src/file_palette/content_search.rs`:

```rust
// Ripgrep-as-library content search; exposes `search_content` Tauri command.
```

Create `src-tauri/src/file_palette/read_file.rs`:

```rust
// Preview file reader; exposes `read_text_file` Tauri command.
```

Create `src-tauri/src/file_palette/windows.rs`:

```rust
// Tauri commands that create palette/viewer windows on the main thread.
```

- [ ] **Step 2: Register module in `lib.rs`**

Edit `src-tauri/src/lib.rs`. The `pub mod` block at the top (lines 1-11) currently ends with `pub mod updater;`. Add:

```rust
pub mod file_palette;
```

on a new line after `pub mod updater;`.

- [ ] **Step 3: Verify compilation**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/ src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(file-palette): scaffold Rust file_palette module"
```

---

## Task 4: `read_text_file` command + tests

**Files:**
- Modify: `src-tauri/src/file_palette/read_file.rs`
- Modify: `src-tauri/src/lib.rs:147` — add command to `generate_handler!`

- [ ] **Step 1: Write failing tests**

Replace the contents of `src-tauri/src/file_palette/read_file.rs` with:

```rust
use serde::Serialize;
use std::path::PathBuf;

const DEFAULT_MAX_BYTES: u64 = 1_048_576; // 1 MB

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReadFileError {
    NotFound { path: String },
    TooLarge { size: u64, limit: u64 },
    Binary,
    Io { message: String },
}

#[tauri::command]
pub async fn read_text_file(
    path: String,
    max_bytes: Option<u64>,
) -> Result<String, ReadFileError> {
    let limit = max_bytes.unwrap_or(DEFAULT_MAX_BYTES);
    tokio::task::spawn_blocking(move || read_text_file_sync(PathBuf::from(path), limit))
        .await
        .map_err(|e| ReadFileError::Io { message: format!("join error: {e}") })?
}

fn read_text_file_sync(path: PathBuf, limit: u64) -> Result<String, ReadFileError> {
    let meta = std::fs::metadata(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => ReadFileError::NotFound {
            path: path.display().to_string(),
        },
        _ => ReadFileError::Io { message: e.to_string() },
    })?;
    let size = meta.len();
    if size > limit {
        return Err(ReadFileError::TooLarge { size, limit });
    }
    let bytes = std::fs::read(&path).map_err(|e| ReadFileError::Io { message: e.to_string() })?;
    if looks_binary(&bytes) {
        return Err(ReadFileError::Binary);
    }
    String::from_utf8(bytes).map_err(|e| ReadFileError::Io {
        message: format!("not valid UTF-8: {e}"),
    })
}

/// True if the first 8 KB contain > 10% non-printable bytes.
fn looks_binary(bytes: &[u8]) -> bool {
    let sample_len = bytes.len().min(8192);
    if sample_len == 0 {
        return false;
    }
    let sample = &bytes[..sample_len];
    let bad = sample
        .iter()
        .filter(|&&b| b == 0 || (b < 9) || (b > 13 && b < 32 && b != 27))
        .count();
    (bad * 10) > sample_len
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn reads_small_utf8_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("hello.txt");
        std::fs::write(&path, "hello world").unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert_eq!(content, "hello world");
    }

    #[test]
    fn refuses_oversized_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("big.txt");
        std::fs::write(&path, vec![b'a'; 2048]).unwrap();
        let err = read_text_file_sync(path, 1024).unwrap_err();
        match err {
            ReadFileError::TooLarge { size, limit } => {
                assert_eq!(size, 2048);
                assert_eq!(limit, 1024);
            }
            other => panic!("expected TooLarge, got {other:?}"),
        }
    }

    #[test]
    fn reports_not_found() {
        let err = read_text_file_sync(PathBuf::from("/nope/does-not-exist"), DEFAULT_MAX_BYTES)
            .unwrap_err();
        assert!(matches!(err, ReadFileError::NotFound { .. }));
    }

    #[test]
    fn detects_binary_by_null_bytes() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("binary.bin");
        let mut payload = vec![b'a'; 8000];
        // Inject many null bytes so > 10% of the sample is non-printable.
        for i in 0..1500 {
            payload[i] = 0;
        }
        std::fs::write(&path, payload).unwrap();
        let err = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap_err();
        assert!(matches!(err, ReadFileError::Binary));
    }

    #[test]
    fn accepts_text_with_tabs_and_newlines() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("tabs.txt");
        std::fs::write(&path, "a\tb\n\tc\r\nd").unwrap();
        let content = read_text_file_sync(path, DEFAULT_MAX_BYTES).unwrap();
        assert!(content.contains("\tb"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

The tests should currently fail with missing-symbol errors (since `Debug` isn't derived on `ReadFileError`). Run:

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::read_file
```

Expected: **compile error** — `ReadFileError` needs `#[derive(Debug)]` for the `unwrap_err().unwrap()` flow. The `#[derive(Debug, Serialize)]` line above should already include it, so this may compile and pass on the first try — that's acceptable.

- [ ] **Step 3: Register command in `lib.rs`**

Edit `src-tauri/src/lib.rs`. Inside `generate_handler![` (starts at line 147), add at the end (before the closing `]`) — keep alphabetical-ish ordering with the existing sections by putting it in a new `// File palette` block:

```rust
            // File palette
            file_palette::read_file::read_text_file,
```

- [ ] **Step 4: Confirm build + tests pass**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::read_file
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/read_file.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(file-palette): read_text_file command with binary + size checks"
```

---

## Task 5: `list_root_files` command + tests

**Files:**
- Modify: `src-tauri/src/file_palette/files.rs`
- Modify: `src-tauri/src/lib.rs:147` — register command

- [ ] **Step 1: Define the allowlist + types + walker, with tests**

Replace the contents of `src-tauri/src/file_palette/files.rs` with:

```rust
use ignore::WalkBuilder;
use serde::Serialize;
use std::path::{Path, PathBuf};

const DEFAULT_LIMIT: usize = 50_000;

/// Extensions we are willing to list. Anything not in this set is dropped
/// from the filename list (keeps binaries like .exe/.png out by default).
/// Match is case-insensitive.
const ALLOWED_EXTENSIONS: &[&str] = &[
    // source code
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "cs", "fs", "go", "py", "rb",
    "java", "kt", "swift", "c", "cc", "cpp", "h", "hpp", "m", "mm",
    // config
    "json", "yaml", "yml", "toml", "ini", "env", "editorconfig", "gitignore",
    "dockerfile",
    // sql / data
    "sql", "csv", "tsv",
    // web
    "html", "css", "scss", "less",
    // shell
    "sh", "bash", "zsh", "ps1", "bat", "cmd",
    // docs
    "md", "mdx", "txt", "rst",
];

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub rel_path: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct ListFilesResult {
    pub entries: Vec<FileEntry>,
    pub truncated: bool,
}

#[tauri::command]
pub async fn list_root_files(
    root: String,
    limit: Option<usize>,
) -> Result<ListFilesResult, String> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    tokio::task::spawn_blocking(move || walk_root(&PathBuf::from(root), limit))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn walk_root(root: &Path, limit: usize) -> Result<ListFilesResult, String> {
    if !root.exists() {
        return Err(format!("root does not exist: {}", root.display()));
    }
    let mut entries: Vec<FileEntry> = Vec::new();
    let mut truncated = false;
    let walker = WalkBuilder::new(root).hidden(false).build();
    for dent in walker {
        let dent = match dent {
            Ok(d) => d,
            Err(_) => continue,
        };
        if dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if !is_allowed_extension(dent.path()) {
                continue;
            }
            let rel = match dent.path().strip_prefix(root) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            let size = dent.metadata().map(|m| m.len()).unwrap_or(0);
            entries.push(FileEntry { rel_path: rel_str, size });
            if entries.len() >= limit {
                truncated = true;
                break;
            }
        }
    }
    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(ListFilesResult { entries, truncated })
}

fn is_allowed_extension(path: &Path) -> bool {
    // Files whose *name* matches an extension-style entry (e.g. `.gitignore`,
    // `Dockerfile`) are also allowed.
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        let lower = name.to_ascii_lowercase();
        if ALLOWED_EXTENSIONS.iter().any(|e| lower == *e || lower == format!(".{e}")) {
            return true;
        }
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => {
            let lower = ext.to_ascii_lowercase();
            ALLOWED_EXTENSIONS.iter().any(|e| lower == *e)
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write(dir: &Path, rel: &str, body: &str) {
        let p = dir.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(p, body).unwrap();
    }

    #[test]
    fn lists_source_files_and_skips_unknown_extensions() {
        let dir = tempdir().unwrap();
        write(dir.path(), "src/app.ts", "export const a = 1;");
        write(dir.path(), "src/app.test.ts", "// test");
        write(dir.path(), "image.png", "binary-ish");
        write(dir.path(), "doc.md", "# hello");
        write(dir.path(), "noext", "");

        let result = walk_root(dir.path(), DEFAULT_LIMIT).unwrap();
        let paths: Vec<&str> = result.entries.iter().map(|e| e.rel_path.as_str()).collect();

        assert!(paths.contains(&"src/app.ts"));
        assert!(paths.contains(&"src/app.test.ts"));
        assert!(paths.contains(&"doc.md"));
        assert!(!paths.contains(&"image.png"));
        assert!(!paths.contains(&"noext"));
        assert!(!result.truncated);
    }

    #[test]
    fn respects_gitignore() {
        let dir = tempdir().unwrap();
        // Create a git repo-like layout so ignore crate honors .gitignore.
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join(".gitignore"), "build/\n").unwrap();
        write(dir.path(), "src/app.ts", "");
        write(dir.path(), "build/out.ts", "");

        let result = walk_root(dir.path(), DEFAULT_LIMIT).unwrap();
        let paths: Vec<&str> = result.entries.iter().map(|e| e.rel_path.as_str()).collect();
        assert!(paths.contains(&"src/app.ts"));
        assert!(!paths.contains(&"build/out.ts"));
    }

    #[test]
    fn includes_dotfile_configs_like_gitignore_file() {
        let dir = tempdir().unwrap();
        write(dir.path(), ".gitignore", "x");
        write(dir.path(), ".editorconfig", "");

        let result = walk_root(dir.path(), DEFAULT_LIMIT).unwrap();
        let paths: Vec<&str> = result.entries.iter().map(|e| e.rel_path.as_str()).collect();
        assert!(paths.contains(&".gitignore"));
        assert!(paths.contains(&".editorconfig"));
    }

    #[test]
    fn truncates_past_limit() {
        let dir = tempdir().unwrap();
        for i in 0..20 {
            write(dir.path(), &format!("f{i}.ts"), "");
        }
        let result = walk_root(dir.path(), 5).unwrap();
        assert_eq!(result.entries.len(), 5);
        assert!(result.truncated);
    }

    #[test]
    fn missing_root_returns_error() {
        let err = walk_root(Path::new("/nope/does-not-exist-xyz"), DEFAULT_LIMIT).unwrap_err();
        assert!(err.contains("does not exist"));
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::files
```

Expected: 5 tests pass.

- [ ] **Step 3: Register command in `lib.rs`**

Inside the `// File palette` block in `generate_handler![`, add:

```rust
            file_palette::files::list_root_files,
```

- [ ] **Step 4: Verify full build**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(file-palette): list_root_files with .gitignore awareness"
```

---

## Task 6: `search_content` command + tests

**Files:**
- Modify: `src-tauri/src/file_palette/content_search.rs`
- Modify: `src-tauri/src/lib.rs:147` — register command

- [ ] **Step 1: Implement content search with smart-case + cancellation**

Replace `src-tauri/src/file_palette/content_search.rs` with:

```rust
use grep_regex::RegexMatcherBuilder;
use grep_searcher::{BinaryDetection, SearcherBuilder, Sink, SinkMatch};
use ignore::{WalkBuilder, WalkState};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

const MAX_FILES_WITH_MATCHES: usize = 200;
const MAX_PREVIEWS_PER_FILE: usize = 5;
const MAX_PREVIEW_CHARS: usize = 200;

static CURRENT_TOKEN: AtomicU32 = AtomicU32::new(0);

#[derive(Debug, Serialize, Clone)]
pub struct ContentMatch {
    pub line: u32,
    pub preview: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ContentFileResult {
    pub rel_path: String,
    pub match_count: u32,
    pub matches: Vec<ContentMatch>,
}

#[tauri::command]
pub async fn search_content(
    root: String,
    pattern: String,
    cancel_token: u32,
) -> Result<Vec<ContentFileResult>, String> {
    CURRENT_TOKEN.store(cancel_token, Ordering::SeqCst);
    tokio::task::spawn_blocking(move || search(&PathBuf::from(root), &pattern, cancel_token))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn is_cancelled(my_token: u32) -> bool {
    CURRENT_TOKEN.load(Ordering::SeqCst) != my_token
}

fn search(root: &Path, pattern: &str, my_token: u32) -> Result<Vec<ContentFileResult>, String> {
    if pattern.is_empty() {
        return Ok(Vec::new());
    }
    let smart_case = pattern.chars().all(|c| !c.is_uppercase());
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(smart_case)
        .build(pattern)
        .map_err(|e| format!("bad regex: {e}"))?;

    let results: Arc<Mutex<Vec<ContentFileResult>>> = Arc::new(Mutex::new(Vec::new()));

    WalkBuilder::new(root).hidden(false).build_parallel().run(|| {
        let matcher = matcher.clone();
        let results = Arc::clone(&results);
        let root = root.to_path_buf();
        Box::new(move |entry| {
            if is_cancelled(my_token) {
                return WalkState::Quit;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(_) => return WalkState::Continue,
            };
            if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                return WalkState::Continue;
            }
            if results.lock().unwrap().len() >= MAX_FILES_WITH_MATCHES {
                return WalkState::Quit;
            }
            let rel = match entry.path().strip_prefix(&root) {
                Ok(r) => r.to_string_lossy().replace('\\', "/"),
                Err(_) => return WalkState::Continue,
            };
            let mut sink = CollectSink::default();
            let mut searcher = SearcherBuilder::new()
                .binary_detection(BinaryDetection::quit(b'\x00'))
                .build();
            if searcher.search_path(&matcher, entry.path(), &mut sink).is_err() {
                return WalkState::Continue;
            }
            if sink.match_count == 0 {
                return WalkState::Continue;
            }
            let mut guard = results.lock().unwrap();
            if guard.len() < MAX_FILES_WITH_MATCHES {
                guard.push(ContentFileResult {
                    rel_path: rel,
                    match_count: sink.match_count,
                    matches: sink.previews,
                });
            }
            WalkState::Continue
        })
    });

    if is_cancelled(my_token) {
        return Ok(Vec::new());
    }

    let mut out = Arc::try_unwrap(results)
        .map(|m| m.into_inner().unwrap())
        .unwrap_or_else(|a| a.lock().unwrap().clone());
    out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(out)
}

#[derive(Default)]
struct CollectSink {
    match_count: u32,
    previews: Vec<ContentMatch>,
}

impl Sink for CollectSink {
    type Error = std::io::Error;

    fn matched(
        &mut self,
        _searcher: &grep_searcher::Searcher,
        mat: &SinkMatch<'_>,
    ) -> Result<bool, Self::Error> {
        self.match_count += 1;
        if self.previews.len() < MAX_PREVIEWS_PER_FILE {
            let line = mat.line_number().unwrap_or(0) as u32;
            let text = std::str::from_utf8(mat.bytes()).unwrap_or("").trim_end();
            let preview = if text.chars().count() > MAX_PREVIEW_CHARS {
                let mut s: String = text.chars().take(MAX_PREVIEW_CHARS).collect();
                s.push('…');
                s
            } else {
                text.to_string()
            };
            self.previews.push(ContentMatch { line, preview });
        }
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write(dir: &Path, rel: &str, body: &str) {
        let p = dir.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(p, body).unwrap();
    }

    #[test]
    fn finds_matches_and_groups_by_file() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "const x = handleLogin();\nhandleLogin();\n");
        write(dir.path(), "b.ts", "// unrelated\n");

        let results = search(dir.path(), "handleLogin", 1).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].rel_path, "a.ts");
        assert_eq!(results[0].match_count, 2);
        assert_eq!(results[0].matches.len(), 2);
        assert!(results[0].matches[0].preview.contains("handleLogin"));
    }

    #[test]
    fn smart_case_insensitive_when_lowercase() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "const MyThing = 1;\n");
        let results = search(dir.path(), "mything", 2).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].match_count, 1);
    }

    #[test]
    fn smart_case_case_sensitive_when_mixed() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "const MyThing = 1;\nconst mything = 2;\n");
        let results = search(dir.path(), "MyThing", 3).unwrap();
        assert_eq!(results[0].match_count, 1);
    }

    #[test]
    fn caps_preview_count_but_keeps_match_count() {
        let dir = tempdir().unwrap();
        let mut body = String::new();
        for _ in 0..12 {
            body.push_str("foo\n");
        }
        write(dir.path(), "a.ts", &body);
        let results = search(dir.path(), "foo", 4).unwrap();
        assert_eq!(results[0].match_count, 12);
        assert_eq!(results[0].matches.len(), MAX_PREVIEWS_PER_FILE);
    }

    #[test]
    fn empty_pattern_returns_empty() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "anything");
        let results = search(dir.path(), "", 5).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn bad_regex_returns_error() {
        let dir = tempdir().unwrap();
        write(dir.path(), "a.ts", "x");
        let err = search(dir.path(), "(unclosed", 6).unwrap_err();
        assert!(err.contains("bad regex"));
    }

    #[test]
    fn cancellation_short_circuits() {
        let dir = tempdir().unwrap();
        for i in 0..10 {
            write(dir.path(), &format!("f{i}.ts"), "foo\n");
        }
        CURRENT_TOKEN.store(999, Ordering::SeqCst);
        let results = search(dir.path(), "foo", 7).unwrap();
        assert!(results.is_empty(), "cancelled search returned results");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::content_search
```

Expected: 7 tests pass.

- [ ] **Step 3: Register command in `lib.rs`**

Add to the `// File palette` block:

```rust
            file_palette::content_search::search_content,
```

- [ ] **Step 4: Verify build**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/content_search.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(file-palette): search_content via grep-* crates"
```

---

## Task 7: HTML shells, Vite entries, capability files

**Files:**
- Create: `file-palette.html`
- Create: `file-viewer.html`
- Create: `src-tauri/capabilities/file-palette.json`
- Create: `src-tauri/capabilities/file-viewer.json`
- Modify: `vite.config.ts:78-88` — add two inputs

- [ ] **Step 1: Create `file-palette.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BorgDock File Palette</title>
    <script>
      (function(){try{var s=localStorage.getItem('borgdock-theme');var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();
    </script>
    <style>
      html, body, #root { margin: 0; padding: 0; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/file-palette-main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `file-viewer.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BorgDock File Viewer</title>
    <script>
      (function(){try{var s=localStorage.getItem('borgdock-theme');var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();
    </script>
    <style>
      html, body, #root { margin: 0; padding: 0; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/file-viewer-main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Add Vite rollup inputs**

Edit `vite.config.ts`. The `input` object starts at line 78. After the `'whats-new'` entry, add:

```ts
        filepalette: path.resolve(__dirname, "file-palette.html"),
        fileviewer: path.resolve(__dirname, "file-viewer.html"),
```

- [ ] **Step 4: Create capability files**

`src-tauri/capabilities/file-palette.json`:

```json
{
  "identifier": "file-palette-capability",
  "description": "Permissions for the file palette window",
  "windows": ["file-palette"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-close",
    "core:window:allow-set-position",
    "core:window:allow-set-focus",
    "core:window:allow-set-size",
    "core:window:allow-inner-size",
    "core:window:allow-scale-factor",
    "core:window:allow-outer-position",
    "core:window:allow-is-visible",
    "core:webview:allow-create-webview-window",
    "core:app:allow-current-monitor",
    "core:event:default"
  ]
}
```

`src-tauri/capabilities/file-viewer.json`:

```json
{
  "identifier": "file-viewer-capability",
  "description": "Permissions for file viewer pop-out windows",
  "windows": ["file-viewer-*"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-close",
    "core:window:allow-set-position",
    "core:window:allow-set-focus",
    "core:window:allow-set-size",
    "core:window:allow-inner-size",
    "core:window:allow-scale-factor",
    "core:event:default"
  ]
}
```

- [ ] **Step 5: Verify build still works**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: exits 0. (The capabilities files are consumed by Tauri at build time.)

A Vite build will fail at this stage because the `.tsx` entries don't exist yet — that's fine. We'll exercise the full build in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/file-palette.html src/BorgDock.Tauri/file-viewer.html src/BorgDock.Tauri/src-tauri/capabilities/file-palette.json src/BorgDock.Tauri/src-tauri/capabilities/file-viewer.json src/BorgDock.Tauri/vite.config.ts
git commit -m "chore(file-palette): add HTML shells, Vite entries, capabilities"
```

---

## Task 8: `open_file_viewer_window` Tauri command

**Files:**
- Modify: `src-tauri/src/file_palette/windows.rs`
- Modify: `src-tauri/src/lib.rs:147` — register command

- [ ] **Step 1: Implement window-open command + inline unit test for label hashing**

Replace `src-tauri/src/file_palette/windows.rs` with:

```rust
use tauri::{Manager, WebviewWindowBuilder};
use tokio::sync::oneshot;

/// Viewer window label format: `file-viewer-<16 hex chars of blake3>`.
/// Stable per absolute path (normalized), so reopening the same file focuses
/// the existing window instead of creating a duplicate.
pub fn viewer_label_for(path: &str) -> String {
    let normalized = normalize_path(path);
    let hash = blake3::hash(normalized.as_bytes());
    format!("file-viewer-{}", hex16(&hash))
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn hex16(hash: &blake3::Hash) -> String {
    hash.to_hex().as_str()[..16].to_string()
}

#[tauri::command]
pub async fn open_file_viewer_window(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    let label = viewer_label_for(&path);
    let encoded = urlencoding::encode(&path).into_owned();

    let (tx, rx) = oneshot::channel::<Result<(), String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            if let Some(win) = app_for_run.get_webview_window(&label) {
                let _ = win.set_focus();
                return Ok(());
            }
            let url = format!("file-viewer.html?path={encoded}");
            let win = WebviewWindowBuilder::new(
                &app_for_run,
                &label,
                tauri::WebviewUrl::App(url.into()),
            )
            .title("BorgDock File Viewer")
            .inner_size(900.0, 720.0)
            .decorations(false)
            .always_on_top(false)
            .resizable(true)
            .skip_taskbar(false)
            .center()
            .focused(true)
            .build()
            .map_err(|e| format!("failed to build viewer window: {e}"))?;
            let _ = win.set_focus();
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_is_stable_for_same_path() {
        let a = viewer_label_for("E:\\BorgDock\\src\\app.ts");
        let b = viewer_label_for("E:/BorgDock/src/app.ts");
        assert_eq!(a, b, "slash direction should not matter");
    }

    #[test]
    fn label_is_case_insensitive() {
        let a = viewer_label_for("E:/BorgDock/src/app.ts");
        let b = viewer_label_for("e:/borgdock/src/app.ts");
        assert_eq!(a, b);
    }

    #[test]
    fn different_paths_give_different_labels() {
        let a = viewer_label_for("E:/one.ts");
        let b = viewer_label_for("E:/two.ts");
        assert_ne!(a, b);
    }

    #[test]
    fn label_has_expected_prefix_and_length() {
        let label = viewer_label_for("/x");
        assert!(label.starts_with("file-viewer-"));
        assert_eq!(label.len(), "file-viewer-".len() + 16);
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::windows
```

Expected: 4 tests pass.

- [ ] **Step 3: Register command in `lib.rs`**

Add to the `// File palette` block in `generate_handler![`:

```rust
            file_palette::windows::open_file_viewer_window,
```

- [ ] **Step 4: Verify `urlencoding` is already a dep**

From `src-tauri/Cargo.toml` Task 2 showed `urlencoding = "2"` on line 42 — good. No change needed.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/windows.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(file-palette): open_file_viewer_window with stable label per path"
```

---

## Task 9: Register Ctrl+F8 hotkey

**Files:**
- Modify: `src-tauri/src/platform/hotkey.rs` — add new block after the Ctrl+F7 handler (ends ~line 128)

- [ ] **Step 1: Add hotkey block**

Open `src-tauri/src/platform/hotkey.rs`. The Ctrl+F7 handler ends with `.map_err(|e| format!("Failed to register worktree palette hotkey: {e}"))?;` around line 128. Immediately after that semicolon, add:

```rust
    // Register file palette shortcut (Ctrl+F8) — toggles the same way as the
    // command and worktree palettes. The palette window itself is keyboard-
    // dismissed and skipTaskbar=true. Files opened from it pop out into
    // separate first-class viewer windows (see file_palette::windows).
    let app_file_palette = app.clone();
    app.global_shortcut()
        .on_shortcut("Ctrl+F8", move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let app_cb = app_file_palette.clone();
            let _ = app_file_palette.run_on_main_thread(move || {
                if let Some(win) = app_cb.get_webview_window("file-palette") {
                    let _ = win.close();
                    return;
                }

                if let Ok(win) = WebviewWindowBuilder::new(
                    &app_cb,
                    "file-palette",
                    tauri::WebviewUrl::App("file-palette.html".into()),
                )
                .title("BorgDock File Palette")
                .inner_size(1100.0, 600.0)
                .min_inner_size(800.0, 400.0)
                .decorations(false)
                .always_on_top(true)
                .resizable(true)
                .skip_taskbar(true)
                .center()
                .focused(true)
                .build()
                {
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(200));
                        let _ = win.set_focus();
                    });
                }
            });
        })
        .map_err(|e| format!("Failed to register file palette hotkey: {e}"))?;
```

- [ ] **Step 2: Verify build**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/platform/hotkey.rs
git commit -m "feat(file-palette): register Ctrl+F8 hotkey"
```

---

## Task 10: Scaffold `file-palette-main.tsx` + empty `FilePaletteApp`

**Files:**
- Create: `src/file-palette-main.tsx`
- Create: `src/components/file-palette/FilePaletteApp.tsx`
- Create: `src/styles/file-palette.css`
- Modify: `vite.config.ts` coverage excludes

- [ ] **Step 1: Create entry file**

Create `src/file-palette-main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import './styles/file-palette.css';
import { FilePaletteApp } from './components/file-palette/FilePaletteApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FilePaletteApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Create empty `FilePaletteApp.tsx`**

```tsx
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback } from 'react';

export function FilePaletteApp() {
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      getCurrentWindow().close();
    }
  }, []);

  return (
    <div className="fp-root" onKeyDown={handleKey} tabIndex={-1}>
      <div className="fp-titlebar" data-tauri-drag-region>
        <span className="fp-title">FILES</span>
      </div>
      <div className="fp-body">
        <div className="fp-placeholder">File palette — coming online</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create minimal stylesheet**

Create `src/styles/file-palette.css`:

```css
.fp-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: var(--fg, #e6e6e6);
  background: var(--bg, #121212);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
}

.fp-titlebar {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid var(--border, #2a2a2a);
  cursor: grab;
}

.fp-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  opacity: 0.72;
}

.fp-body {
  flex: 1;
  display: grid;
  grid-template-columns: 200px 320px 1fr;
  min-height: 0;
}

.fp-placeholder {
  padding: 20px;
  opacity: 0.6;
}
```

- [ ] **Step 4: Exclude new entry from coverage**

Edit `vite.config.ts`. Inside the `coverage.exclude` array (line 46-62), add:

```ts
        "src/file-palette-main.tsx",
        "src/file-viewer-main.tsx",
```

- [ ] **Step 5: Start dev server + open window manually**

Run in one terminal: `npm run tauri dev`

Once BorgDock is running, press **Ctrl+F8**. A small undecorated window should appear centered on the primary monitor showing "File palette — coming online". Press Esc to close.

Expected: window opens and closes cleanly. If the window is blank or throws a console error, open devtools on it (right-click in the dev build) and fix before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/file-palette-main.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/styles/file-palette.css src/BorgDock.Tauri/vite.config.ts
git commit -m "feat(file-palette): scaffold palette window with empty React app"
```

---

## Task 11: `parse-query.ts` pure logic + tests

**Files:**
- Create: `src/components/file-palette/parse-query.ts`
- Create: `src/components/file-palette/__tests__/parse-query.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/file-palette/__tests__/parse-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseQuery } from '../parse-query';

describe('parseQuery', () => {
  it('returns filename mode for plain text', () => {
    expect(parseQuery('login')).toEqual({ mode: 'filename', query: 'login' });
  });

  it('returns content mode for > prefix', () => {
    expect(parseQuery('>handleLogin')).toEqual({ mode: 'content', query: 'handleLogin' });
  });

  it('returns symbol mode for @ prefix', () => {
    expect(parseQuery('@Foo')).toEqual({ mode: 'symbol', query: 'Foo' });
  });

  it('strips leading whitespace after prefix', () => {
    expect(parseQuery('> foo')).toEqual({ mode: 'content', query: 'foo' });
    expect(parseQuery('@ Foo')).toEqual({ mode: 'symbol', query: 'Foo' });
  });

  it('returns empty query in filename mode when input is empty', () => {
    expect(parseQuery('')).toEqual({ mode: 'filename', query: '' });
  });

  it('treats bare prefix as empty query in that mode', () => {
    expect(parseQuery('>')).toEqual({ mode: 'content', query: '' });
    expect(parseQuery('@')).toEqual({ mode: 'symbol', query: '' });
  });

  it('does not interpret prefix in the middle of the query', () => {
    expect(parseQuery('foo>bar')).toEqual({ mode: 'filename', query: 'foo>bar' });
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
npx vitest run src/components/file-palette/__tests__/parse-query.test.ts
```

Expected: FAIL (module `'../parse-query'` not found).

- [ ] **Step 3: Implement**

Create `src/components/file-palette/parse-query.ts`:

```ts
export type SearchMode = 'filename' | 'content' | 'symbol';

export interface ParsedQuery {
  mode: SearchMode;
  query: string;
}

export function parseQuery(raw: string): ParsedQuery {
  if (raw.startsWith('>')) {
    return { mode: 'content', query: raw.slice(1).trimStart() };
  }
  if (raw.startsWith('@')) {
    return { mode: 'symbol', query: raw.slice(1).trimStart() };
  }
  return { mode: 'filename', query: raw };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/components/file-palette/__tests__/parse-query.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/parse-query.ts src/BorgDock.Tauri/src/components/file-palette/__tests__/parse-query.test.ts
git commit -m "feat(file-palette): parseQuery modes (filename / > content / @ symbol)"
```

---

## Task 12: `CodeView.tsx` — reusable line-numbered + syntax-highlighted code

**Files:**
- Create: `src/components/file-palette/CodeView.tsx`
- Create: `src/components/file-palette/__tests__/CodeView.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/file-palette/__tests__/CodeView.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeView } from '../CodeView';

vi.mock('@/services/syntax-highlighter', () => ({
  highlightLines: vi.fn(() => Promise.resolve(null)),
  getHighlightClass: vi.fn(() => 'hl-keyword'),
}));

describe('CodeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders one row per line with 1-based line numbers', () => {
    render(<CodeView path="test.ts" content={'a\nb\nc'} />);
    const numbers = screen.getAllByTestId('code-line-number');
    expect(numbers.map((n) => n.textContent)).toEqual(['1', '2', '3']);
  });

  it('applies the highlightedLines class to the requested rows', () => {
    render(<CodeView path="t.ts" content={'a\nb\nc\nd'} highlightedLines={[2, 4]} />);
    const rows = screen.getAllByTestId('code-line-row');
    expect(rows[0].className).not.toContain('code-line-row--hit');
    expect(rows[1].className).toContain('code-line-row--hit');
    expect(rows[2].className).not.toContain('code-line-row--hit');
    expect(rows[3].className).toContain('code-line-row--hit');
  });

  it('calls onIdentifierJump on F12 when a word is under the cursor', () => {
    const onJump = vi.fn();
    render(
      <CodeView
        path="t.ts"
        content={'const handleLogin = () => {}'}
        onIdentifierJump={onJump}
      />,
    );
    const lineText = screen.getAllByTestId('code-line-text')[0];
    // Simulate selecting the word handleLogin via native Range.
    const range = document.createRange();
    range.selectNodeContents(lineText);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    fireEvent.keyDown(lineText, { key: 'F12' });
    expect(onJump).toHaveBeenCalledWith(expect.stringContaining('handleLogin'));
  });

  it('writes full content to clipboard on Ctrl+Shift+C', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CodeView path="t.ts" content="hello" />);
    const root = screen.getByTestId('code-view-root');
    await act(async () => {
      fireEvent.keyDown(root, { key: 'C', ctrlKey: true, shiftKey: true });
    });
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
npx vitest run src/components/file-palette/__tests__/CodeView.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement CodeView**

Create `src/components/file-palette/CodeView.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getHighlightClass,
  highlightLines as runHighlighter,
  type HighlightSpan,
} from '@/services/syntax-highlighter';

export interface CodeViewProps {
  path: string;
  content: string;
  scrollToLine?: number;
  highlightedLines?: number[];
  onIdentifierJump?: (word: string) => void;
}

export function CodeView({
  path,
  content,
  scrollToLine,
  highlightedLines,
  onIdentifierJump,
}: CodeViewProps) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [spans, setSpans] = useState<Map<number, HighlightSpan[]> | null>(null);
  const hitSet = useMemo(() => new Set(highlightedLines ?? []), [highlightedLines]);

  // Load syntax highlighting asynchronously.
  useEffect(() => {
    let cancelled = false;
    runHighlighter(path, lines).then((result) => {
      if (!cancelled) setSpans(result);
    });
    return () => {
      cancelled = true;
    };
  }, [path, lines]);

  // Scroll to a specific line.
  useEffect(() => {
    if (!scrollToLine || !rootRef.current) return;
    const lineHeight = 20;
    const target = (scrollToLine - 1) * lineHeight - rootRef.current.clientHeight / 3;
    rootRef.current.scrollTop = Math.max(0, target);
  }, [scrollToLine]);

  const copyAll = useCallback(() => {
    navigator.clipboard.writeText(content).catch(() => {
      /* ignore */
    });
  }, [content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        copyAll();
        return;
      }
      if (e.key === 'F12' && onIdentifierJump) {
        const word = wordFromSelectionOrCaret();
        if (word) {
          e.preventDefault();
          onIdentifierJump(word);
        }
      }
    },
    [copyAll, onIdentifierJump],
  );

  return (
    <div
      ref={rootRef}
      className="code-view"
      data-testid="code-view-root"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {lines.map((text, i) => {
        const lineNo = i + 1;
        const isHit = hitSet.has(lineNo);
        return (
          <div
            key={lineNo}
            data-testid="code-line-row"
            className={`code-line-row${isHit ? ' code-line-row--hit' : ''}`}
          >
            <span className="code-line-number" data-testid="code-line-number">
              {lineNo}
            </span>
            <span className="code-line-text" data-testid="code-line-text">
              {renderLine(text, spans?.get(i) ?? null)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function renderLine(text: string, spans: HighlightSpan[] | null) {
  if (!spans || spans.length === 0) return text === '' ? ' ' : text;
  const out: Array<string | JSX.Element> = [];
  let cursor = 0;
  spans.forEach((span, idx) => {
    if (span.start > cursor) out.push(text.slice(cursor, span.start));
    out.push(
      <span key={idx} className={getHighlightClass(span.category)}>
        {text.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function wordFromSelectionOrCaret(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const text = sel.toString().trim();
  if (text) {
    // Use only the first word if user selected multiple.
    const m = text.match(/[A-Za-z_][A-Za-z0-9_]*/);
    return m ? m[0] : null;
  }
  // No explicit selection — fall back to the caret's parent text node.
  const node = sel.focusNode;
  const offset = sel.focusOffset;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const raw = node.textContent ?? '';
  if (!raw) return null;
  const left = raw.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_]*$/);
  const right = raw.slice(offset).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  const word = (left?.[0] ?? '') + (right?.[0] ?? '');
  return word || null;
}
```

- [ ] **Step 4: Add CodeView styles to `file-palette.css`**

Append to `src/styles/file-palette.css`:

```css
.code-view {
  overflow: auto;
  font-family: 'Consolas', 'SF Mono', Menlo, 'Courier New', monospace;
  font-size: 12px;
  line-height: 20px;
  padding: 4px 0;
  outline: none;
}

.code-line-row {
  display: grid;
  grid-template-columns: 48px 1fr;
  white-space: pre;
}

.code-line-row--hit {
  background: rgba(255, 200, 80, 0.08);
}

.code-line-number {
  text-align: right;
  padding-right: 10px;
  opacity: 0.35;
  user-select: none;
}

.code-line-text {
  user-select: text;
  white-space: pre;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/components/file-palette/__tests__/CodeView.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/CodeView.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/CodeView.test.tsx src/BorgDock.Tauri/src/styles/file-palette.css
git commit -m "feat(file-palette): reusable CodeView with syntax + gutter + copy-all"
```

---

## Task 13: `use-file-index` hook + test

**Files:**
- Create: `src/components/file-palette/use-file-index.ts`
- Create: `src/components/file-palette/__tests__/use-file-index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/file-palette/__tests__/use-file-index.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileIndex } from '../use-file-index';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('useFileIndex', () => {
  beforeEach(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'list_root_files') {
        return Promise.resolve({
          entries: [
            { rel_path: 'src/app.ts', size: 10 },
            { rel_path: 'src/auth/login.tsx', size: 20 },
            { rel_path: 'README.md', size: 30 },
          ],
          truncated: false,
        });
      }
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
  });

  it('returns [] while loading, then the index', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.rel_path)).toEqual([
      'src/app.ts',
      'src/auth/login.tsx',
      'README.md',
    ]);
  });

  it('filters by substring case-insensitively', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const hits = result.current.filter('LOGIN');
    expect(hits.map((h) => h.rel_path)).toEqual(['src/auth/login.tsx']);
  });

  it('returns all entries on empty filter', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filter('')).toHaveLength(3);
  });

  it('refreshes on refresh()', async () => {
    const { result } = renderHook(() => useFileIndex('/repo'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    mock.mockClear();
    await act(async () => {
      await result.current.refresh();
    });
    expect(mock).toHaveBeenCalledWith('list_root_files', { root: '/repo', limit: undefined });
  });
});
```

- [ ] **Step 2: Run to see failure**

```bash
npx vitest run src/components/file-palette/__tests__/use-file-index.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement hook**

Create `src/components/file-palette/use-file-index.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface FileEntry {
  rel_path: string;
  size: number;
}

interface ListFilesResult {
  entries: FileEntry[];
  truncated: boolean;
}

export interface FileIndexState {
  entries: FileEntry[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  filter: (query: string) => FileEntry[];
  refresh: () => Promise<void>;
}

export function useFileIndex(root: string | null, limit?: number): FileIndexState {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState<boolean>(Boolean(root));
  const [error, setError] = useState<string | null>(null);
  const currentRoot = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!root) {
      setEntries([]);
      setTruncated(false);
      setLoading(false);
      setError(null);
      return;
    }
    currentRoot.current = root;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<ListFilesResult>('list_root_files', { root, limit });
      if (currentRoot.current !== root) return; // a newer call took over
      setEntries(result.entries);
      setTruncated(result.truncated);
    } catch (e) {
      if (currentRoot.current !== root) return;
      setError(String(e));
      setEntries([]);
      setTruncated(false);
    } finally {
      if (currentRoot.current === root) setLoading(false);
    }
  }, [root, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const filter = useCallback(
    (query: string) => {
      if (!query) return entries;
      const lower = query.toLowerCase();
      return entries.filter((e) => e.rel_path.toLowerCase().includes(lower));
    },
    [entries],
  );

  return useMemo(
    () => ({ entries, truncated, loading, error, filter, refresh: load }),
    [entries, truncated, loading, error, filter, load],
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/file-palette/__tests__/use-file-index.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/use-file-index.ts src/BorgDock.Tauri/src/components/file-palette/__tests__/use-file-index.test.ts
git commit -m "feat(file-palette): useFileIndex hook with substring filter"
```

---

## Task 14: `RootsColumn` + integrate into `FilePaletteApp`

**Files:**
- Create: `src/components/file-palette/RootsColumn.tsx`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`
- Modify: `src/styles/file-palette.css` — append new styles

- [ ] **Step 1: Create RootsColumn**

Create `src/components/file-palette/RootsColumn.tsx`:

```tsx
import type { FilePaletteRoot } from '@/types/settings';

export interface RootEntry {
  path: string;
  label: string;
  source: 'worktree' | 'custom';
}

interface RootsColumnProps {
  roots: RootEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
}

export function RootsColumn({ roots, activePath, onSelect }: RootsColumnProps) {
  const worktrees = roots.filter((r) => r.source === 'worktree');
  const custom = roots.filter((r) => r.source === 'custom');

  const renderRow = (root: RootEntry) => (
    <button
      key={root.path}
      type="button"
      className={`fp-root-row${activePath === root.path ? ' fp-root-row--active' : ''}`}
      onClick={() => onSelect(root.path)}
      title={root.path}
    >
      <span className="fp-root-label">{root.label}</span>
    </button>
  );

  return (
    <div className="fp-roots">
      {worktrees.length > 0 && (
        <div className="fp-roots-section">
          <div className="fp-roots-heading">WORKTREES</div>
          {worktrees.map(renderRow)}
        </div>
      )}
      {custom.length > 0 && (
        <div className="fp-roots-section">
          <div className="fp-roots-heading">CUSTOM</div>
          {custom.map(renderRow)}
        </div>
      )}
      {roots.length === 0 && (
        <div className="fp-roots-empty">No roots configured. Add roots in Settings.</div>
      )}
    </div>
  );
}

export function buildRootEntries(
  repos: Array<{ owner: string; name: string; enabled: boolean; worktreeBasePath: string }>,
  custom: FilePaletteRoot[] | undefined,
  worktreePaths: Record<string, string[]>,
): RootEntry[] {
  const seen = new Set<string>();
  const out: RootEntry[] = [];
  for (const repo of repos) {
    if (!repo.enabled) continue;
    const paths = worktreePaths[`${repo.owner}/${repo.name}`] ?? [];
    for (const p of paths) {
      const norm = p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      const label = basename(p);
      out.push({ path: p, label, source: 'worktree' });
    }
  }
  for (const c of custom ?? []) {
    const norm = c.path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ path: c.path, label: c.label ?? basename(c.path), source: 'custom' });
  }
  return out;
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}
```

- [ ] **Step 2: Wire `FilePaletteApp` to load settings and compute roots**

Replace `src/components/file-palette/FilePaletteApp.tsx` with:

```tsx
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';
import { buildRootEntries, RootsColumn, type RootEntry } from './RootsColumn';

interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

export function FilePaletteApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [worktreePathsByRepo, setWorktreePathsByRepo] = useState<Record<string, string[]>>({});
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      getCurrentWindow().close();
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<AppSettings>('load_settings');
        setSettings(s);
        const repos = s.repos.filter((r) => r.enabled && r.worktreeBasePath);
        const collected: Record<string, string[]> = {};
        await Promise.allSettled(
          repos.map(async (r) => {
            try {
              const wts = await invoke<WorktreeEntry[]>('list_worktrees_bare', {
                basePath: r.worktreeBasePath,
              });
              collected[`${r.owner}/${r.name}`] = wts.map((w) => w.path);
            } catch {
              collected[`${r.owner}/${r.name}`] = [];
            }
          }),
        );
        setWorktreePathsByRepo(collected);
        setActiveRoot(s.ui?.filePaletteActiveRootPath ?? null);
      } catch (e) {
        setLoadError(parseError(e).message);
      }
    })();
  }, []);

  const roots: RootEntry[] = useMemo(() => {
    if (!settings) return [];
    return buildRootEntries(settings.repos, settings.filePaletteRoots, worktreePathsByRepo);
  }, [settings, worktreePathsByRepo]);

  useEffect(() => {
    if (!activeRoot && roots.length > 0) {
      setActiveRoot(roots[0].path);
    } else if (activeRoot && !roots.some((r) => r.path === activeRoot) && roots.length > 0) {
      setActiveRoot(roots[0].path);
    }
  }, [roots, activeRoot]);

  const selectRoot = useCallback(async (path: string) => {
    setActiveRoot(path);
    try {
      const s = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...s, ui: { ...s.ui, filePaletteActiveRootPath: path } },
      });
    } catch {
      /* best effort */
    }
  }, []);

  return (
    <div className="fp-root" onKeyDown={handleKey} tabIndex={-1}>
      <div className="fp-titlebar" data-tauri-drag-region>
        <span className="fp-title">FILES</span>
      </div>
      <div className="fp-body">
        <RootsColumn roots={roots} activePath={activeRoot} onSelect={selectRoot} />
        <div className="fp-middle-placeholder">
          {loadError ? `Load error: ${loadError}` : 'Search coming online…'}
        </div>
        <div className="fp-preview-placeholder">Preview</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Append Roots styles**

Append to `src/styles/file-palette.css`:

```css
.fp-roots {
  border-right: 1px solid var(--border, #2a2a2a);
  overflow-y: auto;
  padding: 6px 0;
}

.fp-roots-section { padding: 6px 0; }

.fp-roots-heading {
  padding: 2px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  opacity: 0.5;
}

.fp-root-row {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  border-radius: 4px;
}

.fp-root-row:hover { background: rgba(255,255,255,0.04); }

.fp-root-row--active {
  background: rgba(80, 140, 255, 0.18);
  color: #fff;
}

.fp-roots-empty {
  padding: 14px 12px;
  opacity: 0.55;
  font-size: 12px;
}

.fp-middle-placeholder,
.fp-preview-placeholder {
  padding: 14px;
  opacity: 0.55;
  font-size: 12px;
}
```

- [ ] **Step 4: Manual check**

Run `npm run tauri dev`. Press Ctrl+F8. Left column should list your worktrees grouped under "WORKTREES". Clicking one highlights it. Closing (Esc) and reopening preserves the active selection.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/RootsColumn.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/styles/file-palette.css
git commit -m "feat(file-palette): left column of roots (worktrees + custom)"
```

---

## Task 15: `SearchPane` + `ResultsList` (filename search end-to-end)

**Files:**
- Create: `src/components/file-palette/SearchPane.tsx`
- Create: `src/components/file-palette/ResultsList.tsx`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`
- Modify: `src/styles/file-palette.css`

- [ ] **Step 1: Create `ResultsList.tsx`** (presentational)

```tsx
import type { SearchMode } from './parse-query';

export interface ResultEntry {
  rel_path: string;
  mode: SearchMode;
  match_count?: number;     // for content / symbol
  line?: number;            // for symbol
  symbol?: string;          // for symbol
}

interface Props {
  results: ResultEntry[];
  selectedIndex: number;
  onHover: (i: number) => void;
  onOpen: (i: number) => void;
  rowRef: (el: HTMLButtonElement | null, i: number) => void;
}

export function ResultsList({ results, selectedIndex, onHover, onOpen, rowRef }: Props) {
  if (results.length === 0) return null;
  return (
    <div className="fp-results">
      {results.map((r, i) => (
        <button
          key={`${r.rel_path}:${r.line ?? 0}`}
          type="button"
          className={`fp-result-row${i === selectedIndex ? ' fp-result-row--selected' : ''}`}
          ref={(el) => rowRef(el, i)}
          onMouseEnter={() => onHover(i)}
          onClick={() => onOpen(i)}
        >
          <span className="fp-result-path">{r.rel_path}</span>
          {r.match_count !== undefined && (
            <span className="fp-result-meta">
              {r.match_count} match{r.match_count === 1 ? '' : 'es'}
            </span>
          )}
          {r.line !== undefined && (
            <span className="fp-result-meta">
              {r.symbol ? `${r.symbol} · ` : ''}L{r.line}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `SearchPane.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { ParsedQuery } from './parse-query';
import { parseQuery } from './parse-query';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  parsed: ParsedQuery;
  resultCount: number;
}

export function SearchPane({ query, onQueryChange, parsed, resultCount }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);

  const modeLabel =
    parsed.mode === 'filename' ? 'file' : parsed.mode === 'content' ? 'content' : 'symbol';

  return (
    <div className="fp-search-pane">
      <div className="fp-search-input-wrap">
        <input
          ref={inputRef}
          className="fp-search-input"
          placeholder="Filename · prefix > for content · @ for symbol"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="File palette search"
        />
        <span className="fp-search-mode" title={`Mode: ${modeLabel}`}>
          {modeLabel}
        </span>
      </div>
      <div className="fp-search-count">{resultCount} result{resultCount === 1 ? '' : 's'}</div>
    </div>
  );
}

export { parseQuery };
```

- [ ] **Step 3: Wire into `FilePaletteApp`**

Extend `FilePaletteApp.tsx` so the middle column renders `<SearchPane>` + `<ResultsList>`. Replace the file's entire body with:

```tsx
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '@/types/settings';
import { parseError } from '@/utils/parse-error';
import { parseQuery, type ParsedQuery } from './parse-query';
import { buildRootEntries, RootsColumn, type RootEntry } from './RootsColumn';
import { SearchPane } from './SearchPane';
import { ResultsList, type ResultEntry } from './ResultsList';
import { useFileIndex } from './use-file-index';

interface WorktreeEntry { path: string; branchName: string; isMainWorktree: boolean; }

export function FilePaletteApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [worktreePathsByRepo, setWorktreePathsByRepo] = useState<Record<string, string[]>>({});
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const rowRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());

  const fileIndex = useFileIndex(activeRoot);
  const parsed: ParsedQuery = useMemo(() => parseQuery(query), [query]);

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<AppSettings>('load_settings');
        setSettings(s);
        const repos = s.repos.filter((r) => r.enabled && r.worktreeBasePath);
        const collected: Record<string, string[]> = {};
        await Promise.allSettled(repos.map(async (r) => {
          try {
            const wts = await invoke<WorktreeEntry[]>('list_worktrees_bare', { basePath: r.worktreeBasePath });
            collected[`${r.owner}/${r.name}`] = wts.map((w) => w.path);
          } catch { collected[`${r.owner}/${r.name}`] = []; }
        }));
        setWorktreePathsByRepo(collected);
        setActiveRoot(s.ui?.filePaletteActiveRootPath ?? null);
      } catch (e) {
        setLoadError(parseError(e).message);
      }
    })();
  }, []);

  const roots: RootEntry[] = useMemo(() => {
    if (!settings) return [];
    return buildRootEntries(settings.repos, settings.filePaletteRoots, worktreePathsByRepo);
  }, [settings, worktreePathsByRepo]);

  useEffect(() => {
    if (!activeRoot && roots.length > 0) setActiveRoot(roots[0].path);
    else if (activeRoot && !roots.some((r) => r.path === activeRoot) && roots.length > 0) {
      setActiveRoot(roots[0].path);
    }
  }, [roots, activeRoot]);

  useEffect(() => setSelectedIndex(0), [query, activeRoot]);

  const selectRoot = useCallback(async (path: string) => {
    setActiveRoot(path);
    try {
      const s = await invoke<AppSettings>('load_settings');
      await invoke('save_settings', {
        settings: { ...s, ui: { ...s.ui, filePaletteActiveRootPath: path } },
      });
    } catch { /* ignore */ }
  }, []);

  const results: ResultEntry[] = useMemo(() => {
    if (parsed.mode !== 'filename') return [];
    return fileIndex.filter(parsed.query).slice(0, 500).map((e) => ({
      rel_path: e.rel_path,
      mode: 'filename' as const,
    }));
  }, [parsed, fileIndex]);

  const openResult = useCallback((_i: number) => {
    // Will be wired in Task 19 (Enter-to-pop-out).
  }, []);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (query) setQuery('');
        else getCurrentWindow().close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) openResult(selectedIndex);
      }
    },
    [query, results, selectedIndex, openResult],
  );

  useEffect(() => {
    rowRefs.current.get(selectedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="fp-root" onKeyDown={handleKey} tabIndex={-1}>
      <div className="fp-titlebar" data-tauri-drag-region>
        <span className="fp-title">FILES</span>
      </div>
      <div className="fp-body">
        <RootsColumn roots={roots} activePath={activeRoot} onSelect={selectRoot} />
        <div className="fp-middle">
          <SearchPane
            query={query}
            onQueryChange={setQuery}
            parsed={parsed}
            resultCount={results.length}
          />
          {loadError ? (
            <div className="fp-empty">Load error: {loadError}</div>
          ) : fileIndex.loading && parsed.mode === 'filename' ? (
            <div className="fp-empty">Loading file index…</div>
          ) : (
            <ResultsList
              results={results}
              selectedIndex={selectedIndex}
              onHover={setSelectedIndex}
              onOpen={openResult}
              rowRef={(el, i) => {
                rowRefs.current.set(i, el);
              }}
            />
          )}
        </div>
        <div className="fp-preview-placeholder">Preview</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append styles**

Append to `src/styles/file-palette.css`:

```css
.fp-middle {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border, #2a2a2a);
  min-width: 0;
}

.fp-search-pane {
  padding: 10px;
  border-bottom: 1px solid var(--border, #2a2a2a);
}

.fp-search-input-wrap { position: relative; }

.fp-search-input {
  width: 100%;
  padding: 8px 70px 8px 10px;
  background: var(--input-bg, #1b1b1b);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 6px;
  color: inherit;
  font-size: 13px;
  outline: none;
}

.fp-search-input:focus { border-color: #4f8dff; }

.fp-search-mode {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 2px 6px;
  font-size: 10px;
  letter-spacing: 0.06em;
  background: rgba(80,140,255,0.22);
  border-radius: 10px;
  text-transform: uppercase;
}

.fp-search-count {
  font-size: 10px;
  opacity: 0.5;
  margin-top: 6px;
}

.fp-results { overflow-y: auto; padding: 4px 0; }

.fp-result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  font-family: 'Consolas', monospace;
}

.fp-result-row:hover,
.fp-result-row--selected { background: rgba(80,140,255,0.14); }

.fp-result-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.fp-result-meta { font-size: 10px; opacity: 0.5; flex-shrink: 0; }

.fp-empty { padding: 14px; opacity: 0.55; font-size: 12px; }
```

- [ ] **Step 5: Manual check**

Run `npm run tauri dev`. Ctrl+F8. Middle column shows the search box. Type a filename fragment — results should filter live. Arrow keys move selection. Esc clears, Esc again closes.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/SearchPane.tsx src/BorgDock.Tauri/src/components/file-palette/ResultsList.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/styles/file-palette.css
git commit -m "feat(file-palette): filename search end-to-end (roots + search + results)"
```

---

## Task 16: `PreviewPane` + live preview on selection

**Files:**
- Create: `src/components/file-palette/PreviewPane.tsx`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`
- Modify: `src/styles/file-palette.css`

- [ ] **Step 1: Create `PreviewPane.tsx`**

```tsx
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { CodeView } from './CodeView';

interface Props {
  rootPath: string | null;
  relPath: string | null;
  scrollToLine?: number;
  highlightedLines?: number[];
  onIdentifierJump?: (word: string) => void;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; content: string }
  | { kind: 'binary' }
  | { kind: 'too_large'; size: number; limit: number }
  | { kind: 'error'; message: string };

export function PreviewPane({
  rootPath,
  relPath,
  scrollToLine,
  highlightedLines,
  onIdentifierJump,
}: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const absPath = rootPath && relPath ? joinPath(rootPath, relPath) : null;

  useEffect(() => {
    if (!absPath) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    invoke<string>('read_text_file', { path: absPath, maxBytes: null })
      .then((content) => {
        if (!cancelled) setState({ kind: 'ok', content });
      })
      .catch((err) => {
        if (cancelled) return;
        const e = normalizeError(err);
        setState(e);
      });
    return () => { cancelled = true; };
  }, [absPath]);

  if (state.kind === 'idle') {
    return <div className="fp-preview-empty">Select a file to preview</div>;
  }
  if (state.kind === 'loading') {
    return <div className="fp-preview-empty">Loading…</div>;
  }
  if (state.kind === 'binary') {
    return (
      <div className="fp-preview-empty">
        Binary file — preview disabled.
        <button
          type="button"
          className="fp-preview-action"
          onClick={() => absPath && invoke('open_in_editor', { path: absPath })}
        >
          Open in editor
        </button>
      </div>
    );
  }
  if (state.kind === 'too_large') {
    return (
      <div className="fp-preview-empty">
        File too large ({(state.size / 1024).toFixed(0)} KB &gt; {(state.limit / 1024).toFixed(0)} KB).
        <button
          type="button"
          className="fp-preview-action"
          onClick={() => absPath && invoke('open_in_editor', { path: absPath })}
        >
          Open in editor
        </button>
      </div>
    );
  }
  if (state.kind === 'error') {
    return <div className="fp-preview-empty">Could not read file: {state.message}</div>;
  }
  return (
    <CodeView
      path={relPath ?? ''}
      content={state.content}
      scrollToLine={scrollToLine}
      highlightedLines={highlightedLines}
      onIdentifierJump={onIdentifierJump}
    />
  );
}

function normalizeError(err: unknown): LoadState {
  if (err && typeof err === 'object' && 'kind' in (err as Record<string, unknown>)) {
    const e = err as { kind: string; size?: number; limit?: number; message?: string };
    if (e.kind === 'notFound') return { kind: 'error', message: 'File not found' };
    if (e.kind === 'tooLarge') return { kind: 'too_large', size: e.size ?? 0, limit: e.limit ?? 0 };
    if (e.kind === 'binary') return { kind: 'binary' };
    return { kind: 'error', message: e.message ?? 'unknown error' };
  }
  return { kind: 'error', message: String(err) };
}

function joinPath(root: string, rel: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normRel = rel.replace(/\\/g, '/').replace(/^\//, '');
  return `${normRoot}/${normRel}`;
}
```

- [ ] **Step 2: Wire into `FilePaletteApp`**

Edit `FilePaletteApp.tsx`. Replace `<div className="fp-preview-placeholder">Preview</div>` with:

```tsx
<PreviewPane
  rootPath={activeRoot}
  relPath={results[selectedIndex]?.rel_path ?? null}
  scrollToLine={results[selectedIndex]?.line}
/>
```

Add the import at the top: `import { PreviewPane } from './PreviewPane';`

- [ ] **Step 3: Styles**

Append to `src/styles/file-palette.css`:

```css
.fp-preview-empty {
  padding: 18px;
  opacity: 0.55;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.fp-preview-action {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  background: rgba(80,140,255,0.22);
  border: none;
  color: inherit;
  cursor: pointer;
}

.fp-preview-action:hover { background: rgba(80,140,255,0.35); }
```

- [ ] **Step 4: Manual check**

Ctrl+F8, select a result with arrow keys — the right column should load and display that file's contents with line numbers and (after a beat) syntax highlighting.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/PreviewPane.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/styles/file-palette.css
git commit -m "feat(file-palette): live preview pane tracking selection"
```

---

## Task 17: `use-content-search` hook + `>` mode wired in

**Files:**
- Create: `src/components/file-palette/use-content-search.ts`
- Create: `src/components/file-palette/__tests__/use-content-search.test.ts`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`

- [ ] **Step 1: Tests**

Create `src/components/file-palette/__tests__/use-content-search.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContentSearch } from '../use-content-search';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('useContentSearch', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args: { pattern?: string }) => {
      if (cmd === 'search_content') {
        return Promise.resolve([
          { rel_path: 'src/a.ts', match_count: 2, matches: [{ line: 3, preview: args?.pattern ?? '' }] },
        ]);
      }
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
  });

  it('returns empty results for empty query', async () => {
    const { result } = renderHook(() => useContentSearch('/r', ''));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.results).toEqual([]);
  });

  it('debounces then queries the backend', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    const { result, rerender } = renderHook(({ q }: { q: string }) => useContentSearch('/r', q), {
      initialProps: { q: '' },
    });
    rerender({ q: 'foo' });
    expect(mock).not.toHaveBeenCalledWith('search_content', expect.anything());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0));
    expect(mock).toHaveBeenCalledWith(
      'search_content',
      expect.objectContaining({ root: '/r', pattern: 'foo' }),
    );
  });

  it('ignores stale responses when query changes mid-flight', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    const deferreds: Array<{ resolve: (v: unknown) => void }> = [];
    mock.mockReset();
    mock.mockImplementation(() => {
      return new Promise((resolve) => deferreds.push({ resolve }));
    });
    const { result, rerender } = renderHook(({ q }: { q: string }) => useContentSearch('/r', q), {
      initialProps: { q: 'foo' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ q: 'bar' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    // Resolve the first (stale) call last — it should be ignored.
    deferreds[1].resolve([{ rel_path: 'bar-result.ts', match_count: 1, matches: [] }]);
    deferreds[0].resolve([{ rel_path: 'foo-result.ts', match_count: 1, matches: [] }]);
    await waitFor(() =>
      expect(result.current.results.map((r) => r.rel_path)).toEqual(['bar-result.ts']),
    );
  });
});
```

- [ ] **Step 2: Run to see failure**

```bash
npx vitest run src/components/file-palette/__tests__/use-content-search.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement hook**

Create `src/components/file-palette/use-content-search.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';

export interface ContentMatch {
  line: number;
  preview: string;
}

export interface ContentFileResult {
  rel_path: string;
  match_count: number;
  matches: ContentMatch[];
}

const DEBOUNCE_MS = 180;

export function useContentSearch(root: string | null, query: string) {
  const [results, setResults] = useState<ContentFileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!root) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (!query) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const token = ++tokenRef.current;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      invoke<ContentFileResult[]>('search_content', {
        root,
        pattern: query,
        cancelToken: token,
      })
        .then((r) => {
          if (token !== tokenRef.current) return;
          setResults(r);
        })
        .catch((e) => {
          if (token !== tokenRef.current) return;
          setError(String(e));
          setResults([]);
        })
        .finally(() => {
          if (token === tokenRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [root, query]);

  return { results, loading, error };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/components/file-palette/__tests__/use-content-search.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Wire into `FilePaletteApp`**

Edit `FilePaletteApp.tsx`. Import: `import { useContentSearch } from './use-content-search';`

Inside the component, after the `useFileIndex(activeRoot)` line add:

```tsx
  const contentSearch = useContentSearch(
    parsed.mode === 'content' ? activeRoot : null,
    parsed.mode === 'content' ? parsed.query : '',
  );
```

Replace the `results` memo:

```tsx
  const results: ResultEntry[] = useMemo(() => {
    if (parsed.mode === 'filename') {
      return fileIndex
        .filter(parsed.query)
        .slice(0, 500)
        .map((e) => ({ rel_path: e.rel_path, mode: 'filename' as const }));
    }
    if (parsed.mode === 'content') {
      return contentSearch.results.map((r) => ({
        rel_path: r.rel_path,
        mode: 'content' as const,
        match_count: r.match_count,
        line: r.matches[0]?.line,
      }));
    }
    return [];
  }, [parsed, fileIndex, contentSearch.results]);
```

Pass `scrollToLine` + `highlightedLines` into `PreviewPane`:

```tsx
  const currentContentHit = useMemo(() => {
    if (parsed.mode !== 'content') return null;
    const sel = results[selectedIndex];
    if (!sel) return null;
    const match = contentSearch.results.find((r) => r.rel_path === sel.rel_path);
    return match ?? null;
  }, [parsed.mode, results, selectedIndex, contentSearch.results]);

  // ...and in JSX
  <PreviewPane
    rootPath={activeRoot}
    relPath={results[selectedIndex]?.rel_path ?? null}
    scrollToLine={currentContentHit?.matches[0]?.line ?? results[selectedIndex]?.line}
    highlightedLines={currentContentHit?.matches.map((m) => m.line)}
  />
```

- [ ] **Step 6: Manual check**

Ctrl+F8. Type `>const`. Results should show files containing `const` with match counts. Selecting a row should scroll the preview to the first hit and subtly highlight match lines.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/use-content-search.ts src/BorgDock.Tauri/src/components/file-palette/__tests__/use-content-search.test.ts src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx
git commit -m "feat(file-palette): > content search wired in with jump-to-match"
```

---

## Task 18: File viewer window (`FileViewerApp` + toolbar + main)

**Files:**
- Create: `src/file-viewer-main.tsx`
- Create: `src/components/file-viewer/FileViewerApp.tsx`
- Create: `src/components/file-viewer/FileViewerToolbar.tsx`
- Create: `src/components/file-viewer/__tests__/FileViewerApp.test.tsx`
- Create: `src/styles/file-viewer.css`

- [ ] **Step 1: Tests**

Create `src/components/file-viewer/__tests__/FileViewerApp.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileViewerApp } from '../FileViewerApp';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('FileViewerApp', () => {
  beforeEach(async () => {
    window.history.replaceState(null, '', '/file-viewer.html?path=' + encodeURIComponent('E:/a.ts'));
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'read_text_file') return Promise.resolve('export const x = 1;');
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
  });

  it('reads the file path from the URL and renders its content', async () => {
    render(<FileViewerApp />);
    await waitFor(() => expect(screen.getByText(/x = 1/)).toBeTruthy());
    expect(screen.getByText('E:/a.ts')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Create viewer toolbar**

```tsx
// src/components/file-viewer/FileViewerToolbar.tsx
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState } from 'react';

interface Props {
  path: string;
  content: string | null;
}

export function FileViewerToolbar({ path, content }: Props) {
  const [copied, setCopied] = useState(false);
  const copyAll = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  return (
    <div className="fv-toolbar" data-tauri-drag-region>
      <span className="fv-path" title={path}>{path}</span>
      <div className="fv-actions">
        <button type="button" className="fv-btn" onClick={copyAll} disabled={!content}>
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button
          type="button"
          className="fv-btn"
          onClick={() => invoke('open_in_editor', { path })}
        >
          Open in editor
        </button>
        <button
          type="button"
          className="fv-btn fv-btn--close"
          onClick={() => getCurrentWindow().close()}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `FileViewerApp`**

```tsx
// src/components/file-viewer/FileViewerApp.tsx
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CodeView } from '../file-palette/CodeView';
import { FileViewerToolbar } from './FileViewerToolbar';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; content: string }
  | { kind: 'error'; message: string };

export function FileViewerApp() {
  const path = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('path');
    return p ?? '';
  }, []);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!path) {
      setState({ kind: 'error', message: 'No file path supplied' });
      return;
    }
    invoke<string>('read_text_file', { path })
      .then((content) => setState({ kind: 'ok', content }))
      .catch((e) => setState({ kind: 'error', message: extractMessage(e) }));
  }, [path]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      getCurrentWindow().close();
    }
  }, []);

  return (
    <div className="fv-root" onKeyDown={handleKey} tabIndex={-1}>
      <FileViewerToolbar
        path={path}
        content={state.kind === 'ok' ? state.content : null}
      />
      <div className="fv-body">
        {state.kind === 'loading' && <div className="fv-empty">Loading…</div>}
        {state.kind === 'error' && <div className="fv-empty">{state.message}</div>}
        {state.kind === 'ok' && <CodeView path={path} content={state.content} />}
      </div>
    </div>
  );
}

function extractMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'kind' in (e as Record<string, unknown>)) {
    const err = e as { kind: string; message?: string };
    if (err.kind === 'notFound') return 'File not found';
    if (err.kind === 'binary') return 'Binary file — preview disabled';
    if (err.kind === 'tooLarge') return 'File too large to preview';
    return err.message ?? 'Unknown error';
  }
  return String(e);
}
```

- [ ] **Step 4: Create entry**

```tsx
// src/file-viewer-main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import './styles/file-viewer.css';
import { FileViewerApp } from './components/file-viewer/FileViewerApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FileViewerApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Stylesheet**

Create `src/styles/file-viewer.css`:

```css
.fv-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: var(--fg, #e6e6e6);
  background: var(--bg, #121212);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
}

.fv-toolbar {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border, #2a2a2a);
  cursor: grab;
}

.fv-path {
  font-family: 'Consolas', monospace;
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.82;
}

.fv-actions { display: flex; gap: 6px; }

.fv-btn {
  padding: 4px 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  color: inherit;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.fv-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.fv-btn:disabled { opacity: 0.4; cursor: default; }

.fv-btn--close { font-size: 16px; line-height: 1; padding: 2px 8px; }

.fv-body { flex: 1; min-height: 0; }

.fv-empty { padding: 18px; opacity: 0.55; font-size: 12px; }
```

- [ ] **Step 6: Run viewer tests**

```bash
npx vitest run src/components/file-viewer/__tests__/FileViewerApp.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/file-viewer-main.tsx src/BorgDock.Tauri/src/components/file-viewer/ src/BorgDock.Tauri/src/styles/file-viewer.css
git commit -m "feat(file-palette): pop-out file viewer window"
```

---

## Task 19: Enter-to-pop-out wiring

**Files:**
- Modify: `src/components/file-palette/FilePaletteApp.tsx` — the `openResult` callback

- [ ] **Step 1: Wire openResult**

Replace the placeholder `openResult` callback with:

```tsx
  const openResult = useCallback(
    (i: number) => {
      if (!activeRoot) return;
      const entry = results[i];
      if (!entry) return;
      const absPath = joinRootAndRel(activeRoot, entry.rel_path);
      invoke('open_file_viewer_window', { path: absPath }).catch((e) => {
        console.error('open_file_viewer_window failed', e);
      });
    },
    [activeRoot, results],
  );
```

Add the helper near the top of the file (inside the module but outside the component):

```ts
function joinRootAndRel(root: string, rel: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normRel = rel.replace(/\\/g, '/').replace(/^\//, '');
  return `${normRoot}/${normRel}`;
}
```

- [ ] **Step 2: Manual smoke test**

Ctrl+F8. Select a result. Enter. A new window should open showing the file. It should appear in Alt+Tab. Opening another file via Ctrl+F8 → Enter should leave the first viewer open. Opening the same file again focuses the existing viewer. Ctrl+W closes the viewer.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx
git commit -m "feat(file-palette): Enter opens viewer window"
```

---

## Task 20: Tree-sitter symbol queries + `use-symbol-index` hook

**Files:**
- Create: `src/components/file-palette/queries/typescript.scm`
- Create: `src/components/file-palette/queries/javascript.scm`
- Create: `src/components/file-palette/queries/rust.scm`
- Create: `src/components/file-palette/queries/c_sharp.scm`
- Create: `src/components/file-palette/use-symbol-index.ts`
- Create: `src/components/file-palette/__tests__/use-symbol-index.test.ts`

- [ ] **Step 1: Write the four query files**

Create `src/components/file-palette/queries/typescript.scm`:

```scheme
; Function declarations with a body — skips interface method signatures
; (which are declared inside interface_body and have no body).
(function_declaration
  name: (identifier) @symbol.name
  body: (statement_block)) @symbol.def

; Class methods with a body.
(method_definition
  name: [(property_identifier) (computed_property_name)] @symbol.name
  body: (statement_block)) @symbol.def

; `const foo = () => { ... }` and `const foo = function () { ... }`.
(lexical_declaration
  (variable_declarator
    name: (identifier) @symbol.name
    value: [
      (arrow_function body: (statement_block))
      (function_expression body: (statement_block))
    ])) @symbol.def
```

Create `src/components/file-palette/queries/javascript.scm`:

```scheme
(function_declaration
  name: (identifier) @symbol.name
  body: (statement_block)) @symbol.def

(method_definition
  name: (property_identifier) @symbol.name
  body: (statement_block)) @symbol.def

(lexical_declaration
  (variable_declarator
    name: (identifier) @symbol.name
    value: [
      (arrow_function body: (statement_block))
      (function_expression body: (statement_block))
    ])) @symbol.def
```

Create `src/components/file-palette/queries/rust.scm`:

```scheme
; Free functions with a body.
(function_item
  name: (identifier) @symbol.name
  body: (block)) @symbol.def

; Associated functions inside impl blocks.
(impl_item
  body: (declaration_list
    (function_item
      name: (identifier) @symbol.name
      body: (block)) @symbol.def))
```

Create `src/components/file-palette/queries/c_sharp.scm`:

```scheme
; Class/struct/record methods with a body — skips interface methods
; (which have a semicolon terminator, not a block).
(method_declaration
  name: (identifier) @symbol.name
  body: (block)) @symbol.def

; Constructors.
(constructor_declaration
  name: (identifier) @symbol.name
  body: (block)) @symbol.def

; Top-level or nested local function declarations with a body.
(local_function_statement
  name: (identifier) @symbol.name
  body: (block)) @symbol.def
```

- [ ] **Step 2: Tests for `use-symbol-index`**

Create `src/components/file-palette/__tests__/use-symbol-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeSymbolHits, SymbolEntry } from '../use-symbol-index';

describe('mergeSymbolHits', () => {
  const sample: SymbolEntry[] = [
    { name: 'handleLogin', rel_path: 'auth.ts', line: 10 },
    { name: 'HandleLogin', rel_path: 'page.cs', line: 5 },
    { name: 'handleLogout', rel_path: 'auth.ts', line: 42 },
  ];

  it('filters case-insensitively by substring', () => {
    const hits = mergeSymbolHits(sample, 'login');
    expect(hits.map((h) => h.rel_path).sort()).toEqual(['auth.ts', 'page.cs']);
  });

  it('returns empty on empty query', () => {
    expect(mergeSymbolHits(sample, '')).toEqual([]);
  });

  it('sorts hits by path then line', () => {
    const hits = mergeSymbolHits(sample, 'handle');
    expect(hits.map((h) => `${h.rel_path}:${h.line}`)).toEqual([
      'auth.ts:10',
      'auth.ts:42',
      'page.cs:5',
    ]);
  });
});
```

- [ ] **Step 3: Implement `use-symbol-index.ts`**

Create `src/components/file-palette/use-symbol-index.ts`:

```ts
export interface SymbolEntry {
  name: string;
  rel_path: string;
  line: number;
}

/**
 * Filter a flat list of symbol entries by a case-insensitive substring of the
 * name, and sort by (path, line). Pure function — the hook state is held by
 * the caller (FilePaletteApp) so testing stays cheap.
 */
export function mergeSymbolHits(all: SymbolEntry[], query: string): SymbolEntry[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  return all
    .filter((s) => s.name.toLowerCase().includes(lower))
    .sort((a, b) =>
      a.rel_path === b.rel_path ? a.line - b.line : a.rel_path.localeCompare(b.rel_path),
    );
}

/** Language id for a given extension, or null if we don't index it. */
export function languageForExtension(ext: string): 'typescript' | 'javascript' | 'rust' | 'c_sharp' | null {
  const lower = ext.toLowerCase();
  if (lower === 'ts' || lower === 'tsx') return 'typescript';
  if (lower === 'js' || lower === 'jsx' || lower === 'mjs' || lower === 'cjs') return 'javascript';
  if (lower === 'rs') return 'rust';
  if (lower === 'cs') return 'c_sharp';
  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/file-palette/__tests__/use-symbol-index.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/queries/ src/BorgDock.Tauri/src/components/file-palette/use-symbol-index.ts src/BorgDock.Tauri/src/components/file-palette/__tests__/use-symbol-index.test.ts
git commit -m "feat(file-palette): Tree-sitter queries + symbol-hit filter"
```

---

## Task 21: Background indexer + `@` mode wired in

**Files:**
- Create: `src/components/file-palette/use-background-indexer.ts`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`

- [ ] **Step 1: Implement the indexer hook**

Create `src/components/file-palette/use-background-indexer.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { languageForExtension, type SymbolEntry } from './use-symbol-index';
import type { FileEntry } from './use-file-index';

// Dynamically loaded once per session.
let treeSitterPromise: Promise<{
  Parser: typeof import('web-tree-sitter').Parser;
  Language: typeof import('web-tree-sitter').Language;
}> | null = null;

async function loadTreeSitter() {
  if (!treeSitterPromise) {
    treeSitterPromise = (async () => {
      const mod = await import('web-tree-sitter');
      await mod.Parser.init({
        locateFile: (name: string) => `/${name}`,
      });
      return { Parser: mod.Parser, Language: mod.Language };
    })();
  }
  return treeSitterPromise;
}

const langCache = new Map<string, Promise<import('web-tree-sitter').Language>>();

function loadLanguage(id: 'typescript' | 'javascript' | 'rust' | 'c_sharp') {
  if (!langCache.has(id)) {
    const grammarFile =
      id === 'typescript'
        ? 'tree-sitter-typescript.wasm'
        : id === 'javascript'
          ? 'tree-sitter-javascript.wasm'
          : id === 'rust'
            ? 'tree-sitter-rust.wasm'
            : 'tree-sitter-c_sharp.wasm';
    langCache.set(
      id,
      loadTreeSitter().then(({ Language }) => Language.load(`/grammars/${grammarFile}`)),
    );
  }
  return langCache.get(id)!;
}

const queryCache = new Map<string, Promise<string>>();

function loadQuery(id: 'typescript' | 'javascript' | 'rust' | 'c_sharp') {
  if (!queryCache.has(id)) {
    queryCache.set(
      id,
      import(`./queries/${id}.scm?raw`).then((m: { default: string }) => m.default),
    );
  }
  return queryCache.get(id)!;
}

interface IndexerResult {
  entries: SymbolEntry[];
  processed: number;
  total: number;
  indexing: boolean;
}

export function useBackgroundIndexer(
  root: string | null,
  files: FileEntry[],
): IndexerResult {
  const [entries, setEntries] = useState<SymbolEntry[]>([]);
  const [processed, setProcessed] = useState(0);
  const [indexing, setIndexing] = useState(false);
  const rootRef = useRef<string | null>(null);

  useEffect(() => {
    rootRef.current = root;
    setEntries([]);
    setProcessed(0);
    if (!root || files.length === 0) {
      setIndexing(false);
      return;
    }
    const indexable = files.filter((f) => {
      const ext = f.rel_path.split('.').pop() ?? '';
      return languageForExtension(ext) !== null;
    });
    if (indexable.length === 0) {
      setIndexing(false);
      return;
    }
    setIndexing(true);

    let cancelled = false;
    (async () => {
      const { Parser } = await loadTreeSitter();
      const collected: SymbolEntry[] = [];
      const byLang = new Map<string, FileEntry[]>();
      for (const f of indexable) {
        const lang = languageForExtension(f.rel_path.split('.').pop() ?? '')!;
        const list = byLang.get(lang) ?? [];
        list.push(f);
        byLang.set(lang, list);
      }

      for (const [langId, group] of byLang) {
        const language = await loadLanguage(langId as 'typescript' | 'javascript' | 'rust' | 'c_sharp');
        const queryText = await loadQuery(
          langId as 'typescript' | 'javascript' | 'rust' | 'c_sharp',
        );
        const parser = new Parser();
        parser.setLanguage(language);
        const query = language.query(queryText);

        for (const f of group) {
          if (cancelled || rootRef.current !== root) return;
          const abs = joinPath(root, f.rel_path);
          let content: string;
          try {
            content = await invoke<string>('read_text_file', { path: abs });
          } catch {
            setProcessed((p) => p + 1);
            continue;
          }
          const tree = parser.parse(content);
          if (tree) {
            const captures = query.captures(tree.rootNode);
            for (const cap of captures) {
              if (cap.name === 'symbol.name') {
                collected.push({
                  name: cap.node.text,
                  rel_path: f.rel_path,
                  line: cap.node.startPosition.row + 1,
                });
              }
            }
            tree.delete();
          }
          setProcessed((p) => p + 1);
          if (collected.length % 200 === 0) {
            setEntries([...collected]);
            await new Promise((resolve) => {
              if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => resolve(null), { timeout: 50 });
              } else {
                window.setTimeout(() => resolve(null), 0);
              }
            });
          }
        }
      }

      if (!cancelled && rootRef.current === root) {
        setEntries([...collected]);
        setIndexing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [root, files]);

  return { entries, processed, total: files.length, indexing };
}

function joinPath(root: string, rel: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normRel = rel.replace(/\\/g, '/').replace(/^\//, '');
  return `${normRoot}/${normRel}`;
}
```

- [ ] **Step 2: Add Vite type augmentation for `?raw` imports**

Check `src/vite-env.d.ts`. If it doesn't already declare `*?raw`, add:

```ts
declare module '*.scm?raw' {
  const content: string;
  export default content;
}
```

If `src/vite-env.d.ts` doesn't exist, create it with:

```ts
/// <reference types="vite/client" />
declare module '*.scm?raw' {
  const content: string;
  export default content;
}
```

- [ ] **Step 3: Wire into `FilePaletteApp`**

In `FilePaletteApp.tsx`, import the hook and merge helper:

```tsx
import { useBackgroundIndexer } from './use-background-indexer';
import { mergeSymbolHits } from './use-symbol-index';
```

Inside the component:

```tsx
  const indexer = useBackgroundIndexer(activeRoot, fileIndex.entries);
```

Extend the `results` memo to handle the `symbol` mode:

```tsx
  if (parsed.mode === 'symbol') {
    return mergeSymbolHits(indexer.entries, parsed.query)
      .slice(0, 200)
      .map((s) => ({
        rel_path: s.rel_path,
        mode: 'symbol' as const,
        line: s.line,
        symbol: s.name,
      }));
  }
```

Show index progress in the empty state for the symbol mode. Where the empty-state is rendered, add:

```tsx
{parsed.mode === 'symbol' && indexer.indexing && results.length === 0 && (
  <div className="fp-empty">
    Indexing symbols… {indexer.processed} / {indexer.total}
  </div>
)}
```

- [ ] **Step 4: Manual smoke test**

Ctrl+F8. Wait a beat for index to build (watch the "Indexing symbols…" line). Type `@handleLogin` (or another function you know exists). Results should show the file + line of the implementation.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/use-background-indexer.ts src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/vite-env.d.ts
git commit -m "feat(file-palette): @ symbol-implementation search via Tree-sitter"
```

---

## Task 22: F12 jump-to-implementation wiring

**Files:**
- Modify: `src/components/file-palette/FilePaletteApp.tsx`

- [ ] **Step 1: Wire the `onIdentifierJump` prop to set the query to `@<word>` and focus search**

In `FilePaletteApp.tsx`, pass a callback into `PreviewPane`:

```tsx
  const jumpToSymbol = useCallback((word: string) => {
    setQuery(`@${word}`);
  }, []);

  // ...in JSX
  <PreviewPane
    rootPath={activeRoot}
    relPath={results[selectedIndex]?.rel_path ?? null}
    scrollToLine={currentContentHit?.matches[0]?.line ?? results[selectedIndex]?.line}
    highlightedLines={currentContentHit?.matches.map((m) => m.line)}
    onIdentifierJump={jumpToSymbol}
  />
```

- [ ] **Step 2: Manual smoke test**

Open a TS file in the preview. Put the cursor on a function identifier (click into the preview text and position the caret in the word). Press F12. The search box should switch to `@<name>` and the results list to symbol matches.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx
git commit -m "feat(file-palette): F12 inside preview jumps to implementation"
```

---

## Task 23: `FilePaletteApp` integration test + polished empty/error states

**Files:**
- Create: `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`
- Modify: `src/components/file-palette/FilePaletteApp.tsx`

- [ ] **Step 1: Write integration tests**

Create `src/components/file-palette/__tests__/FilePaletteApp.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePaletteApp } from '../FilePaletteApp';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({ close: vi.fn(() => Promise.resolve()) })),
}));
vi.mock('../use-background-indexer', () => ({
  useBackgroundIndexer: () => ({ entries: [], processed: 0, total: 0, indexing: false }),
}));

describe('FilePaletteApp', () => {
  beforeEach(async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') {
        return Promise.resolve({
          repos: [{ owner: 'org', name: 'r', enabled: true, worktreeBasePath: '/repo' }],
          ui: {},
          filePaletteRoots: [],
        });
      }
      if (cmd === 'list_worktrees_bare') {
        return Promise.resolve([{ path: '/repo/.worktrees/wt1', branchName: 'main', isMainWorktree: true }]);
      }
      if (cmd === 'list_root_files') {
        return Promise.resolve({
          entries: [
            { rel_path: 'src/app.ts', size: 10 },
            { rel_path: 'src/auth/login.tsx', size: 20 },
          ],
          truncated: false,
        });
      }
      if (cmd === 'save_settings') return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
  });

  it('renders roots and the file index after settings load', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('wt1')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeTruthy());
  });

  it('arrow-down moves selection', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('src/auth/login.tsx')).toBeTruthy());
    const root = screen.getAllByText('FILES')[0].closest('.fp-root')!;
    await act(async () => {
      fireEvent.keyDown(root, { key: 'ArrowDown' });
    });
    const second = screen.getByText('src/auth/login.tsx').closest('.fp-result-row');
    expect(second?.className).toContain('fp-result-row--selected');
  });

  it('typing filters the file list', async () => {
    render(<FilePaletteApp />);
    await waitFor(() => expect(screen.getByText('src/app.ts')).toBeTruthy());
    const input = screen.getByLabelText('File palette search') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'login' } });
    });
    await waitFor(() => {
      expect(screen.queryByText('src/app.ts')).toBeNull();
      expect(screen.getByText('src/auth/login.tsx')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/file-palette/__tests__/FilePaletteApp.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 3: Add "no results" / "no roots" polish**

Inside `FilePaletteApp.tsx`, in the middle-column render block, extend the empty-state conditions:

```tsx
{roots.length === 0 && (
  <div className="fp-empty">No roots configured. Add worktrees or paths under Settings.</div>
)}
{roots.length > 0 && parsed.mode === 'filename' && !fileIndex.loading && results.length === 0 && query && (
  <div className="fp-empty">No filenames matching &lsquo;{parsed.query}&rsquo;.</div>
)}
{roots.length > 0 && parsed.mode === 'content' && !contentSearch.loading && results.length === 0 && parsed.query && (
  <div className="fp-empty">No content matches for &lsquo;{parsed.query}&rsquo;.</div>
)}
{roots.length > 0 && parsed.mode === 'symbol' && !indexer.indexing && results.length === 0 && parsed.query && (
  <div className="fp-empty">
    No implementations found for &lsquo;{parsed.query}&rsquo; in this root. v1 supports TS, JS, C#, Rust.
  </div>
)}
```

Replace the single `<ResultsList>` render with conditional wrap so empty states and the list don't both appear.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx
git commit -m "feat(file-palette): empty states + integration tests"
```

---

## Task 24: Full-build smoke test + manual end-to-end verification

**Files:**
- (no code changes — this is a verification task)

- [ ] **Step 1: Run the full frontend test suite**

```bash
npx vitest run
```

Expected: all previous suites continue to pass; new suites pass.

- [ ] **Step 2: Run full cargo tests**

```bash
cd src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib
```

Expected: exits 0. New `file_palette::*` tests + all existing tests pass.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: all entries (including `filepalette` and `fileviewer`) are emitted. No Vite warnings about missing files.

- [ ] **Step 4: Manual end-to-end on real data**

Run `npm run tauri dev` and walk through this script once:

1. Press **Ctrl+F8** — file palette appears, shows worktrees in the left column.
2. Click through a few roots — left column highlights the selected root; file index reloads.
3. Type a filename fragment — results filter; arrow keys move selection; preview updates live.
4. Type `>useAuth` — content search results appear with match counts.
5. Select a content result — preview scrolls to the first match; match lines have a subtle background.
6. Wait for symbol index to finish (check the "Indexing symbols… N / M" state in `@` mode).
7. Type `@handleLogin` — results show implementations, not interface signatures or call sites.
8. Press **Enter** on a result — a viewer window opens. It appears in the **Alt+Tab** list and in the Windows taskbar.
9. Open another file. The first viewer stays open.
10. Re-open the same file — the already-open viewer is focused, no duplicate window.
11. Press **Ctrl+W** in a viewer — it closes.
12. In the palette preview, click into a function identifier. Press **F12** — search switches to `@<word>` with implementations.
13. Press **Esc** in the palette — it closes.
14. Re-open with **Ctrl+F8** — last active root is remembered.

Any step that fails → fix in a follow-up commit, not in this plan.

- [ ] **Step 5: Commit any smoke-test fixes**

If the walkthrough surfaced fixes, commit them under the same feature branch:

```bash
git add <paths>
git commit -m "fix(file-palette): <summary of the issue>"
```

If everything works, no commit needed.

---

## Done

At this point, the file palette is fully functional and tested. Open a PR:

```bash
git push -u origin <branch-name>
gh pr create --title "feat: file palette (Ctrl+F8)" --body "Implements docs/superpowers/specs/2026-04-21-file-palette-design.md"
```
