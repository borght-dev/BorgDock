# Runtime and performance

The main entry starts `startApplicationRuntime()` once. React observes its stores; mounting a screen does not start another integration poller. GitHub, ADO query results and Dispatch have separate refresh interfaces. They share account clients and transport policies. Dispatch's decision engine remains pure.

## Synchronization

- Initialization awaits SQLite readiness, hydrates cached PRs, then uses the normal GitHub refresh pipeline. A cold start awaits that pipeline; a cached start renders immediately and refreshes in the background. Cached data does not advance the successful-refresh timestamp.
- Native cache operations also open the shared database on first use, independently of setup or GitHub sign-in. SQL snippets and schemas remain available before authentication. Repeated initialization retains the existing connection.
- Polling coalesces overlapping callers. Stopped generations cannot publish late results. Explicit refresh bypasses visibility throttling. While all native windows are hidden or minimized, scheduled integration polls run every fourth interval. A stale feed refreshes when a window is revealed.
- Each GitHub account shares four transport slots across repositories and callers. GraphQL summary/check pagination also shares a client budget. Native ADO and T3 requests reuse one pooled HTTP client; authorization remains on each request.
- Dispatch is the only T3 shell poller. Rust caches and broadcasts its local sessions. Main and detail windows subscribe to that cache instead of polling another shell.
- Unchanged entities retain their references. Dispatch skips rebuilding when its inputs and the current minute are unchanged; the minute remains an input because drift rules depend on time. Source-health timestamps update independently of entity data.

## Rendering and syntax

The React Compiler runs through React plugin v6's `reactCompilerPreset` and the separate Babel plugin. It covers components and hooks, excluding tests and stories. Zustand selectors return derived values directly, so the compiler can observe their dependencies. Detail views, secondary sections and Quick Review load on demand.

The production main entry excludes Quick Review, Markdown, CodeMirror and Tree-sitter from its preload graph. The React chunk has higher priority than the optional vendor groups; otherwise dependency capture can put React inside the Markdown chunk and make it eager. This follows [Rolldown's group-priority rules](https://rolldown.rs/reference/TypeAlias.CodeSplittingGroup). Keep optional screens out of eager barrel exports.

PR groups larger than 50 rows use the existing bounded scrolling layout. Keyboard navigation follows every filtered row in group order, including unmounted rows, and skips collapsed groups. Selection scrolls the relevant virtualizer. Small groups retain their transitions.

Highlighting and file-symbol extraction share a module worker. Tree traversal visits each node once. Highlight requests take priority over background symbol requests. The worker keeps grammar/runtime caches and releases per-request parse trees and parsers. Views abort obsolete requests.

The worker admits at most 16 requests, limits a source to approximately 2 MiB of string storage, and resets after a 15-second job timeout. Unsupported, oversized, cancelled or failed requests fall back to plain text or no symbols. No parsing fallback runs on the renderer thread. Packaged CSP explicitly permits the worker and WebAssembly compilation.

## SQL

Results stream through a bounded collector instead of collecting the entire query first. A batch retains at most 10,000 rows, 16 MiB of row/column data including cell overhead, and 100 result sets. Truncation is explicit. Empty result sets keep their column metadata. Excess rows drain without being retained, preserving later statements in the batch; the deadline still bounds execution.

Each run has an ID and a cancellation token. Cancel stops the query task and drops its connection. The overall connection/query task has a 120-second deadline. Blocking settings and credential reads run outside the async executor. The spawned task still catches unsupported-column decoder panics; release builds must retain `panic = "unwind"`.

Cancellation does not undo statements that already completed. Do not describe it as rollback.

## Native contracts and isolated verification

One command registry supplies the production Tauri handler and the test-only Specta exporter. Runtime events use the same serialized DTOs as their generated bindings. `commandData` unwraps typed native errors while preserving their existing values. Generated TypeScript is checked in; editing it manually is not a repair.

`BORGDOCK_DATA_DIR` selects a separate settings/cache/log directory and credential namespace for verification. Without it, existing locations and credential names remain unchanged. Tauri plugin stores follow the application identifier, so use a separate identifier when running a verification build beside the installed app. Never seed plaintext production credentials into fixtures.

## Proof commands

From `src/BorgDock.Tauri`:

```sh
bun run bindings
bun run build
bun run lint
bun run test
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
bunx playwright test tests/e2e/perf.spec.ts tests/e2e/syntax-worker.spec.ts
```

The worker browser test uses the real grammar and worker, including symbol extraction. The list performance test warms the lazy detail module before measuring and asserts that navigation committed inside the measured interval. Native tests cover SQL retention limits, cancellation ownership and generated-contract drift. CI runs native tests on Windows and macOS.

Record native startup, renderer responsiveness, request counts, hidden CPU and peak memory separately. Browser fixtures prove rendering and worker execution; they do not measure production network latency. Compare performance only with the same data, build mode and machine load.

Inspected fixture captures: [dark PR list](proof/virtual-prs-dark.png), [light PR list](proof/virtual-prs-light.png), [running SQL query](proof/sql-running.png). The keyboard test reaches a row absent from the initial virtual viewport, then opens its detail view. The SQL test observes the execution request before cancelling its matching operation ID.

## Verification snapshot, 2026-10-26

- Windows: 3,788 unit tests passed; 174 native tests passed, three ignored. Generated contracts, typecheck, lint and production frontend build passed.
- All 92 browser cases passed across the functional and performance runs. The 200-PR warm navigation median was 87.5 ms (94.1, 83.1, 87.5), within the unchanged 100 ms budget. A real worker highlighted 5,000 TypeScript lines and extracted a function symbol in 450 ms; the renderer heartbeat continued for 86 ticks.
- A packaged Windows debug build with the production frontend ran beside the installed app using a separate identifier and data directory. Native UI inspection verified syntax coloring and `workerDemo` symbol lookup at line 41 under the packaged CSP.
- Native SQL cancellation used a loopback listener that accepted a real TDS connection before Cancel. Cancel closed that connection and displayed the cancellation result. The installed app remained running. The 900 px busy toolbar was then corrected and visually checked in the browser fixture.

These are development-build budget checks on a shared workstation, not a release-build speedup comparison. Native UI screenshots were captured and inspected in the task transcript; the checked-in captures above use synthetic browser fixtures.
