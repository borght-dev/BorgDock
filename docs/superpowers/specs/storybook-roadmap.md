# Storybook Rollout Roadmap

**Status:** living document. Updated as each screen lands.
**Owner:** see `~/.claude/CLAUDE.md` for who's driving the work.

## Why this exists

Storybook is being rolled out across BorgDock one window at a time, not as a single
big-bang spec. This document is the *index* — it tracks every window, what's
been done, what's planned, and the cross-cutting decisions that should stay
consistent across phases. Each screen still gets its own focused spec under
`docs/superpowers/specs/YYYY-MM-DD-storybook-phaseN-<screen>-design.md`.

## Goals (recap)

1. **Faster isolated dev** — work on a screen without `tauri dev` / Rust rebuilds / live data.
2. **Visual catalog / design docs** — browsable showcase of every window state.
3. **Visual regression** — eventually supplement the per-OS Playwright screenshots.
4. **Hero shots / marketing** — replace ad-hoc state-posing in `screenshot-heroes.mjs`.

All four are in scope long-term. Each phase is judged against (1) and (2) only;
(3) and (4) are sequenced as their own phases once the catalog is broad enough.

## Locked decisions (cross-cutting — don't redebate per screen)

- **Storybook 9 + `@storybook/react-vite` + `@storybook/addon-themes`.** No webpack, no MDX-only docs, no separate CSS pipeline.
- **Tailwind v4 via `@tailwindcss/vite`** in `.storybook/main.ts viteFinal`. CSS entry is `src/styles/index.css` (loaded once in `preview.ts`).
- **Tauri mock layer is decorator-only.** Production code stays byte-identical. Vite alias rewrites at `.storybook/main.ts` swap `@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/plugin-opener`, `@/services/windows` to mocks under `.storybook/mocks/`. Add new aliases here as new windows pull in new Tauri plugins.
- **Control surface lives on `window.__borgdock_storybook_tauri`** (`getControl()` from `.storybook/mocks/control.ts`). Stories drive state via:
  1. Existing dev-only `window.__borgdock_test_*_seed` hooks where they exist (FlyoutApp pattern).
  2. Mock event channels (`getControl().emit(channel, payload)`) for events the production code listens to via `@tauri-apps/api/event`.
  3. Canned `invoke` responses (`getControl().invokeResponses['<command>'] = …`) for windows that fetch initial data via `invoke`.
- **Theme is a global Storybook toolbar**, not duplicated per story. Toolbar handler mirrors each window's `applyTheme()`.
- **Per-screen spec format:** intro / why / non-goals / constraints / architecture / story catalog / tooling / risks / acceptance / what comes next. Same shape every time.
- **Per-screen plan format:** task-by-task, full code blocks, literal commit messages. Each task ≤ ~5 minutes for an implementer.
- **Branch + PR per screen.** Branch name `storybook-phase<N>-<screen>`. PR title `storybook phase <N>: <screen> catalog`. Personal-account `gh` switch protocol per `~/.claude/CLAUDE.md`.

## Workflow per phase

1. Brainstorm (`superpowers:brainstorming`) the screen — what stories matter, which states are exhaustive, what new mock surfaces are needed.
2. Spec (`docs/superpowers/specs/YYYY-MM-DD-storybook-phaseN-<screen>-design.md`).
3. Plan (`docs/superpowers/plans/YYYY-MM-DD-storybook-phaseN-<screen>.md`).
4. Implement on a feature branch via `superpowers:subagent-driven-development`.
5. Open PR; wait for vitest CI green.
6. Merge; update this roadmap (move the row from "Pending" to "Done", note the spec/plan paths and PR number).

## Window inventory

Twelve top-level windows live in `src/BorgDock.Tauri/src/`. Eleven done, one to go. Order below is arbitrary — pick whichever next phase makes sense at the
time.

### Done

| # | Window | Entry | Spec | Plan | PR |
|---|---|---|---|---|---|
| 1 | Flyout (sidebar overlay) | `flyout-main.tsx` → `components/flyout/FlyoutApp.tsx` | `2026-05-05-storybook-phase1-flyoutapp-design.md` | `2026-05-05-storybook-phase1-flyoutapp.md` | [#13](https://github.com/borght-dev/BorgDock/pull/13) |
| 2 | What's New | `whats-new-main.tsx` → `components/whats-new/WhatsNewApp.tsx` | `2026-05-05-storybook-phase2-whatsnew-design.md` | `2026-05-05-storybook-phase2-whatsnew.md` | _(filled in after PR opens)_ |
| 3 | Worktree (palette) | `worktree-main.tsx` → `components/worktree-palette/WorktreePaletteApp.tsx` | `2026-05-05-storybook-phase3-worktree-design.md` | `2026-05-05-storybook-phase3-worktree.md` | [#15](https://github.com/borght-dev/BorgDock/pull/15) |
| 4 | Agent Overview | `main-agent-overview.tsx` → `components/agent-overview/AgentOverviewApp.tsx` | `2026-05-05-storybook-phase5-agent-overview-design.md` | `2026-05-05-storybook-phase5-agent-overview.md` | _(filled in after PR opens)_ |
| 5 | SQL | `sql-main.tsx` → `components/sql/SqlApp.tsx` | `2026-05-05-storybook-phase4-sql-design.md` | `2026-05-05-storybook-phase4-sql.md` | _(filled in after PR opens)_ |
| 6 | Work Item Detail | `workitem-detail-main.tsx` → `components/work-items/WorkItemDetailApp.tsx` | `2026-05-05-storybook-phase6-workitem-detail-design.md` | `2026-05-05-storybook-phase6-workitem-detail.md` | [#16](https://github.com/borght-dev/BorgDock/pull/16) |
| 7 | File Palette | `file-palette-main.tsx` → `components/file-palette/FilePaletteApp.tsx` | `2026-05-06-storybook-phase7-file-palette-design.md` | `2026-05-06-storybook-phase7-file-palette.md` | _(filled in after PR opens)_ |
| 8 | File Viewer | `file-viewer-main.tsx` → `components/file-viewer/FileViewerApp.tsx` | `2026-05-06-storybook-phase9-file-viewer-design.md` | `2026-05-06-storybook-phase9-file-viewer.md` | _(filled in after PR opens)_ |
| 9 | Work Item Palette | `work-item-palette-main.tsx` → `components/work-item-palette/WorkItemPaletteApp.tsx` | `2026-05-06-storybook-phase8-work-item-palette-design.md` | `2026-05-06-storybook-phase8-work-item-palette.md` | _(filled in after PR opens)_ |
| 10 | Settings | `settings-main.tsx` → `components/settings/SettingsApp.tsx` | `2026-05-06-storybook-phase10-settings-design.md` | `2026-05-06-storybook-phase10-settings.md` | _(filled in after PR opens)_ |
| 11 | PR Detail | `pr-detail-main.tsx` → `components/pr-detail/PRDetailApp.tsx` | `2026-05-07-storybook-phase11-pr-detail-design.md` | `2026-05-07-storybook-phase11-pr-detail.md` | _(filled in after PR opens)_ |
| 12 | Main / Sidebar | `main.tsx` → `App.tsx` | `2026-05-08-storybook-phase12-main-sidebar-design.md` | `2026-05-08-storybook-phase12-main-sidebar.md` | _(filled in after PR opens)_ |

### Pending

_Catalog complete — every top-level window has its window-level stories. See
"Cross-cutting workstreams (post-catalog)" below for the next phases of work
(component-level stories, visual regression, hero-shot pipeline, static hosting)._

> **Roadmap correction (Phase 3):** the previous Worktree row described the
> window as containing the prune dialog and changes panel. That was wrong.
> `worktree-main.tsx` mounts `WorktreePaletteApp` (a palette listing
> worktrees across configured repos for quick terminal-launch). The
> `WorktreePruneDialog` is rendered from `components/settings/MaintenanceSection.tsx`
> — Settings phase territory. `WorktreeChangesPanel` /
> `WorktreeDiffOverlay` exist under `components/worktree-changes/` but are
> not rendered by any window today (orphaned but committed).

## Cross-cutting workstreams (post-catalog)

Sequenced after enough screens are storied to be worthwhile:

- **Component-level stories.** Once a screen has its window-level stories, its
  child components are candidates for their own stories. The `shared/primitives/`
  family (Toggle, Slider, Select, Field, …) deserves stories whether or not
  Settings is done — they're the smallest unit and pay back fastest in design
  reviews. Treat as its own phase once Settings has shaken them out in real use.
- **Visual regression.** Pick between Storybook's test-runner, Chromatic, or
  Playwright-driven snapshots of Storybook URLs. Decision deferred until ≥3
  screens are done so we have enough breadth to evaluate tooling.
- **Hero-shot pipeline.** Rewire `scripts/screenshot-heroes.mjs` to drive
  Storybook URLs (or Storybook test-runner snapshots) instead of a live `tauri
  dev` window. Removes the ad-hoc state-seeding currently in that script.
- **Static Storybook hosting.** Once the catalog is broad enough to be useful
  to non-developers (designers, contributors, reviewers), publish
  `storybook build` output somewhere durable.

## Mock layer extensions (track here as they're added)

Keep this list in sync with `.storybook/main.ts` aliases and `.storybook/mocks/*.ts`:

- `@tauri-apps/api/core` → `mocks/tauri-core.ts`
- `@tauri-apps/api/event` → `mocks/tauri-event.ts`
- `@tauri-apps/api/window` → `mocks/tauri-api-window.ts`
- `@tauri-apps/api/webviewWindow` → `mocks/tauri-api-webviewWindow.ts`
- `@tauri-apps/api/app` → `mocks/tauri-api-app.ts`
- `@tauri-apps/plugin-opener` → `mocks/tauri-plugin-opener.ts`
- `@tauri-apps/plugin-store` → `mocks/tauri-plugin-store.ts`
- `@tauri-apps/plugin-dialog` → `mocks/tauri-plugin-dialog.ts`
- `@tauri-apps/plugin-fs` → `mocks/tauri-plugin-fs.ts`
- `@/services/windows` → `mocks/services-windows.ts`
- `@/services/ado/workitems` → `mocks/services-ado-workitems.ts`
- `@/generated/changelog` → `mocks/generated-changelog.ts`
- `@tauri-apps/api/dpi` → `mocks/tauri-api-dpi.ts`
- `@tauri-apps/plugin-clipboard-manager` → `mocks/tauri-plugin-clipboard-manager.ts`
- `@tauri-apps/plugin-autostart` → `mocks/tauri-plugin-autostart.ts`
- `@/services/github/pulls` → `mocks/services-github-pulls.ts`
- `@/services/github/checks` → `mocks/services-github-checks.ts`
- `@/services/github/auth` → `mocks/services-github-auth.ts`
- `@/services/github/reviewThreads` → `mocks/services-github-reviewThreads.ts`
- `@/services/github/reviews` → `mocks/services-github-reviews.ts`
- `@/services/github/mutations` → `mocks/services-github-mutations.ts`
- `@/services/github/singleton` → `mocks/services-github-singleton.ts`
- `@/services/github` → `mocks/services-github-barrel.ts`
- `@/services/pr-actions` → `mocks/services-pr-actions.ts`
- `@tauri-apps/plugin-updater` → `mocks/tauri-plugin-updater.ts`
- `@tauri-apps/plugin-notification` → `mocks/tauri-plugin-notification.ts`

> **Phase 3 mock-layer extensions:** `tauri-api-window` now also exports
> `currentMonitor` and `getCurrentWindow().{hide,setSize,innerSize,scaleFactor}`.
> `tauri-core` now supports function-form `invokeResponses` —
> `invokeResponses[command]` may be `(args) => T | Promise<T>` for
> arg-discriminated responses (used by stories that vary
> `list_worktrees_bare` per `basePath`).

> **Phase 4 mock-layer extensions:** `tauri-api-window` now also exposes
> `getCurrentWindow().{outerPosition, setPosition, onMoved}`. `control.ts`
> records `clipboardWrites: string[]` (populated by every
> `clipboard.writeText` invocation) and `windowSize` gains `x` / `y`
> fields for the position round-trip used by SqlApp's saved-position
> persistence.

> **Phase 7 mock-layer extensions:** `tauri-api-window` now also exposes
> `getCurrentWindow().onFocusChanged` (synthetic `__window.onFocusChanged`
> channel — emit a boolean payload via `getControl().emit(...)`). Mirrors
> the Phase-4 `onMoved` pattern.

> **Phase 8 mock-layer extensions:** `tauri-api-window` now also exposes
> `getCurrentWindow().startDragging` (records a `window.startDragging`
> invocation; no-op otherwise). `tauri-api-webviewWindow` now also exports
> a `WebviewWindow` class — instantiation pushes the label/options into
> `getControl().webviewWindowsCreated`. `services-ado-workitems` mock
> replaced its stub-throws with scenario-driven impls keyed off
> `getControl().workItemPaletteScenario` (browse/search/loading/failure
> presets — see `__fixtures__/work-item-palette-data.ts` for the
> canonical shapes). `control.ts` adds `workItemPaletteScenario` and
> `webviewWindowsCreated` fields.

> **Phase 9 mock-layer extensions:** none. The File Viewer's tree-sitter
> highlighter runs unmodified inside the Storybook iframe — `.storybook/main.ts`
> now uses `vite-plugin-static-copy` in `viteFinal` to copy
> `node_modules/web-tree-sitter/.../web-tree-sitter.wasm` into the iframe
> output (`public/grammars/*.wasm` is already served at `/grammars/...` by
> Vite). Confirmed end-to-end via a probe story that mounts a small TSX
> file and asserts highlighted spans in the rendered DOM.

> **Phase 10 mock-layer extensions:** new alias `@tauri-apps/plugin-autostart`
> → `mocks/tauri-plugin-autostart.ts`. Mock exposes `enable()` / `disable()`,
> both push `autostart.enable` / `autostart.disable` invocations into the
> standard `getControl().invocations` log. `enable()` / `disable()` reject
> when `getControl().invokeResponses['autostart.enable']` (resp. `.disable`)
> is the literal string `'__throw__'` — used by the `AutostartFailure` story
> to exercise the production catch branch in `AppearanceSection`.

> **Phase 11 mock-layer extensions:** nine new aliases for the GitHub
> services and the pr-actions mutation layer. The PR Detail window
> hydrates via `getOpenPRs` + `getCheckRunsForRef` from `@/services/github/*`,
> and its `usePrActions` hook routes through `@/services/pr-actions` for
> mutations. To intercept those without touching production code, this
> phase adds:
>
> - `@/services/github/{pulls, checks, auth, reviewThreads, reviews,
>   mutations, singleton}` mocks plus a barrel alias for the `@/services/github`
>   index (without the barrel alias the sub-path mocks are unreachable for
>   any consumer that imports via the index — Vite alias resolution doesn't
>   follow into the production barrel's relative re-exports).
> - `@/services/pr-actions` mock that re-exports the seven mutation
>   functions, each recording into `getControl().invocations` and supporting
>   `prActionResponses[name] = '__throw__' | '__fail__' | function`
>   overrides.
>
> Two new control-surface fields: `githubResponses` (per-call canned
> values for the GH service mocks — `getOpenPRs`, `getCheckRunsForRef`,
> `tokenGetter`, `getPRFiles`, `getCommitFiles`, `getPRCommits`,
> `getReviewThreads`, `getReviews`, `getAllComments`) and `prActionResponses`
> (per-action override map keyed by mutation function name).
>
> `tauri-core.ts` invoke mock now also honors the `'__throw__'` sentinel
> as a shorthand for "reject with a synthetic error" — previously this
> sentinel was per-mock; centralizing it in tauri-core lets all
> invokeResponses-driven stories (e.g. CheckoutPanel's `checkout_pr:
> '__throw__'`) use the same shorthand without each mock implementing it.
>
> Interactive play functions use `within(canvasElement)` + `element.click()`
> from `storybook/test` (the idiomatic Storybook 9 pattern). The earlier
> `.storybook/mocks/play-helpers.ts` shim was removed in phase 11 once the
> stories were migrated to the canvas-scoped Testing Library API.

> **Phase 12 mock-layer extensions:** two new defensive aliases —
> `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-notification`. Today's
> production code routes both through Tauri IPC (`invoke('check_for_update')`,
> `invoke('show_flyout_toast')`) rather than the JS plugin APIs, so the new
> mocks are coverage-only; story authors driving update / notification flow
> seed the corresponding `tauri-core.invokeResponses` keys instead. Stories
> drive the main window via `withMainWindow` (multi-store seed across settings,
> ui, init, pr, onboarding, work-items, quick-review) and a `freezeAnimations`
> decorator. The README hero composition mounts both `<App />` and
> `<PrDetailApp />` simultaneously inside a CSS-grid `HeroCompositionFrame`;
> both share Zustand stores so the seeded fixtures are coherent across both
> windows.
>
> Phase 12 also migrated the storybook test runner from `@storybook/test-runner`
> to `@storybook/addon-vitest` + `@vitest/browser-playwright` (foundation
> commit). `bun run test` now runs vitest browser-mode for storybook
> alongside the unit suites; addon-vitest auto-generates one smoke test per
> story (Phase 12 added 25 new stories → +25 tests).

When a new window's spec needs a plugin not in this list, the spec must:
1. Add the alias in that window's plan (Storybook config edit).
2. Add a corresponding mock under `.storybook/mocks/`.
3. Update this section of the roadmap in the same PR.

Plugins likely to surface in upcoming phases: `plugin-fs`, `plugin-dialog`,
`plugin-clipboard-manager`, `plugin-shell`, `plugin-store`, `plugin-notification`,
`plugin-updater`, `plugin-os`, `plugin-autostart`, `plugin-global-shortcut`,
`plugin-log`.

## When to revisit this roadmap

- Whenever a screen ships (move row, link spec/plan/PR).
- Whenever a locked decision changes (note the change with a date).
- Whenever the cross-cutting list grows (new mock, new global decorator).
