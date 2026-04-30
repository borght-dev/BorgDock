# File Index — persistent disk cache

## Context

Opening the File Palette currently walks the chosen worktree from scratch every time (`ignore::WalkBuilder` in `src-tauri/src/file_palette/files.rs::list_root_files`). On a 50k-file repo that's 1–2s of cold-cache work on every switch. The user wants the palette to feel instant, including after an app restart — so an in-memory cache isn't enough.

We're adding a SQLite-backed persistent cache for the file list, with **stale-while-revalidate** semantics: cache hits return immediately, and a background re-walk refreshes the DB so the next open sees the latest state.

No frontend changes — `list_root_files` keeps its current signature and shape. The UI just gets fast.

## Approach

### Storage

- New SQLite file at `%APPDATA%/BorgDock/fileindex.db` (same parent dir as the existing `prcache.db`, kept separate because file-index data has a different lifecycle and would otherwise bloat the PR cache).
- Schema (one row per cached root):

```sql
CREATE TABLE IF NOT EXISTS file_index (
    root TEXT PRIMARY KEY,       -- normalized absolute path
    entries_json TEXT NOT NULL,  -- JSON array of { rel_path, size }
    truncated INTEGER NOT NULL,  -- 0 | 1
    cached_at TEXT NOT NULL      -- ISO-8601 timestamp
);
```

- **Path normalization** (used everywhere the cache key is touched — key must be canonical in one place only): forward slashes, strip trailing `/`, `to_ascii_lowercase()` on Windows only. Mirrors `viewer_label_for`'s `normalize_path` pattern in `file_palette/windows.rs`.

### State

New module `src-tauri/src/file_palette/cache.rs`:

```rust
pub struct FileIndexCache {
    pub conn: Mutex<Option<Connection>>,
    pub in_flight: Mutex<HashSet<PathBuf>>,  // background re-walks currently running
}
```

Managed via `app.manage(FileIndexCache { ... })` in `lib.rs::run()` alongside `PrCache`. Initialized in `setup()` (same point the main-window show + tray setup happen) via a new `init()` helper that opens the DB, creates the table, and stores the connection. No Tauri command exposed — init runs at startup, unlike the existing `cache_init` which is called from the frontend.

### `list_root_files` behavior

Pseudocode:

```
fn list_root_files(root, limit):
    let key = normalize(root)
    if let Some(hit) = cache::read(key):
        cache::spawn_refresh(root, limit, key)   // fire-and-forget
        return hit

    // Cold path — first walk ever, or DB unavailable.
    let walked = walk_root(root, limit)?
    cache::write(key, &walked)
    Ok(walked)
```

`cache::spawn_refresh` guarantees:
- It does NOT spawn if `in_flight` already contains the key.
- Otherwise it inserts the key into `in_flight`, spawns a `tokio::task::spawn_blocking`, runs the walk, writes to the DB, removes the key from `in_flight`. Poison-safe even on walk errors.
- Errors during the background walk are logged but do NOT affect the foreground return.

### Error handling

- DB connection absent / poisoned / write failure → `cache::read` returns `None`, `cache::write` silently no-ops with a `log::warn!`. The foreground path falls through to the direct walk. User sees today's latency, never a broken feature.
- Walk errors: unchanged — returned to the frontend as today.
- Corrupt DB file on startup: rename the existing file to `fileindex.db.corrupt-<ts>` and recreate empty. Matches how `cache_init` already handles its own schema bump implicitly (CREATE IF NOT EXISTS + no schema version yet).

### Concurrency invariants

- `conn` mutex wraps all SQL operations.
- `in_flight` mutex only wraps membership checks (fine-grained; held briefly).
- Background task releases `in_flight` entry in a `struct Guard` that calls `remove` on drop, so a panic in the walker can't permanently strand a key.

## Files to create / modify

**Create:**
- `src-tauri/src/file_palette/cache.rs` — `FileIndexCache`, `init`, `read`, `write`, `spawn_refresh`, `normalize_root`, in-flight `Guard`.
- `src-tauri/src/file_palette/cache.rs` tests module — `roundtrip`, `separate_roots_independent`, `overwrite_updates_row`, `normalize_root_windows` / `unix`.

**Modify:**
- `src-tauri/src/file_palette/mod.rs` — register `pub mod cache;`.
- `src-tauri/src/file_palette/files.rs` — inject a cache lookup + background refresh around `walk_root`; accept the `FileIndexCache` state via `tauri::State<'_, FileIndexCache>`.
- `src-tauri/src/lib.rs` — `.manage(FileIndexCache { … })` + `file_palette::cache::init()` call in `setup()`. Keep the `list_root_files` entry in `invoke_handler`.

## Reused code

- `dirs::config_dir()` + `BorgDock/` directory — matches `PrCache::db_path()` pattern.
- `rusqlite::Connection` — already in dependencies.
- `tokio::task::spawn_blocking` — already the Rust-Tauri pattern for CPU-bound work (see `git_file_diff`, `git_changed_files`).
- `walk_root` in `files.rs` — unchanged; wrapped, not modified.

## Scope boundaries (not in v1)

- **No symbol-index cache** — the symbol indexer (`use-background-indexer.ts`) is out of scope. Different data, different invalidation concerns.
- **No user-facing "clear cache" button** — can be added later as a Settings action if needed.
- **No mid-session refresh event** — stale-while-revalidate means you see fresh data on the **next** open, not mid-session. A Tauri event emitter is a follow-up if the UX turns out to need it.
- **No eviction / size cap** — 10 roots × ~2MB JSON = trivial. Add later only if a user reports unbounded growth.
- **No schema versioning** — v1 schema is a single table; if we evolve, we detect mismatch at `init()` and recreate.

## Verification

1. **Cold cache (first walk ever)**
   - Launch `npm run tauri dev`, open the File Palette, pick a worktree root that's never been cached.
   - Expected: same latency as before (~1–2s on a 50k-file repo).
   - DB check: `sqlite3 %APPDATA%/BorgDock/fileindex.db "SELECT root, length(entries_json) FROM file_index"` shows the new row.

2. **Warm cache (subsequent opens)**
   - Close the palette (Esc). Reopen it. Select the same root.
   - Expected: file list renders in <100ms (essentially instant).
   - DB check: `cached_at` column may or may not have advanced depending on whether the background refresh completed; both are acceptable.

3. **Stale-while-revalidate**
   - With the palette showing cached entries, in another terminal create a new file in the worktree: `touch newfile.ts`.
   - Close and reopen the palette, select the same root.
   - Expected: first render is instant (old cache, missing `newfile.ts`). A background refresh fires. Close/reopen again — `newfile.ts` now appears.

4. **App restart persistence**
   - Close the app entirely, relaunch, open the palette, pick the previously-cached root.
   - Expected: instant render (DB survived the restart).

5. **Dedup of in-flight refresh**
   - Open and close the palette rapidly 5 times against the same root.
   - Expected: only one background walker runs concurrently (observe via `log::info!` trace in `spawn_refresh`; only one "refreshing <root>" log entry should appear within a ~second).

6. **DB unavailable fallback**
   - Manually rename `fileindex.db` to `fileindex.db.locked` while the app is running.
   - Reopen the palette on a cached root.
   - Expected: falls back to a direct walk, no crash, no user-visible error (a warning in the app logs is OK).

7. **Rust tests**
   - `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib file_palette::cache` — roundtrip + independence + overwrite + normalize tests pass.
   - `cargo test --lib file_palette::files` — existing tests (`lists_source_files_and_skips_unknown_extensions` etc.) still pass; new integration test exercises the cache-wrapped `list_root_files`.

8. **Frontend test suite**
   - `npx vitest run` — 2471/2471 still pass (no TS changes, but sanity run).
