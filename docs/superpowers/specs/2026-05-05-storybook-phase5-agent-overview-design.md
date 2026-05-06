# Storybook Phase 5 — AgentOverviewApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.tsx`, extending the Phase 1–2 mock layer with one new Tauri surface (`@tauri-apps/api/webviewWindow`) and exercising the existing event mock layer hard. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, AgentOverviewApp is the next pending window. It's the right Phase 5 pick because:

- It's the **first window that's primarily driven by live `listen` events** rather than one-shot `invoke` calls. Every prior phase exercised `invoke` heavily and `listen` lightly. Storying AgentOverviewApp will validate the existing `tauri-event` mock under realistic load (rapid `agent-sessions-changed` upserts/removes) and surface any gaps.
- The screen has **six distinct UI states per session** (`working`, `tool`, `awaiting`, `finished`, `idle`, `ended`) that combine into many top-level layouts (rail visible / hidden, idle rail visible / hidden, archived rail toggle, density `roomy`/`standard`/`wall`, five grouping modes, pinned vs hovered inspector). The story catalog enumerates these so the design is reviewable without booting Tauri.
- It exposes **an inspector popover** with a popover lifecycle (hover open / hover close / pinned / focus-cycle via Tab). Storybook is the cheapest place to inspect every variant.
- The **only new Tauri surface** is `getCurrentWebviewWindow()` from `@tauri-apps/api/webviewWindow`, which `Titlebar.tsx` uses for minimize/toggleMaximize/close. That's a tiny mock — three log-only no-ops mirroring `tauri-api-window.ts`.
- It does **not** use `@tauri-apps/plugin-shell` directly (despite what the roadmap row suggests) — none of the agent-overview source files import it. The roadmap will be corrected to reflect this in the same PR.

## Non-Goals

- Per-component stories for `AgentCard`, `AgentTile`, `AwaitingRail`, `IdleRail`, `RepoMark`, `StateDot`, `StatePill`, `TokenBar`, `Statusbar`, `Titlebar`, `InspectorPopover`, `InspectorActions`, `InspectorFileRow`, `InspectorFilesSection`, `InspectorHeader`, `AssistantMarkdown`, `SegmentedToggle`, `DismissButton`. Deferred to the cross-cutting "component-level stories" phase.
- Visual regression / Chromatic / Storybook test-runner — still deferred.
- Hero-shot pipeline integration — later phase.
- Touching any production file under `src/components/agent-overview/`, `src/hooks/useAgentSessions.ts`, `src/hooks/useInspectorState.ts`, `src/hooks/useKeyboardShortcuts.ts`, `src/services/agent-overview.ts`, `src/services/agent-overview-types.ts`, `src/services/notification.ts`. No new test/seed hooks introduced into production.
- Mocking `attachConsoleBridge`, `services/logger`, or anything in `main-agent-overview.tsx` (which the stories never render — they mount `<AgentOverviewApp />` directly).
- Mocking `@tauri-apps/plugin-shell`. AgentOverviewApp does not import it. The roadmap row will be corrected in the same PR. Phase 6/7 will introduce the alias when a window that actually uses it is storied.
- Stories that exercise the inspector's `diff_worktree_vs_head` IPC fully — that's covered through invoke-records on the control surface but the Storybook layout doesn't render real diff content (the mock returns whatever stories seed under `invokeResponses['diff_worktree_vs_head']`).
- Stories that drive `useNowTick` clock progression. The `useNowTick` interval re-renders every second to compute snooze cutoffs. We accept the natural ticking as part of the runtime; we don't try to freeze or fast-forward it.

## Constraints

- **No production code changes.** Verified via `git diff origin/master...storybook-phase5-agent-overview -- src/BorgDock.Tauri/src/components/agent-overview src/BorgDock.Tauri/src/hooks/useAgentSessions.ts src/BorgDock.Tauri/src/hooks/useInspectorState.ts src/BorgDock.Tauri/src/hooks/useKeyboardShortcuts.ts src/BorgDock.Tauri/src/services/agent-overview.ts src/BorgDock.Tauri/src/services/agent-overview-types.ts src/BorgDock.Tauri/src/services/notification.ts ':(exclude)src/BorgDock.Tauri/src/components/agent-overview/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/agent-overview/*.stories.tsx'` showing zero changes.
- Storybook 9 + React-Vite + Tailwind v4 setup from Phase 1–2 stays as-is. Only additive changes to `.storybook/`.
- The control surface (`window.__borgdock_storybook_tauri`) gets **no new fields**. `agent-overview` stories drive state entirely through:
  1. `getControl().invokeResponses['list_agent_sessions'] = […SessionRecord[]]` for the initial snapshot.
  2. `getControl().invokeResponses['list_worktree_changes'] = { files: [...] }` for the inspector's file diff section.
  3. `getControl().invokeResponses['diff_worktree_vs_head'] = { hunks: [...] }` for the inspector file row's per-file expansion.
  4. `getControl().emit('agent-sessions-changed', { kind: 'upsert', session: {...} })` to drive live transitions.
- The new mock module (`tauri-api-webviewWindow.ts`) implements only `getCurrentWebviewWindow()` returning an object with `minimize`, `toggleMaximize`, `close` — every method is a no-op log to `ctrl.invocations`. `close()` is a no-op so clicking the title-bar X doesn't unmount the iframe.
- Real `SessionRecord` and `SessionDelta` types are imported from production sources; no parallel type definitions in fixtures.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                                   # extend resolve.alias with one new entry
│   └── mocks/
│       └── tauri-api-webviewWindow.ts            # NEW
└── src/components/agent-overview/
    ├── __fixtures__/
    │   └── agent-overview-data.ts                # SessionRecord factories + curated states
    └── AgentOverviewApp.stories.tsx              # 26 stories
```

### Mock additions

#### `tauri-api-webviewWindow.ts`

Drop-in for `@tauri-apps/api/webviewWindow`. Only `getCurrentWebviewWindow()` is exported (the surface the agent-overview Titlebar uses).

```ts
import { getControl } from './control';

interface MockWebviewWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

export function getCurrentWebviewWindow(): MockWebviewWindow {
  const ctrl = getControl();
  return {
    async minimize()        { ctrl.invocations.push({ command: 'webviewWindow.minimize' }); },
    async toggleMaximize()  { ctrl.invocations.push({ command: 'webviewWindow.toggleMaximize' }); },
    async close()           { ctrl.invocations.push({ command: 'webviewWindow.close' }); },
  };
}
```

`close()` is a no-op for the same reason as `tauri-api-window.ts::close()` — without this, clicking the title-bar X kills the Storybook iframe.

#### `.storybook/main.ts` aliases

Add one entry to the `viteFinal` alias block (placed alphabetically among the `@tauri-apps/api/*` group):

```ts
'@tauri-apps/api/webviewWindow': resolve(here, 'mocks/tauri-api-webviewWindow.ts'),
```

#### Control surface

**No changes** to `control.ts`. AgentOverviewApp's needs are fully covered by:
- `invocations` (logging)
- `invokeResponses` (canned `invoke` returns)
- `channels` + `emit()` (live event delivery via the existing `tauri-event` mock)

### Stories file pattern

`AgentOverviewApp.stories.tsx` mirrors the Phase 2 `WhatsNewApp.stories.tsx` pattern: an `AgentOverviewHarness` wrapper, a `story()` helper, parameter-driven seeding. The harness:

1. The global preview decorator already calls `getControl().reset()`.
2. Seeds `getControl().invokeResponses['list_agent_sessions'] = params.sessions ?? []` BEFORE mount.
3. Seeds `getControl().invokeResponses['list_worktree_changes']` and `['diff_worktree_vs_head']` from `params.fileChanges` and `params.diffSnippet` if provided.
4. After mount (next-frame), if `params.deltas` is set, schedules `ctrl.emit('agent-sessions-changed', delta)` for each entry, optionally with `params.deltaIntervalMs` between each emit.
5. Wraps `<AgentOverviewApp />` in a fixed-size container so Storybook's `layout: 'fullscreen'` renders against a deterministic viewport (default 1280×800; some stories override to test density tiers).

```tsx
function AgentOverviewHarness({ params }: { params: AgentOverviewStoryParams }) {
  const ctrl = getControl();
  ctrl.invokeResponses['list_agent_sessions'] = params.sessions ?? [];
  ctrl.invokeResponses['list_worktree_changes'] = params.fileChanges ?? { files: [] };
  if (params.diffSnippet !== undefined) {
    ctrl.invokeResponses['diff_worktree_vs_head'] = params.diffSnippet;
  }

  useEffect(() => {
    if (!params.deltas?.length) return;
    let cancelled = false;
    const interval = params.deltaIntervalMs ?? 0;
    let t = 0;
    for (const delta of params.deltas) {
      const id = window.setTimeout(() => {
        if (!cancelled) ctrl.emit('agent-sessions-changed', delta);
      }, t);
      t += interval;
      // cleanup tracked below
    }
    return () => { cancelled = true; };
  }, [params.deltas, params.deltaIntervalMs]);

  const w = params.viewportWidth ?? 1280;
  const h = params.viewportHeight ?? 800;
  return (
    <div style={{ width: w, height: h, ... }}>
      <AgentOverviewApp />
    </div>
  );
}
```

Story `parameters` field shape:

```ts
interface AgentOverviewStoryParams {
  sessions?: SessionRecord[];                   // initial list_agent_sessions response
  fileChanges?: { files: FileChangeRow[] };     // initial list_worktree_changes response
  diffSnippet?: { hunks: Array<...> };          // diff_worktree_vs_head response
  deltas?: SessionDelta[];                      // emitted on agent-sessions-changed
  deltaIntervalMs?: number;                     // delay between deltas (default 0)
  viewportWidth?: number;                       // harness wrapper width (default 1280)
  viewportHeight?: number;                      // harness wrapper height (default 800)
}
```

### Theme

The Phase 1 global toolbar (`light`/`dark`/`system`) covers AgentOverviewApp. The component reads CSS variables (`--color-background`, etc.) defined in `agent-overview.css` and the shared theme stylesheets — same pattern as every other app.

### Fixtures

`src/components/agent-overview/__fixtures__/agent-overview-data.ts`:

```ts
import type { SessionRecord, SessionState, TurnFile } from '@/services/agent-overview-types';

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord;

// Curated single-state sessions (one per state, ready to drop into a `sessions` array)
export const sessionWorking:    SessionRecord;
export const sessionTool:       SessionRecord;
export const sessionAwaiting:   SessionRecord;
export const sessionAwaitingOld: SessionRecord; // stateSinceMs >= 10m → alert tier
export const sessionFinished:   SessionRecord;
export const sessionIdle:       SessionRecord;
export const sessionEnded:      SessionRecord;
export const sessionArchived:   SessionRecord;  // idle + lastEventMs >= 24h
export const sessionSnoozed:    SessionRecord;  // awaiting + snoozedUntilMs in future
export const sessionSeen:       SessionRecord;  // working + seenAtMs set
export const sessionHighTokens: SessionRecord;  // tokenPct > 85
export const sessionMidTokens:  SessionRecord;  // tokenPct 65-85
export const sessionLongLabel:  SessionRecord;  // very long label/branch
export const sessionLongTask:   SessionRecord;  // very long task hero text
export const sessionWithFiles:  SessionRecord;  // currentTurnFiles populated

// Curated composite session lists
export const noSessions:           SessionRecord[]; // []
export const oneAwaiting:          SessionRecord[]; // [sessionAwaiting]
export const oneWorking:           SessionRecord[]; // [sessionWorking]
export const allStates:            SessionRecord[]; // one of each top-level state
export const multipleAwaiting:     SessionRecord[]; // 4 awaiting across 2 repos
export const multipleAwaitingMixedAge: SessionRecord[]; // 4 awaiting, normal/warn/alert tiers
export const multiRepoMixed:       SessionRecord[]; // 8 sessions, 3 repos, mixed states
export const heavyLoad:            SessionRecord[]; // 18 sessions, 4 repos → density 'wall'
export const moderateLoad:         SessionRecord[]; // 9 sessions → density 'standard'
export const allIdle:              SessionRecord[]; // 5 idle, none archived
export const idleWithArchived:     SessionRecord[]; // 3 archived + 2 fresh idle
export const allArchived:          SessionRecord[]; // 5 archived
```

`SessionRecord`, `SessionState`, `SessionDelta`, `TurnFile` are imported from `@/services/agent-overview-types` — never redeclared.

## Story Catalog (exhaustive — 29 stories)

### Empty / loading / single-state axis (5)

1. **Loading** — `sessions` omitted, `invokeResponses` returns `undefined` on first call (the production hook treats this as "not yet loaded"). Verifies the empty-tree pre-load layout (no rails, statusbar all zero).
2. **Empty** — `sessions: []`. Verifies "0 live, 0 awaiting, 0 archived" — every group renders blank.
3. **OneWorking** — `sessions: [sessionWorking]`. Single card, no awaiting rail, no idle rail, statusbar shows `working 1`.
4. **OneAwaiting** — `sessions: [sessionAwaiting]`. Awaiting rail shows one card, titlebar shows pill `1 awaiting · oldest …`.
5. **OneIdle** — `sessions: [sessionIdle]`. No awaiting rail, IdleRail visible with 1 row.

### State-coverage axis (4)

6. **AllStates** — one session per top-level state (`working`, `tool`, `awaiting`, `finished`, `idle`, `ended`). Verifies every `StateDot`, `StatePill`, and `ag-card--<state>` class renders. Default grouping (`repo`).
7. **AllStatesByStatus** — same dataset as AllStates, but with story-level interaction: harness pre-clicks the "Group" select to set it to `status` (or, simpler, the harness exposes a fallback by setting `__borgdock_test_…` — NOT introducing a new prod hook; instead we add a `play` function that fires `change` on the select to switch grouping after mount). Stays within "no production code changes."
8. **AllStatesByContext** — uses `multiRepoMixed` plus context-bucket-tagged sessions (`sessionHighTokens`, `sessionMidTokens`, default low). `play` switches grouping to `context`.
9. **AllStatesByActivity** — uses `multiRepoMixed`. `play` switches grouping to `activity`.

### Awaiting / urgency axis (3)

10. **MultipleAwaitingSameRepo** — 4 awaiting in one repo. Single `ag-rail-repo-head` with no worktree subheaders.
11. **MultipleAwaitingMixedAge** — `multipleAwaitingMixedAge` (one normal, one warn, one alert tier). Verifies the three `ag-tb-alert--{normal,warn,alert}` styles exist side-by-side.
12. **AwaitingAcrossRepos** — 6 awaiting across 3 repos and multiple worktrees per repo. Triggers worktree subheaders inside the awaiting rail.

### Density axis (3)

13. **DensityRoomy** — 5 live sessions in a 1280px viewport → `roomy`. AgentCards render at `comfortable` density.
14. **DensityStandard** — 10 live sessions in a 1280px viewport → `standard`.
15. **DensityWall** — 18 live sessions in a 1280px viewport → `wall`. Cards switch to compact.

### Idle / archived axis (3)

16. **IdleRailVisible** — 3 fresh idle + 2 working. IdleRail renders 3 rows.
17. **IdleRailWithArchived** — 3 archived + 2 fresh idle + 2 working. Default render hides the archived rows; statusbar shows `3 archived` toggle.
18. **IdleRailArchivedExpanded** — same dataset as `IdleRailWithArchived`, with `play` that clicks the `statusbar-archived-toggle`. Expects the IdleRail to show all 5 rows after the click.

### Live-update axis — drives `agent-sessions-changed` events post-mount (4)

19. **TransitionWorkingToAwaiting** — initial `[sessionWorking]`; `deltas: [{ kind: 'upsert', session: { ...sessionWorking, state: 'awaiting', stateSinceMs: 0, lastEventMs: 0 } }]`. After 600 ms, the session moves from the live grid into the awaiting rail; titlebar pill appears.
20. **TransitionAwaitingToIdle** — initial `[sessionAwaiting]`; `deltas: [{ kind: 'upsert', session: { ...sessionAwaiting, state: 'idle' } }]`. Session vanishes from the awaiting rail and reappears in the IdleRail.
21. **NewSessionArrives** — initial `[]`; `deltas: [{ kind: 'upsert', session: sessionWorking }, { kind: 'upsert', session: sessionAwaiting }]` with `deltaIntervalMs: 800`. Verifies progressive arrival.
22. **SessionEnds** — initial `[sessionWorking]`; `deltas: [{ kind: 'remove', sessionId: sessionWorking.sessionId }]` with `deltaIntervalMs: 1000`. Verifies removal causes the live grid to empty.

### Inspector axis (3)

23. **InspectorHovered** — initial `[sessionAwaiting]`; `play` dispatches `mouseenter` on the awaiting card so the popover opens. The inspector seeds canned `invokeResponses` for `list_worktree_changes` (empty) and renders the popover header + actions.
24. **InspectorPinned** — initial `[sessionAwaiting]` with `currentTurnFiles` populated and `fileChanges` seeding `list_worktree_changes` to return one modified file plus one read-only file. `play` clicks the card (pin), then clicks the file row (expand). The diff snippet renders.
25. **InspectorWithFiles** — initial `[sessionWithFiles]`; `play` opens the popover via hover. The inspector's "Files changed" section renders rows from `currentTurnFiles` plus the seeded diffstat.

### Edge cases (4)

26. **HeavyLoadManySessions** — `heavyLoad` (18 sessions). Default grouping is `repo`. Verifies the screen handles dozens of cards without breaking the grid.
27. **AllArchived** — `allArchived`. Live grid is empty; IdleRail hidden by default; statusbar shows the archived toggle.
28. **LongLabelsAndBranches** — uses `sessionLongLabel`. Verifies branch-name truncation in card chrome.
29. **OnlySnoozedAwaiting** — 2 awaiting sessions, both with `snoozedUntilMs` in the future. Awaiting rail and titlebar pill should NOT render (snoozed sessions are filtered out of `awaiting` in `AgentOverviewApp.tsx:38`).

**Total: 29 stories.** (Empty/loading 5 + state coverage 4 + awaiting 3 + density 3 + idle 3 + live 4 + inspector 3 + edge 4 = 29.)

## Tooling additions

### `package.json`
No changes. Storybook 9, `@storybook/test`, and `@storybook/addon-themes` already installed in Phase 1/2.

### `tsconfig.json`
The fixtures and stories paths are already covered by the existing globs (`src/**/*.tsx`, `src/**/*.ts`). No changes.

### Biome
The Phase 1 commit already extended `biome.json` includes to cover `.storybook/`. The new mock under `.storybook/mocks/` is automatically covered. Nothing to add.

### Test suites
- **Vitest**: untouched. The fixtures file is plain TypeScript that may be imported by future tests, but Phase 5 doesn't add or modify any vitest test.
- **Playwright**: untouched.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `useAgentSessions` hook subscribes to the channel asynchronously inside an `await` chain, so deltas emitted too early in the harness's `useEffect` arrive before the listener registers | high | Harness wraps each delta `emit()` in a `setTimeout` (default 0 ms, but never executes synchronously). Even with `interval = 0`, the `setTimeout` posts to the macrotask queue, giving the hook's `await listen(...)` time to resolve. The first interval-spaced story (`NewSessionArrives`, 800 ms) and the explicit-delay stories provide a safety margin. |
| `play` functions that interact with `<select>` elements need `userEvent.selectOptions` (not `click + click option`) to fire the React `onChange` | low | Use `userEvent.selectOptions(canvas.getByLabelText('Grouping'), 'status')` per `@storybook/test` docs. Verified pattern in Phase 2's `DisableAutoOpenInteraction`. |
| The mock for `getCurrentWebviewWindow().close()` swallows the click but the title-bar X icon visually depresses without feedback — risk that designers reading the catalog assume the window actually closed | low | Document in the spec/plan that `close()` is a deliberate no-op in Storybook. Comment in the mock file. |
| `useNowTick` re-renders every 1s, which fights Storybook's auto-snapshot tooling later (visual regression phase) | low | Out of scope here. The story's `params.deltaIntervalMs` accommodates the natural tick — when visual regression lands, that phase will decide whether to mock `Date.now()` globally. |
| Inspector popover's `placePopover()` measures real DOM rects that depend on Storybook's iframe size; the popover may render off-screen at narrower viewports | medium | All inspector stories use the default `viewportWidth: 1280`, and the harness's outer `<div>` wraps the app in a sized container. The popover's clamping logic is exercised because the wrapper is the bounding box. If a story still mis-renders, fall back to `viewportWidth: 1440`. |
| `requestAnimationFrame` callback in `AgentOverviewApp` invokes `'window_ready'` which we mock as a no-op via `tauri-core` — fine in Storybook since `invokeResponses['window_ready']` is undefined and the mock returns `undefined as T` | low | Already handled by the existing `tauri-core` mock. The component's `.catch(() => {})` swallows any error. |
| Roadmap row claimed `plugin-shell` is needed; we're skipping it | low | Spec calls this out; plan adds a roadmap-correction commit with a one-line clarification ("AgentOverviewApp does not use plugin-shell — that surface will land with a later phase"). |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 29 stories render.
2. Light/dark toolbar toggle re-renders every story without reload.
3. `npm run build-storybook` completes.
4. `npm run lint` and `npm run test` pass.
5. Production code is byte-identical (`git diff origin/master...storybook-phase5-agent-overview -- src/BorgDock.Tauri/src/components/agent-overview src/BorgDock.Tauri/src/hooks/useAgentSessions.ts src/BorgDock.Tauri/src/hooks/useInspectorState.ts src/BorgDock.Tauri/src/hooks/useKeyboardShortcuts.ts src/BorgDock.Tauri/src/services/agent-overview.ts src/BorgDock.Tauri/src/services/agent-overview-types.ts src/BorgDock.Tauri/src/services/notification.ts ':(exclude)src/BorgDock.Tauri/src/components/agent-overview/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/agent-overview/*.stories.tsx'` shows zero lines).
6. `.storybook/mocks/` gains exactly one new file (`tauri-api-webviewWindow.ts`); `main.ts` gains exactly one new alias entry; `control.ts` is unchanged.
7. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR: Agent Overview moves from "Pending" to "Done"; the "Mock layer extensions" list grows by one bullet; the row's "Tauri surfaces" column is corrected to drop `plugin-shell`.

## What comes next (out of scope here)

- **Phase 6 candidate:** Work Item Detail or another pending row per the roadmap. Phase 6 will likely introduce `@tauri-apps/plugin-dialog`.
- **Component-level stories** for the agent-overview children — easier now that the window-level catalog exposes their states.
- **Visual regression tooling decision** — the four-screen breadth (Flyout + What's New + ??? + Agent Overview, with phases 3 and 4 in flight) is enough to start evaluating Chromatic vs. Playwright snapshots.
