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

## Fresh worktrees: CRLF checkout vs biome's LF requirement

The repo has `core.autocrlf=true` set locally, so a **fresh `git worktree add` checks every file out with CRLF line endings** — while biome (which the lefthook pre-commit runs on staged files) requires LF. The main checkout's files are LF on disk only because they predate the autocrlf setting; a new worktree is CRLF everywhere, so the very first commit touching any file fails the format check with whole-file `␍`-removal diffs. Fix: after editing in a fresh worktree, run `bunx biome check --write <files you touched>` before committing (committed blobs are LF either way — only the working-tree bytes are wrong). Don't mass-format untouched files: that surfaces unrelated pre-existing lint fixes as spurious diffs, and some files on master are not biome-clean, so restoring them afterwards fails the hook. Pass `biome check --write` the files you changed, never a directory. Scripted edits hit the same wall: Python's text mode on Windows writes CRLF, so open files with `newline=''` (biome won't fix CSS, and a CRLF CSS file diffs as a whole-file rewrite).

**Duplicate React:** if a root-hoisted dep (e.g. `lucide-react`) crashes with `Cannot read properties of null (reading 'useContext')`, check `src/BorgDock.Tauri/node_modules/react` — stale pre-workspace copies there make the app and the dep load two Reacts. `bun.lock` has only the root copy; delete the member's `react`, `react-dom`, `scheduler`. Don't paper over it with Vite `dedupe` (vitest externalizes deps, so it doesn't help).

Two other fresh-worktree facts: run `bun install` at the worktree root before anything else (node_modules is per-worktree), and Playwright e2e (`bun run test:e2e`) reuses any server already listening on :1420 (`reuseExistingServer`) — if the main checkout's dev server is running, e2e silently tests the *main checkout's* code, not the worktree's. Stop it first or the results are meaningless. A new Tauri command needs a default in `tests/e2e/helpers/mock-tauri.ts` when anything calls it at boot: an unhandled command logs an error and the boot smoke check fails every e2e test.

If every e2e test hangs on the splash screen (`waitForSelector('[data-app-ready="true"]')` timeout) and the WebServer log shows `ENOENT ... src/BorgDock.Tauri/node_modules/react-dom/index.js`, Vite's pre-bundle cache is stale: `rm -rf src/BorgDock.Tauri/node_modules/.vite/deps`.

## React Compiler escape hatch

The React Compiler runs on application components and hooks through `reactCompilerPreset` and `@rolldown/plugin-babel` in `vite.config.ts`. Tests and stories are excluded. Select derived Zustand values inside the selector, such as `usePrStore(s => s.filteredPrs())`; selecting a stable getter and calling it afterward can leave compiler-memoized results stale. If a specific component breaks under compilation — usually because it relied on referential identity for a side effect — opt it out file-locally with the `"use no memo"` directive at the very top of the file:

```ts
"use no memo";

import { useState } from 'react';

export function MyComponent() { /* ... */ }
```

This is a per-file escape hatch. The compiler skips that file; everything else still gets memoized. If you have to use this directive, leave a one-line comment explaining why.

## Runtime, bindings and performance

GitHub, ADO and T3 synchronization starts from `src/runtime/application-runtime.ts` in `main.tsx`, independently of React mounts. Reuse that ownership when adding a refresh path. PR detail windows subscribe to the native T3 session cache.

After changing Rust command arguments, results or events, run `bun run bindings`. `cargo test --lib` checks that `src/generated/commands.ts` matches the shared command registry. Type reflection is test-only. Keep the existing numeric wire representation unless every caller migrates with it.

When changing polling, syntax workers, SQL limits, virtualization or native profiling, read `docs/performance/runtime.md` at the repository root for the invariants and proof commands.

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

## Syntax highlighting (diff view)

Tree-sitter based. Two moving parts that must stay in sync:

1. **Runtime**: `web-tree-sitter` (dynamic import in `src/services/syntax-highlighter.ts`). Its wasm is served at `/web-tree-sitter.wasm` — do NOT change the `locateFile` callback without also updating `vite.config.ts`. The module exports `Parser` and `Language` as **separate named classes** (no default export, and `Language` is NOT a static member of `Parser` like it was in ≤0.20). `syntax-highlighter.ts` imports both via `const { Parser, Language } = mod`.
2. **Grammars built from source**: every grammar (tsx, ts, js, rust, c_sharp, css, html, json, yaml, toml, sql) is built from its npm source package with the bundled `tree-sitter-cli` and committed to `public/grammars/tree-sitter-<name>.wasm`. Vite serves `public/` at root automatically, so they end up at `/grammars/tree-sitter-<name>.wasm` with no copy plugin. Rebuild everything with `bash scripts/build-grammars.sh`, or a single grammar with `bash scripts/build-grammars.sh tsx`.

**Why build from source instead of the prebuilt `tree-sitter-wasms` package:** its latest release (0.1.13) ships wasms with the *old* `dylink` custom section. `web-tree-sitter` ≥0.24 requires the new `dylink.0` section — otherwise `Language.load()` rejects with `Error: need dylink section` and every language silently becomes plain text. The CLI at the same major version as `web-tree-sitter` emits the new format.

**On Windows**, the tree-sitter CLI downloads wasi-sdk into `%LOCALAPPDATA%/tree-sitter` on first build. The downloaded `.exe` binaries may be marked as "from the internet" — if you see `wasm-ld.exe: Access is denied`, run `Get-ChildItem $env:LOCALAPPDATA\tree-sitter\wasi-sdk\bin\*.exe | Unblock-File`.

The `EXT_TO_GRAMMAR` map in `syntax-highlighter.ts` must only reference grammars that actually exist in `public/grammars/`. Markdown is intentionally absent — the upstream grammar is messy to pin and comes and goes.

If diffs / files show up as plain text with no coloring, check the browser devtools console for `[syntax-highlighter]` warnings — they name the exact grammar and failure. A 404 on `/grammars/tree-sitter-*.wasm` in the network tab usually means someone added a new extension to `EXT_TO_GRAMMAR` without extending `scripts/build-grammars.sh`.

**CSP must include `'wasm-unsafe-eval'` in `script-src`.** The CSP in `src-tauri/tauri.conf.json` (`app.security.csp`) is enforced by WebView2 in packaged builds. `web-tree-sitter` ≥0.24 instantiates grammars via `WebAssembly.compile()` — without `'wasm-unsafe-eval'`, this throws and every `Language.load()` call rejects silently (the highlighter's try/catch swallows it and returns `null`, so the app looks fine but every file renders as plain text). Dev mode doesn't surface this because Vite's dev server doesn't inject the production CSP. If you ever strip the CSP down, keep `'wasm-unsafe-eval'` in `script-src`.

## Tauri sync commands and main-thread operations

Tauri 2 invokes synchronous `#[tauri::command]` functions inline on the **main GUI thread**. Async commands run as tasks. A sync command must never perform file, database, credential-manager, process, or network I/O. Make it `async` and move blocking work into `tokio::task::spawn_blocking`.

Operations that touch a `WebviewWindow`, especially `WebviewWindowBuilder::build()`, `show()`, `hide()`, and `set_position()`, still belong on the main thread. Dispatch them with `run_on_main_thread`, return through a oneshot, and always apply the shared timeout so a stalled GUI thread becomes an error instead of freezing IPC forever.

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
    crate::platform::window::main_thread_result(rx).await
}
```

The command has to be `async` so it can await the bounded oneshot.

**Global shortcut callbacks must queue window actions with `platform::queue_window_action`.** The shortcut plugin holds its map mutex across the callback, and `run_on_main_thread` executes inline when already on the GUI thread. Creating a WebView pumps Windows messages; another shortcut then reenters the same mutex and deadlocks. `DeferredActions` posts from a worker, waits for each GUI action to finish, and coalesces repeated pending actions by window label. The tray's flyout action shares that queue. Keep native window operations on the GUI thread.

## Tauri capabilities are per-window — plugin permissions don't auto-propagate

Each pop-out window (`work-item-palette`, `workitem-detail`, `pr-detail`, `sql`, etc.) has its own JSON file in `src-tauri/capabilities/`, and Tauri only honors plugin invocations that the **specific window's** capabilities file allows. Registering a plugin globally in `lib.rs::run` and adding it to `Cargo.toml` is necessary but NOT sufficient — the per-window capabilities file must also list `<plugin>:default` (or a tighter allowlist) for that window to call it.

Symptom of the missing grant: `await import('@tauri-apps/plugin-<x>')` resolves fine, but the actual call (e.g. `open(...)`, `save(...)`) rejects with a permission error. If the call site has a `try/catch` that swallows errors with just a `console.error`, the user-facing failure is "button does nothing." Check the devtools console first — the error message names the window and the missing permission.

Existing precedent: when adding a feature that uses `@tauri-apps/plugin-dialog` (or any other plugin), search `src-tauri/capabilities/*.json` for which windows currently have `dialog:default`. If your target window isn't in that list, add it before testing — the dev server has to rebuild Rust after a capabilities edit, so a missed grant burns a full rebuild cycle.

## Spawning Windows CLI wrappers (`az.cmd`, etc.) from Rust

Rust's `std::process::Command::new("az")` on Windows uses `CreateProcessW`, which only auto-appends `.exe` — not `.cmd`, `.bat`, or the rest of `PATHEXT`. Azure CLI ships as `az.cmd` (a batch wrapper around the Python entry point), so bare `"az"` fails with `NotFound` even when `az` works in Windows Terminal, cmd.exe, or PowerShell (those honor `PATHEXT`).

**Rule:** when spawning a CLI tool from Rust on Windows via `hidden_command`/`Command::new`, check whether the tool ships as `.exe` (like `gh.exe`, `git.exe`, `bun.exe`) or as a batch wrapper (`az.cmd`, `npm.cmd`, `yarn.cmd`, most Python-wrapped CLIs). Batch wrappers need the extension spelled out, ideally behind a `cfg!(windows)` guard. See `src-tauri/src/auth/ado.rs::az_program()` for the canonical pattern.

(Bun itself ships as `bun.exe` on Windows, not as a batch wrapper, so spawning bun from Rust uses the bare name without this concern. The rule still applies to npm CLI invocations and any Python-wrapped CLI we spawn.)

## SQL query execution: tiberius panics on unsupported column types

Tiberius (`tiberius = "0.12"`) is not defensive about column types it doesn't know how to decode. When a result row contains a SQL Server **UDT** (`geography`, `geometry`, `hierarchyid`, a CLR type, sometimes `xml` / `sql_variant`), the decoder hits a `todo!()` / `unimplemented!()` inside `tds::codec::type_info` and **panics** rather than returning an error. A wide `SELECT *` against a certain view is the usual way to hit this.

Because this is a panic (not a `Result`), `try_get`-level handling in `row_to_strings` can never catch it — the panic originates deeper, inside stream decoding.

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

Don't combine `MSYS_NO_PATHCONV=1` with a Git Bash path in `CARGO_TARGET_DIR` (`/e/BorgDock/...`): cargo gets it literally and builds into `E:\e\BorgDock\...`, and the build scripts record that path. Give a Windows path (`E:/BorgDock/...`) or run cargo from PowerShell.

## T3 Code integration: orchestration protocol 2

Code lives in `src-tauri/src/t3/`: `hosts` (which server, which token), `client` (transport), `shell` (what a host reports, reduced to DTOs), `desktop` (the app on this machine), `commands` (the Tauri commands). The frontend never talks to T3 itself.

- **Reads are HTTP.** `GET {origin}/api/orchestration/shell` and `/api/orchestration/threads/:id/bounded`, with `Authorization: Bearer <token>` and the header `x-t3-orchestration-protocol: 2`. Without the header T3 answers an empty 400. The origin comes from `~/.t3/userdata/server-runtime.json`.
- **Commands are WebSocket only.** There is no HTTP command endpoint. Get a ticket from `POST /api/auth/websocket-ticket`, connect to `/ws?orchestrationProtocol=2&wsTicket=<ticket>`, and send one Effect RPC message per frame: `{"_tag":"Request","id":"1","tag":"orchestration.dispatchCommand","payload":{…},"headers":[]}`. The answer is `{"_tag":"Exit","requestId":"1","exit":{"_tag":"Success","value":…}}`. `headers` must be present (send `[]`) and every command needs a `commandId`. Tags in use: `orchestration.launchThread`, `orchestration.dispatchCommand`, `server.getConfig`.
- **Gone since protocol 1:** `POST /api/orchestration/dispatch`, the `projection_*` tables in `state.sqlite` (T3 writes `statev2.sqlite`), `thread.meta.update` (now `thread.metadata.update`), and `project.create` as a thread command (now `POST /api/projects/mutate`).
- **Status never comes from SQLite.** The shell carries it (`shell::status_of`). The one database read left is the first user message of a thread, from `orchestration_v2_projection_messages` in `statev2.sqlite`, which is indexed by thread.
- **Pairing.** The token sits in the keychain as `borgdock:t3` (remote hosts: `borgdock:t3:<id>`). It lasts 30 days and cannot be refreshed. `t3_pair_local` issues one through T3's own CLI: `ELECTRON_RUN_AS_NODE=1 "<T3 exe>" "<resources>/server.asar/apps/server/dist/bin.mjs" auth session issue --scope orchestration:read --scope orchestration:operate --ttl 30d --json`. The exe is a GUI binary, so read its output through pipes (`Command::output`); a console shows nothing.
- **The desktop app.** The install folder holds one build whose file name carries the channel ("T3 Code (Nightly).exe"); `desktop::executable` finds it. A second launch hands its arguments to the running app, so `"<exe>" t3code://threads/<environmentId>/<threadId>` opens that thread without the `t3code:` scheme being registered. The environment id comes from `GET /.well-known/t3/environment`.
- **Checking against the real T3.** `cargo test --lib t3::commands::tests::live -- --ignored --nocapture` reads the shell, one thread and `server.getConfig`. It is read-only. Set `BORGDOCK_T3_TEST_TOKEN` to use a token other than the stored pairing. Never run launch, respond or settle against a real T3 from a test: they start agents and answer real questions.

T3 is **not** an agent provider for Fix / Resolve / Monitor (those spawn a terminal with a prompt file). The pull request action is "Open a new thread in T3" (`src/services/t3-thread.ts`): other windows hand it to the main window (`OPEN_PR_THREAD_EVENT`), whose `T3PrThreadDialog` picks the environment and where the thread works. "Check out the branch" calls T3's `git.preparePullRequestThread` (mode `worktree`, which reuses a worktree that has the branch) and launches with `existing_worktree`; BorgDock no longer makes the checkout. A row in the worktree palette or the PR's checkout panel opens on that exact path (`openT3Thread`).

**Where an agent starts is one control, `LaunchTarget` (`components/dispatch/LaunchTarget.tsx`, pure parts in `services/dispatch/launch-target.ts`)**, used by the launch, run, Investigate and workstream sheets and the PR dialog. Environment = a configured T3 host; project = one per repository (`repositoryProjects` keeps the shortest checkout of each `repository.key`, so a repository's main checkout wins over projects made for its worktrees); workspace = a new worktree from a branch (`vcs.listRefs`; no base → Rust resolves the default branch) or an existing thread: continue it (`t3_send_message`) or a new thread in its checkout (`existing_worktree`, or `root` when the thread ran in its project's own checkout). Every launch goes through `launchAt`. A continued thread keeps its model and its item link. T3's `worktree` strategy takes `branch` as a *new* branch name; leave it out and T3 names the branch from the first message.

## Dispatch: work items joined with T3 threads

The Dispatch section shows my Azure DevOps items with the T3 threads and pull requests that belong to them. Where things live:

- `src/services/dispatch/engine.ts`: `buildOverview` is pure. Items, threads, pull requests and the queue go in; the overview (bays, suggestions) comes out. Every T3 project's threads count: there are no slots any more. Change behaviour there and test it with `__tests__/fixtures.ts`.
- `sync.ts` polls and writes to `stores/dispatch-store.ts`; `recomputeOverview()` runs after every change to an input and leaves the store alone when nothing changed.
- `hosts.ts` names the T3 servers (`configuredHosts`). Ids from a remote host are prefixed with its id (`scopedId` / `rawId`); always pass T3 the raw id.
- `host-memory.ts` keeps each remote host's open threads and projects in `dispatch-hosts.json`, so an offline host still shows its work after a restart. Recalled entries have `available: false`.
- `actions.ts` and `launch.ts` are the only code that writes to T3 or ADO. UI lives in `components/dispatch/`.

Things that bite:

- **A thread's `place`** is what rows show for where its agent works: its branch when T3 made a worktree for it, else its project's title (`toAgentThread`). The activity journal keeps calling that field `slot` in its own observations.
- **Plan first is an instruction, not T3's plan mode.** Plan mode sticks to the thread and keeps the agent read-only after approval, so `launch.ts` starts in default mode and appends `PLAN_FIRST` to the first message. "Approve plan" sends `GO_AHEAD_MESSAGE` as a normal message, and first switches a thread that is in plan mode back to default.
- **The shell has no messages.** `latestVisibleMessage` is always null. The last agent message and the questions come from the bounded thread snapshot, read only for threads that wait on me (`readDetails`).
- **Notifications wait for a full read.** `notifyNew` records but does not send until ADO and every host have been read once (`everySourceRead`). A new source that is never marked read silences every notification.
- **Up next is the work items track star.** There is no second queue; `dequeue` from the engine untracks an item once an agent picks it up.
- **Subagents are threads in T3's shell** (`lineage.relationshipToParent: "subagent"`, `rootThreadId`). They never settle and report the *checkout's* branch and pull requests, not their own. `toAgentThread` holds them as settled without branch/PRs; `linkThreads` gives the items their conversation names to the root thread. Without that, idle subagents show as "Your turn".
- **BorgDock never changes an ADO state on a button.** Every move (row "Move to X", the state menu, Fix out of sync, Sync) opens the run sheet and starts a T3 thread; a move needs notes and required fields only the repo's skills know. The one direct write left is `stateOnStart` when a thread launches.
- **"Plan Review" sits before "Code Review"** in the Bug, PBI and QI workflows. Never pick a target state by `/review/`; `verdict.ts` `reviewState` asks for Code Review by name.
- **ADO's PR links carry ADO's repository id**, not GitHub's: `vstfs:///GitHub/PullRequest/<id>%2f<number>` (lower-case `%2f` too), and numbers collide across repos. No ADO API maps the id (`githubconnections/{id}/repos` returns only URLs); `linked-prs.ts` learns it from which configured repo's PRs name the linking items, and keeps it in `dispatch-state.json`.
- **A PR linked on several of my items that names none of them is `shared`** (an epic's plan PR on every PBI). It never drives a drift or verdict; without that every PBI of the epic looks ready for QA.
- **Formatting CSS.** `bunx biome check --write` on `work-items-workbench.css` rewraps a rule nobody touched. The pre-commit hook does not check CSS, so revert that hunk instead of committing it.

**States view (the default layout).** One section per ADO state in the order of the morning walk (`walk.ts` `WALK_ORDER`), each row with a verdict, evidence chips and the latest message. Spec: `docs/superpowers/specs/2026-10-13-dispatch-state-walk.md`.

- `verdict.ts` is pure and holds every rule: `verdictOf` (first match wins, in spec order), `evidenceOf`, `latestMessage`. Change a rule there and in the spec table together.
- The latest message is the newest of the item's newest ADO comment, the top block of `Custom.DeveloperNotes` and the agent's last message. A comment that starts `Vera · <kind> —` counts as Vera's, whoever's account posted it. Notes carry only a date, so a comment on the same day wins.
- Comments cost one request per item; `items.ts` reads them again only when `System.ChangedDate` moved (a new comment moves it).
- One pull request can belong to two items (an ADO link, or an `AB#` in its body). The one whose title names the item is that item's own, so it ranks first in `pullRequests`.
- **Sync with agent / Fix out of sync / Sync all / Suggest my next item are runs**: one T3 thread for many items (or none), scoped by `SyncScope` (a state, the items out of sync, every item, one item). `startRun` links the thread to *no* item (`linkThread(id, null)`), or its `AB#` mentions would attach it to one; a run for one item (a move) is linked to that item. Runs persist in `dispatch-state.json`. BorgDock writes no Developer Notes itself; the sync prompt sends the agent to the repo's own skills (`ado-update-for-qa`, `ado-dev-in-progress`, `/ado-fix`).
- **The schedule** (`agents.dispatchSyncSchedule`) runs only while BorgDock is open. `runScheduleIfDue` marks the day *before* it starts, so a failure never runs twice. It starts a new worktree of the last run's repository, in its environment, with its model (`runChoice`); before a run was started by hand it skips.
- The rail's count and the Focus card both use `needingYou` (verdict tone `bad`), not the `waiting` bay.
- The briefing at the top of States (`briefing()` in `walk.ts`) counts every item a fix would take as out of sync, even one that also needs you, so its number matches the Fix button. A sync's progress compares each item's state with `AgentRun.fromStates`, which `startRun` records; runs saved before that field show no progress rather than "0 moved".

## Workstreams: goals across items, threads and pull requests

A workstream is a goal you curate: ADO items, T3 threads, GitHub pull requests and links, the decisions between alternative approaches, the outcomes the goal needs and the evidence behind each. Rules and their reasons: `docs/superpowers/specs/2026-10-26-workstreams.md`.

- `src/services/workstreams/` is pure apart from `actions.ts`, `runs.ts` and `membership.ts`: `edits.ts` (every change, with a log line), `merge.ts` (three-way), `resolve.ts` + `rules.ts` + `attention.ts` (what the sources say now, what verifies, what needs you), `suggest.ts`, `brief.ts` (agent brief and proposals). `src/stores/workstreams-store.ts` holds the documents and writes them; `src/runtime/workstreams-sync.ts` rebuilds the assessments and is the only poller (it lists the folder, nothing else).
- **Files, not plugin-store.** One `<id>.json` per workstream in `%APPDATA%/BorgDock/workstreams/` or `<sync folder>/BorgDock Workstreams/`, written by `src-tauri/src/workstreams/storage.rs` atomically and only over the revision the writer last saw. A malformed file is never written over; a sync client's `<id>-PC.json` copy is merged.
- **Never store source metadata in a workstream.** Titles, states and checks change on every poll; writing them would bump the revision and make two machines conflict all day. The per-device cache (`workstreams-cache.json`) keeps the last seen title.
- **Identity is the `RefKey`**: `gh:github.com/owner/repo#n`, `ado:<org>#id`, `t3:<environmentId>/<threadId>`. A thread is found by its T3 install's environment id (`HostStatus.environmentId`, from `t3_environment`), never by a host label or id.
- **The base moves only when a conflict is resolved.** `entry.base` is the revision both sides shared; keep it during a conflict so a restart merges again instead of writing over the other machine. Undo is a three-way merge too: it takes back its own change, not everything since.
- **Freshness is per reference.** A polled PR is live by its repository's own poll time (`pr-store.repoPolledAt`; a failed repository keeps its old PRs in the list), a looked-up one by `LOOKUP_FRESH_MS`, a context item by `dispatch-store.contextStatus`. The recently closed PR list is read once without reviews or checks, so it never counts as polled. Only live evidence can verify or invalidate an outcome; an agent never verifies one.
- **Context items never change Dispatch.** The engine links them in a pass of their own (`overview.context`); `overview.combinedPullRequests` gives Dispatch items the "shared" flags that count context items too, for the workstreams only. The golden test in `engine-context.test.ts` fails if Dispatch's own overview moves.
- **Rows in the PR list are virtualized at a fixed height.** Anything a row shows extra (workstream chips) goes on an existing line (`TitleWithChips`), never on a new one.
- e2e: `tests/e2e/helpers/mock-tauri.ts` answers every `workstreams_*` command from an in-page folder; an unmocked command throws.

## Related CI failures

Groups the same failure across PRs and the default branch so one investigation covers them. Plan: `docs/superpowers/plans/2026-10-26-related-ci-failures-plan.html`; rules: `docs/superpowers/specs/2026-10-26-related-ci-failures.md`.

- **Raw logs never enter the webview.** `ci_read_job_log` (Rust, `src-tauri/src/ci_failures/`) follows the log redirect by hand, reads only the tail (`Range: bytes=-N`, ring buffer if storage ignores it), sanitizes, extracts signals and returns those. `GitHubClient.readJobLog` holds the account's request slot for the whole read. The CSP's `connect-src` doesn't allow the storage host, so a webview `fetch` of a job log fails in packaged builds.
- **Normalizing and fingerprinting are TypeScript** (`services/ci-failures/`), over the sanitized signals the store keeps. Raise `FINGERPRINT_VERSION` (catalog version included) when a rule changes what matches.
- **One occurrence per job attempt.** GitHub gives a rerun new job ids; history is never edited. A job tests a different SHA than the PR head for `pull_request` (merge commit) and `merge_group` events.
- **Groups own fingerprints; decisions bind fingerprints, not groups**, so a merge or split survives re-clustering and retention. Medium links are candidates and never merge on their own; low-tier (generic) text never groups.
- **A group's dates are failure times, not read times.** `first_observed_at`/`last_observed_at` follow each job's `completed_at` (`FAILED_AT` in `store/queries.rs`), falling back to when BorgDock saw it. With read times, the first backfill made two-day-old failures say "first seen 24 min ago" and a failure from before a fix "seen again after the fix".
- **A rerun reuses the original commit.** A fix on the base branch never reaches a rerun; the Rerun sheet says to update the branch instead.
- **`ci-failures.db` is separate from `prcache.db`.** Clear cache leaves it alone; Maintenance has its own clear. Only the main window's runtime records observations; every window reads, and decisions/claims go through Rust compare-and-set (one live claim per group, unique partial index).
- **Launch seams:** `useClaudeActions.fixWithClaude` calls `guardLaunch`, and every Open in T3 path calls `guardT3Launch` (`services/t3-thread.ts`) first. The guard counts only failures of the PR's current head that haven't passed since. The dialog (`LaunchGuardDialog`, mounted in the main window, the PR pop-out and the worktree palette) opens owners, messages them or opens the Investigate sheet itself and only answers proceed/cancel; in a window without it, `ask()` proceeds instead of hanging. Sheets need Dispatch's T3 data, so other windows ask the main window (`OPEN_CI_SHEET_EVENT`).

## Activity: the journal of what changed

What changed since I last checked, kept until I read or dismiss it (#88). Plan: `docs/superpowers/plans/2026-10-26-activity-digest-plan.md`.

- **Rust owns the journal, TypeScript derives it.** `activity.db` (`src-tauri/src/activity/`) holds the entries, each source's generation, revision and baseline, the read state and the outbox. The adapters in `services/activity/adapters/` hook into reads the app already accepts (Dispatch's `pollHost` and `loadItems`, the GitHub poll's `onResult`, the CI failure store, the workstream recompute, the deployment poller) and hand an observation to `ingest()`, which runs the pure `derive/*` function and sends one `activity_commit`. Only the main window ingests; other windows read with `activity_list` / `activity_counts` and write read state with `activity_mark`.
- **Ids are the dedup.** An entry's id is `${sourceId}|${nativeKey}` (T3 run and request ids, review `databaseId`, CI event ids, deployment status ids), inserted with `INSERT OR IGNORE`. A failed commit leaves the in-memory baseline where it was, so the next observation derives the same entries again without doubling them.
- **Generations and revisions.** `activity_open_source(sourceId, configKey)` bumps the generation when the config key changes (a T3 host's `environmentId`, a repository's resolved login), and a commit from an older generation, or at or below the stored revision, writes nothing. T3 and CI revisions are their own sequences (`{ sequence }`, with sub-revisions for a detail read in the same sequence); one that goes back reseeds the source. Others use the read's start time.
- **The first commit of a generation seeds**: it writes the baseline and adds nothing. An entity seen first after the seed counts only when it was created after it. Only positive observations create completions: a PR that leaves the open list is merged only once `pr-lookup` says so, and a host that went offline creates nothing.
- **Popups come from the outbox only** (`services/activity/policy.ts`, `drainPopups`). Live entries pop up one by one; catch-up commits, rows from before a restart and bursts of more than four become one summary. Don't add `sendOsNotification` calls for events anywhere else; add a category instead. Push rows go to `activity/push.rs`, which posts to the Home Assistant webhook once `platform/idle.rs` says I have been away, and queues a `push-clear` when a pushed entry is read or resolved.
- **Adding a category:** add it to `ACTIVITY_CATEGORIES` (`services/activity/types.ts`), `CATEGORY_GROUP` (`sources.ts`), `CATEGORY_DEFAULTS` (`policy.ts`), `CATEGORY_LABEL` (`labels.ts`), the summary nouns (`copy.ts`) and the icon map (`components/activity/icons.ts`); derive it in the source's `derive/*.ts` with a native key that is stable for the fact, and test that the same observation twice adds nothing.
- **The shared SQLite module** is `src-tauri/src/sqlite_store.rs`: lazy open on a blocking thread, `user_version` migrations, a newer schema opens read-only, a corrupt file is moved aside. `CiStore` and `ActivityDb` both use it; a new store should too. `reset_all_settings` deletes both files.
- **Actions are checked again right before they run** (`services/activity/actions.ts`, `revalidate`). Components pass the store state it reads as the `world` argument; with the React Compiler, a call that reads `getState()` inside render memoizes a stale answer.
- **A list with `role="listbox"` swallows every list key**: `isOverlayOpen()` treats it as an open dropdown. The Activity list is `role="list"`.

## BorgDock for iPhone: the desktop link

Settings → Notifications → "BorgDock for iPhone" links this desktop to the iPhone app's server (contract: borgdock-mobile `shared/src/borgdock.ts`, "Owners, desktop link and read sync").

- **Rust does every request** (`src-tauri/src/phone_link.rs`): the CSP can't reach a server address the user types. The session sits in the keychain as `borgdock:phone-link` (server, token, server name); a pending link's poll secret never leaves Rust. A 401 forgets the session, so Settings shows "Link" again. Every request sends `X-Dispatch-Intent: 1`.
- **Presence** is a Rust task: every 60 s while linked and `phoneLink.shareDesk` is on, `POST /api/presence` with `platform::idle::seconds_since_input()` (Windows and macOS; other platforms send nothing).
- **Read sync** is the main window's `runtime/phone-link-sync.ts`. Out: `activity_read_since` (entries read after a `(readAt, id)` cursor, never roll-ups or `phone` reads) mapped by `services/phone-link/targets.ts`, a moment after `activity-changed`. In: every minute `GET /api/activity/reads` marks matching entries with reason `phone`, which is what keeps them from echoing back. Both cursors live in `localStorage`; a missing cursor starts at now, so linking never uploads history, and turning sharing off forgets them.
- PR keys go out with GitHub's spelling from the entity URL (the journal lower-cases them); threads go out as raw T3 ids and come back as one key per configured host.

## Notes: an Obsidian-style vault

Markdown notes in `<workstreams sync folder>/BorgDock Notes/` (else `%APPDATA%/BorgDock/notes/`), linked to PRs, work items, T3 threads and workstreams. They replaced the File Palette and File Viewer (gone, with symbol extraction and `git/diff.rs`). Rules and decisions: `docs/superpowers/specs/2026-10-28-notes.md`.

- `src-tauri/src/notes/` is the vault on disk: list, batch read, write, rename, trash. `resolve()` refuses anything outside the vault, hidden folders and non-`.md` files. Full-text search is `content_search.rs` (`search_content`) run on the vault folder.
- `src/services/notes/` is pure apart from `chips.ts`, `agents.ts`, `writeback.ts`, `daily.ts`, `decisions.ts`, `vault-line.ts`: `parse.ts` (`scanLine` is the one tokenizer for the index and the editor), `vault-index.ts` (links, backlinks, mentions by `RefKey`, tags, tasks), `text-edits.ts`, `graph.ts`. `src/stores/notes-store.ts` holds the files and writes them; `src/runtime/notes-sync.ts` is the main window's poller, `hooks/useNotesVault.ts` the other windows'.
- **Never write over text you haven't read.** Every write passes `base`, the text last read; Rust compares it with the disk and answers `conflict` with what the file holds. The store keeps the unsaved edit and shows "Changed on disk". Appends (capture, digest, threads, writeback, task ticks) go through `update()`, which reads the file fresh first.
- BorgDock writes text you didn't type only between `<!-- borgdock:… -->` markers (`markerBlock`), and only appends.
- Chips read live state from the stores (`chipView(token, context, sources)`); React components pass the store slices they subscribed to (`RefChip`), the editor's DOM chips are redrawn by `refreshChips` when a store moves. Don't call `chipView` without sources inside render: the React Compiler memoizes a stale answer.
- The quick note window is `note-capture` (`Ctrl+F8`, `note-capture.html`). PR and work item detail remember what they show in `localStorage` (`rememberCaptureContext`), which is how a capture in another window links it.
- Every agent prompt BorgDock writes gets the vault line (`withVault`): Dispatch launches go through `launchInSlot`, Fix / Resolve / Monitor through `withNotesFor`.
- e2e: `tests/e2e/helpers/mock-tauri.ts` answers every `notes_*` command from `window.__notes`; seed it with `page.addInitScript` before `bootApp`.

## Floating surfaces need an opaque token

In the light theme `--color-surface-raised` is a 3% ink tint (`rgba(23,24,28,0.03)`), not a surface; only the dark theme makes it opaque. Anything that floats over content (toasts, menus, popovers) must use `--color-modal-bg` or `--color-toast-bg`, or it renders see-through in light mode and its text lands on whatever is underneath. The Dispatch "started" toast and the state menu both had this bug. The window background (`--color-background`) is white in light mode: grey read as disabled.

The marketing site keeps a copy of the app's tokens. After adding or changing one in `src/styles/index.css`, run `bun scripts/site-tokens-check.ts --write` from the repo root, or CI's site build fails with "tokens.css has drifted".

Storybook ignores `src-tauri/**` in its watcher (`.storybook/main.ts`). Without that, a `cargo build` running at the same time crashes it with `EBUSY` on a locked file in `target/`.

## Diagnosing a hung / frozen BorgDock (AppHang)

Start with `grep responsiveness` in `%APPDATA%\BorgDock\logs\borgdock.log`. The watchdog (`platform/responsiveness.rs`, renderer half `src/services/responsiveness.ts`) writes:

| Line | Meaning |
|---|---|
| `GUI thread blocked for Ns` / `responsive again after Ns` | Rust's main thread missed a ping: a native deadlock, a sync command, or a huge IPC body being parsed |
| `window 'x' renderer silent for Ns, last input: …` | that window's JS stopped beating while the GUI thread was fine; names the last click or key |
| `long frame` / `slow interaction` (`[responsiveness:<window>]`) | renderer jank after the fact: the scripts that ran (LoAF), or the clicked element |
| `private memory jumped A -> B MiB in one second` | a giant allocation in `borgdock.exe` |
| `whole process paused for Ns` | system sleep, debugger, or machine-wide starvation; not a BorgDock bug |
| `window 'x': renderer process unresponsive` / `GPU process exited` (…) | WebView2's own `ProcessFailed` verdict |

`renderer stats` and the watchdog's resource line (every 10 min) give the heap, private-bytes and handle trend for leaks over uptime.

**IPC bodies are parsed on the GUI thread.** On 2026-10-28 (4.7.2) every poll cycle sent the whole ETag cache (~450 MB of GitHub response bodies) through `cache_save_etags`; the webview spiked to 10 GB, `borgdock.exe` to 6 GB, and the window froze every ~70 s. Send deltas over IPC, never a whole cache, and cap anything persisted (`ETAG_ROWS_KEPT`, 500 rows).

`window.__TAURI_INTERNALS__.invoke` is read-only (`Object.defineProperty`): assigning to it throws and the window never boots. The e2e mock (`tests/e2e/helpers/mock-tauri.ts`) was writable and hid this; it is read-only now, but check anything touching Tauri internals in a real build.

Older pattern (2026-09-08, 2.2.0): webview lines stop dead while Rust-side `worktree cache refreshed` lines keep coming, then Windows reports `AppHangTransient` for `borgdock.exe` in the Application event log (Event 1001). Things to know before chasing a hang:

- **Log timestamps are UTC**; WER / event-log / file mtimes are local time. Convert before correlating.
- `borgdock-panic.log` only covers panics, never hangs. WER keeps no dump for transient hangs, and `[profile.release] strip = true` means a post-hoc dump would show borgdock frames as module+offset only.
- **To catch the next one**, run `pwsh -File src/BorgDock.Tauri/scripts/diag/hang-watchdog.ps1` and leave it open. It triggers on `Process.Responding = false` (its stale-log trigger rarely fires now: the watchdog keeps writing during a freeze), attaches `cdb` non-invasively, and writes `logs\hang-<stamp>.txt` (all thread stacks, OS/WebView2 frames symbolized) plus a full minidump. Read thread 0 (main) first: a wait inside `EmbeddedBrowserWebView.dll` means WebView2, a wait under a `borgdock` frame means a Rust-side Mutex/oneshot deadlock (see "Tauri sync commands and main-thread operations").
- For symbolized borgdock frames, build a local release with `strip = false` and `debug = 1` temporarily (don't commit) and run that instead of the installed exe.

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

## Release notes, What's New, and hero screenshots

`/CHANGELOG.md` (repo root) is the single source of truth. The Vite changelog plugin (`scripts/changelog/`) parses it on `bun run dev`/`build` and generates `src/generated/changelog.ts`, which feeds the in-app **What's new?** window. Format: `## X.Y.Z — YYYY-MM-DD`, then `### New Features` / `### Improvements` / `### Bug Fixes`. A `- **Title** — desc` bullet becomes a highlight (and **must** have a hero image — `bun scripts/changelog/validate-release.ts <version>` fails otherwise); a plain `- ` bullet under Bug Fixes becomes an "Also fixed" line.

Hero images are **real screenshots captured from Storybook**, written large (not the old 74px banner). To produce a release's heroes:
1. Author `design/whats-new/<version>.heroes.json` — `[{ slug, storyId, viewport?, theme?, delay?, selector?, seedIdle?, emit? }]`. Get story ids from `http://localhost:6006/index.json`.
2. `node_modules/.bin/storybook dev -p 6006 --no-open`, then `node scripts/screenshot-stories.mjs <version>` → `docs/whats-new/<version>/<slug>.png` (2×, forced dark theme). Reference them as `![alt](whats-new/<version>/<slug>.png)`.
3. `bun run build` regenerates `changelog.ts` and copies `docs/whats-new/*` → `public/whats-new/*`.

Voice: emulate the Home Assistant release blog — benefit-first, "you", per-feature, not root-cause engineering prose. The marketing site's `site/src/pages/changelog.astro` parses `/CHANGELOG.md` at build time, and `site/src/pages/whats-new/[version].astro` builds a post for every release with a highlight from the same entry and its hero images in `docs/whats-new/` (a hand-written `whats-new/<v>.astro` replaces it). So a release reaches the site's changelog and posts with no extra step; new *surfaces* still need entries in `design/site/screens.json` / `recordings.json` and a `bun run site:assets` (see `site/README.md`). A feature that changes or removes behaviour also needs the site checked by hand: nothing fails when `site/src/pages/*.astro`, the manifests' `alt` text or a recording's `steps` still describe the old UI (slots stayed on the site after 4.9.0 removed them, and a recording clicked a slot that no longer existed). Grep them for the old vocabulary. The main window (Focus / PRs / Work Items) Storybook catalog is `src/components/layout/MainWindow.stories.tsx`.

A story or meta that sets `globals: { theme: 'dark' }` ignores `globals=theme:light` in the iframe URL; capture light mode from a `…Light` story (`SharedFailuresLight`, `LongTitlesLight`). In a worktree the Storybook binary is hoisted to the repo root: `../../node_modules/.bin/storybook.exe dev -p 6007 --no-open`.

Capturing from Storybook in a fresh worktree: `src/BorgDock.Tauri/public/whats-new/` is gitignored and filled by the build, and Vite serves only the public files that existed when Storybook started. Stories that show description images (`pr-detail-overviewtab--description-with-screenshots`) then render "Image could not load". Copy `docs/whats-new` there (or run `bun run build`) *before* starting Storybook. The first visit to each story compiles on demand, so a cold Storybook times out some `page.goto` calls in the capture scripts; rerun the failed slugs with `--only`.

## Tooltips for cut-off text

`HoverPopover` with `variant="tooltip"` and `when={isTextClipped}` explains text cut off with an ellipsis: it opens after 300 ms, only while the trigger's `[data-clip]` element is actually clipped. Drop the native `title` where you add one. A nowrap ellipsis span's min-content is its full text, so a flex item holding one never shrinks below that unless it has an explicit `min-width` (see `.bd-ci-marker-slot`).

## Hover cards: AB# references and PR check bars

`HoverPopover variant="card"` has no chrome of its own: the content draws the card (`styles/hover-cards.css`), the wrapper `.bd-hover-card` pins the header and footer and scrolls only `.bd-hover-card__scroll`, so a card's actions never scroll away. Designs: `design/work-item-hover/mockups.html`, `design/check-hover/mockups.html`; stories `Work Items/Hover card` and `PR/Checks hover card` (the `In…` stories hover the real trigger).

- **AB# references.** `Markdown` turns plain `AB#123` into a link (`rehypeWorkItemRefs`, after `rehype-raw` so raw HTML counts; href `#bd-ab-123`; rehype-sanitize may prefix it `#user-content-`) and renders any link to `/_workitems/edit/<id>` as `WorkItemRef`. `WorkItemPreview` is lazy inside `WorkItemRef`: a static import closes the cycle Markdown → WorkItemRef → WorkItemPreview → detail panel → Markdown, and `PrDetailView`'s import hangs in tests. The card reads through `useWorkItemPeek` (link-store cache, one request per id) only when it opens.
- **Checks card.** `PrRow` passes `checksCard` to `PrRowCore`; the check bar then takes its own click (opens the PR on its Checks tab). The reason per failed job comes from the CI failure store (`usePrCiFailures`, signals of the job's occurrence); `checks-card-data.ts` is pure. With related CI failures off no log is read, and the card says so.
- **e2e.** ADO reads go through the mocked `ado_fetch` command, not the network: route them there. Mock handlers are serialized into the page, so a handler function can't use variables from the spec. The first spec against a cold dev server can take 20 s+ to open a detail view (lazy chunks compile); run against a warm server before reading a timeout as a bug.

## Vitest: a hook that returns a function

`beforeEach(() => someMock.mockReset())` returns the mock, and Vitest runs a function returned from `beforeEach` as that test's teardown. A mock that later rejects then fails the test with its own error after every assertion passed. Give hooks a block body: `beforeEach(() => { someMock.mockReset(); })`. The same goes for `onTestFinished`.

## Quick Review approvals wait for Undo

Approve (card, walk, composer) moves the deck on at once and posts the review only when its Undo toast runs out (`components/focus/quick-review-approval.ts`, `APPROVAL_UNDO_MS`); GitHub cannot take a review back. A test that expects `submitReview` after an approval must run the toast out first (`sendHeldApproval()` in `QuickReviewOverlay.test.tsx`), and e2e specs `expect.poll` the posted review with a timeout above 5 s. A refused approval brings the PR back with the error (`reopen`). Request changes and Comment still post immediately.

The walk's design reference is `design/quick-review-v2/mockups.html`; the stories `WalkWithProof`, `AllFilesReviewed` and `ReReviewSinceLastReview` render its three frames.

## Self-Improvement

Whenever you learn something new that is important to remember, run into the same issue twice, or encounter an issue that might happen again — update this CLAUDE.md so the next session avoids the same pitfalls.
