# File Index — persistent disk cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make File Palette root switches feel instant after the first walk by adding a SQLite-backed cache for `list_root_files` with stale-while-revalidate semantics.

**Architecture:** New `src-tauri/src/file_palette/cache.rs` module owns a SQLite connection in `%APPDATA%/BorgDock/fileindex.db` plus an in-flight `HashSet<PathBuf>` of background re-walks. `list_root_files` is rewritten: cache hit → return immediately + spawn background refresh; cache miss → walk synchronously, cache, return. No frontend changes.

**Tech Stack:** Rust (Tauri 2), `rusqlite = "0.32"` (already a dep), `tokio::task::spawn_blocking`, `serde`, `chrono`.

**Reference spec:** `docs/superpowers/specs/2026-04-23-file-index-persistent-cache-design.md`

**Windows/Git Bash note (CLAUDE.md):** prefix every `cargo` command with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`.

---

## File Structure

**Create:**
- `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs` — `FileIndexCache` state, `init`, `new_connection`, `read`, `write`, `spawn_refresh`, `normalize_root`, in-flight `Guard`, and unit tests.

**Modify:**
- `src/BorgDock.Tauri/src-tauri/src/file_palette/mod.rs` — add `pub mod cache;`.
- `src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs` — derive `Deserialize` on `FileEntry` and `ListFilesResult`, inject `tauri::State<FileIndexCache>` into `list_root_files`, and wrap `walk_root` with cache lookup + background refresh.
- `src/BorgDock.Tauri/src-tauri/src/lib.rs` — `.manage(FileIndexCache { ... })` and call `file_palette::cache::init(&app.handle())` in `setup()`.

---

## Task 1: `cache.rs` skeleton + `normalize_root`

**Files:**
- Create: `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/mod.rs`

- [ ] **Step 1: Register the module**

Edit `src/BorgDock.Tauri/src-tauri/src/file_palette/mod.rs`. It currently reads:

```rust
pub mod content_search;
pub mod files;
pub mod read_file;
pub mod windows;
```

Change it to:

```rust
pub mod cache;
pub mod content_search;
pub mod files;
pub mod read_file;
pub mod windows;
```

- [ ] **Step 2: Write the failing tests for `normalize_root`**

Create `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs` with just this scaffolding:

```rust
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

pub struct FileIndexCache {
    pub conn: Arc<Mutex<Option<Connection>>>,
    pub in_flight: Arc<Mutex<HashSet<PathBuf>>>,
}

/// Canonicalize a root path for use as the cache key. Forward slashes only,
/// no trailing slash, and lower-case on Windows so path-case differences
/// between callers collapse to one row.
pub fn normalize_root(raw: &str) -> String {
    let mut s = raw.replace('\\', "/");
    while s.ends_with('/') && s.len() > 1 {
        s.pop();
    }
    if cfg!(target_os = "windows") {
        s = s.to_ascii_lowercase();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_forward_slashes_backslashes() {
        assert_eq!(normalize_root("C:\\repo\\src"), "c:/repo/src");
        assert_eq!(normalize_root("/home/user/repo"), "/home/user/repo");
    }

    #[test]
    fn normalize_strips_trailing_slash() {
        assert_eq!(normalize_root("/repo/"), "/repo");
        assert_eq!(normalize_root("C:\\repo\\"), "c:/repo");
    }

    #[test]
    fn normalize_single_slash_kept() {
        assert_eq!(normalize_root("/"), "/");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn normalize_windows_is_lowercased() {
        assert_eq!(normalize_root("E:\\PRDock\\SRC"), "e:/prdock/src");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn normalize_unix_preserves_case() {
        assert_eq!(normalize_root("/Home/User/Repo"), "/Home/User/Repo");
    }
}
```

- [ ] **Step 3: Run tests to confirm they compile and pass**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::cache::tests 2>&1 | tail -15
```

Expected: 4 tests pass (3 cross-platform + 1 platform-conditional).

- [ ] **Step 4: Commit**

```bash
cd 'E:/PRDock' && git add src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs src/BorgDock.Tauri/src-tauri/src/file_palette/mod.rs
git commit -m "$(cat <<'EOF'
feat(file-palette): add cache.rs skeleton + normalize_root

Foundation for the persistent file-index cache. Introduces the
FileIndexCache struct (SQLite connection + in-flight set) and the
normalize_root helper that collapses path-case and slash
differences into a single canonical cache key. Unit tests for
normalization on both Windows and Unix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB read / write + roundtrip tests

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs` (add `Deserialize` derives)

- [ ] **Step 1: Add `Deserialize` derives to cached types**

In `src-tauri/src/file_palette/files.rs`, change the two `derive` lines:

```rust
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
```

to:

```rust
#[derive(Debug, Serialize, serde::Deserialize)]
pub struct FileEntry {
    pub rel_path: String,
    pub size: u64,
}

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct ListFilesResult {
    pub entries: Vec<FileEntry>,
    pub truncated: bool,
}
```

(Fully qualify `serde::Deserialize` to avoid adding a new `use` at the top — matches the `Serialize` import already in scope for the file.)

- [ ] **Step 2: Write the failing read/write tests**

Append to `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs`'s `mod tests`:

```rust
    use crate::file_palette::files::{FileEntry, ListFilesResult};

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        create_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn read_miss_returns_none() {
        let conn = memory_conn();
        let hit = read(&conn, "/does/not/exist");
        assert!(hit.is_none());
    }

    #[test]
    fn write_then_read_roundtrips_entries_and_truncated() {
        let conn = memory_conn();
        let data = ListFilesResult {
            entries: vec![
                FileEntry { rel_path: "a.ts".into(), size: 10 },
                FileEntry { rel_path: "b/c.ts".into(), size: 20 },
            ],
            truncated: true,
        };
        write(&conn, "/repo", &data).unwrap();
        let got = read(&conn, "/repo").unwrap();
        assert_eq!(got.entries.len(), 2);
        assert_eq!(got.entries[0].rel_path, "a.ts");
        assert_eq!(got.entries[0].size, 10);
        assert_eq!(got.entries[1].rel_path, "b/c.ts");
        assert!(got.truncated);
    }

    #[test]
    fn write_overwrites_existing_row() {
        let conn = memory_conn();
        write(
            &conn,
            "/repo",
            &ListFilesResult {
                entries: vec![FileEntry { rel_path: "x.ts".into(), size: 1 }],
                truncated: false,
            },
        )
        .unwrap();
        write(
            &conn,
            "/repo",
            &ListFilesResult {
                entries: vec![
                    FileEntry { rel_path: "y.ts".into(), size: 2 },
                    FileEntry { rel_path: "z.ts".into(), size: 3 },
                ],
                truncated: false,
            },
        )
        .unwrap();
        let got = read(&conn, "/repo").unwrap();
        assert_eq!(got.entries.len(), 2);
        assert_eq!(got.entries[0].rel_path, "y.ts");
    }

    #[test]
    fn writes_to_different_roots_are_independent() {
        let conn = memory_conn();
        write(
            &conn,
            "/one",
            &ListFilesResult {
                entries: vec![FileEntry { rel_path: "one.ts".into(), size: 1 }],
                truncated: false,
            },
        )
        .unwrap();
        write(
            &conn,
            "/two",
            &ListFilesResult {
                entries: vec![FileEntry { rel_path: "two.ts".into(), size: 2 }],
                truncated: false,
            },
        )
        .unwrap();
        assert_eq!(read(&conn, "/one").unwrap().entries[0].rel_path, "one.ts");
        assert_eq!(read(&conn, "/two").unwrap().entries[0].rel_path, "two.ts");
    }
```

- [ ] **Step 3: Run the new tests to confirm they fail**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::cache::tests 2>&1 | tail -20
```

Expected: 4 new tests fail with `cannot find function create_schema` / `cannot find function read` / `cannot find function write`.

- [ ] **Step 4: Implement `create_schema`, `read`, and `write`**

In `src-tauri/src/file_palette/cache.rs`, above the `#[cfg(test)]` block, add:

```rust
use chrono::Utc;
use log::warn;
use rusqlite::params;

use super::files::ListFilesResult;

pub fn create_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS file_index (
            root TEXT PRIMARY KEY,
            entries_json TEXT NOT NULL,
            truncated INTEGER NOT NULL,
            cached_at TEXT NOT NULL
        );",
    )
}

/// Look up a cached file listing. Returns `None` on miss or deserialization
/// failure — callers must fall back to the direct walk.
pub fn read(conn: &Connection, root: &str) -> Option<ListFilesResult> {
    let normalized = normalize_root(root);
    let mut stmt = conn
        .prepare("SELECT entries_json, truncated FROM file_index WHERE root = ?1")
        .ok()?;
    let row: Option<(String, i64)> = stmt
        .query_row(params![normalized], |r| Ok((r.get(0)?, r.get(1)?)))
        .ok();
    let (entries_json, truncated_i) = row?;
    match serde_json::from_str::<Vec<super::files::FileEntry>>(&entries_json) {
        Ok(entries) => Some(ListFilesResult {
            entries,
            truncated: truncated_i != 0,
        }),
        Err(e) => {
            warn!("file_index cache: failed to decode entries for {normalized}: {e}");
            None
        }
    }
}

/// Upsert a file listing into the cache.
pub fn write(conn: &Connection, root: &str, result: &ListFilesResult) -> rusqlite::Result<()> {
    let normalized = normalize_root(root);
    let entries_json = serde_json::to_string(&result.entries).map_err(|e| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            e.to_string(),
        )))
    })?;
    let truncated_i: i64 = if result.truncated { 1 } else { 0 };
    let cached_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO file_index (root, entries_json, truncated, cached_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(root) DO UPDATE SET
            entries_json = excluded.entries_json,
            truncated = excluded.truncated,
            cached_at = excluded.cached_at",
        params![normalized, entries_json, truncated_i, cached_at],
    )?;
    Ok(())
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::cache::tests 2>&1 | tail -20
```

Expected: all 8 tests pass (4 normalize + 4 read/write).

- [ ] **Step 6: Commit**

```bash
cd 'E:/PRDock' && git add src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs
git commit -m "$(cat <<'EOF'
feat(file-palette): cache schema + read/write for file index

Adds create_schema, read, and write to file_palette::cache. Data
is serialized as JSON in a single row per normalized root path.
FileEntry and ListFilesResult grew Deserialize derives so cached
entries can be reconstructed. Four new roundtrip / independence /
upsert unit tests using :memory: SQLite.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: in-flight dedup (`Guard`) + `spawn_refresh`

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs`

- [ ] **Step 1: Write the failing tests for the in-flight Guard**

Append to the existing `mod tests` in `cache.rs`:

```rust
    use std::sync::Arc;

    #[test]
    fn in_flight_guard_inserts_on_creation_and_removes_on_drop() {
        let set: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
        let key = PathBuf::from("/repo");
        {
            let _g = Guard::new(&set, key.clone());
            assert!(set.lock().unwrap().contains(&key));
        }
        // Dropped at end of scope.
        assert!(!set.lock().unwrap().contains(&key));
    }

    #[test]
    fn try_claim_returns_none_when_already_in_flight() {
        let set: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
        let key = PathBuf::from("/repo");
        let first = Guard::try_claim(&set, key.clone());
        assert!(first.is_some());
        let second = Guard::try_claim(&set, key.clone());
        assert!(second.is_none(), "second claim must return None while first is live");
        drop(first);
        let third = Guard::try_claim(&set, key);
        assert!(third.is_some(), "claim must succeed after previous guard drops");
    }
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::cache::tests 2>&1 | tail -20
```

Expected: 2 new tests fail with `cannot find type Guard`.

- [ ] **Step 3: Implement `Guard` and `spawn_refresh`**

In `src-tauri/src/file_palette/cache.rs`, above the `#[cfg(test)]` block, add:

```rust
/// RAII handle that registers a re-walk as "in flight" on creation and
/// removes it on drop. Use `Guard::try_claim` to take a slot iff no other
/// re-walk is currently running for the same key.
pub struct Guard {
    set: Arc<Mutex<HashSet<PathBuf>>>,
    key: PathBuf,
}

impl Guard {
    /// Unconditionally insert the key (for tests). Prefer `try_claim` in
    /// production code so concurrent callers don't stack refreshes.
    pub fn new(set: &Arc<Mutex<HashSet<PathBuf>>>, key: PathBuf) -> Self {
        set.lock().unwrap().insert(key.clone());
        Self { set: set.clone(), key }
    }

    /// Insert `key` only if absent. Returns `Some(Guard)` on success, `None`
    /// if another refresh for the same key is already in flight.
    pub fn try_claim(set: &Arc<Mutex<HashSet<PathBuf>>>, key: PathBuf) -> Option<Self> {
        let inserted = set.lock().unwrap().insert(key.clone());
        if inserted {
            Some(Self { set: set.clone(), key })
        } else {
            None
        }
    }
}

impl Drop for Guard {
    fn drop(&mut self) {
        if let Ok(mut set) = self.set.lock() {
            set.remove(&self.key);
        }
    }
}

/// Fire-and-forget: re-walk `root` in the background and overwrite the cache
/// row if the walk succeeds. Deduplicated via an in-flight set so concurrent
/// callers against the same root collapse to a single refresh.
pub fn spawn_refresh(
    conn: Arc<Mutex<Option<Connection>>>,
    in_flight: Arc<Mutex<HashSet<PathBuf>>>,
    root: String,
    limit: usize,
) {
    let key = PathBuf::from(&root);
    let Some(guard) = Guard::try_claim(&in_flight, key) else {
        log::debug!("file_index cache: refresh already in flight for {root}");
        return;
    };

    tokio::task::spawn_blocking(move || {
        // Keep the guard alive for the whole background walk. When this closure
        // returns (including on panic), the guard drops and the key leaves the
        // in-flight set, freeing future refreshes.
        let _guard = guard;

        match super::files::walk_root(&PathBuf::from(&root), limit) {
            Ok(result) => {
                let Ok(conn_lock) = conn.lock() else {
                    log::warn!("file_index cache: connection mutex poisoned; skipping write");
                    return;
                };
                let Some(conn_ref) = conn_lock.as_ref() else {
                    log::warn!("file_index cache: connection is None; skipping write");
                    return;
                };
                if let Err(e) = write(conn_ref, &root, &result) {
                    log::warn!("file_index cache: failed to write refreshed entries: {e}");
                }
            }
            Err(e) => {
                log::warn!("file_index cache: background re-walk failed for {root}: {e}");
            }
        }
    });
}
```

Note: `super::files::walk_root` is currently `fn walk_root(root: &Path, limit: usize) -> Result<ListFilesResult, String>`. It's a private `fn` today — Task 4 makes it `pub(super)` so this module can call it.

- [ ] **Step 4: Expose `walk_root` to the cache module**

In `src-tauri/src/file_palette/files.rs`, change the line:

```rust
fn walk_root(root: &Path, limit: usize) -> Result<ListFilesResult, String> {
```

to:

```rust
pub(super) fn walk_root(root: &Path, limit: usize) -> Result<ListFilesResult, String> {
```

- [ ] **Step 5: Run all cache tests to confirm everything builds and passes**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::cache::tests 2>&1 | tail -20
```

Expected: 10 tests pass (4 normalize + 4 read/write + 2 guard).

- [ ] **Step 6: Commit**

```bash
cd 'E:/PRDock' && git add src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs
git commit -m "$(cat <<'EOF'
feat(file-palette): in-flight dedup + spawn_refresh for cache

Adds the Guard RAII handle (try_claim / drop removes entry) and a
spawn_refresh helper that fires a background tokio::spawn_blocking
walk, writes the result to SQLite, and is deduplicated via the
in-flight HashSet so rapid open/close cycles don't stack
concurrent walks. walk_root is now pub(super) so the cache module
can invoke it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: wire cache into `list_root_files`

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs`

- [ ] **Step 1: Write a failing integration test**

Append to `src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs`'s existing `mod tests`:

```rust
    use super::super::cache::{create_schema, read, FileIndexCache};
    use rusqlite::Connection;
    use std::collections::HashSet;
    use std::sync::{Arc, Mutex};

    fn make_cache() -> FileIndexCache {
        let conn = Connection::open_in_memory().unwrap();
        create_schema(&conn).unwrap();
        FileIndexCache {
            conn: Arc::new(Mutex::new(Some(conn))),
            in_flight: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    #[test]
    fn list_root_files_uses_cache_on_second_call() {
        let dir = tempdir().unwrap();
        write(dir.path(), "src/a.ts", "");
        write(dir.path(), "src/b.ts", "");

        let cache = make_cache();
        let root_str = dir.path().to_string_lossy().to_string();

        // First call: cache miss → walk + write.
        let first = list_root_files_sync(&cache, &root_str, DEFAULT_LIMIT).unwrap();
        assert_eq!(first.entries.len(), 2);

        // DB should now contain the cached entries for this root.
        {
            let conn_lock = cache.conn.lock().unwrap();
            let conn_ref = conn_lock.as_ref().unwrap();
            let hit = read(conn_ref, &root_str).expect("cache hit");
            assert_eq!(hit.entries.len(), 2);
        }

        // Delete a file on disk — but because the second call hits the cache
        // synchronously, we still get the old view.
        std::fs::remove_file(dir.path().join("src/b.ts")).unwrap();
        let second = list_root_files_sync(&cache, &root_str, DEFAULT_LIMIT).unwrap();
        assert_eq!(second.entries.len(), 2, "cache should serve stale data");
    }
```

Also add (above the tests module, still inside `files.rs`, NOT inside the tests mod) a test-only synchronous helper so the tests can drive the cache path without Tauri's async command machinery:

```rust
#[cfg(test)]
pub(super) fn list_root_files_sync(
    cache: &super::cache::FileIndexCache,
    root: &str,
    limit: usize,
) -> Result<ListFilesResult, String> {
    if let Some(conn_lock) = cache.conn.lock().ok() {
        if let Some(conn_ref) = conn_lock.as_ref() {
            if let Some(hit) = super::cache::read(conn_ref, root) {
                // Skip spawning the real background refresh in tests — we
                // assert on the synchronous return value only.
                return Ok(hit);
            }
        }
    }
    let walked = walk_root(&PathBuf::from(root), limit)?;
    if let Ok(conn_lock) = cache.conn.lock() {
        if let Some(conn_ref) = conn_lock.as_ref() {
            let _ = super::cache::write(conn_ref, root, &walked);
        }
    }
    Ok(walked)
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::files::tests 2>&1 | tail -20
```

Expected: the new test fails or doesn't compile because `list_root_files_sync` isn't yet defined or because `FileIndexCache`/`write`/`read` aren't in scope for tests.

- [ ] **Step 3: Replace the production `list_root_files`**

In `src-tauri/src/file_palette/files.rs`, replace the existing implementation:

```rust
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
```

with:

```rust
#[tauri::command]
pub async fn list_root_files(
    cache: tauri::State<'_, super::cache::FileIndexCache>,
    root: String,
    limit: Option<usize>,
) -> Result<ListFilesResult, String> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT);

    // Fast path: DB hit. Serve immediately, spawn a background refresh so
    // the NEXT open reflects any filesystem changes.
    if let Ok(conn_lock) = cache.conn.lock() {
        if let Some(conn_ref) = conn_lock.as_ref() {
            if let Some(hit) = super::cache::read(conn_ref, &root) {
                drop(conn_lock);
                super::cache::spawn_refresh(
                    cache.conn.clone(),
                    cache.in_flight.clone(),
                    root.clone(),
                    limit,
                );
                return Ok(hit);
            }
        }
    }

    // Cold path: synchronous walk, then cache.
    let walked = tokio::task::spawn_blocking({
        let root = root.clone();
        move || walk_root(&PathBuf::from(root), limit)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    if let Ok(conn_lock) = cache.conn.lock() {
        if let Some(conn_ref) = conn_lock.as_ref() {
            if let Err(e) = super::cache::write(conn_ref, &root, &walked) {
                log::warn!("file_index cache: cold-write failed: {e}");
            }
        }
    }

    Ok(walked)
}
```

`spawn_refresh` already takes `Arc<Mutex<...>>` handles (see Task 3), and `FileIndexCache`'s fields are `Arc<Mutex<...>>` (see Task 1), so `cache.conn.clone()` and `cache.in_flight.clone()` share ownership with the Tauri-managed state.

- [ ] **Step 4: Run tests to confirm they pass and no regression**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette 2>&1 | tail -20
```

Expected: all file_palette tests pass — 5 pre-existing `file_palette::files::tests` (`lists_source_files_…`, `respects_gitignore`, `includes_dotfile_configs_…`, `truncates_past_limit`, `missing_root_returns_error`) + 1 new `list_root_files_uses_cache_on_second_call` + 10 cache tests = 16 total.

- [ ] **Step 5: Also run `cargo check` to confirm the production code compiles end-to-end**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -10
```

Expected: `Finished` with no errors.

- [ ] **Step 6: Commit**

```bash
cd 'E:/PRDock' && git add src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs src/BorgDock.Tauri/src-tauri/src/file_palette/files.rs
git commit -m "$(cat <<'EOF'
feat(file-palette): cache-aware list_root_files

list_root_files now consults FileIndexCache before walking. On a
hit it returns immediately and fires a background re-walk via
spawn_refresh so the NEXT open sees filesystem changes. On a miss
it falls through to the synchronous walk and writes the result
into the cache.

FileIndexCache's fields are now Arc<Mutex<…>> so spawn_refresh can
share ownership with the Tauri-managed state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: register state + init in `lib.rs`, add `db_path()`

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs` — add `db_path()` + `init()`.
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs` — manage state + init.

- [ ] **Step 1: Add `db_path` and `init` in `cache.rs`**

Append to `src-tauri/src/file_palette/cache.rs` (above `#[cfg(test)]`):

```rust
pub fn db_path() -> std::path::PathBuf {
    dirs::config_dir()
        .expect("could not determine config directory")
        .join("BorgDock")
        .join("fileindex.db")
}

/// Open (or create) the SQLite file and install it into the managed cache
/// state. Safe to call multiple times — subsequent calls no-op. Errors during
/// init are logged but non-fatal: the command falls back to direct walks.
pub fn init(state: &FileIndexCache) {
    let path = db_path();
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("file_index cache: failed to create dir {}: {e}", parent.display());
            return;
        }
    }
    let conn = match Connection::open(&path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("file_index cache: open failed at {}: {e}", path.display());
            return;
        }
    };
    if let Err(e) = create_schema(&conn) {
        log::warn!("file_index cache: create_schema failed: {e}");
        return;
    }
    match state.conn.lock() {
        Ok(mut guard) => *guard = Some(conn),
        Err(e) => log::warn!("file_index cache: connection mutex poisoned during init: {e}"),
    }
}
```

- [ ] **Step 2: Register the state and call `init` in `lib.rs::run()`**

In `src-tauri/src/lib.rs`, find the `.manage(...)` block (currently there's a sequence `.manage(ProcessState { ... }) .manage(PrCache { ... }) .manage(platform::flyout_cache::FlyoutCache { ... })`). Add a fourth:

```rust
        .manage(file_palette::cache::FileIndexCache {
            conn: std::sync::Arc::new(std::sync::Mutex::new(None)),
            in_flight: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashSet::new())),
        })
```

In the existing `.setup(|app| { ... })` closure, AFTER the `platform::tray::setup_tray(app)?;` line and BEFORE the main-window show block, add:

```rust
            file_palette::cache::init(&app.state::<file_palette::cache::FileIndexCache>());
```

- [ ] **Step 3: Verify the end-to-end build passes**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -10
```

Expected: `Finished` with no errors.

```bash
cd 'E:/PRDock/src/BorgDock.Tauri/src-tauri' && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette 2>&1 | tail -20
```

Expected: 16 tests pass.

Also sanity check the frontend still builds (no API-shape change expected):

```bash
cd 'E:/PRDock/src/BorgDock.Tauri' && npx tsc --noEmit 2>&1 | tail -5 && echo "---exit $?---"
```

Expected: `---exit 0---` (the pre-existing `useGitHubPolling.test.ts` error is fine).

- [ ] **Step 4: Commit**

```bash
cd 'E:/PRDock' && git add src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat(file-palette): register FileIndexCache state + init at startup

FileIndexCache is now managed by Tauri and its SQLite connection
is opened in setup() via file_palette::cache::init. DB lives next
to prcache.db at %APPDATA%/BorgDock/fileindex.db. Failures during
init are logged but non-fatal — list_root_files gracefully falls
back to direct walks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: manual smoke test

No code changes. Checklist to exercise the cache in a real Tauri dev window.

- [ ] **Step 1: Launch**

```bash
cd 'E:/PRDock/src/BorgDock.Tauri' && npm run tauri dev
```

- [ ] **Step 2: Cold walk for a fresh root**

Open the palette, pick a large worktree that you have never used this session. Time how long it takes for results to appear — expect ~1-2s on a 50k-file repo.

Check the DB exists:

```bash
ls -la "$APPDATA/BorgDock/fileindex.db" 2>/dev/null || dir "%APPDATA%\\BorgDock\\fileindex.db"
```

Expect: file size > 0.

- [ ] **Step 3: Warm cache**

Close the palette (Esc). Reopen it, pick the same root. Expect: list renders essentially immediately (~sub-100ms).

- [ ] **Step 4: Stale-while-revalidate**

In another terminal, create a new file in that worktree:

```bash
touch "<path-to-worktree>/zzz-cache-probe.ts"
```

Close the palette, reopen, pick the root. Expect:
1. First render: instant, does NOT contain `zzz-cache-probe.ts` (served from cache).
2. A background refresh fires silently.
3. Close and reopen one more time: `zzz-cache-probe.ts` now appears.

Clean up:

```bash
rm "<path-to-worktree>/zzz-cache-probe.ts"
```

- [ ] **Step 5: App restart persistence**

Quit the app entirely (tray menu → Quit). Relaunch. Open the palette, pick the previously-cached root. Expect: instant render.

- [ ] **Step 6: DB-unavailable fallback**

Quit the app, rename `%APPDATA%\BorgDock\fileindex.db` to `fileindex.db.locked`, relaunch. Open palette, pick a root. Expect: a direct walk runs (same latency as cold), but no crash.

Rename back afterwards:

```bash
mv "$APPDATA/BorgDock/fileindex.db.locked" "$APPDATA/BorgDock/fileindex.db"
```

- [ ] **Step 7: Report**

Summarise which steps passed and which (if any) need follow-up fixes.
