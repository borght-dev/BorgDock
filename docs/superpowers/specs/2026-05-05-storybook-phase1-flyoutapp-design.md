# Storybook — Phase 1: FlyoutApp

**Status:** design approved, plan pending
**Scope:** introduce Storybook into `src/BorgDock.Tauri/`, scaffold a Tauri-decoupled mock layer, and ship an exhaustive story catalog for `src/components/flyout/FlyoutApp.tsx` only.

## Why

We want Storybook in this repo for four overlapping reasons (all explicitly in scope long-term):

1. **Faster isolated dev** — work on a screen without `tauri dev`, Rust rebuilds, or live GitHub/ADO data.
2. **Visual catalog / design docs** — a browsable showcase of every screen and its meaningful states.
3. **Visual regression** — eventually supplement (or replace) the per-OS `tests/e2e/__screenshots__/` baselines.
4. **Hero shots / marketing** — feed the existing `design-bundle/` and `screenshot-heroes.mjs` workflow with consistent posed states.

Doing all four at once across the 12 windows and ~134 components is a multi-week commitment. This phase de-risks the shape of the solution by proving it on a single, representative window — `FlyoutApp` — before expanding.

`FlyoutApp` is a deliberate Phase 1 pick because:
- It already exposes a clean dev-only test seam (`window.__borgdock_test_flyout_seed`, `FlyoutApp.tsx:118–144`) — Playwright e2e drives it the same way Storybook will, so the pattern is proven.
- It exercises three render branches (`initializing`, `glance`, `toast`) plus a banner sub-mode, so the story catalog stresses the mock layer hard.
- It dynamically imports four distinct Tauri surfaces (`@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/plugin-opener`, `@/services/windows`), so the mock-aliases pattern gets a real workout.

## Non-Goals

- Stories for any window other than the flyout (sidebar/main, pr-detail, file-viewer, file-palette, work-item-palette, workitem-detail, worktree, agent-overview, sql, whats-new, settings — eleven other windows). Each gets its own future phase.
- Visual regression integration (Storybook test-runner, Chromatic, Playwright integration).
- Replacing or modifying the existing `screenshot-heroes.mjs` / `design-bundle/` pipeline.
- Refactoring `FlyoutApp.tsx` or any of its children for dependency injection. Production code stays untouched.
- Component-level stories for the children of `FlyoutApp` (`FlyoutGlance`, `FlyoutToast`, `FlyoutInitializing`, `FlyoutPrRow`, `FlyoutPrContextMenu`). Phase 1 stories the composed window only; per-component stories are a later phase.
- A static built Storybook (`storybook build`) hosted anywhere. Phase 1 is dev-server only.

## Constraints

- **No production code changes.** `FlyoutApp.tsx` and its imports stay byte-for-byte identical. The mock layer must intercept exclusively at the Vite resolver level via `.storybook/main.ts` aliases.
- **Tailwind v4 + Vite 6 + React 19**: Storybook must use the React-Vite framework with the `@tailwindcss/vite` plugin; the CSS-first config (`@import "tailwindcss"`) cannot be replaced by a PostCSS pipeline.
- **Storybook runs in dev mode.** `import.meta.env.DEV` must remain `true` so the existing `__borgdock_test_flyout_seed` hook is live and reusable. If we later add `storybook build`, the decorator must be able to substitute for the seed — flagged for the next phase.
- Must not interfere with `vite dev`, `vite build`, `vitest`, or `playwright`. Storybook gets its own port and config; existing scripts are unmodified.
- TypeScript strict mode must pass for every new `.tsx` / `.ts` file in `.storybook/` and `src/components/flyout/__fixtures__/`.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                              # Storybook config: framework, stories glob, Vite plugins, alias mocks
│   ├── preview.ts                           # global decorators, theme toolbar, CSS imports
│   ├── preview-head.html                    # CSP / font preload if needed (placeholder, may be empty)
│   └── mocks/
│       ├── tauri-core.ts                    # invoke() with command registry + assertion handle
│       ├── tauri-event.ts                   # listen() / emitTo() with channel registry
│       ├── tauri-plugin-opener.ts           # openUrl no-op
│       ├── services-windows.ts              # openPrDetail no-op
│       └── control.ts                       # window.__borgdock_storybook_tauri control object (shared)
└── src/components/flyout/
    ├── FlyoutApp.tsx                        # UNCHANGED
    ├── __fixtures__/
    │   └── flyout-data.ts                   # FlyoutData / FlyoutPr / ToastPayload factories
    └── FlyoutApp.stories.tsx                # the 34 stories
```

### Mock layer

Two layers intercept Tauri:

**Layer 1 — Vite alias replacement** (in `.storybook/main.ts`):

```ts
viteFinal: async (config) => {
  config.resolve!.alias = {
    ...config.resolve!.alias,
    '@tauri-apps/api/core':   resolve(__dirname, 'mocks/tauri-core.ts'),
    '@tauri-apps/api/event':  resolve(__dirname, 'mocks/tauri-event.ts'),
    '@tauri-apps/plugin-opener': resolve(__dirname, 'mocks/tauri-plugin-opener.ts'),
    '@/services/windows':     resolve(__dirname, 'mocks/services-windows.ts'),
  };
  return config;
}
```

The dynamic `await import('@tauri-apps/api/core')` calls inside `FlyoutApp.tsx` resolve to the mock module at story-render time. Vite aliases apply to dynamic and static imports identically.

**Layer 2 — control surface** (`window.__borgdock_storybook_tauri`):

`mocks/control.ts` exposes a singleton:

```ts
window.__borgdock_storybook_tauri = {
  // listen-channel registry: channel name -> Set<callback>
  channels: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  // outbound invoke log for assertions
  invocations: [] as Array<{ command: string; args?: unknown }>,
  // canned invoke responses, keyed by command name
  invokeResponses: {} as Record<string, unknown>,
  // reset between stories (called by global decorator)
  reset(): void { … },
  // helpers used by stories
  emit(channel: string, payload: unknown): void { … },
};
```

`tauri-core.ts` mock implementation:

```ts
export async function invoke<T = unknown>(command: string, args?: unknown): Promise<T> {
  const ctrl = window.__borgdock_storybook_tauri;
  ctrl.invocations.push({ command, args });
  return (ctrl.invokeResponses[command] as T) ?? (undefined as T);
}
```

`tauri-event.ts` mock:

```ts
export async function listen<T>(channel: string, cb: (event: { payload: T }) => void) {
  const ctrl = window.__borgdock_storybook_tauri;
  let set = ctrl.channels.get(channel);
  if (!set) { set = new Set(); ctrl.channels.set(channel, set); }
  set.add(cb as never);
  return () => { set!.delete(cb as never); };
}
export async function emitTo(_target: string, _channel: string, _payload?: unknown) { /* no-op */ }
```

### Driving state from stories

Two seams, used in combination per story:

1. **`__borgdock_test_flyout_seed`** (existing, dev-only, untouched): handles initializing → glance → idle transitions and seeds `FlyoutData`. Stories targeting initializing / glance / idle modes call this.
2. **Mock event channels**: handles toast and toast-banner-on-glance flows. The story decorator pushes payloads into `window.__borgdock_storybook_tauri.channels.get('flyout-toast')` after the component has subscribed.

Both seams are coordinated by `decorators/flyout-decorator.tsx` (kept colocated in `.storybook/decorators/` once introduced — if Phase 1 only needs one decorator, it can live inline in `FlyoutApp.stories.tsx` and graduate to its own file when a second screen needs it).

A typical story:

```ts
export const GlanceMixed: Story = {
  parameters: {
    flyout: {
      mode: 'glance',
      data: makeFlyoutData({ pullRequests: mixedPrs() }),
    },
  },
};

export const Toast3Cards: Story = {
  parameters: {
    flyout: {
      mode: 'idle', // start idle so toast events drive into toast mode
      toasts: [makeToast(...), makeToast(...), makeToast(...)],
    },
  },
};
```

The global `flyoutDecorator`:
1. Calls `window.__borgdock_storybook_tauri.reset()`.
2. Renders `<FlyoutApp />`.
3. After mount, calls `window.__borgdock_test_flyout_seed({ mode, data })` if `mode` is `glance`/`idle`/`initializing`.
4. For each entry in `parameters.flyout.toasts`, pushes via the mock `flyout-toast` channel.
5. For `parameters.flyout.banner`, pushes that single payload after seeding `glance` mode.
6. For `parameters.flyout.hovered: true`, dispatches a synthetic `mouseenter` on the toast container after toasts mount.

### Theme handling

A Storybook **global toolbar** with three values: `light`, `dark`, `system`. The toolbar handler toggles `document.documentElement.classList` exactly as `applyTheme()` does in `FlyoutApp.tsx:15–20`. We do **not** duplicate every story for both themes — one story renders in whichever theme is active. When visual regression lands in a later phase, the test runner enumerates both globals.

### Fixtures

`src/components/flyout/__fixtures__/flyout-data.ts` exports:

```ts
export function makeFlyoutPr(overrides?: Partial<FlyoutPr>): FlyoutPr;
export function makeFlyoutData(overrides?: Partial<FlyoutData>): FlyoutData;
export function makeToast(overrides?: Partial<ToastPayload>): ToastPayload;

// Curated sets used by multiple stories
export const passingPrs:   FlyoutPr[];
export const failingPrs:   FlyoutPr[];
export const mixedPrs:     FlyoutPr[];
export const draftPrs:     FlyoutPr[];
export const longTitlePrs: FlyoutPr[];
export const sparsePrs:    FlyoutPr[];   // omits htmlUrl/headRef/isDraft/mergeScore
export const manyPrs:      FlyoutPr[];   // 25+
```

Defaults match the empty `FlyoutData` seeded in `FlyoutApp.tsx:23–34` (zero counts, `theme: 'system'`, `lastSyncAgo: '...'`, `hotkey: 'Ctrl+Win+Shift+G'`).

## Story Catalog (exhaustive — 34 stories)

### Initializing (1)
1. `Initializing` — splash, no other state.

### Glance — base data variants (12)
2. `GlanceEmpty` — zero PRs, all counts zero.
3. `GlanceAllPassing` — N PRs, all `overallStatus: 'green'`, counts reflect.
4. `GlanceAllFailing` — N PRs, all `overallStatus: 'red'`, counts reflect.
5. `GlanceMixed` — red/yellow/green/gray represented in queue.
6. `GlanceFocusOnly` — `focusCount > 0`, other counts 0; PR list shows focus rows.
7. `GlanceMany` — 25+ PRs to exercise scrolling and list virtualization (if any).
8. `GlanceDraftsOnly` — every PR has `isDraft: true`.
9. `GlanceMergeReady` — high `mergeScore` (≥ 80) and `mergeable: true`.
10. `GlanceMergeConflict` — `mergeable: false` on at least one PR.
11. `GlanceLongTitles` — title lengths near and above truncation thresholds.
12. `GlanceLongAuthors` — author names long enough to test row layout.
13. `GlanceSparseFields` — payload omits `htmlUrl`, `headRef`, `isDraft`, `mergeScore` (the synthetic-payload path).

### Glance — banner overlay (4)
14. `GlanceBannerInfo` — base passing data + `banner: { severity: 'info', ... }`.
15. `GlanceBannerSuccess` — same with `severity: 'success'`.
16. `GlanceBannerWarning` — same with `severity: 'warning'`.
17. `GlanceBannerError` — same with `severity: 'error'`.

### Toast — queue size (3)
18. `Toast1Card` — single toast.
19. `Toast2Cards` — two toasts.
20. `Toast3Cards` — three toasts (`TOAST_MAX`).

### Toast — per-severity, single card (4)
21. `ToastSeverityInfo`
22. `ToastSeveritySuccess`
23. `ToastSeverityWarning`
24. `ToastSeverityError`

### Toast — per-action variant (6)
Each story renders a single toast whose `actions` contains exactly one action of the given type, so the action button rendering is isolated.
25. `ToastActionOpenPr`
26. `ToastActionFixPr`
27. `ToastActionMonitorPr`
28. `ToastActionOpenUrl`
29. `ToastActionMergePr`
30. `ToastActionStartReview`

### Toast — interaction & content (3)
31. `ToastHovered` — three toasts; decorator dispatches `mouseenter` to pause the timer (visualizes the paused state).
32. `ToastNoActions` — one toast with `actions: []`.
33. `ToastLongBody` — title + body lengths exceeding the 340 × ~160px card budget; verifies wrapping/clipping.

### Toast — overflow (1)
34. `ToastOverflow` — decorator pushes 4 toast events sequentially; queue is capped at 3 by the reducer (`flyout-mode.ts:59`). Confirms FIFO trim.

## Tooling additions

### `package.json`

Add to `devDependencies`:
- `storybook` (latest `^9` or whichever ships React-19 + Tailwind-v4 support cleanly at install time — we pin during the implementation plan)
- `@storybook/react-vite`
- `@storybook/addon-essentials` (controls, actions, viewport, backgrounds, toolbars)
- `@storybook/addon-themes` (drives the `light`/`dark` toolbar via class strategy)

Add scripts:
```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```

`build-storybook` is included as a smoke test even though we don't host it in Phase 1 — it runs in CI to catch story-load regressions.

### Test suites

- **Vitest**: untouched. The fixtures file is plain TypeScript and may incidentally be imported by future tests, but Phase 1 doesn't add any.
- **Playwright**: untouched. The existing `tests/e2e/flyout.spec.ts` continues to drive `__borgdock_test_flyout_seed` directly via `page.evaluate`; the same hook now serves Storybook too, so the two consumers must not stomp on each other's state. They don't — Playwright runs against `vite dev` on a different port; Storybook runs against its own dev server.

### Biome

`.storybook/` is added to Biome's include set so lint/format covers it. Stories follow existing project conventions (no emojis, no trailing summaries in code comments, default no-comments policy).

### TypeScript

`tsconfig.json` includes `.storybook/**/*` and `src/**/*.stories.tsx`. No new `tsconfig` file unless Storybook requires one; we keep the single project-level config.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Tailwind v4 CSS-first config doesn't pick up under Storybook's Vite builder | medium | Use `@storybook/react-vite`; install `@tailwindcss/vite` in `.storybook/main.ts`'s `viteFinal`; verify with the first story before scaling out. |
| Dynamic `await import()` doesn't honor Vite aliases under Storybook | low | Vite resolves dynamic and static imports through the same plugin chain. Validate with `Initializing` + `GlanceEmpty` stories before writing the rest. |
| `import.meta.env.DEV` is false under `storybook build` | known, scoped out | Phase 1 ships dev-only. The decorator design already plans for a future fully-mocked path. |
| `@/services/windows` mock drifts from real signature | low | Mock re-imports the real type via `import type { … } from '@/services/windows-types'` (or inline the type). TypeScript catches signature drift at story-compile time. |
| Storybook port 6006 collides with a user's other tooling | trivial | The script accepts `-p`; documented in commit message. |
| Per-story state leaks via `window.__borgdock_storybook_tauri` | medium | Global decorator calls `reset()` before each story renders. The reset wipes channels, invocations, and canned responses. |
| FlyoutApp's `resize_flyout` invoke fires repeatedly, polluting `invocations` | low | `reset()` empties the log per story. We do not assert on resize calls in Phase 1 — they're cosmetic. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm install && npm run storybook` boots without errors.
2. All 34 stories render. None throw, none log uncaught errors to the console.
3. Light/dark toolbar toggle re-renders every story without reload.
4. `npm run build-storybook` completes without errors.
5. `npm run lint` and `npm run test` continue to pass with the new files included.
6. `FlyoutApp.tsx` is byte-identical to its pre-spec version (`git diff --stat src/components/flyout/FlyoutApp.tsx` shows no changes).
7. The mock layer is fully scoped to `.storybook/` — no `__mocks__` or test-double files appear under `src/`.

## What comes next (out of scope for this spec)

- **Phase 2 candidate**: per-component stories for the flyout's children (`FlyoutGlance`, `FlyoutToast`, `FlyoutPrRow`, `FlyoutPrContextMenu`, `FlyoutInitializing`) — easier now that the mock layer exists.
- **Phase 3+ candidates**: stories for each of the other 11 windows, one phase per window or grouped by complexity.
- **Visual regression phase**: pick between Storybook test-runner, Chromatic, or Playwright-driven snapshots of the Storybook URL. Decision deferred until the catalog has enough breadth to justify a tool choice.
- **Hero-shot phase**: rewire `screenshot-heroes.mjs` to drive Storybook URLs instead of `tauri dev`, so heroes use the same posed states as the catalog.
