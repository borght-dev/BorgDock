# Playwright e2e Rework — Design

**Status:** Spec. Plan + implementation follow on this branch (`playwright-e2e-rework`).
**Branch base:** `origin/master`.
**Companion docs:** none — this PR is self-contained. The screenshot-pipeline spec (`2026-05-08-screenshot-pipeline-design.md`) is the right place for *visual* coverage; this spec stays out of that lane.

## Intro

The Playwright e2e suite is permanently red. `bun run test:e2e` fails by design: `tests/e2e/visual.spec.ts` was authored as a "progress tracker" for an in-flight design-migration PR train (`streamline-pr00` → `pr09`) that never landed, and its 62 committed PNG baselines target a vendored design canvas (`tests/e2e/design-bundle/`) that no longer represents the real app. The supporting infrastructure — dual-OS Chromium projects (`webview-mac` / `webview-win`), a second `webServer` running `http-server` on :1421 to serve Babel-transformed JSX, the snapshot-path tuple convention, the `capture-design-baselines.spec.ts` capture/consume split — exists to support that one spec. The 22 behavioral specs sitting alongside it inherit all the scaffolding and the always-red status.

The `playwright` job in `.github/workflows/test.yml` carries `continue-on-error: true` to keep the CI summary unblocked.

This spec replaces the suite outright with a small, behavior-first set of specs that gates merges.

## Why

- **CI signal is dead.** A constantly-red job is indistinguishable from a real regression. The team has stopped looking at it.
- **The visual-diff scaffolding has moved on.** Phase 1–12 of the Storybook catalog is the source of truth for visual review. The screenshot-pipeline spec covers PNG generation. Pixel diffing in Playwright duplicates work that belongs in Storybook + Chromatic-style tooling, and that follow-up is explicitly out of scope of this PR.
- **The behavioral specs are unverifiable.** They share infrastructure with the visual specs, so we can't tell whether they pass or fail on their own merits. Burning down and rebuilding small is faster than auditing 2720 lines of test code that was never green together.
- **CI gating requires rock-solid determinism.** The current shape (dual-OS matrix, two webservers, design-bundle Babel/JSX harness) has multiple flake surfaces. A slimmer config with one webserver, one project, fully-mocked IPC, and pinned clock/animations is straightforwardly gateable.

## Non-goals

- **Visual regression testing.** Pixel-diff coverage moves to Storybook (existing) and the screenshot-pipeline (separate spec). This suite asserts behavior; the lightweight render smoke is a *render* check (page mounted, no console errors), not a pixel check.
- **Real Tauri WebView driving.** Continuing the existing pattern: Playwright's bundled Chromium against `bun run dev` (pure Vite), with Tauri IPC mocked in-page. Driving the packaged Tauri build via WebDriver remains out of scope.
- **Notifications, performance budgets, motion-reduce tests.** The legacy specs covering these were either flaky-by-nature (perf budgets), Playwright-unobservable (OS toasts), or tied to the design canvas (motion). They drop. Vitest covers the schedulable logic.
- **Cross-OS coverage.** Single Linux runner on CI. macOS-specific behavior is exercised by the developer locally; OS chrome differences are out of scope (BorgDock paints its own chrome inside React).
- **Migration / dual-running.** Hard cutover. The old specs and infrastructure are deleted in this PR; the new ones land in the same PR. No incremental migration window.
- **Backfilling all current behavior.** The new suite covers eight focused flows. Coverage gaps are filed as follow-ups, not patched in this PR.

## Constraints

- **Behavior + lightweight render smoke.** Every spec asserts user-visible behavior. A shared `renderSmoke()` helper runs in `beforeEach` (and as the body of `smoke.spec.ts`) to fail-fast on broken renders, console errors, or unhandled rejections.
- **Single source of state.** The frontend gets seeded via one `seedAppState(page, scenario)` helper. Tauri IPC gets mocked via one `mock-tauri.ts` chokepoint. Specs do not reach around either.
- **Pinned determinism.** Clock frozen at `2026-05-08T10:00:00Z` via init script. Animations and transitions disabled via global CSS injection. Fonts: rely on `system-ui` fallback chain — no test asserts pixel-level layout, so cross-host font deltas don't matter.
- **No real network.** Tests don't talk to GitHub, Azure DevOps, or any remote. The IPC mock is the only data source. A `page.route('**/*', route => route.continue())` pattern catches anything that escapes — actual external requests fail the test.
- **One project, one worker, one webserver.** `chromium` project, `workers: 1` (preserved — shared Zustand store across tests would race with parallelism), `bun run dev` only. The legacy `webview-mac`/`webview-win` split and the http-server :1421 design-bundle webserver are deleted.
- **CI-gated.** `.github/workflows/test.yml` `playwright` job flips `continue-on-error: false` and runs on `ubuntu-latest` only.

## Architecture

### What gets deleted

- `tests/e2e/visual.spec.ts` — visual-diff progress tracker (252 lines).
- `tests/e2e/scripts/capture-design-baselines.spec.ts` — baseline capture spec.
- `tests/e2e/visual-tolerances.ts` — per-surface tolerance table.
- `tests/e2e/__screenshots__/` — 62 PNGs, ~4.8 MB committed baselines.
- `tests/e2e/design-bundle/` — vendored design canvas (Babel/JSX HTML).
- `tests/e2e/scripts/` — directory itself, empty after capture spec removal.
- All 22 existing behavioral `*.spec.ts` files. Listed by name so the diff is unambiguous: `diff-viewer`, `file-palette`, `file-viewer`, `flyout`, `focus`, `keyboard-nav`, `motion`, `notifications`, `performance`, `pr-context-menu`, `pr-detail`, `pr-list`, `settings`, `setup-wizard`, `sql`, `theme`, `tray-first`, `whats-new`, `window-rendering`, `work-items`, `worktree-changes`, `worktree-palette`.
- `tests/e2e/perf-budgets.ts` — perf-budget shared module (used by `performance.spec.ts`).
- `tests/e2e/fixtures/__tests__/` — vitest tests living under the Playwright tree only because `testMatch: /.*\.spec\.ts$/` excludes them. They move to `src/test/__tests__/` (or wherever colocated vitest tests already live for the closest production code).
- `package.json` script `test:e2e:capture-design`.
- `package.json` script `screenshot-heroes` if present (defensive — unrelated to this spec but trips the same workflow if it lingers).

### What gets rebuilt

- `tests/e2e/playwright.config.ts` — slimmed (single project, single webserver, no snapshot-path template, no `testMatch` workaround).
- `tests/e2e/helpers/` — four files, fresh:
  - `mock-tauri.ts` — single chokepoint for Tauri IPC stubbing.
  - `seed.ts` — `seedAppState(page, scenario)` with six built-in scenarios.
  - `render-smoke.ts` — `renderSmoke(page, opts?)` helper.
  - `test-utils.ts` — `bootApp(page, entry, scenario)`, `pressHotkey()`, `waitForInvoke()`, `freezeClockTo()`. ~80 lines.
- `tests/e2e/fixtures/design-fixtures.ts` — kept as inert mock data only if any new spec consumes it; otherwise deleted in the same sweep. Decision deferred to implementation: if `seed.ts`'s named scenarios cover everything, fixtures file goes away.

### What gets added

Eight new spec files under `tests/e2e/`:

| Spec | Asserts |
|---|---|
| `smoke.spec.ts` | Per-window: page reaches DOMContentLoaded, no console errors, no unhandled rejections, app root mounted (`[data-app-ready]`). Iterates the entries from `vite.config.ts:rollupOptions.input` so adding a window auto-tests. |
| `pr-list.spec.ts` | List renders seeded PRs; group/sort/filter chips toggle visible items; click opens PR detail (asserts `open_pr_detail_window` IPC payload, doesn't open a real window). |
| `pr-detail.spec.ts` | Detail tabs (Overview, Files, Checks, Comments) switch; merged-state banner shows for merged PR; failing-check expansion shows log slice. Drives `pr-detail.html` directly. |
| `work-items.spec.ts` | 3-pane: rail selection updates list; list selection updates detail; palette open / search / select round-trip. |
| `palettes.spec.ts` | File palette + work-item palette: hotkey opens, type-to-filter narrows, Enter triggers expected IPC, Esc closes. Covers focus-trap behavior. |
| `settings.spec.ts` | Settings flyout opens; theme toggle persists across reload; auth-status indicators reflect mocked GitHub/ADO state. No real OAuth. |
| `hotkeys.spec.ts` | Global hotkey toggles flyout (asserts `toggle_flyout` IPC fires); Esc dismisses flyout; palette focus-trap. |
| `setup-wizard.spec.ts` | First-run state (no settings on disk) lands on wizard; happy path through GitHub-token + ADO-org steps closes wizard and reveals main window. |

Total expected size: ~700–900 lines across all eight specs, vs. today's 2720.

### Helpers

#### `mock-tauri.ts` — IPC chokepoint

Loaded via `page.addInitScript` before any app code runs. Stubs `window.__TAURI_INTERNALS__` and `window.__TAURI__` so the frontend's `invoke()` and `listen()` resolve against a recorded call log instead of crossing IPC.

```ts
export interface MockTauri {
  /** Last N invoke calls in order. Tests assert against this. */
  invokeLog: { cmd: string; args: unknown }[];
  /** Per-command response handlers. Default returns undefined. */
  setHandler<T>(cmd: string, handler: (args: unknown) => T | Promise<T>): void;
  /** Emit a Tauri event into the page (for mocked listen() consumers). */
  emit(event: string, payload: unknown): void;
}

declare global {
  interface Window { __mockTauri?: MockTauri }
}
```

Mocked command surface for the eight specs (~25 commands; adding a 9th spec usually adds 1–3):

```
load_settings, save_settings, get_window_geometry, set_window_geometry,
list_prs, get_pr_detail, list_check_runs, get_pr_log_slice,
list_work_items, get_work_item_detail, search_work_items,
list_files_in_root, list_changed_files, get_file_contents,
toggle_flyout, set_badge_visible, resize_badge,
open_pr_detail_window, open_workitem_detail_window, open_file_palette_window,
github_auth_status, ado_auth_status,
list_worktrees, list_recent_changes
```

The exact set is verified during implementation by grepping `invoke<` and `invoke(` calls in `src/` — anything reachable from a tested flow gets a stub. Anything not reachable gets a default-to-error stub so accidental coverage gaps surface loudly.

#### `seed.ts` — state injection

One function: `seedAppState(page, scenario)`. Six built-in scenarios:

```ts
type Scenario =
  | 'empty'                  // no auth, no data — wizard appears
  | 'happy-path'             // both providers authed, mixed PRs + work items
  | 'failing-checks'         // authed, PRs with red checks
  | 'merged-pr-celebration'  // authed, single PR in just-merged state
  | 'palette-loaded'         // authed, large file index for filtering
  | 'first-run'              // no settings on disk
```

Specs override fields ad-hoc when a custom variant is needed.

#### `render-smoke.ts` — render check

```ts
export async function renderSmoke(page: Page, opts?: {
  /** Allowlist console.error patterns — narrow exceptions only. */
  allowConsoleErrors?: RegExp[];
}): Promise<void>;
```

Subscribes to `page.on('console')` and `page.on('pageerror')` from test setup; waits for `[data-app-ready]`; asserts captured arrays are empty (modulo the allowlist).

`[data-app-ready]` is added to each window's root component during implementation — one attribute per `App.tsx` (or window equivalent), set after the initial settings/IPC roundtrip resolves.

#### `test-utils.ts` — small utilities

- `bootApp(page, entry, scenario)` — composes init scripts (`installMockTauri`, `freezeClockTo`), navigates to `/<entry>.html`, calls `seedAppState`, then `renderSmoke`. Every spec uses this.
- `pressHotkey(page, 'Mod+P')` — synthesizes the keyboard event, handling `Mod` → `Meta` (mac) / `Control` (linux/win) on the test runner OS.
- `waitForInvoke(page, cmd, timeout?)` — promise resolves when the named command lands in `invokeLog`.
- `freezeClockTo(iso: string)` — `addInitScript` payload that overrides `Date.now`, `new Date()`, and `performance.now()`.

### Boot order

Every test, every spec:

```
1. await page.addInitScript(installMockTauri)        // before any app JS
2. await page.addInitScript(freezeClockTo(...))      // pinned date
3. await page.goto('/<entry>.html')                  // app boots, IPC mocked
4. await seedAppState(page, scenario)                // post-mount seed
5. await renderSmoke(page)                           // assert clean render
6. ...spec-specific assertions
```

`bootApp(page, entry, scenario)` wraps steps 1–5.

## Determinism

| Concern | Mitigation |
|---|---|
| Clock | Frozen at `2026-05-08T10:00:00Z` via init-script `Date` override. |
| Animations | Global CSS injected in test setup: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }`. |
| Fonts | System-ui fallback only; no spec asserts pixel layout. CI runs on `ubuntu-latest` with the runner's default fonts; specs assert text content, not rendering. |
| Network | All Tauri IPC mocked. A `page.route('**/*', ...)` rule allows localhost only; non-localhost requests fail the test. |
| Concurrency | `workers: 1` (preserved from current config — shared Zustand store + `__borgdock_test_seed` would race). |
| Retries | `retries: 2` on CI, `0` locally. |
| Timeout | `timeout: 30_000` per test (preserved). |
| Reporter | `'list'` locally, `[['github'], ['html']]` on CI. |

## CI wiring

`.github/workflows/test.yml`, `playwright` job:

- `runs-on: ubuntu-latest` (was `macos-latest + windows-latest` matrix).
- Drop the `matrix` block entirely.
- `continue-on-error: false` (was `true` — this is the gating flip).
- Drop the `--project=` flag from `bun run test:e2e` (single project named `chromium`).
- Keep `bunx playwright install chromium --with-deps` step.
- Keep `playwright-report` and `test-results` upload-artifact steps with `if: failure()`.
- Rename artifact names to drop the OS suffix (`playwright-report-${{ matrix.os }}` → `playwright-report`).
- Keep the `concurrency` group at the workflow level (already correct).

Vitest job stays as-is on the existing `[macos-latest, windows-latest]` matrix — vitest is unit-level and OS coverage there has independent value. Only the playwright job collapses to Linux-single.

## Tauri side: `[data-app-ready]` attribute

Every window root component needs to set `data-app-ready="true"` on its root DOM element after its initial settings/IPC roundtrip resolves. The implementation lands as small per-component edits in `src/components/<window>/<Window>App.tsx` and `src/App.tsx` for the main window. The attribute is a no-op for production (it's just on a div); test-only consumers wait for it via `renderSmoke`.

This is the only production-code change in this PR. Everything else is test-side.

## Tooling

- `@playwright/test` — already a dev dependency.
- No new dependencies. `serve-handler` (referenced by the screenshot-pipeline spec) is irrelevant here.
- `bun run test:e2e` continues to be the entry command.

## Risks

1. **`[data-app-ready]` placement is wrong.** If the attribute lands before the initial IPC roundtrip resolves, `renderSmoke` returns early and tests proceed against half-mounted UI, leading to flaky failures further down each spec. Mitigation: each window's `App.tsx` sets the attribute inside the same `useEffect` that resolves the first `load_settings` (or equivalent) call — colocated, hard to drift. Implementation reviews this placement window-by-window.
2. **IPC mock surface drift.** Production code adds a new `invoke()` call, the mock doesn't stub it, the test silently misses coverage. Mitigation: `mock-tauri.ts` defaults unknown commands to throwing — the test fails loudly with the missing command name, not silently. New commands force a mock update.
3. **Console-error allowlist creep.** Devs hit a console error, slap an `allowConsoleErrors` regex in their test, regression accumulates. Mitigation: `allowConsoleErrors` is per-call; specs document the regex inline and the implementation reviews any allowlist as a code-review red flag.
4. **CI-only flakes.** A test passes locally but flakes on Linux (different fonts, different scroll quirks). Mitigation: run the suite three consecutive times on a draft PR before flipping `continue-on-error: false` in the same PR. If any of the three runs fails, debug before merging.
5. **The 22 deleted specs covered something we'll miss.** Inventory the deletions and explicitly file follow-ups for any flow we want covered later. This spec doesn't promise feature parity — it promises a green, gating, behavior-first baseline.
6. **`workers: 1` is slow as the suite grows.** Acceptable at 8 specs. If the suite grows past ~20 specs and CI runtime crosses 5 minutes, revisit by isolating tests that don't seed shared state and parallelizing those.

## Acceptance

- [ ] `bun run test:e2e` is green locally on macOS, three consecutive runs.
- [ ] CI `playwright` job is green on a draft PR, three consecutive runs.
- [ ] `.github/workflows/test.yml` `playwright` job: `runs-on: ubuntu-latest`, no matrix, `continue-on-error: false`.
- [ ] `tests/e2e/` contains exactly: `playwright.config.ts`, eight `*.spec.ts` files (smoke, pr-list, pr-detail, work-items, palettes, settings, hotkeys, setup-wizard), `helpers/` (four files), and any kept fixtures. Nothing else.
- [ ] `tests/e2e/__screenshots__/`, `tests/e2e/design-bundle/`, `tests/e2e/scripts/` all deleted.
- [ ] Eight specs total: ~700–900 LOC, vs. baseline 2720.
- [ ] `playwright.config.ts`: one project (`chromium`), one webserver (`bun run dev`), no `testMatch` workaround, no `snapshotPathTemplate`.
- [ ] `[data-app-ready]` lands on each window's root component, set after the first IPC roundtrip resolves.
- [ ] No new runtime dependencies. `package.json` deltas are limited to script removals.
- [ ] PR description lists deleted specs and links a follow-up issue for any coverage gap reviewers flag.
- [ ] PR opened from `playwright-e2e-rework` branch via the personal `gh` account; switched back to enterprise after.

## What comes next

1. **Plan**: `docs/superpowers/plans/2026-05-08-playwright-e2e-rework.md` generated by the writing-plans skill.
2. **Implementation**: subagent-driven-development executes the plan task by task on this branch.
3. **Follow-up issues** for any deleted-spec coverage the team wants restored — filed as part of the PR review, not gating it.
4. **Visual regression** lands separately via the screenshot-pipeline spec; that spec is independent and untouched by this work.
