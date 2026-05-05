# Storybook Phase 3 — WorktreePaletteApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for `src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.tsx` (the window mounted by `worktree-main.tsx`), extending the Phase 1+2 mock layer with one new alias (`@tauri-apps/api/dpi`), broader `@tauri-apps/api/window` coverage, and a function-form for `invokeResponses`. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the third window to be storied. WorktreePaletteApp is a deliberate Phase 3 pick because:

- It's an M-sized palette window — fast turnaround, but more state-shape variety than WhatsNew.
- It exercises **palette infrastructure** the Phase 4+ File Palette and Work Item Palette will reuse: auto-resize logic against `currentMonitor`, the `palette-shown` re-show event channel, the `window_ready` reveal handshake, and a `Promise.allSettled` per-repo data-fetch fan-out.
- It introduces a new alias (`@tauri-apps/api/dpi`) and adds full `getCurrentWindow()` resize-method coverage to the existing `tauri-api-window.ts` mock — both reusable by every other window that does palette-style auto-resize.
- It introduces a **function-form for `invokeResponses`** (`(args) => T`) so stories can vary a single command's response by argument — required here for the "one repo errors, others succeed" story, but applies broadly to any window that fans out the same `invoke` per repo / per file / per work-item.

### Roadmap correction included in this PR

The roadmap currently describes Worktree as "Includes the prune dialog and the changes panel." That's wrong:
- `WorktreePruneDialog` is rendered from `components/settings/MaintenanceSection.tsx` — Settings phase territory.
- `WorktreeChangesPanel` and `WorktreeDiffOverlay` are exported from `components/worktree-changes/` but not rendered by any window today (orphaned but committed). Out of scope here per the locked "no per-component stories yet" decision.

The Pending-table row will be corrected in the same PR.

## Non-Goals

- Per-component stories for `WorktreeRow` — deferred to the cross-cutting "component-level stories" phase noted in the roadmap.
- Stories for `WorktreePruneDialog` (lives in Settings) and `WorktreeChangesPanel` / `WorktreeDiffOverlay` (orphaned). Not rendered by the Worktree window.
- Visual regression integration / Chromatic / Storybook test-runner — still deferred.
- Hero-shot pipeline integration — later phase.
- Touching any production file under `src/components/worktree-palette/`, `src/types/settings.ts`, `src/utils/parse-error.ts`, or `src/worktree-main.tsx`.
- Adding a `__borgdock_test_*` seed hook in `WorktreePaletteApp.tsx`. The existing `invokeResponses` + `emit` surfaces are sufficient — no production code change needed.
- Mocking `@tauri-apps/api/dpi`'s full surface (matrix transforms, `toLogical`/`toPhysical` round-trips). Only `LogicalSize` and `PhysicalSize` constructors are stubbed — the consumer needs constructors only.

## Constraints

- **No production code changes.** Verified via `git diff master...storybook-phase3-worktree -- src/BorgDock.Tauri/src/components/worktree-palette src/BorgDock.Tauri/src/types/settings.ts src/BorgDock.Tauri/src/utils/parse-error.ts` showing zero lines.
- Storybook 9 + React-Vite + Tailwind v4 setup from Phase 1 stays as-is. Only additive changes to `.storybook/`.
- The control surface (`window.__borgdock_storybook_tauri`) gains two new fields (`windowSize`, `monitorState`) and the `invokeResponses` value type widens to `unknown | ((args: unknown) => unknown)`. The widening is backwards-compatible: every existing static value still works.
- All Phase 1+2 stories continue to render unmodified. The `tauri-core.ts` and `tauri-api-window.ts` extensions are additive.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                                 # +1 alias entry: @tauri-apps/api/dpi
│   └── mocks/
│       ├── control.ts                          # +windowSize, +monitorState; invokeResponses widened
│       ├── tauri-core.ts                       # honors function-form invokeResponses
│       ├── tauri-api-window.ts                 # +currentMonitor; getCurrentWindow() gains hide/setSize/innerSize/scaleFactor
│       └── tauri-api-dpi.ts                    # NEW
└── src/components/worktree-palette/
    ├── __fixtures__/
    │   └── worktree-data.ts                    # synthetic factories + curated histories
    └── WorktreePaletteApp.stories.tsx          # 28 stories
```

### Mock additions

#### `tauri-core.ts` extension

`invokeResponses[command]` widens to `unknown | ((args: unknown) => unknown)`. Function values are called with the live args and the returned value (or Promise) is awaited. Sync values keep working unchanged.

```ts
import { getControl } from './control';

export async function invoke<T = unknown>(command: string, args?: unknown): Promise<T> {
  const ctrl = getControl();
  ctrl.invocations.push({ command, args });
  const response = ctrl.invokeResponses[command];
  if (typeof response === 'function') {
    return (await (response as (a: unknown) => unknown)(args)) as T;
  }
  return (response as T) ?? (undefined as T);
}
```

This unblocks the **OneRepoErrored / MixedSuccessAndError** stories where `list_worktrees_bare` must succeed for some `basePath` values and reject for others.

#### `tauri-api-window.ts` extension

`getCurrentWindow()` gains the methods Worktree calls:

```ts
interface MockWindow {
  // existing
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  // new
  hide(): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
  innerSize(): Promise<{ width: number; height: number }>;
  scaleFactor(): Promise<number>;
}
```

- `hide()` — records `'window.hide'` invocation, no-op (otherwise Esc unmounts the iframe).
- `innerSize()` / `scaleFactor()` — read `getControl().windowSize` (defaults `{ width: 480, height: 600, scaleFactor: 1 }`).
- `setSize(size)` — records `'window.setSize'` and updates `getControl().windowSize.width/height`. The actual Storybook iframe size is unchanged; we only log that the resize logic ran.

New top-level export:

```ts
export async function currentMonitor(): Promise<{
  size: { width: number; height: number };
  scaleFactor: number;
} | null> {
  return getControl().monitorState ?? { size: { width: 1920, height: 1080 }, scaleFactor: 1 };
}
```

#### `tauri-api-dpi.ts` (NEW)

```ts
// .storybook/mocks/tauri-api-dpi.ts
//
// Drop-in replacement for @tauri-apps/api/dpi. Only the constructors used
// by WorktreePaletteApp (and by extension future palette windows) are
// stubbed. The `type` discriminator field mirrors the real Tauri shape in
// case future windows introspect it.

export class LogicalSize {
  readonly type = 'Logical' as const;
  constructor(public width: number, public height: number) {}
}

export class PhysicalSize {
  readonly type = 'Physical' as const;
  constructor(public width: number, public height: number) {}
}

export class LogicalPosition {
  readonly type = 'Logical' as const;
  constructor(public x: number, public y: number) {}
}

export class PhysicalPosition {
  readonly type = 'Physical' as const;
  constructor(public x: number, public y: number) {}
}
```

`LogicalPosition` / `PhysicalPosition` are included alongside the size classes — the real `@tauri-apps/api/dpi` exports both pairs and a future window pulling either in won't trigger another mock-layer extension.

#### `control.ts` extensions

```ts
export interface StorybookTauriControl {
  // existing
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, unknown | ((args: unknown) => unknown)>;  // WIDENED

  // Phase 2
  windowState: { isMaximized: boolean };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  // Phase 3 additions
  windowSize: { width: number; height: number; scaleFactor: number };
  monitorState: { size: { width: number; height: number }; scaleFactor: number } | null;

  reset(): void;   // extended to wipe windowSize/monitorState
  emit(channel: string, payload: unknown): void;
}
```

`reset()` resets `windowSize = { width: 480, height: 600, scaleFactor: 1 }` and `monitorState = null` (so the `currentMonitor()` mock falls back to its default 1920×1080).

#### `.storybook/main.ts` aliases

Add one entry:

```ts
'@tauri-apps/api/dpi': resolve(here, 'mocks/tauri-api-dpi.ts'),
```

### Stories file pattern

`WorktreePaletteApp.stories.tsx` follows the WhatsNew precedent:
- A `WorktreeHarness` wrapper component reads `parameters.worktree.*` from the story context and seeds `getControl()` before mount.
- Per-story `parameters.worktree`: `{ settings, listResponses, monitorState?, windowSize? }`.
  - `settings`: the `AppSettings` object the `load_settings` invoke returns.
  - `listResponses`: either a static `WorktreeEntry[]` (used for every `list_worktrees_bare` call regardless of `basePath`) OR a function `(args) => WorktreeEntry[] | Promise<…>` for per-`basePath` differentiation.
- The harness writes:
  ```ts
  getControl().invokeResponses['load_settings'] = params.settings;
  getControl().invokeResponses['list_worktrees_bare'] = params.listResponses;
  if (params.monitorState !== undefined) getControl().monitorState = params.monitorState;
  if (params.windowSize)  Object.assign(getControl().windowSize, params.windowSize);
  ```
- The global `reset()` in `preview.ts` already runs before each story, so the harness only adds — never clears.

Stories that exercise `palette-shown` re-emission use `play`:
```ts
play: async () => { getControl().emit('palette-shown', null); }
```

### Theme

Existing global toolbar (`light` / `dark` / `system`) covers it. `WorktreePaletteApp` uses Tailwind `dark:` modifiers and CSS custom properties — no per-story wiring needed.

### Fixtures

`src/components/worktree-palette/__fixtures__/worktree-data.ts`:

```ts
import type { AppSettings, RepoSettings } from '@/types/settings';

export interface WorktreeEntry {                          // mirrors local interface in WorktreePaletteApp.tsx
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

export function makeRepo(overrides?: Partial<RepoSettings>): RepoSettings;
export function makeWorktree(overrides?: Partial<WorktreeEntry>): WorktreeEntry;
export function makeSettings(repos: RepoSettings[], ui?: Partial<AppSettings['ui']>): AppSettings;

// Curated repo fixtures
export const repoBorgDock:   RepoSettings;       // borght-dev/BorgDock,  posix path
export const repoFspHorizon: RepoSettings;       // gomocha/fsp-horizon,  windows path (C:\\Dev\\…)
export const repoLongName:   RepoSettings;       // very/long-organization-name-that-overflows
export const repoNoBasePath: RepoSettings;       // worktreeBasePath = ''  (filtered out)
export const repoDisabled:   RepoSettings;       // enabled = false
export const repoWithFavs:   RepoSettings;       // favoriteWorktreePaths populated

// Worktree shape variants
export const wtMain:               WorktreeEntry;
export const wtFeature:            WorktreeEntry;
export const wtDetached:           WorktreeEntry;     // branchName === ''
export const wtLongBranch:         WorktreeEntry;     // 80-char branch
export const wtLongPath:           WorktreeEntry;     // deep nested path
export const wtFavoriteCandidate1: WorktreeEntry;
export const wtFavoriteCandidate2: WorktreeEntry;

// Curated histories
export const oneRepoFew:        { repo: RepoSettings; trees: WorktreeEntry[] };  // 3 trees
export const oneRepoMany:       { repo: RepoSettings; trees: WorktreeEntry[] };  // 30 trees
export const twoReposBalanced:  Array<{ repo: RepoSettings; trees: WorktreeEntry[] }>;
export const twoReposLopsided:  Array<{ repo: RepoSettings; trees: WorktreeEntry[] }>;
export const fiveRepos:         Array<{ repo: RepoSettings; trees: WorktreeEntry[] }>;
```

`AppSettings` and `RepoSettings` are imported from `@/types/settings` — never redeclared. `WorktreeEntry` mirrors the local interface inside `WorktreePaletteApp.tsx` since that interface is not exported (acceptable — the duplication is one shape, three fields, and matching it is a deliberate test point: if production drifts, fixtures fail to type-check).

## Story Catalog (exhaustive — 28 stories)

### Loading axis (3)
1. **Loading** — `invokeResponses['load_settings']` set to a never-resolving promise (function form returning `new Promise(() => {})`); pre-data UI ("Scanning worktrees…").
2. **Refreshing** — Story renders loaded once, then `play` clicks the refresh button; second `load_settings` call is pending, refresh icon's `animate-spin` class is on.
3. **WindowReadyDeferred** — first paint with `loading=false` and 5 worktrees; `play` waits 100ms and asserts `getControl().invocations` includes a `'window_ready'` entry (proves the 50ms reveal effect fires).

### Empty / no-data axis (3)
4. **NoReposConfigured** — `settings.repos = []` → "No worktrees configured" + "Settings → Repos" hint.
5. **AllReposDisabled** — repos exist but all `enabled=false` → same empty state (the `.filter()` excludes them before the fetch fan-out).
6. **AllReposNoBasePath** — repos exist + enabled but `worktreeBasePath = ''` → same empty state (filtered out).

### Single-repo / list-shape axis (4)
7. **OneRepoMainOnly** — single repo, only its main worktree → no star button on that row, `main` pill rendered, branch-icon glyph (not the star).
8. **OneRepoFewTrees** — one repo, 3 trees (1 main + 2 feature branches).
9. **OneRepoManyTrees** — `oneRepoMany` (30 trees); scroll triggers; `play` step asserts `getControl().invocations` includes `'window.setSize'` (auto-resize executed).
10. **OneRepoMixedDetached** — includes `wtDetached` → "(detached)" rendered with the `bd-wt-branch--detached` modifier.

### Multi-repo grouping axis (3)
11. **TwoReposBalanced** — `twoReposBalanced` fixture, both group headers visible with their counts as `Pill tone="ghost"`.
12. **TwoReposLopsided** — `twoReposLopsided` (1 main vs 25 trees), grouping ratio extreme.
13. **FiveRepos** — `fiveRepos`, deep accordion-of-groups layout.

### Error axis (4)
14. **OneRepoErrored** — fn-form `listResponses`: returns rejection for one `basePath`, success array for the others. Group header shows `Pill tone="error"` + parsed message in `bd-wt-error-detail`.
15. **AllReposErrored** — all repos reject; every group shows error pills, no rows.
16. **MixedSuccessAndError** — three repos: success / error / empty array → covers the `Promise.allSettled` mixed-outcome path.
17. **SettingsLoadFailed** — `invokeResponses['load_settings'] = () => Promise.reject(...)`. Component catches silently per the production try/catch and renders the "no worktrees configured" empty state — documents the silent-failure mode.

### Filter / favorites axis (6)
18. **FilterMatchingByBranch** — `play` types `'feature'`; rows whose branch contains 'feature' remain.
19. **FilterMatchingByFolder** — `play` types a path fragment; folder-name match path.
20. **FilterMatchingByRepo** — `play` types `'borgdock'`; only that repo's group shows.
21. **FilterNoMatch** — `play` types `'zzz'`; "No worktrees matching 'zzz'" empty.
22. **FavoritesOnlyEmpty** — settings's `ui.worktreePaletteFavoritesOnly = true`, no favorites; "No favorite worktrees" + star-marker hint copy.
23. **FavoritesOnlyWithMix** — `worktreePaletteFavoritesOnly = true`, two favorites + a main worktree; main + favorites only (main always visible per code).

### Selection / keyboard axis (3)
24. **FirstRowSelected** — default render; first row has `bd-wt-row--selected`.
25. **MidListSelected** — `play` presses ArrowDown 5x; row 6 highlighted, scrolled into view.
26. **EnterOpensTerminal** — `play` selects a row, presses Enter; story asserts `getControl().invocations` ends with `{ command: 'open_in_terminal', args: { path: '...' } }`.

### Interaction axis (2)
27. **ToggleFavoriteOptimistic** — `play` clicks star on a non-favorite row; the star fills before `save_settings` resolves; assertion confirms the optimistic local update plus the `save_settings` invocation.
28. **PaletteReshown** — story emits `getControl().emit('palette-shown', null)` mid-render via `play`; query field clears, `setRefreshing(true)` triggers, second `load_settings` call recorded.

(`open-folder`, `open-in-editor`, and the favorites-only-toggle button interactions follow the same pattern as `EnterOpensTerminal` and `ToggleFavoriteOptimistic`. They're flagged as "covered by precedent" rather than getting near-duplicate stories — keeps the catalog crisp without losing axis coverage.)

**Total: 28 stories.**

## Tooling additions

### `package.json`
No changes. Storybook deps installed in Phase 1 are sufficient.

### `tsconfig.json`
The fixtures and stories paths are already covered by the existing globs (`src/**/*.tsx`). No changes.

### Biome
The Phase 1 commit already extended `biome.json` includes to cover `.storybook/`. Nothing to add.

### Test suites
- **Vitest**: untouched. Existing `WorktreePaletteApp` tests don't import the new fixtures; if they choose to in the future, the fixtures are plain TypeScript that will load under jsdom without changes.
- **Playwright**: untouched. No e2e suite for this window today; if one lands later, it drives the real Tauri webview.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Widening `invokeResponses` to allow function values silently breaks Phase 1/2 stories that rely on the value form | low | Backwards-compat by construction — `tauri-core.ts` checks `typeof === 'function'` and falls back to value-form. Acceptance gate: every Phase 1/2 story still renders. |
| `LogicalSize` mock missing the discriminator field breaks a future window's introspection | low | Mock includes `type: 'Logical' as const` mirroring the real Tauri shape. Position classes added preemptively for the same reason. |
| `currentMonitor()` returning `null` in some stories breaks the resize math | medium | Default mock value is a populated 1920×1080 monitor. Empty-list and one-row stories exercise the "no overflow, no shrink" branch where monitor data is irrelevant — both paths covered. |
| `requestAnimationFrame` + `setTimeout(50)` in the reveal effect race against Storybook's render lifecycle, hiding the iframe | low | The reveal calls `invoke('window_ready')` (no-op in the mock) and `searchRef.current?.focus()`. Neither has visual side effects in Storybook. The `WindowReadyDeferred` story's `play` step waits past the timer and asserts the invocation, validating the path. |
| Auto-resize effect causes story panel to flicker as it tries to read `contentEl.scrollHeight` | medium | The effect runs `win.setSize(...)` which is logged-only in the mock. Storybook's iframe controls visible bounds; no flicker. |
| 30-row story (`OneRepoManyTrees`) blows up render time when many stories are open | low | Storybook lazy-renders one story at a time; 30 simple rows is well within budget. |
| Function-form `invokeResponses` could be misused to introduce non-determinism | low | Guidance in the per-story comment block says fn-form is for arg-discriminated responses only. Each fn-form story includes a deterministic mapping in its parameters. |
| `WorktreeEntry` interface is mirrored in fixtures (not imported from the production module) and silently drifts from production if the local interface changes | low | The local interface is small (3 fields) and stable. If it changes, stories that consume the fixtures fail to type-check against the local production interface at story render time — caught at lint/test. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 28 Worktree stories render alongside Phase 1+2 stories (no regressions).
2. Light/dark toolbar toggle re-renders every Worktree story without reload.
3. `npm run build-storybook` completes cleanly.
4. `npm run lint` and `npm run test` pass on macOS and Windows CI runners.
5. **Production code is byte-identical** — verified by:
   ```bash
   git diff master...storybook-phase3-worktree -- \
     src/BorgDock.Tauri/src/components/worktree-palette \
     src/BorgDock.Tauri/src/types/settings.ts \
     src/BorgDock.Tauri/src/utils/parse-error.ts \
     src/BorgDock.Tauri/src/worktree-main.tsx
   ```
   shows zero lines.
6. Mock layer ends with: one new file (`.storybook/mocks/tauri-api-dpi.ts`), one new alias (`@tauri-apps/api/dpi`), `tauri-api-window.ts` extended with `currentMonitor` and `getCurrentWindow().{hide,setSize,innerSize,scaleFactor}`, `tauri-core.ts` extended with function-form `invokeResponses`, `control.ts` gains `windowSize` and `monitorState` plus the widened `invokeResponses` value type.
7. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR:
   - Worktree row moves Pending → Done with spec/plan/PR links.
   - The Pending-table description for Worktree is corrected: it's a palette of worktrees; the prune dialog actually lives in Settings; the changes panel is unrendered in any window today.
   - "Mock layer extensions" section gains `@tauri-apps/api/dpi → mocks/tauri-api-dpi.ts` and a one-line note that `tauri-api-window` now also exports `currentMonitor` and full `getCurrentWindow()` resize methods, and that `tauri-core` now supports function-form `invokeResponses`.
8. CI: vitest green on macOS and Windows. Playwright is allowed to fail (pre-existing flakiness — established Phase 2 precedent).

## What comes next (out of scope here)

- **Phase 4 candidate:** another M-sized window. After this phase, File Palette and Work Item Palette are cheap because the palette / `currentMonitor` / `setSize` mock infrastructure is in place. Settings remains the highest-leverage L window and the next logical step toward the per-component Toggle/Slider/Select/Field/Seg2 catalog.
- **Component-level stories** for `WorktreeRow` — easier now that the window-level catalog surfaces every row state.
- **Visual regression tooling decision** — three windows storied is the threshold the roadmap set. After this phase we hit it; the decision becomes the next cross-cutting workstream.
