# Storybook Phase 2 — WhatsNewApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 31 exhaustive Storybook stories for `WhatsNewApp.tsx` and extend the existing Tauri mock layer with four new alias surfaces, all without changing a byte of production code.

**Architecture:** Add four mock modules under `.storybook/mocks/` (api/window, api/app, plugin-store, plus a Proxy-backed `@/generated/changelog`) and four Vite alias entries in `.storybook/main.ts`. The control singleton (`window.__borgdock_storybook_tauri`) gains four fields (`windowState`, `pluginStore`, `pluginStoreBehavior`, `appVersion`, `releasesOverride`). Stories drive state via `parameters.whatsNew.*` consumed by a `WhatsNewHarness` wrapper.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8 (already installed in Phase 1).

**Spec:** `docs/superpowers/specs/2026-05-05-storybook-phase2-whatsnew-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to `src/BorgDock.Tauri/` unless explicitly absolute.**

---

## Task 0: Create feature branch

**Files:** none

- [ ] **Step 1: Verify clean tree on master**

```bash
cd /Users/koenvdb/projects/BorgDock && git status && git rev-parse --abbrev-ref HEAD
```
Expected: `master`, clean tree.

- [ ] **Step 2: Create branch**

```bash
git checkout -b storybook-phase2-whatsnew
```
Expected: `Switched to a new branch 'storybook-phase2-whatsnew'`.

---

## Task 1: Extend control surface

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/control.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `.storybook/mocks/control.ts`:

```ts
// .storybook/mocks/control.ts
//
// Singleton control surface used by the Tauri mocks and by story decorators.
// Lives on window so dynamic-imported mocks and the React tree can both reach it.

import type { Release } from '../../src/types/whats-new';

export interface InvokeRecord {
  command: string;
  args?: unknown;
}

export type ChannelListener = (event: { payload: unknown }) => void;

export type PluginStoreBehavior = 'normal' | 'pending' | 'reject';

export interface StorybookTauriControl {
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, unknown>;

  // Phase 2 additions
  windowState: { isMaximized: boolean };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  reset(): void;
  emit(channel: string, payload: unknown): void;
}

declare global {
  interface Window {
    __borgdock_storybook_tauri?: StorybookTauriControl;
  }
}

function createControl(): StorybookTauriControl {
  const ctrl: StorybookTauriControl = {
    channels: new Map(),
    invocations: [],
    invokeResponses: {},

    windowState: { isMaximized: false },
    pluginStore: new Map(),
    pluginStoreBehavior: 'normal',
    appVersion: null,
    releasesOverride: null,

    reset() {
      ctrl.channels.clear();
      ctrl.invocations.length = 0;
      for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];
      ctrl.windowState.isMaximized = false;
      ctrl.pluginStore.clear();
      ctrl.pluginStoreBehavior = 'normal';
      ctrl.appVersion = null;
      ctrl.releasesOverride = null;
    },
    emit(channel, payload) {
      const set = ctrl.channels.get(channel);
      if (!set) return;
      for (const cb of set) cb({ payload });
    },
  };
  return ctrl;
}

export function getControl(): StorybookTauriControl {
  if (typeof window === 'undefined') {
    throw new Error('storybook tauri mock used outside browser');
  }
  if (!window.__borgdock_storybook_tauri) {
    window.__borgdock_storybook_tauri = createControl();
  }
  return window.__borgdock_storybook_tauri;
}
```

- [ ] **Step 2: Verify tsc still clean**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors. The `Release` type import resolves via the relative path.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook: extend control surface for phase 2 (window/store/app/releases)

Adds windowState, pluginStore (Map keyed by file path), pluginStoreBehavior
(normal/pending/reject), appVersion, and releasesOverride. reset() now wipes
all of them. Foundation for the WhatsNewApp catalog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Mock `@tauri-apps/api/window`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts`

- [ ] **Step 1: Write the mock**

```ts
// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Only the surface
// WhatsNewApp uses is implemented: getCurrentWindow().{close,minimize,
// maximize,unmaximize,isMaximized}.
//
// close() is a no-op — without this, the "Got it" button would unmount
// the Storybook iframe.

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
    async close() {
      ctrl.invocations.push({ command: 'window.close' });
    },
    async minimize() {
      ctrl.invocations.push({ command: 'window.minimize' });
    },
    async maximize() {
      ctrl.invocations.push({ command: 'window.maximize' });
      ctrl.windowState.isMaximized = true;
    },
    async unmaximize() {
      ctrl.invocations.push({ command: 'window.unmaximize' });
      ctrl.windowState.isMaximized = false;
    },
    async isMaximized() {
      return ctrl.windowState.isMaximized;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/api/window getCurrentWindow

close/minimize are pure log-only no-ops. maximize/unmaximize update
windowState.isMaximized so isMaximized() can story both states.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mock `@tauri-apps/api/app`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-app.ts`

- [ ] **Step 1: Write the mock**

```ts
// .storybook/mocks/tauri-api-app.ts
//
// Drop-in replacement for @tauri-apps/api/app.getVersion().
// Returns the per-story override or a sensible default.

import { getControl } from './control';

export async function getVersion(): Promise<string> {
  return getControl().appVersion ?? '1.2.0';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-app.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/api/app getVersion

Used by useReleasesToShow to determine the current version. Defaults
to '1.2.0' when no story override is set.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Mock `@tauri-apps/plugin-store`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-store.ts`

- [ ] **Step 1: Write the mock**

```ts
// .storybook/mocks/tauri-plugin-store.ts
//
// Drop-in replacement for @tauri-apps/plugin-store. Map-backed and
// keyed per file path so multiple windows storying different store
// files don't collide. save() is a no-op (in-memory).
//
// pluginStoreBehavior on the control surface lets stories assert
// the Hydrating ('pending') and StoreHydrationFailed ('reject')
// states without touching production code.

import { getControl } from './control';

interface MockStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

export async function load(path: string): Promise<MockStore> {
  const ctrl = getControl();

  if (ctrl.pluginStoreBehavior === 'pending') {
    // Never resolves — used by the Hydrating story to freeze the
    // pre-hydration UI.
    return new Promise<MockStore>(() => {});
  }
  if (ctrl.pluginStoreBehavior === 'reject') {
    throw new Error('storybook: plugin-store unavailable');
  }

  let bag = ctrl.pluginStore.get(path);
  if (!bag) {
    bag = new Map();
    ctrl.pluginStore.set(path, bag);
  }
  const owned = bag;
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return owned.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      owned.set(key, value);
    },
    async save(): Promise<void> {
      // no-op
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-store.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/plugin-store load()

Map-backed store keyed per file path. pluginStoreBehavior on the
control surface drives the 'pending' (never-resolves) and 'reject'
(throws) modes used by Hydrating and StoreHydrationFailed stories.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Mock `@/generated/changelog` via Proxy

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/generated-changelog.ts`

- [ ] **Step 1: Write the Proxy module**

```ts
// .storybook/mocks/generated-changelog.ts
//
// Storybook re-export of @/generated/changelog. Defaults to the real
// RELEASES array. Stories that need a synthetic history set
// getControl().releasesOverride to substitute, story-by-story.
//
// We use a Proxy so every access (length, indexed, Symbol.iterator,
// .filter, .map, etc.) routes through the override-or-real choice
// at read time — without committing to a snapshot at module load.

import { RELEASES as REAL_RELEASES } from '../../src/generated/changelog';
import type { Release } from '../../src/types/whats-new';
import { getControl } from './control';

function pickSource(): readonly Release[] {
  // Guard for tests / SSR contexts where window is missing — fall back
  // to real data so module evaluation never throws.
  if (typeof window === 'undefined') return REAL_RELEASES;
  const override = getControl().releasesOverride;
  return override ?? REAL_RELEASES;
}

export const RELEASES: Release[] = new Proxy([] as Release[], {
  get(_target, prop, receiver) {
    return Reflect.get(pickSource(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(pickSource(), prop);
  },
  ownKeys(_target) {
    return Reflect.ownKeys(pickSource());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(pickSource(), prop);
  },
}) as Release[];
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/generated-changelog.ts
git commit -m "$(cat <<'EOF'
storybook: proxy alias for @/generated/changelog

Defaults to the real RELEASES array; stories override via
getControl().releasesOverride. Proxy traps cover get/has/ownKeys/
getOwnPropertyDescriptor so .length, indexed access, iterators, and
spread all go through the override path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add Vite aliases to Storybook config

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/main.ts`

- [ ] **Step 1: Replace the alias block**

Open `.storybook/main.ts`. Find the `config.resolve.alias = { ... }` block and replace its contents with:

```ts
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
      '@tauri-apps/api/app': resolve(here, 'mocks/tauri-api-app.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
      '@': resolve(here, '../src'),
    };
```

The order matters: the `@`-prefixed deep aliases (`@/services/windows`, `@/generated/changelog`) MUST appear before the catch-all `@` so Vite's longest-match resolver picks them first. The list above is the canonical order — keep it.

- [ ] **Step 2: Boot Storybook to confirm aliases resolve**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && timeout 30 npm run storybook 2>&1 | head -30 || true
```
Expected: "Storybook started" / "for preview" lines, no resolver errors. Storybook will exit when the `timeout` fires; that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook: register four new aliases for phase 2

api/window, api/app, plugin-store, and @/generated/changelog. Order
preserved so the @-prefixed deep aliases match before the catch-all.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Smoke-test the extended Storybook config

**Files:** none

- [ ] **Step 1: Run build-storybook**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && npm run build-storybook
```
Expected: completes without errors. The build still bundles only the existing FlyoutApp stories — the new aliases are wired but not yet referenced by any new story.

If the build fails with module-resolution errors against the new alias targets, check that all four mock files were committed in Tasks 2–5.

- [ ] **Step 2: Run vitest as a regression check**

```bash
npm run test
```
Expected: same test count and result as master (231 files, 2810 tests at the time of writing). Vitest does not use Storybook's Vite config, so the new aliases should not affect it. If the count drops or tests fail, investigate before proceeding — possible cause: the Phase 1 fix that extended `biome.json` includes touched something else.

No commit in this task.

---

## Task 8: WhatsNew fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/whats-new/__fixtures__/whats-new-data.ts`

- [ ] **Step 1: Write the fixtures**

```ts
// src/components/whats-new/__fixtures__/whats-new-data.ts
//
// Synthetic Release fixtures for Storybook stories that need
// deterministic edge-case content. Real RELEASES are imported from
// @/generated/changelog at runtime via the Storybook Proxy alias and
// override only when releasesOverride is set.

import type { Highlight, Release } from '@/types/whats-new';

export function makeHighlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    kind: 'new',
    title: 'A new feature',
    description: 'A short markdown description of the highlighted feature.',
    hero: null,
    keyboard: null,
    ...overrides,
  };
}

export function makeRelease(overrides: Partial<Release> = {}): Release {
  return {
    version: '1.2.0',
    date: '2026-04-30',
    summary: 'A normal release with a sentence-long summary.',
    highlights: [],
    alsoFixed: [],
    autoOpenEligible: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Curated single releases — used by Release-shape-axis stories.
// Each is a single-element substitute for the "latest" release in stories.
// ---------------------------------------------------------------------------

export const releaseEmptySummary: Release = makeRelease({
  version: '1.3.0',
  date: '2026-05-01',
  summary: '',
});

export const releaseRichSummary: Release = makeRelease({
  version: '1.3.1',
  date: '2026-05-02',
  summary:
    'A multi-sentence release summary. It runs to roughly two lines on a typical viewport, ' +
    'demonstrating how the hero copy wraps when content actually fills it.',
});

export const releaseNoHighlights: Release = makeRelease({
  version: '1.3.2',
  date: '2026-05-03',
  summary: 'A release with fixes but no headline highlights.',
  highlights: [],
  alsoFixed: ['Minor bug fix.', 'Another minor bug fix.'],
});

export const releaseSingleHighlight: Release = makeRelease({
  version: '1.3.3',
  date: '2026-05-04',
  summary: 'One marquee feature.',
  highlights: [
    makeHighlight({
      kind: 'new',
      title: 'Single Highlight',
      description: 'The only headline change in this release.',
    }),
  ],
  autoOpenEligible: true,
});

export const releaseManyHighlights: Release = makeRelease({
  version: '1.3.4',
  date: '2026-05-05',
  summary: 'A release with six headline changes.',
  highlights: [
    makeHighlight({ kind: 'new', title: 'Highlight A', description: 'First.' }),
    makeHighlight({ kind: 'improved', title: 'Highlight B', description: 'Second.' }),
    makeHighlight({ kind: 'fixed', title: 'Highlight C', description: 'Third.' }),
    makeHighlight({ kind: 'new', title: 'Highlight D', description: 'Fourth.' }),
    makeHighlight({ kind: 'improved', title: 'Highlight E', description: 'Fifth.' }),
    makeHighlight({ kind: 'new', title: 'Highlight F', description: 'Sixth.' }),
  ],
  autoOpenEligible: true,
});

export const releaseLongHighlight: Release = makeRelease({
  version: '1.3.5',
  date: '2026-05-06',
  summary: 'A release with a single very long highlight card.',
  highlights: [
    makeHighlight({
      kind: 'improved',
      title:
        'A highlight title that is itself fairly long and may wrap on narrower viewports to multiple lines',
      description:
        'A multi-paragraph description that exceeds the comfortable card height. ' +
        'It is designed to exercise the card layout and verify text wrapping, line-height, ' +
        'and the markdown renderer handle a substantial body without overflowing the surrounding window.',
      keyboard: 'Ctrl+Shift+L',
    }),
  ],
  autoOpenEligible: true,
});

export const releaseNoFixes: Release = makeRelease({
  version: '1.3.6',
  date: '2026-05-07',
  summary: 'A release with no "also fixed" entries.',
  alsoFixed: [],
});

export const releaseFewFixes: Release = makeRelease({
  version: '1.3.7',
  date: '2026-05-08',
  summary: 'A release with three small fixes.',
  alsoFixed: ['Fix one.', 'Fix two.', 'Fix three.'],
});

export const releaseLongFixList: Release = makeRelease({
  version: '1.3.8',
  date: '2026-05-09',
  summary: 'A release dominated by a long list of fixes.',
  alsoFixed: Array.from({ length: 25 }, (_, i) => `Fix number ${i + 1} — short description.`),
});

export const releaseLongMixed: Release = makeRelease({
  version: '1.3.9',
  date: '2026-05-10',
  summary:
    'A worst-case release that combines a long summary, several heavy highlights, and a long fix list to exercise the full layout.',
  highlights: [
    makeHighlight({
      kind: 'new',
      title: 'A long highlight title for the first card',
      description: 'A reasonably long description for the first highlight in the worst-case story.',
    }),
    makeHighlight({
      kind: 'improved',
      title: 'A long highlight title for the second card',
      description: 'A reasonably long description for the second highlight in the worst-case story.',
    }),
    makeHighlight({
      kind: 'fixed',
      title: 'A long highlight title for the third card',
      description: 'A reasonably long description for the third highlight in the worst-case story.',
    }),
  ],
  alsoFixed: Array.from({ length: 18 }, (_, i) => `Worst-case fix ${i + 1}.`),
  autoOpenEligible: true,
});

export const releaseLongVersion: Release = makeRelease({
  version: '1.2.0-beta.4+build.42',
  date: '2026-05-04',
  summary: 'A pre-release with a long version string.',
});

export const releaseLongDate: Release = makeRelease({
  version: '1.4.0',
  date: '2024-01-15',
  summary: 'An older release used to verify date formatting at >1 year.',
});

// ---------------------------------------------------------------------------
// Curated histories — used by Accordion-axis and Edge-case stories.
// All arrays are sorted newest-first to match RELEASES.
// ---------------------------------------------------------------------------

export const noReleases: Release[] = [];

export const oneRelease: Release[] = [
  makeRelease({ version: '1.0.0', date: '2026-04-01', summary: 'The very first release.' }),
];

export const deepHistory: Release[] = [
  makeRelease({ version: '1.7.0', date: '2026-05-15', summary: 'Latest.' }),
  makeRelease({ version: '1.6.0', date: '2026-05-08' }),
  makeRelease({ version: '1.5.0', date: '2026-05-01' }),
  makeRelease({ version: '1.4.0', date: '2026-04-24' }),
  makeRelease({ version: '1.3.0', date: '2026-04-17' }),
  makeRelease({ version: '1.2.0', date: '2026-04-10' }),
  makeRelease({ version: '1.1.0', date: '2026-04-03' }),
  makeRelease({ version: '1.0.0', date: '2026-03-27' }),
];

// Spread of dates for the AccordionWithDates story — today, weeks ago,
// months ago, and >1 year. Ordered newest-first.
export const dateSpreadHistory: Release[] = [
  makeRelease({ version: '2.0.0', date: '2026-05-05', summary: 'Today.' }),
  makeRelease({ version: '1.9.0', date: '2026-04-21', summary: 'Two weeks ago.' }),
  makeRelease({ version: '1.8.0', date: '2026-02-05', summary: 'Three months ago.' }),
  makeRelease({ version: '1.7.0', date: '2024-08-12', summary: 'Over a year ago.' }),
];

// History used by the Release-shape stories: prepends the curated edge-case
// release as the newest, then provides two normal historical releases for
// accordion context. Stories pick which curated release to put on top.
export function shapeStoryHistory(latest: Release): Release[] {
  return [
    latest,
    makeRelease({ version: '1.0.1', date: '2026-04-23', summary: 'Prior release.' }),
    makeRelease({ version: '1.0.0', date: '2026-04-16', summary: 'Earlier release.' }),
  ];
}
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors. The Release / Highlight types resolve via the existing `@` alias.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/whats-new/__fixtures__/whats-new-data.ts
git commit -m "$(cat <<'EOF'
storybook: whats-new fixture factories + curated edge-case releases

makeHighlight / makeRelease factories plus 12 curated single releases
(empty/rich summary, no/single/many/long highlights, no/few/long fixes,
long mixed, long version, long date) and 4 curated histories
(noReleases, oneRelease, deepHistory, dateSpreadHistory) plus the
shapeStoryHistory helper that wraps any single curated release in a
realistic accordion context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Stories scaffold + Hydrating story

**Files:**
- Create: `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx`

- [ ] **Step 1: Write the file with meta, harness, helper, and the Hydrating story**

```tsx
// src/components/whats-new/WhatsNewApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import type { Release } from '@/types/whats-new';
import { WhatsNewApp } from './WhatsNewApp';

interface PluginStoreSeed {
  [path: string]: Record<string, unknown>;
}

interface WhatsNewStoryParams {
  /** Per-path key/value seed pushed into the mock plugin-store. */
  pluginStoreSeed?: PluginStoreSeed;
  /** Forces tauri-plugin-store.load() into 'pending' or 'reject' modes. */
  storeBehavior?: 'normal' | 'pending' | 'reject';
  /** Sets window.__BORGDOCK_WHATS_NEW__.version before mount. */
  targetVersion?: string;
  /** Initial isMaximized() return value. */
  windowMaximized?: boolean;
  /** Override for getVersion() — defaults to '1.2.0'. */
  appVersion?: string;
  /** Replace the RELEASES array exposed via the proxy alias. */
  releasesOverride?: Release[];
}

declare global {
  interface Window {
    __BORGDOCK_WHATS_NEW__?: { version: string | null };
  }
}

function WhatsNewHarness({ params }: { params: WhatsNewStoryParams }) {
  // Seed all control-surface state synchronously, before WhatsNewApp's
  // first render. The global preview decorator already called reset().
  const ctrl = getControl();

  if (params.storeBehavior) ctrl.pluginStoreBehavior = params.storeBehavior;
  if (params.appVersion !== undefined) ctrl.appVersion = params.appVersion;
  if (params.windowMaximized !== undefined) ctrl.windowState.isMaximized = params.windowMaximized;
  if (params.releasesOverride !== undefined) ctrl.releasesOverride = params.releasesOverride;
  if (params.pluginStoreSeed) {
    for (const [path, kv] of Object.entries(params.pluginStoreSeed)) {
      ctrl.pluginStore.set(path, new Map(Object.entries(kv)));
    }
  }

  if (params.targetVersion !== undefined) {
    window.__BORGDOCK_WHATS_NEW__ = { version: params.targetVersion };
  } else {
    delete window.__BORGDOCK_WHATS_NEW__;
  }

  useEffect(() => {
    return () => {
      delete window.__BORGDOCK_WHATS_NEW__;
    };
  }, []);

  return (
    <div style={{ width: 720, height: 640 }}>
      <WhatsNewApp />
    </div>
  );
}

const meta: Meta<typeof WhatsNewHarness> = {
  title: 'Whats New/WhatsNewApp',
  component: WhatsNewHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof WhatsNewHarness>;

function story(params: WhatsNewStoryParams): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Store-state axis
// ---------------------------------------------------------------------------

export const Hydrating = story({
  // load() never resolves; the store stays unhydrated and the component
  // shows its pre-hydration UI.
  storeBehavior: 'pending',
});
```

- [ ] **Step 2: Verify the story renders**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && timeout 30 npm run storybook 2>&1 | head -20 || true
```
Open `http://localhost:6006` in a browser if you have one, navigate to "Whats New / WhatsNewApp / Hydrating", confirm the story renders without console errors. Storybook exits when the timeout fires.

If the story fails to render due to alias issues, double-check the relative path `'../../../.storybook/mocks/control'` from `src/components/whats-new/`. Adjust if needed.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: whatsnewapp.stories.tsx scaffold + Hydrating story

WhatsNewHarness seeds control-surface state synchronously before
mount (pluginStoreSeed, storeBehavior, targetVersion, windowMaximized,
appVersion, releasesOverride) and clears window.__BORGDOCK_WHATS_NEW__
on unmount. Hydrating is the first story — uses storeBehavior: 'pending'
so load() never resolves and the pre-hydration UI is visible.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Store-state stories (7)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx`

- [ ] **Step 1: Append the seven store-state stories at the end of the file**

```tsx
export const FirstTimeUser = story({
  pluginStoreSeed: { 'whats-new-state.json': {} },
  appVersion: '1.2.0',
});

export const UpToDate = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
});

export const OneVersionBehind = story({
  // 1.1.0 is the version directly before 1.2.0 in the real RELEASES array.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.1.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
});

export const ManyVersionsBehind = story({
  // 1.0.0 is far enough behind the real changelog to surface several
  // missed releases. If the real changelog later only ships 1.0.x → 1.2.0,
  // this story still demonstrates "many behind" correctly.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
});

export const AutoOpenDisabledAlready = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: true },
  },
  appVersion: '1.2.0',
});

export const TargetedAtSpecificVersion = story({
  // Force a specific real-history version to expand instead of the latest.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
  targetVersion: '1.0.0',
});

export const TargetedAtMissingVersion = story({
  // 99.99.99 doesn't exist; useReleasesToShow falls back to newest missed
  // (or newest overall when none missed).
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
  targetVersion: '99.99.99',
});
```

- [ ] **Step 2: Boot Storybook and verify each story renders**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && timeout 30 npm run storybook 2>&1 | head -20 || true
```

Story count check:
```bash
grep -c "^export const " /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
```
Expected: `8` (Hydrating + 7 store-state stories).

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: whats-new store-state axis stories (7)

FirstTimeUser, UpToDate, OneVersionBehind, ManyVersionsBehind,
AutoOpenDisabledAlready, TargetedAtSpecificVersion, TargetedAtMissingVersion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Release-shape stories (10)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx`

- [ ] **Step 1: Append a fixtures import block**

At the top of `WhatsNewApp.stories.tsx`, after the existing `import` lines, add:

```tsx
import {
  releaseEmptySummary,
  releaseFewFixes,
  releaseLongFixList,
  releaseLongHighlight,
  releaseLongMixed,
  releaseManyHighlights,
  releaseNoFixes,
  releaseNoHighlights,
  releaseRichSummary,
  releaseSingleHighlight,
  shapeStoryHistory,
} from './__fixtures__/whats-new-data';
```

- [ ] **Step 2: Append the ten release-shape stories**

Each story uses `shapeStoryHistory(<curated release>)` so the curated release is the newest in the accordion, with two prior real-shaped releases for context.

```tsx
// ---------------------------------------------------------------------------
// Release-shape axis
// ---------------------------------------------------------------------------

const shapeStoryDefaults = {
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: '1.3.0',
};

export const ReleaseEmptySummary = story({
  ...shapeStoryDefaults,
  appVersion: releaseEmptySummary.version,
  releasesOverride: shapeStoryHistory(releaseEmptySummary),
});

export const ReleaseRichSummary = story({
  ...shapeStoryDefaults,
  appVersion: releaseRichSummary.version,
  releasesOverride: shapeStoryHistory(releaseRichSummary),
});

export const ReleaseNoHighlights = story({
  ...shapeStoryDefaults,
  appVersion: releaseNoHighlights.version,
  releasesOverride: shapeStoryHistory(releaseNoHighlights),
});

export const ReleaseSingleHighlight = story({
  ...shapeStoryDefaults,
  appVersion: releaseSingleHighlight.version,
  releasesOverride: shapeStoryHistory(releaseSingleHighlight),
});

export const ReleaseManyHighlights = story({
  ...shapeStoryDefaults,
  appVersion: releaseManyHighlights.version,
  releasesOverride: shapeStoryHistory(releaseManyHighlights),
});

export const ReleaseLongHighlightCard = story({
  ...shapeStoryDefaults,
  appVersion: releaseLongHighlight.version,
  releasesOverride: shapeStoryHistory(releaseLongHighlight),
});

export const ReleaseNoFixes = story({
  ...shapeStoryDefaults,
  appVersion: releaseNoFixes.version,
  releasesOverride: shapeStoryHistory(releaseNoFixes),
});

export const ReleaseFewFixes = story({
  ...shapeStoryDefaults,
  appVersion: releaseFewFixes.version,
  releasesOverride: shapeStoryHistory(releaseFewFixes),
});

export const ReleaseLongFixList = story({
  ...shapeStoryDefaults,
  appVersion: releaseLongFixList.version,
  releasesOverride: shapeStoryHistory(releaseLongFixList),
});

export const ReleaseLongMixed = story({
  ...shapeStoryDefaults,
  appVersion: releaseLongMixed.version,
  releasesOverride: shapeStoryHistory(releaseLongMixed),
});
```

- [ ] **Step 3: Verify story count = 18**

```bash
grep -c "^export const " /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
```
Expected: `18` (8 + 10).

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: whats-new release-shape axis stories (10)

ReleaseEmptySummary, ReleaseRichSummary, ReleaseNoHighlights,
ReleaseSingleHighlight, ReleaseManyHighlights, ReleaseLongHighlightCard,
ReleaseNoFixes, ReleaseFewFixes, ReleaseLongFixList, ReleaseLongMixed.

Each story uses shapeStoryHistory(curated) so the curated release is
the newest in the accordion, with two prior real-shaped entries for
context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Accordion-axis stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx`

- [ ] **Step 1: Extend the fixtures import**

Add `dateSpreadHistory` and `deepHistory` to the existing fixtures import block at the top of the file:

```tsx
import {
  dateSpreadHistory,
  deepHistory,
  releaseEmptySummary,
  releaseFewFixes,
  releaseLongFixList,
  releaseLongHighlight,
  releaseLongMixed,
  releaseManyHighlights,
  releaseNoFixes,
  releaseNoHighlights,
  releaseRichSummary,
  releaseSingleHighlight,
  shapeStoryHistory,
} from './__fixtures__/whats-new-data';
```

- [ ] **Step 2: Append the accordion stories**

```tsx
// ---------------------------------------------------------------------------
// Accordion axis
// ---------------------------------------------------------------------------

export const AccordionAllCollapsed = story({
  // lastSeenVersion = the newest deepHistory entry, no targetVersion;
  // useReleasesToShow returns expandedVersion = null (no missed; no target).
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.7.0', autoOpenDisabled: false },
  },
  appVersion: '1.7.0',
  releasesOverride: deepHistory,
});

export const AccordionTargetExpanded = story({
  // Force a mid-list version to expand.
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.7.0', autoOpenDisabled: false },
  },
  appVersion: '1.7.0',
  releasesOverride: deepHistory,
  targetVersion: '1.4.0',
});

export const AccordionDeepHistory = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: '1.7.0',
  releasesOverride: deepHistory,
});

export const AccordionWithDates = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.7.0', autoOpenDisabled: false },
  },
  appVersion: '2.0.0',
  releasesOverride: dateSpreadHistory,
});
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
```
Expected: `22` (18 + 4).

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: whats-new accordion axis stories (4)

AccordionAllCollapsed (none expanded — lastSeen = current),
AccordionTargetExpanded (mid-list expanded via targetVersion),
AccordionDeepHistory (8-entry history), AccordionWithDates (today /
two weeks / three months / >1 year span).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Window-chrome / interaction stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx`

- [ ] **Step 1: Append the four chrome / interaction stories**

For interaction stories (`DisableAutoOpenInteraction`, `GotItButtonClickable`) we use Storybook 9's `play` function with `@storybook/test`. Since `@storybook/test` is part of `@storybook/addon-essentials` / Storybook 9 core, no new dependency is needed.

```tsx
// ---------------------------------------------------------------------------
// Window-chrome / interaction axis
// ---------------------------------------------------------------------------

export const WindowMaximized = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
  windowMaximized: true,
});

export const WindowNotMaximized = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
  },
  appVersion: '1.2.0',
  windowMaximized: false,
});

// The two interaction stories use play functions. They do NOT change
// the production code path — they just exercise the existing UI.

export const DisableAutoOpenInteraction: Story = {
  args: {
    params: {
      pluginStoreSeed: {
        'whats-new-state.json': { lastSeenVersion: '1.2.0', autoOpenDisabled: false },
      },
      appVersion: '1.2.0',
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    // The "Don't auto-open again" checkbox is labeled by aria-label
    // on the input itself (see WhatsNewApp.tsx footer).
    const checkbox = await canvas.findByLabelText("Don't auto-open again");
    await userEvent.click(checkbox);
  },
};

export const GotItButtonClickable: Story = {
  args: {
    params: {
      pluginStoreSeed: {
        'whats-new-state.json': { lastSeenVersion: '1.1.0', autoOpenDisabled: false },
      },
      appVersion: '1.2.0',
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /got it/i });
    await userEvent.click(button);
    // window.close() is mocked as a no-op that logs to control.invocations;
    // the iframe stays alive.
  },
};
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
```
Expected: `26` (22 + 4).

- [ ] **Step 3: Verify play functions don't kill the iframe**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && timeout 45 npm run storybook 2>&1 | head -25 || true
```

Open the two interaction stories in a browser if available. Confirm the iframe survives the click on "Got it" (the mock's `window.close()` is a no-op). If `@storybook/test` is missing, install it:

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri && npm install --save-dev @storybook/test@^9
```

If the install was needed, append a follow-up commit `storybook: add @storybook/test for interaction-story play functions` after the main commit below.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
# If package.json/package-lock.json changed in step 3, also add them:
# git add src/BorgDock.Tauri/package.json src/BorgDock.Tauri/package-lock.json
git commit -m "$(cat <<'EOF'
storybook: whats-new window-chrome + interaction stories (4)

WindowMaximized, WindowNotMaximized (paired chrome states),
DisableAutoOpenInteraction (play clicks the checkbox),
GotItButtonClickable (play clicks Got it; window.close mock keeps
the iframe alive).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Edge-case stories (5)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx`

- [ ] **Step 1: Extend the fixtures import**

Add `noReleases`, `oneRelease`, `releaseLongVersion`, `releaseLongDate` to the existing fixtures import block at the top of the file:

```tsx
import {
  dateSpreadHistory,
  deepHistory,
  noReleases,
  oneRelease,
  releaseEmptySummary,
  releaseFewFixes,
  releaseLongDate,
  releaseLongFixList,
  releaseLongHighlight,
  releaseLongMixed,
  releaseLongVersion,
  releaseManyHighlights,
  releaseNoFixes,
  releaseNoHighlights,
  releaseRichSummary,
  releaseSingleHighlight,
  shapeStoryHistory,
} from './__fixtures__/whats-new-data';
```

- [ ] **Step 2: Append the five edge-case stories**

```tsx
// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

export const NoReleasesShipped = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: null, autoOpenDisabled: false },
  },
  appVersion: '0.0.0',
  releasesOverride: noReleases,
});

export const OnlyOneReleaseShipped = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: null, autoOpenDisabled: false },
  },
  appVersion: '1.0.0',
  releasesOverride: oneRelease,
});

export const LongVersionString = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: releaseLongVersion.version,
  releasesOverride: shapeStoryHistory(releaseLongVersion),
});

export const LongDateFormat = story({
  pluginStoreSeed: {
    'whats-new-state.json': { lastSeenVersion: '1.0.0', autoOpenDisabled: false },
  },
  appVersion: releaseLongDate.version,
  releasesOverride: shapeStoryHistory(releaseLongDate),
});

export const StoreHydrationFailed = story({
  storeBehavior: 'reject',
  appVersion: '1.2.0',
});
```

- [ ] **Step 3: Story count check (must equal 31)**

```bash
grep -c "^export const " /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
```
Expected: `31`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock && git add src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: whats-new edge-case stories (5)

NoReleasesShipped (empty array), OnlyOneReleaseShipped (single entry),
LongVersionString (1.2.0-beta.4+build.42), LongDateFormat (>1 year ago),
StoreHydrationFailed (plugin-store load() rejects; component falls back
to defaults).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Verification, roadmap update, push, PR

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Run all verification gates**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit
npm run lint
npm run build-storybook
npm run test
```

Each command must exit 0. If `lint` flags warnings only (no errors) and the warnings are in pre-existing files (not the new fixtures or stories), that's acceptable (matches the Phase 1 baseline of 33 warnings + 4 infos).

- [ ] **Step 2: Production-code byte-identical assertion**

```bash
cd /Users/koenvdb/projects/BorgDock
git diff master...storybook-phase2-whatsnew -- \
  src/BorgDock.Tauri/src/components/whats-new \
  src/BorgDock.Tauri/src/stores/whats-new-store.ts \
  src/BorgDock.Tauri/src/utils/semver.ts \
  src/BorgDock.Tauri/src/generated/changelog.ts
```

Output MUST be empty save for new files (`__fixtures__/whats-new-data.ts` and `WhatsNewApp.stories.tsx`). Specifically, `WhatsNewApp.tsx`, `HeroBanner.tsx`, `HighlightCard.tsx`, `ReleaseAccordion.tsx`, `AlsoFixedList.tsx`, `useReleasesToShow.ts`, `whats-new-store.ts`, `semver.ts`, `changelog.ts` MUST show no changes.

- [ ] **Step 3: Final story-count assertion**

```bash
grep -c "^export const " /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/whats-new/WhatsNewApp.stories.tsx
```
Expected: `31`.

- [ ] **Step 4: Update the roadmap**

Open `docs/superpowers/specs/storybook-roadmap.md`. Move the WhatsNewApp row out of the Pending table and into the Done table. The result should look like:

In the Done table:
```
| 2 | What's New | `whats-new-main.tsx` → `components/whats-new/WhatsNewApp.tsx` | `2026-05-05-storybook-phase2-whatsnew-design.md` | `2026-05-05-storybook-phase2-whatsnew.md` | _(filled in after PR opens)_ |
```

Delete the WhatsNewApp row from the Pending table.

Also extend the "Mock layer extensions" section under `.storybook/main.ts` aliases — add three new bullets:

```
- `@tauri-apps/api/window` → `mocks/tauri-api-window.ts`
- `@tauri-apps/api/app` → `mocks/tauri-api-app.ts`
- `@tauri-apps/plugin-store` → `mocks/tauri-plugin-store.ts`
- `@/generated/changelog` → `mocks/generated-changelog.ts`
```

(Replace the four-bullet list with the new seven-bullet list.)

- [ ] **Step 5: Commit the roadmap update**

```bash
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark whatsnew done, register 4 new mock aliases

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Switch to personal gh account**

```bash
gh auth switch --user borght-dev
gh auth status
```
Verify `Active account: true` next to `borght-dev`.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin storybook-phase2-whatsnew
```

- [ ] **Step 8: Open the PR**

```bash
gh pr create --title "storybook phase 2: whatsnewapp catalog (31 stories)" --body "$(cat <<'EOF'
## Summary
- Adds **31 exhaustive Storybook stories** for `WhatsNewApp.tsx` covering store state (8), release shape (10), accordion behavior (4), window chrome / interaction (4), and edge cases (5).
- Extends the Phase 1 mock layer with **four new alias surfaces**: `@tauri-apps/api/window`, `@tauri-apps/api/app`, `@tauri-apps/plugin-store`, and a Proxy-backed `@/generated/changelog` for per-story `RELEASES` overrides.
- Production code (`WhatsNewApp.tsx`, all whats-new children, the Zustand store, `semver.ts`, `generated/changelog.ts`) is byte-identical to master.
- Updates the roadmap to mark What's New done and register the four new mock aliases.

Spec: `docs/superpowers/specs/2026-05-05-storybook-phase2-whatsnew-design.md`
Plan: `docs/superpowers/plans/2026-05-05-storybook-phase2-whatsnew.md`

## Test plan
- [ ] `npm run storybook` boots; all 31 stories load without console errors
- [ ] Theme toolbar (light/dark/system) toggles every story without reload
- [ ] `DisableAutoOpenInteraction` and `GotItButtonClickable` play functions complete; the iframe survives the "Got it" click (`window.close()` is a no-op mock)
- [ ] `npm run build-storybook` completes
- [ ] `npm run test` (vitest) green
- [ ] `npm run lint` (Biome) clean
- [ ] `git diff master...storybook-phase2-whatsnew -- src/BorgDock.Tauri/src/components/whats-new src/BorgDock.Tauri/src/stores/whats-new-store.ts src/BorgDock.Tauri/src/utils/semver.ts src/BorgDock.Tauri/src/generated/changelog.ts` shows zero changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Switch gh back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
```
Verify `KvanderBorght_gomocha` is active again.

- [ ] **Step 10: Capture PR URL for the monitoring step**

The URL printed by `gh pr create` is the watch target for the post-PR vitest monitoring step. Save it.

---

## Self-Review Notes

- **Spec coverage:**
  - Mock layer extensions (api/window, api/app, plugin-store, generated-changelog) — Tasks 2, 3, 4, 5, 6.
  - Control surface extensions (`windowState`, `pluginStore`, `pluginStoreBehavior`, `appVersion`, `releasesOverride`) — Task 1.
  - Fixtures (12 single releases + 4 histories + helper) — Task 8.
  - 31 stories — Tasks 9, 10, 11, 12, 13, 14 (1 + 7 + 10 + 4 + 4 + 5 = 31).
  - Roadmap update — Task 15 step 4–5.
  - Acceptance criteria — Task 15 steps 1–3.
  - PR creation — Task 15 steps 6–10.
- **No prod code changes:** verified explicitly in Task 15 step 2.
- **Type consistency:** `Release` and `Highlight` types imported from production sources only; never redeclared. Mock interfaces (`MockWindow`, `MockStore`) live entirely inside the mocks. `WhatsNewStoryParams` matches the spec's parameter list.
- **Bite-sized steps:** every task has 2–10 steps; every code-changing step shows the literal code; every commit step has the literal command.
- **Out of scope:** per-component stories, visual regression, hero shots — all deferred per spec.
