# PRDock — Developer Guide for Claude

## What is this?

A desktop app that monitors GitHub PRs as a docked sidebar. Built with Tauri + React + TypeScript in `src/PRDock.Tauri/`.

## Quick Commands

```bash
cd src/PRDock.Tauri
npm install                     # Install dependencies
npm run dev                     # Dev mode with hot reload
npm run build                   # Production build
npm run tauri dev               # Launch Tauri dev window
```

## Project Layout

```
src/PRDock.Tauri/         # Tauri + React application
```

## Implementation Status (Legacy WPF — completed before Tauri rewrite)

- **Phase 1 COMPLETE**: Core skeleton (sidebar, DI, settings, tray, hotkey, themes, work area)
- **Phase 2 COMPLETE**: GitHub integration (auth, HTTP client, PR fetching, check suites/runs, PR card UI, polling loop, grouping/sorting/filtering)
- **Phase 3 COMPLETE**: Failure details (log parsing, GitHub Actions extensions, check detail panel)
- **Phase 4 COMPLETE**: Claude Code integration (worktrees, launcher, process tracking, prompt generation)
- **Phase 5 COMPLETE**: Claude review panel (review comments, Markdown rendering, severity grouping)
- **Phase 6 COMPLETE**: Polish (notifications, floating badge, auto-hide, settings flyout, setup wizard, keyboard nav, worktree pruning, recently closed PRs, merge conflict indicators)
- **Phase 7 COMPLETE**: Hardening (retry handling, rate limit display, adaptive polling, graceful degradation)
- **Phase 8 COMPLETE**: Azure DevOps (work items, CRUD, query browser, filtering, attachments, section switcher)

Full spec: `PRDock-Implementation-Plan.md`

## Syntax highlighting (diff view)

Tree-sitter based. Three moving parts that must stay in sync:

1. **Runtime**: `web-tree-sitter` (dynamic import in `src/services/syntax-highlighter.ts`). Its wasm is served at `/web-tree-sitter.wasm` — do NOT change the `locateFile` callback without also updating `vite.config.ts`.
2. **Grammars from npm**: `tree-sitter-wasms` ships prebuilt `.wasm` for tsx, typescript, javascript, rust, c_sharp, css, html, json, yaml, toml, etc. They are copied to `/grammars/` by `vite-plugin-static-copy` in `vite.config.ts`. Dev server and prod build both go through this plugin — nothing to commit.
3. **SQL grammar (special case)**: SQL is NOT in `tree-sitter-wasms`. We build it from `@derekstride/tree-sitter-sql` using the tree-sitter CLI and commit the result to `public/grammars/tree-sitter-sql.wasm`. Rebuild with `bash scripts/build-sql-grammar.sh` (needs `tree-sitter-cli` dev dep, which auto-downloads wasi-sdk on first run). **On Windows, the wasi-sdk binaries may need `Unblock-File` before they can run** — if `wasm-ld.exe: Access is denied` appears, run `Get-ChildItem $env:LOCALAPPDATA\tree-sitter\wasi-sdk\bin\*.exe | Unblock-File`.

The `EXT_TO_GRAMMAR` map in `syntax-highlighter.ts` must only reference grammars that actually exist in `public/grammars/` or `node_modules/tree-sitter-wasms/out/`. Markdown is intentionally absent — no prebuilt wasm ships for it.

If diffs show up as plain text with no coloring, first check the browser devtools network tab for 404s on `/grammars/tree-sitter-*.wasm` or `/web-tree-sitter.wasm` — that's almost always the symptom of a broken copy pipeline.

## Tauri sync commands and main-thread operations

Tauri 2 invokes both sync and async `#[tauri::command]` functions on a **worker thread**, not the main GUI thread. Any operation that touches a `WebviewWindow` — especially `WebviewWindowBuilder::build()`, and often `show()` / `hide()` / `set_position()` — has to run on the main thread, or the cross-thread marshalling deadlocks against itself on Windows (the main thread waits for the worker that's waiting for the main thread).

Symptoms of the deadlock: the command logs its entry but never returns, and subsequent IPC calls from the frontend hang (e.g. `loadSettings` gets stuck on one of its `invoke()` calls, the splash screen never progresses). You'll see a log like `set_badge_visible: show=true` followed by silence.

**Pattern used by every window-creating command** (`open_pr_detail_window`, `open_whats_new_window`, `set_badge_visible`, `resize_badge`, etc.):

```rust
#[tauri::command]
pub async fn my_window_command(app: tauri::AppHandle, /* args */) -> Result<T, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<T, String>>();
    let app_for_run = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<T, String> {
            // ...window ops happen here, on the main thread...
            Ok(value)
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}
```

The command has to be `async` so it can `.await` the oneshot. `toggle_flyout` is the one exception — it's a non-command internal helper called synchronously from the tray event handler, which already runs on the main thread via `run_on_main_thread`.

## Spawning Windows CLI wrappers (`az.cmd`, etc.) from Rust

Rust's `std::process::Command::new("az")` on Windows uses `CreateProcessW`, which only auto-appends `.exe` — not `.cmd`, `.bat`, or the rest of `PATHEXT`. Azure CLI ships as `az.cmd` (a batch wrapper around the Python entry point), so bare `"az"` fails with `NotFound` even when `az` works in Windows Terminal, cmd.exe, or PowerShell (those honor `PATHEXT`).

**Rule:** when spawning a CLI tool from Rust on Windows via `hidden_command`/`Command::new`, check whether the tool ships as `.exe` (like `gh.exe`, `git.exe`) or as a batch wrapper (`az.cmd`, `npm.cmd`, `yarn.cmd`, most Python-wrapped CLIs). Batch wrappers need the extension spelled out, ideally behind a `cfg!(windows)` guard. See `src-tauri/src/auth/ado.rs::az_program()` for the canonical pattern.

## SQL query execution: tiberius panics on unsupported column types

Tiberius (`tiberius = "0.12"`) is not defensive about column types it doesn't know how to decode. When a result row contains a SQL Server **UDT** (`geography`, `geometry`, `hierarchyid`, a CLR type, sometimes `xml` / `sql_variant`), the decoder hits a `todo!()` / `unimplemented!()` inside `tds::codec::type_info` and **panics** rather than returning an error. A wide `SELECT *` against a certain view is the usual way to hit this.

Because this is a panic (not a `Result`), `try_get`-level handling in `row_to_strings` can never catch it — the panic originates deeper, inside `into_results()` decoding.

**Two pieces keep this from killing the app:**

1. **Release profile uses `panic = "unwind"`** (not `abort`) in `src-tauri/Cargo.toml`. With `abort`, neither `catch_unwind` nor `tokio::spawn` can intercept the panic — the process dies before any handler runs. Don't revert this without a replacement strategy.
2. **The query body in `sql::execute_sql_query` runs inside `tokio::spawn`**, and `JoinError::is_panic()` is checked on the handle. The panic payload is downcast to a string and returned as a friendly `Err(String)` suggesting the user avoid `SELECT *`.

If a user reports the SQL window still crashing, check `%APPDATA%\PRDock\logs\prdock-panic.log` — the panic hook in `lib.rs::install_panic_hook` does a synchronous, flushed write there (survives even `panic = "abort"`, for diagnosing future crashes that predate the catch).

## `cargo check` / `cargo build` hangs in Git Bash on Windows

Git Bash's MSYS path conversion mangles flags like `-Brepro` (MSVC's deterministic-build flag), parsing them as `-B` followed by a path argument. Symptom: `cc-rs` errors like `"C:/Program" "Files/Git/Brepro-"` during `libsqlite3-sys` build.

Workaround: prefix cargo commands with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`:

```bash
cd src/PRDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Or run cargo from cmd.exe / PowerShell where MSYS isn't involved.

## Self-Improvement

Whenever you learn something new that is important to remember, run into the same issue twice, or encounter an issue that might happen again — update this CLAUDE.md so the next session avoids the same pitfalls.
