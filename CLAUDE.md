# BorgDock — Developer Guide for Claude

## What is this?

A desktop app that monitors GitHub PRs as a docked sidebar. Built with Tauri + React + TypeScript in `src/BorgDock.Tauri/`.

## Quick Commands

```bash
# From the repo root — single bun workspace install for both
# src/BorgDock.Tauri (the desktop app) and site/ (the marketing site)
bun install

# From the repo root: root scripts cd into the workspace member.
# Or run from src/BorgDock.Tauri directly — same result.
bun run dev                     # Dev mode with hot reload
bun run build                   # Production build (tsc -b && vite build)
bun run tauri dev               # Launch Tauri dev window
bun run lint                    # biome lint
bun run test                    # vitest
bun run site:build              # Astro marketing site build
```

**Package manager:** Bun 1.3+. The repo is a bun workspace (`/package.json` + `/bun.lock` + `/bunfig.toml` pinning the hoisted linker). The Tauri app workspace member is named `borgdock-app`; the marketing site is `borgdock-site`. `bun --filter` has been observed to misbehave in 1.3.10 with these names — root scripts use `cd <member> && bun run <script>` instead, which works through bun's bundled cross-platform shell on macOS, Linux, and Windows.

**npm CLI is also required** (alongside bun) for one specific case: `scripts/build-grammars.sh` and `scripts/build-sql-grammar.sh` use `npm pack` to fetch grammar tarballs from the npm registry. Bun has no equivalent registry-fetch command yet (`bun pm pack` only packs the local package).

## React Compiler escape hatch

The React Compiler (`babel-plugin-react-compiler`, wired into `@vitejs/plugin-react` in `vite.config.ts`) auto-memoizes function components and hooks at build time. If a specific component breaks under compilation — usually because it relied on referential identity for a side effect — opt it out file-locally with the `"use no memo"` directive at the very top of the file:

```ts
"use no memo";

import { useState } from 'react';

export function MyComponent() { /* ... */ }
```

This is a per-file escape hatch. The compiler skips that file; everything else still gets memoized. If you have to use this directive, leave a one-line comment explaining why.

## Project Layout

```
src/BorgDock.Tauri/         # Tauri + React application
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

Full spec: `BorgDock-Implementation-Plan.md`

## Syntax highlighting (diff view, file palette, file viewer)

Tree-sitter based. Two moving parts that must stay in sync:

1. **Runtime**: `web-tree-sitter` (dynamic import in `src/services/syntax-highlighter.ts`). Its wasm is served at `/web-tree-sitter.wasm` — do NOT change the `locateFile` callback without also updating `vite.config.ts`. The module exports `Parser` and `Language` as **separate named classes** (no default export, and `Language` is NOT a static member of `Parser` like it was in ≤0.20). `syntax-highlighter.ts` imports both via `const { Parser, Language } = mod`.
2. **Grammars built from source**: every grammar (tsx, ts, js, rust, c_sharp, css, html, json, yaml, toml, sql) is built from its npm source package with the bundled `tree-sitter-cli` and committed to `public/grammars/tree-sitter-<name>.wasm`. Vite serves `public/` at root automatically, so they end up at `/grammars/tree-sitter-<name>.wasm` with no copy plugin. Rebuild everything with `bash scripts/build-grammars.sh`, or a single grammar with `bash scripts/build-grammars.sh tsx`.

**Why build from source instead of the prebuilt `tree-sitter-wasms` package:** its latest release (0.1.13) ships wasms with the *old* `dylink` custom section. `web-tree-sitter` ≥0.24 requires the new `dylink.0` section — otherwise `Language.load()` rejects with `Error: need dylink section` and every language silently becomes plain text. The CLI at the same major version as `web-tree-sitter` emits the new format.

**On Windows**, the tree-sitter CLI downloads wasi-sdk into `%LOCALAPPDATA%/tree-sitter` on first build. The downloaded `.exe` binaries may be marked as "from the internet" — if you see `wasm-ld.exe: Access is denied`, run `Get-ChildItem $env:LOCALAPPDATA\tree-sitter\wasi-sdk\bin\*.exe | Unblock-File`.

The `EXT_TO_GRAMMAR` map in `syntax-highlighter.ts` must only reference grammars that actually exist in `public/grammars/`. Markdown is intentionally absent — the upstream grammar is messy to pin and comes and goes.

If diffs / files show up as plain text with no coloring, check the browser devtools console for `[syntax-highlighter]` warnings — they name the exact grammar and failure. A 404 on `/grammars/tree-sitter-*.wasm` in the network tab usually means someone added a new extension to `EXT_TO_GRAMMAR` without extending `scripts/build-grammars.sh`.

**CSP must include `'wasm-unsafe-eval'` in `script-src`.** The CSP in `src-tauri/tauri.conf.json` (`app.security.csp`) is enforced by WebView2 in packaged builds. `web-tree-sitter` ≥0.24 instantiates grammars via `WebAssembly.compile()` — without `'wasm-unsafe-eval'`, this throws and every `Language.load()` call rejects silently (the highlighter's try/catch swallows it and returns `null`, so the app looks fine but every file renders as plain text). Dev mode doesn't surface this because Vite's dev server doesn't inject the production CSP. If you ever strip the CSP down, keep `'wasm-unsafe-eval'` in `script-src`.

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

## Tauri capabilities are per-window — plugin permissions don't auto-propagate

Each pop-out window (`file-palette`, `workitem-detail`, `pr-detail`, `sql`, etc.) has its own JSON file in `src-tauri/capabilities/`, and Tauri only honors plugin invocations that the **specific window's** capabilities file allows. Registering a plugin globally in `lib.rs::run` and adding it to `Cargo.toml` is necessary but NOT sufficient — the per-window capabilities file must also list `<plugin>:default` (or a tighter allowlist) for that window to call it.

Symptom of the missing grant: `await import('@tauri-apps/plugin-<x>')` resolves fine, but the actual call (e.g. `open(...)`, `save(...)`) rejects with a permission error. If the call site has a `try/catch` that swallows errors with just a `console.error`, the user-facing failure is "button does nothing." Check the devtools console first — the error message names the window and the missing permission.

Existing precedent: when adding a feature that uses `@tauri-apps/plugin-dialog` (or any other plugin), search `src-tauri/capabilities/*.json` for which windows currently have `dialog:default`. If your target window isn't in that list, add it before testing — the dev server has to rebuild Rust after a capabilities edit, so a missed grant burns a full rebuild cycle.

## Spawning Windows CLI wrappers (`az.cmd`, etc.) from Rust

Rust's `std::process::Command::new("az")` on Windows uses `CreateProcessW`, which only auto-appends `.exe` — not `.cmd`, `.bat`, or the rest of `PATHEXT`. Azure CLI ships as `az.cmd` (a batch wrapper around the Python entry point), so bare `"az"` fails with `NotFound` even when `az` works in Windows Terminal, cmd.exe, or PowerShell (those honor `PATHEXT`).

**Rule:** when spawning a CLI tool from Rust on Windows via `hidden_command`/`Command::new`, check whether the tool ships as `.exe` (like `gh.exe`, `git.exe`, `bun.exe`) or as a batch wrapper (`az.cmd`, `npm.cmd`, `yarn.cmd`, most Python-wrapped CLIs). Batch wrappers need the extension spelled out, ideally behind a `cfg!(windows)` guard. See `src-tauri/src/auth/ado.rs::az_program()` for the canonical pattern.

(Bun itself ships as `bun.exe` on Windows, not as a batch wrapper, so spawning bun from Rust uses the bare name without this concern. The rule still applies to npm CLI invocations and any Python-wrapped CLI we spawn.)

## SQL query execution: tiberius panics on unsupported column types

Tiberius (`tiberius = "0.12"`) is not defensive about column types it doesn't know how to decode. When a result row contains a SQL Server **UDT** (`geography`, `geometry`, `hierarchyid`, a CLR type, sometimes `xml` / `sql_variant`), the decoder hits a `todo!()` / `unimplemented!()` inside `tds::codec::type_info` and **panics** rather than returning an error. A wide `SELECT *` against a certain view is the usual way to hit this.

Because this is a panic (not a `Result`), `try_get`-level handling in `row_to_strings` can never catch it — the panic originates deeper, inside `into_results()` decoding.

**Two pieces keep this from killing the app:**

1. **Release profile uses `panic = "unwind"`** (not `abort`) in `src-tauri/Cargo.toml`. With `abort`, neither `catch_unwind` nor `tokio::spawn` can intercept the panic — the process dies before any handler runs. Don't revert this without a replacement strategy.
2. **The query body in `sql::execute_sql_query` runs inside `tokio::spawn`**, and `JoinError::is_panic()` is checked on the handle. The panic payload is downcast to a string and returned as a friendly `Err(String)` suggesting the user avoid `SELECT *`.

If a user reports the SQL window still crashing, check `%APPDATA%\BorgDock\logs\borgdock-panic.log` — the panic hook in `lib.rs::install_panic_hook` does a synchronous, flushed write there (survives even `panic = "abort"`, for diagnosing future crashes that predate the catch).

## `cargo check` / `cargo build` hangs in Git Bash on Windows

Git Bash's MSYS path conversion mangles flags like `-Brepro` (MSVC's deterministic-build flag), parsing them as `-B` followed by a path argument. Symptom: `cc-rs` errors like `"C:/Program" "Files/Git/Brepro-"` during `libsqlite3-sys` build.

Workaround: prefix cargo commands with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`:

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check
```

Or run cargo from cmd.exe / PowerShell where MSYS isn't involved.

## Check for existing patterns before implementing

Before writing a new component, hook, command, store, or utility, search the codebase for something similar that already exists. Reuse it, or extract the shared piece into a reusable abstraction — don't fork a near-duplicate.

Concrete examples:
- New pop-out window? `open_pr_detail_window` / `open_workitem_detail_window` in `src-tauri/src/lib.rs` already encode the main-thread + oneshot pattern. Follow it; don't reinvent.
- New list with filter/sort/group? `WorkItemsSection` and the PR list have done this already — check whether the existing query/store machinery covers your case.
- New keyboard shortcut? Hotkeys are centralized in `src-tauri/src/platform/hotkey.rs` and the frontend's `useHotkeys` plumbing — wire into those, don't add a parallel listener.
- New ADO/GitHub API call? `src/services/ado/client.ts` and the GitHub services already handle auth, retries, and rate limits — extend them instead of opening a raw `fetch`.
- New panel/section in the main window? Check `src/components/work-items/` for the existing section/rail/panel split before introducing a fourth layout primitive.

If a similar thing exists but doesn't quite fit, the right move is usually to extract the shared core (a hook, a util, a base component) and have both the old and new call sites consume it — not to copy-paste-tweak.

When in doubt, grep first, then ask the user "I saw X already does Y — should I extend it or build a separate thing?" before writing code.

## Self-Improvement

Whenever you learn something new that is important to remember, run into the same issue twice, or encounter an issue that might happen again — update this CLAUDE.md so the next session avoids the same pitfalls.
