# Storybook Phase 12 — Main / Sidebar — Design

**Status:** Spec. Awaiting plan + implementation.
**Roadmap row:** the final pending row in `docs/superpowers/specs/storybook-roadmap.md` ("Main / Sidebar").
**Sibling spec:** `2026-05-08-screenshot-pipeline-design.md` — the cross-cutting hero-shot pipeline that consumes the screenshot-tagged stories defined here. Land Phase 12 first; pipeline second.

## Intro

Phase 12 stories the BorgDock main window — `App.tsx` mounted by `main.tsx`. This is the orchestrator: splash → wizard → fade-out → main shell, three sections (focus / prs / workitems), two overlays (merge toast, quick review), and ~15 hooks coordinating polling, init, theme, hotkeys, flyout sync, notifications, autostart, whatsnew, etc.

It is the largest screen in the rollout and intentionally last so the prior 11 phases' patterns (mock layer, store seeding, theme toolbar, addon-vitest) inform its shape.

## Why

1. **Catalog completeness.** Eleven of twelve windows are storied; this closes the gap.
2. **Foundation for the screenshot pipeline.** README hero, marketing site shots, inline doc images, and per-release whatsnew banners all want to derive from real production code paths. Phase 12 produces the canonical Loaded states and the multi-window hero compositions the pipeline captures.
3. **Design-review surface.** App.tsx's gating logic (splash / wizard / fade-out / main) is otherwise only visible by booting Tauri. Stories make every gating state browseable.

## Non-goals

- **Pop-out windows** opened from App (Settings, PR Detail, Work Item Detail, file viewers, SQL, etc.) — already storied in their own phases. App.stories triggers their `invoke('open_*_window')` calls but the mock no-ops them; the pop-outs do not actually open.
- **Theme variants as separate stories.** Light/dark is the global Storybook toolbar from prior phases.
- **Visual regression / image diffing.** Out of scope; separate cross-cutting workstream.
- **Native tray / global hotkey behavior.** The mock records invocations; OS-level wiring is untestable in a browser iframe and not the point.
- **Per-state polling indicator stories.** Polling is a small visual cue covered by `PrsCanonical`.
- **Renaming `src/App.tsx`.** Out-of-scope churn. App.stories sits beside it.

## Constraints

Inherited from `storybook-roadmap.md`'s "Locked decisions" — restated here only where Phase 12 has a notable interaction.

- **State via stores, not via hook mocks.** App orchestrates many hooks; mocking each one is invasive and brittle. Stories pre-seed Zustand stores (`useSettingsStore`, `useInitStore`, `useUiStore`, `usePrStore`, `useOnboardingStore`) before render. The hooks then run as in production but find data already present and short-circuit.
- **Mock layer surface only what App's hooks call.** Existing aliases (`@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/api/window`, GitHub services, ADO services, etc.) cover most of it. Likely *new* aliases:
  - `@tauri-apps/plugin-updater` — `useAutoUpdate`.
  - `@tauri-apps/plugin-notification` — `useReviewNudges`.
  - `@tauri-apps/plugin-global-shortcut` — `register_user_hotkeys` / `unregister_hotkey` already invoked via `tauri-core`, but if any direct plugin-global-shortcut import surfaces, alias it.
  - `@/services/state-transitions` and any other internal service the orchestrator pulls in but a story never wants to actually run.
  Exact list nailed during implementation; the mock follows the no-op-records-into-control pattern from prior phases.
- **No production-code edits.** The decorator/mock layer is the only surface that changes. App.tsx, MainWindow.tsx, and every section component stay byte-identical.
- **Deterministic capture-friendliness.** Stories whose primary purpose is screenshots (`Hero_*` group) must be stable: dates pinned in fixtures, animations short or skippable, no live timers.
- **Branch + PR per screen.** Branch `storybook-phase12-main-sidebar`. PR title `storybook phase 12: main / sidebar catalog`. Personal-account `gh` switch protocol per `~/.claude/CLAUDE.md`.

## Architecture

### File layout

```
src/
├── App.tsx                      # unchanged
├── App.stories.tsx              # NEW — title "Main Window/App"
└── components/
    ├── pr-detail/
    │   └── PRDetailApp.tsx     # imported by Hero_ReadmeMain composition
    └── ...

src/components/main/
└── __fixtures__/
    └── main-window-data.ts      # NEW — fixtures + decorator helpers
```

`App.stories.tsx` lives at the same depth as `App.tsx` to mirror its production location. The fixtures and helpers go into `src/components/main/__fixtures__/main-window-data.ts` (a new directory, since App.tsx itself is at `src/`). This keeps fixtures co-located with related primitives and matches the per-window fixture-folder pattern from earlier phases.

### Decorator chain

Each story decorator runs in this order:

1. **Reset stores.** Clear `useSettingsStore`, `useInitStore`, `useUiStore`, `usePrStore`, `useOnboardingStore`, `useAdoStore` (etc.) to known-empty state. Without this, story-to-story store leakage produces non-determinism.
2. **Seed stores per-story.** Each story declares the shape it wants and the decorator writes it directly into store state via `setState`.
3. **Seed mock control.** `getControl().invokeResponses`, `getControl().githubResponses`, `getControl().workItemPaletteScenario`, etc. set the canned responses for any actual Tauri/HTTP calls App's hooks do trigger after store seed (rarely — most short-circuit immediately).
4. **Render `<App />`** (or, for `Hero_ReadmeMain`, render the composition wrapper).

### Composition wrapper for multi-window heroes

`Hero_ReadmeMain` mounts both `<App />` and `<PrDetailApp />` simultaneously inside a CSS grid:

```
┌──────────────┬──────────────────────────────────┐
│              │                                  │
│   <App />    │       <PrDetailApp />            │
│   sidebar    │       pop-out                    │
│              │                                  │
└──────────────┴──────────────────────────────────┘
```

Both consume the same Zustand stores, so the seeded fixtures must be coherent across both:

- `usePrStore.pullRequests` includes the PR that PR Detail expects.
- The PR-Detail mock receives the same PR via `githubResponses.getOpenPRs` so its hydration matches.
- `injectedPrParams` (the test-seed used by PR Detail to know which PR to focus) points to the same PR.

This is the only story that mounts more than one window. Future multi-window heroes follow the same pattern but live in separate composed `Hero_*` stories — never reuse this composition for unrelated shots.

### Splash / wizard / fade-out gating

App.tsx's render branches:

```
if (!isLoading && needsSetup)        → <SetupWizard />
if (!initCompletedRef.current && (isLoading || !isInitComplete)) → <SplashScreen />
if (fadingOut)                       → fade overlay + main shell
otherwise                            → main shell
```

Each gate becomes a story that seeds the inputs to land in that branch:
- `LoadingSettings` — `isLoading=true`. SplashScreen visible.
- `InitInProgress` — `isLoading=false`, `isInitComplete=false`. SplashScreen visible.
- `FadingOut` — `isInitComplete=true`, `fadingOut=true`. The 200ms `setTimeout` would normally clear `fadingOut` — story decorator pins `animation-play-state: paused` on the fade overlay and freezes the timer (mock `setTimeout` to no-op for this one story, scoped via decorator).
- All wizard stories — `setupComplete=false` and either no repos or `authMethod='pat'` with empty token. The wizard's internal step state is set via the matching prop or via its own store if applicable.

### Animation freezing helper

Add `freezeAnimations` decorator to `__fixtures__/main-window-data.ts`. Injects:

```css
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
```

Used by `FadingOut`, all `Hero_*` stories, and any story that would otherwise auto-advance during capture. Other stories opt in only if needed.

## Story catalog

Twenty-one catalog stories across five sub-groups (A–E) + four screenshot stories in group F = **25 stories total in this PR**. Naming is descriptive; sidebar grouping comes from `meta.title` substructure (e.g. `Main Window/App/Lifecycle`).

### A. Lifecycle / gating (4)

| Story | Seeded state | Renders |
|---|---|---|
| `LoadingSettings` | `useSettingsStore.isLoading=true` | SplashScreen |
| `InitInProgress` | settings loaded, `useInitStore.isComplete=false` | SplashScreen |
| `FadingOut` | `useInitStore.isComplete=true`, `fadingOut=true` (state injected via story-only ref) | fade overlay + main shell |
| `Loaded` | fully booted, `activeSection='focus'` | main shell, focus section, canonical priorities |

### B. Setup wizard (3)

| Story | Seeded state | Renders |
|---|---|---|
| `WizardAuth` | `setupComplete=false`, no auth | SetupWizard at AuthStep |
| `WizardRepos` | auth method picked, repos discovered | SetupWizard at RepoStep with discovered repos |
| `WizardPatMissing` | `authMethod='pat'`, empty token | SetupWizard re-shows on AuthStep |

### C. Section variants (post-Loaded) — Focus (4)

| Story | Notes |
|---|---|
| `FocusCanonical` | typical priorities; merge toast hidden, quick-review hidden |
| `FocusEmpty` | no priorities |
| `FocusWithQuickReview` | `QuickReviewOverlay` open |
| `FocusWithMergeToast` | `MergeToast` visible (recent-merge fixture) |

### D. Section variants — PRs (6)

| Story | Notes |
|---|---|
| `PrsCanonical` | multiple repos, mixed states |
| `PrsEmpty` | zero PRs |
| `PrsManyRepos` | 5+ repo groups, list scrolls |
| `PrsWithFailures` | several PRs with failed checks |
| `PrsMergeConflicts` | conflict indicators visible |
| `PrsRateLimited` | rate-limit banner visible |

### E. Section variants — Work items (4)

| Story | Notes |
|---|---|
| `WorkItemsCanonical` | default query populated |
| `WorkItemsLoading` | mid-fetch shimmer |
| `WorkItemsFailure` | error state |
| `WorkItemsSearching` | search active, filtered results |

### F. Screenshot-targeted — `Main Window/App/Screenshots` (4 baseline)

These stories exist *for* the hero-shot pipeline.

**Phase 12 ships the story bodies — the canvas content, fixtures, and decorators — but NOT the `parameters.screenshot` block.** They render in Storybook and are reviewable like any other story. The sibling spec `2026-05-08-screenshot-pipeline-design.md` adds `parameters.screenshot` on top of these story bodies in its own PR, so the pipeline owns its contract end-to-end.

| Story | Purpose | Approx target dimensions (declared by pipeline PR) |
|---|---|---|
| `Hero_ReadmeMain` | README hero — composed App + PR Detail scene | 1600×1000 |
| `Hero_DocFocusList` | inline docs — focus section close-up | 480×800 |
| `Hero_DocPrsList` | inline docs — PRs section close-up | 480×800 |
| `Hero_DocWorkItems` | inline docs — work items section close-up | 480×800 |

`Hero_WhatsNewTemplate` lives in `src/components/whats-new/whats-new.stories.tsx`, NOT in App.stories — banners are about the WhatsNewApp window's HeroBanner component, not the main window. Phase 12 only adds the App-level hero/doc shots above. Per-release whatsnew banner stories are added in *release* PRs, not this PR.

## Tooling

- **Storybook 9 + `@storybook/react-vite` + `@storybook/addon-themes` + `@storybook/addon-vitest`** (already configured).
- **Tailwind v4 via `@tailwindcss/vite`** (already configured).
- **Tauri mocks under `.storybook/mocks/`** — extend with the new plugin aliases listed under Constraints.
- **No new test framework.** Existing addon-vitest covers interaction tests if desired; not required for Phase 12 acceptance.

## Risks

1. **Hook ordering and store seeding race.** App.tsx's first `useEffect` calls `loadSettings()` which writes to the store. If the decorator seeds *before* App mounts, fine — but if the seed runs in a `useEffect` it'll get clobbered. Decorators must seed *synchronously* before render returns. The fixture helpers will enforce this by writing to `setState` outside any effect.
2. **`setTimeout` in the fade-out path.** The 200ms timer in `App.tsx:96-97` will auto-clear `fadingOut`. The `FadingOut` story decorator overrides `window.setTimeout` (scoped to the story) to a no-op so the overlay persists.
3. **`useFlyoutSync` updates the tray icon via invoke.** Mock `set_badge_visible` no-ops; if any state derivation downstream depends on its return value, pin a return value.
4. **Multi-window composition mounts two app components.** Both share Zustand stores. Inconsistent seed → either App's PR list and PR Detail's hydration disagree, producing a story that "looks" like a desktop scene but has mismatched data. The fixture helper for `Hero_ReadmeMain` exposes a single `seedHeroComposition({ pr })` that wires both consistently.
5. **Console bridge / context-menu disable not run.** `main.tsx` calls `attachConsoleBridge()` and `disableDefaultContextMenu()` before App mounts; stories skip both. Right-click in a story shows the browser default menu; logs go to the browser console rather than tauri-plugin-log. Acceptable.
6. **Screenshot stories lock to specific viewport sizes.** A future window-size design change might invalidate captures. Output paths are stable (declared per-story); regenerating after a layout change is a single command run.
7. **Story count growth.** 21 stories is the largest single phase. Vitest browser-mode addon iterates over all of them. Add only the screenshot stories needed; resist tagging every catalog story for capture.

## Acceptance

- [ ] `bun run storybook` opens with `Main Window/App/*` populated, all 25 stories renderable without console errors.
- [ ] Each lifecycle story renders the correct gating branch (splash, wizard, fade-out overlay, main shell).
- [ ] Each section story renders with seeded data — no live polling, no real `invoke` failures escaping to the user-visible UI.
- [ ] `Hero_ReadmeMain` renders App + PR Detail side by side with coherent shared state.
- [ ] Theme toolbar toggles light/dark across every story.
- [ ] `bun run test:storybook` (addon-vitest) passes for every story (smoke render).
- [ ] No edits to `src/App.tsx`, `src/main.tsx`, or any production component file. Mock layer + decorators only.
- [ ] Roadmap (`docs/superpowers/specs/storybook-roadmap.md`) updated: move the Main / Sidebar row from Pending to Done, link this spec, the plan, and the PR.
- [ ] PR opened from `storybook-phase12-main-sidebar` to `master` via the personal `gh` account, switched back to enterprise after.

## What comes next

1. **Plan**: `docs/superpowers/plans/2026-05-08-storybook-phase12-main-sidebar.md` — task-by-task implementation plan generated by the writing-plans skill.
2. **Sibling spec**: `2026-05-08-screenshot-pipeline-design.md` — the hero-shot pipeline that consumes Phase 12's `Hero_*` stories plus screenshot-tagged stories from prior phases. Lands as a separate PR after Phase 12.
3. **Per-release whatsnew workflow**: once the pipeline lands, every release PR adds N `WhatsNewBanner_<slug>` stories to `whats-new.stories.tsx`, each carrying `parameters.screenshot`. The capture script regenerates `docs/whats-new/<VERSION>/*.png`. The hand-built `design/mockups/whats-new-<VERSION>.html` workflow retires.
