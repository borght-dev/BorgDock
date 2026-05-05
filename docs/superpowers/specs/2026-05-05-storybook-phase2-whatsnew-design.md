# Storybook Phase 2 — WhatsNewApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.tsx`, extending the Phase 1 mock layer with three new Tauri surfaces. Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the second window to be storied. WhatsNewApp is a deliberate Phase 2 pick because:

- It's small (one ~192-line root + four small children) — fast win.
- It exercises **three Tauri surfaces the FlyoutApp didn't touch** (`@tauri-apps/api/window`, `@tauri-apps/api/app`, `@tauri-apps/plugin-store`), so the mock layer grows in a useful direction without committing to a complex screen.
- It uses a **Zustand store hydrated from `plugin-store`**, validating the pattern that any future window using the same persistence layer can reuse.
- It depends on **build-time generated data** (`RELEASES` from `src/generated/changelog.ts`), letting us validate "real-data backdrop + synthetic edge-case fixtures" — the hybrid strategy decided in brainstorming.

## Non-Goals

- Per-component stories for `HeroBanner`, `HighlightCard`, `ReleaseAccordion`, `AlsoFixedList` — deferred to the cross-cutting "component-level stories" phase noted in the roadmap.
- Visual regression integration / Chromatic / Storybook test-runner — still deferred.
- Hero-shot pipeline integration — later phase.
- Mocking `services/logger` / `attachConsoleBridge()` — those run from `whats-new-main.tsx` (the Tauri entry), which the stories do NOT render. Stories render `<WhatsNewApp />` directly.
- Touching any production file under `src/components/whats-new/`, `src/stores/whats-new-store.ts`, `src/utils/semver.ts`, or `src/generated/changelog.ts`.
- Adding stories for the `whats-new:navigate` `CustomEvent`. The `TargetedAtSpecificVersion` story covers the same code path via `__BORGDOCK_WHATS_NEW__.version`, which is the production primary mechanism.

## Constraints

- **No production code changes.** Verified via `git diff master...storybook-phase2-whatsnew -- src/BorgDock.Tauri/src/components/whats-new src/BorgDock.Tauri/src/stores/whats-new-store.ts src/BorgDock.Tauri/src/utils/semver.ts src/BorgDock.Tauri/src/generated/changelog.ts` showing zero changes.
- Storybook 9 + React-Vite + Tailwind v4 setup from Phase 1 stays as-is. Only additive changes to `.storybook/`.
- The control surface (`window.__borgdock_storybook_tauri`) gets two new fields (`windowState`, `pluginStore`) but is otherwise unchanged. The existing `reset()` is extended to clear them.
- Real `RELEASES` from `src/generated/changelog.ts` is the default backdrop for stories that test breadth; synthetic releases (defined in `__fixtures__/whats-new-data.ts`) handle deterministic edge cases.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                                 # extend resolve.alias with 3 new entries
│   └── mocks/
│       ├── control.ts                          # extend StorybookTauriControl with windowState + pluginStore
│       ├── tauri-api-window.ts                 # NEW
│       ├── tauri-api-app.ts                    # NEW
│       └── tauri-plugin-store.ts               # NEW
└── src/components/whats-new/
    ├── __fixtures__/
    │   └── whats-new-data.ts                   # synthetic Release factories + curated edge-case releases
    └── WhatsNewApp.stories.tsx                 # 31 stories
```

### Mock additions

#### `tauri-api-window.ts`

Stand-in for `@tauri-apps/api/window`. Only `getCurrentWindow()` is exported (the surface WhatsNewApp uses).

```ts
import { getControl } from './control';

interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
}

export function getCurrentWindow(): MockWindow {
  const ctrl = getControl();
  return {
    async close()      { ctrl.invocations.push({ command: 'window.close' }); },
    async minimize()   { ctrl.invocations.push({ command: 'window.minimize' }); },
    async maximize()   { ctrl.invocations.push({ command: 'window.maximize' });   ctrl.windowState.isMaximized = true; },
    async unmaximize() { ctrl.invocations.push({ command: 'window.unmaximize' }); ctrl.windowState.isMaximized = false; },
    async isMaximized() { return ctrl.windowState.isMaximized; },
  };
}
```

`close()` is a no-op in Storybook — critical, otherwise the "Got it" button would kill the iframe.

#### `tauri-api-app.ts`

Stand-in for `@tauri-apps/api/app.getVersion()`. Returns `getControl().appVersion ?? '1.2.0'` so stories can override.

```ts
import { getControl } from './control';

export async function getVersion(): Promise<string> {
  return getControl().appVersion ?? '1.2.0';
}
```

#### `tauri-plugin-store.ts`

Stand-in for `@tauri-apps/plugin-store.load(path)`. Returns a Map-backed store keyed per `path` so semantics match the real plugin (multiple files don't collide).

```ts
import { getControl } from './control';

interface MockStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export async function load(path: string): Promise<MockStore> {
  const ctrl = getControl();
  let bag = ctrl.pluginStore.get(path);
  if (!bag) {
    bag = new Map();
    ctrl.pluginStore.set(path, bag);
  }
  return {
    async get<T>(key: string) { return bag!.get(key) as T | undefined; },
    async set(key, value)     { bag!.set(key, value); },
    async save()              { /* no-op — in-memory */ },
  };
}
```

Stories seed values BEFORE render via the harness's `parameters.whatsNew.pluginStoreSeed = { 'whats-new-state.json': { lastSeenVersion: '...', autoOpenDisabled: false } }`. The harness pushes those into `getControl().pluginStore` before mount.

The mock also honors `ctrl.pluginStoreBehavior`:
- `'normal'` (default) — behaves as described above.
- `'pending'` — `load()` returns a Promise that never resolves. Used by the **Hydrating** story.
- `'reject'` — `load()` returns a Promise that rejects with an `Error('storybook: plugin-store unavailable')`. Used by the **StoreHydrationFailed** story.

The implementation reads the behavior at the top of `load()` and branches accordingly. `reset()` puts it back to `'normal'`.

#### `control.ts` extensions

```ts
interface StorybookTauriControl {
  // existing
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, unknown>;

  // NEW (Phase 2)
  windowState: { isMaximized: boolean };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: 'normal' | 'pending' | 'reject';
  appVersion: string | null;
  releasesOverride: Release[] | null;

  reset(): void;   // extended to wipe windowState/pluginStore/appVersion
  emit(channel: string, payload: unknown): void;
}
```

`reset()` resets `windowState.isMaximized = false`, clears `pluginStore`, sets `pluginStoreBehavior = 'normal'`, sets `appVersion = null`, and sets `releasesOverride = null`.

#### `.storybook/main.ts` aliases

Add three entries to `viteFinal`:

```ts
'@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
'@tauri-apps/api/app':    resolve(here, 'mocks/tauri-api-app.ts'),
'@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
```

### Stories file pattern

`WhatsNewApp.stories.tsx` mirrors the FlyoutApp pattern: a `WhatsNewHarness` wrapper, a `story()` helper, parameter-driven seeding. The harness:

1. Calls `getControl().reset()` (already done by the global preview decorator).
2. Seeds `getControl().pluginStore.set('whats-new-state.json', new Map(Object.entries(params.pluginStoreSeed ?? {})))` before mount.
3. Sets `getControl().windowState.isMaximized = params.windowMaximized ?? false`.
4. Sets `getControl().appVersion = params.appVersion ?? '1.2.0'`.
5. Sets `(window as any).__BORGDOCK_WHATS_NEW__ = params.targetVersion ? { version: params.targetVersion } : undefined`.
6. If `params.releasesOverride` is present, the harness passes a synthetic `RELEASES`-shaped array via React state and renders a thin shim that injects it. Practical detail: `WhatsNewApp` reads `RELEASES` directly via static import, so to override we either (a) extract the read into a prop (would require touching prod code — VIOLATES no-prod-changes) or (b) **leverage the Vite alias mechanism** by additionally aliasing `@/generated/changelog` to a Storybook-side stub that reads from `getControl().releasesOverride`.

We choose **(b)**: add a fourth alias for `@/generated/changelog` pointing to `.storybook/mocks/generated-changelog.ts`. That mock module re-exports the real array by default but allows stories to override:

```ts
// .storybook/mocks/generated-changelog.ts
import { RELEASES as REAL_RELEASES } from '../../src/generated/changelog';
import { getControl } from './control';

export const RELEASES = new Proxy([] as typeof REAL_RELEASES, {
  get(_target, prop, receiver) {
    const source = getControl().releasesOverride ?? REAL_RELEASES;
    return Reflect.get(source, prop, receiver);
  },
});
```

The Proxy means every read against `RELEASES` (including `.length`, indexed access, iterator) goes through the override-or-real path. Most stories don't set `releasesOverride` and get the real changelog. Edge-case stories set it.

`getControl()` gains a `releasesOverride: typeof RELEASES | null` field.

### Theme

The Phase 1 global toolbar (`light`/`dark`/`system`) covers WhatsNewApp without any new wiring. WhatsNewApp uses Tailwind's `dark:` modifier via `documentElement.classList`, same as the rest of the app.

### Fixtures

`src/components/whats-new/__fixtures__/whats-new-data.ts`:

```ts
import type { Release } from '@/types/whats-new';

export function makeRelease(overrides: Partial<Release> = {}): Release { … }

// Curated synthetic releases for edge-case stories
export const releaseEmptySummary:    Release;
export const releaseRichSummary:     Release;
export const releaseNoHighlights:    Release;
export const releaseSingleHighlight: Release;
export const releaseManyHighlights:  Release; // 6 highlights
export const releaseLongHighlight:   Release; // one giant highlight
export const releaseNoFixes:         Release;
export const releaseFewFixes:        Release; // 3 items
export const releaseLongFixList:     Release; // 25 items
export const releaseLongMixed:       Release; // worst-case layout
export const releaseLongVersion:     Release; // version: '1.2.0-beta.4+build.42'
export const releaseLongDate:        Release;

// Curated synthetic histories
export const noReleases:             Release[]; // []
export const oneRelease:             Release[]; // [single]
export const deepHistory:            Release[]; // 8+ chronological
```

`Release` is imported from the production type at `src/types/whats-new.ts` — never redeclared.

## Story Catalog (exhaustive — 31 stories)

### Store-state axis (8)
1. **Hydrating** — `params.pluginStoreSeed` omitted; `WhatsNewApp` calls `hydrate()` which never resolves in this story (we control the mock to return a never-resolving promise via `params.hydratePending: true`). Verifies the splash/empty pre-hydration state.
2. **FirstTimeUser** — pluginStore seeded with `{}` (no `lastSeenVersion`); count-behind reflects every shipped release.
3. **UpToDate** — `lastSeenVersion = '<latest>'`; "Up to date" copy.
4. **OneVersionBehind** — `lastSeenVersion = '<second-newest>'`; "1 version behind".
5. **ManyVersionsBehind** — `lastSeenVersion = '<3+ behind>'`; "N versions behind".
6. **AutoOpenDisabledAlready** — `autoOpenDisabled: true`; checkbox renders pre-checked.
7. **TargetedAtSpecificVersion** — `params.targetVersion` set to a real release version; that accordion entry expands.
8. **TargetedAtMissingVersion** — `params.targetVersion = '99.99.99'`; harness should fall back to the newest missed (or newest overall) per `useReleasesToShow.ts:33-36`.

### Release-shape axis — synthetic releases (10)
Each of these stories sets `params.releasesOverride` to an array containing the named curated release plus enough surrounding context (typically 2 prior real-history entries) to keep the accordion meaningful.

9. **ReleaseEmptySummary** — uses `releaseEmptySummary`.
10. **ReleaseRichSummary** — uses `releaseRichSummary`.
11. **ReleaseNoHighlights** — uses `releaseNoHighlights`.
12. **ReleaseSingleHighlight** — uses `releaseSingleHighlight`.
13. **ReleaseManyHighlights** — uses `releaseManyHighlights`.
14. **ReleaseLongHighlightCard** — uses `releaseLongHighlight`.
15. **ReleaseNoFixes** — uses `releaseNoFixes`.
16. **ReleaseFewFixes** — uses `releaseFewFixes`.
17. **ReleaseLongFixList** — uses `releaseLongFixList` (25+ items, scroll behavior).
18. **ReleaseLongMixed** — uses `releaseLongMixed` (worst-case combined layout).

### Accordion axis (4)
19. **AccordionAllCollapsed** — synthetic 5-release history, lastSeenVersion = current, no targetVersion → no expansion.
20. **AccordionTargetExpanded** — same history, targetVersion set to a mid-list version.
21. **AccordionDeepHistory** — `deepHistory` fixture (8+ releases).
22. **AccordionWithDates** — synthetic history with date spans (today / weeks ago / months ago / >1 year).

### Window-chrome / interaction axis (4)
23. **WindowMaximized** — `windowMaximized: true`; chrome renders unmaximize glyph.
24. **WindowNotMaximized** — default; renders maximize glyph (also covered by other stories — keeping as a deliberate paired counterpart for design review).
25. **DisableAutoOpenInteraction** — Storybook `play` function clicks the "Don't auto-open again" checkbox; story asserts that `getControl().pluginStore.get('whats-new-state.json').get('autoOpenDisabled') === true` after play.
26. **GotItButtonClickable** — `play` function clicks "Got it"; asserts `getControl().invocations` includes both `'window.close'` and the implicit `setLastSeenVersion(currentVersion)` round-trip in pluginStore.

### Edge cases (5)
27. **NoReleasesShipped** — `releasesOverride: []`; renders "No release notes yet." copy.
28. **OnlyOneReleaseShipped** — single-element history; verifies layout doesn't break with one entry.
29. **LongVersionString** — `releaseLongVersion` (e.g. `1.2.0-beta.4+build.42`).
30. **LongDateFormat** — `releaseLongDate` (verifies date renderer doesn't truncate or overflow).
31. **StoreHydrationFailed** — harness sets a flag that makes `tauri-plugin-store.load()` reject; component falls back to defaults; UI still renders.

**Total: 31 stories.**

## Tooling additions

### `package.json`
No changes. Storybook deps installed in Phase 1 are sufficient.

### `tsconfig.json`
The fixtures and stories paths are already covered by the existing globs (`src/**/*.tsx`). No changes.

### Biome
The Phase 1 commit already extended `biome.json` includes to cover `.storybook/`. Nothing to add.

### Test suites
- **Vitest**: untouched. The fixtures file is plain TypeScript that may incidentally be imported by future tests, but Phase 2 doesn't add any vitest tests.
- **Playwright**: untouched. The existing `tests/e2e/whats-new.spec.ts` continues to drive the real Tauri webview.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Vite alias for `@/generated/changelog` breaks the real Vite dev/build because the alias is scoped to Storybook's `viteFinal` only | low | The alias only applies inside Storybook's Vite config (it's added in the cloned config object inside `viteFinal`). Real `vite dev` / `vite build` is unaffected — confirmed by inspecting how Phase 1's existing aliases (`@tauri-apps/api/core` etc.) coexist with the same modules being used at runtime via real Tauri. |
| Proxy on the `RELEASES` re-export mishandles iterator / `Symbol.iterator` access | medium | The Proxy's `get` trap forwards every property — including `Symbol.iterator`, `length`, and numeric keys — to the override-or-real array via `Reflect.get`. Verified mentally; smoke-test in the first story confirms. |
| `window.__BORGDOCK_WHATS_NEW__` global leaks between stories if the harness forgets to clear it | medium | Global decorator extended to `delete (window as any).__BORGDOCK_WHATS_NEW__` on every story render (before the per-story harness runs). |
| `getCurrentWindow().close()` from the "Got it" button kills the Storybook iframe | high if mock missing | The mock makes `close()` a no-op that only logs. Verified in the design — implementer must verify in the smoke test. |
| `tsc` rejects the Proxy-typed `RELEASES` re-export because `Proxy<typeof REAL_RELEASES>` is generic | low | The export is typed `as typeof REAL_RELEASES` after the Proxy construction — runtime is the Proxy, type is the array. Confirmed pattern works under TS 5.8. |
| `useReleasesToShow` retains the `whats-new:navigate` `CustomEvent` listener on every story render | medium | The hook's effect's cleanup removes the listener; React StrictMode double-invocation may register twice in dev — that's the same behavior as production and not story-specific. Acceptable. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 31 stories render.
2. Light/dark toolbar toggle re-renders every story without reload.
3. `npm run build-storybook` completes.
4. `npm run lint` and `npm run test` pass.
5. Production code is byte-identical (`git diff master...storybook-phase2-whatsnew -- src/BorgDock.Tauri/src/components/whats-new src/BorgDock.Tauri/src/stores/whats-new-store.ts src/BorgDock.Tauri/src/utils/semver.ts src/BorgDock.Tauri/src/generated/changelog.ts` shows zero lines).
6. `.storybook/mocks/` gains exactly four new files (`tauri-api-window.ts`, `tauri-api-app.ts`, `tauri-plugin-store.ts`, `generated-changelog.ts`); `main.ts` gains exactly four new alias entries; `control.ts` gains `windowState`, `pluginStore`, `appVersion`, and `releasesOverride` fields.
7. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR: WhatsNewApp moves from "Pending" to "Done" with the spec/plan/PR links.

## What comes next (out of scope here)

- **Phase 3 candidate:** the next pending window per the roadmap (Settings, PR Detail, File Viewer, etc. — pick at brainstorm time).
- **Component-level stories** for the four whats-new children — easier now that the window-level stories surface their states.
- **Visual regression tooling decision** — once enough screens are storied (≥3) to evaluate options.
