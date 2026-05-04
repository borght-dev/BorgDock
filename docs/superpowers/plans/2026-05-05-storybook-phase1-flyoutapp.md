# Storybook Phase 1 — FlyoutApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Storybook in `src/BorgDock.Tauri/`, build a Vite-alias-based Tauri mock layer, and ship 34 exhaustive stories covering every meaningful state of `FlyoutApp.tsx` — without changing a byte of production code.

**Architecture:** Storybook 9 with the React-Vite framework. `.storybook/main.ts` rewrites four module paths (`@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/plugin-opener`, `@/services/windows`) to mock implementations under `.storybook/mocks/`. The mocks expose a control surface on `window.__borgdock_storybook_tauri`. Stories drive `FlyoutApp` by combining the existing dev-only `window.__borgdock_test_flyout_seed` hook (for glance/idle/initializing modes + data) with the mock event channel (`flyout-toast` for toasts).

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, `@storybook/addon-themes`, Vite 6, React 19, Tailwind v4 (via `@tailwindcss/vite`), TypeScript 5.8, existing project Biome config.

**Spec:** `docs/superpowers/specs/2026-05-05-storybook-phase1-flyoutapp-design.md`

**All paths in this plan are relative to `src/BorgDock.Tauri/` unless explicitly absolute.**

---

## Task 0: Create feature branch

**Files:** none

- [ ] **Step 1: Verify clean working tree on master**

Run from repo root:
```bash
git status
git rev-parse --abbrev-ref HEAD
```
Expected: clean tree, on `master`.

- [ ] **Step 2: Create and switch to feature branch**

```bash
git checkout -b storybook-phase1-flyoutapp
```
Expected: `Switched to a new branch 'storybook-phase1-flyoutapp'`.

---

## Task 1: Install Storybook dependencies

**Files:**
- Modify: `src/BorgDock.Tauri/package.json`

- [ ] **Step 1: Install Storybook devDependencies**

```bash
cd src/BorgDock.Tauri
npm install --save-dev \
  storybook@^9 \
  @storybook/react-vite@^9 \
  @storybook/addon-themes@^9
```

Expected: install completes; `package.json` `devDependencies` gains the three packages; `package-lock.json` updates.

If `storybook@^9` does not yet support React 19 cleanly at install time, fall back to `storybook@^8.6` and matching `@storybook/react-vite@^8.6` / `@storybook/addon-themes@^8.6`. Document the chosen version in the commit message.

- [ ] **Step 2: Add npm scripts**

Edit `package.json`. In the `"scripts"` block, after `"screenshot-heroes"`, add:

```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```

Final `"scripts"` should keep all existing entries plus those two new ones.

- [ ] **Step 3: Commit**

```bash
cd ../..   # back to repo root
git add src/BorgDock.Tauri/package.json src/BorgDock.Tauri/package-lock.json
git commit -m "$(cat <<'EOF'
storybook: add storybook 9 + react-vite + addon-themes deps

First step of phase 1 — installs the Storybook toolchain and adds
storybook / build-storybook npm scripts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tauri mock — control surface

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/control.ts`

- [ ] **Step 1: Create the control module**

```ts
// .storybook/mocks/control.ts
//
// Singleton control surface used by the Tauri mocks and by story decorators.
// Lives on window so dynamic-imported mocks and the React tree can both reach it.

export interface InvokeRecord {
  command: string;
  args?: unknown;
}

export type ChannelListener = (event: { payload: unknown }) => void;

export interface StorybookTauriControl {
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, unknown>;
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
    reset() {
      ctrl.channels.clear();
      ctrl.invocations.length = 0;
      for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];
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

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook: add tauri mock control surface

Singleton on window.__borgdock_storybook_tauri exposing channel
registry, invocation log, and canned invoke responses. Reset
between stories.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tauri mock — `@tauri-apps/api/core`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-core.ts`

- [ ] **Step 1: Implement the mock**

```ts
// .storybook/mocks/tauri-core.ts
//
// Drop-in replacement for @tauri-apps/api/core in Storybook.
// Logs every invocation and returns canned responses from the control surface.

import { getControl } from './control';

export async function invoke<T = unknown>(command: string, args?: unknown): Promise<T> {
  const ctrl = getControl();
  ctrl.invocations.push({ command, args });
  const response = ctrl.invokeResponses[command];
  return (response as T) ?? (undefined as T);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-core.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/api/core invoke()

Records calls into the control surface and returns canned responses
keyed by command name.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tauri mock — `@tauri-apps/api/event`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-event.ts`

- [ ] **Step 1: Implement the mock**

```ts
// .storybook/mocks/tauri-event.ts
//
// Drop-in replacement for @tauri-apps/api/event. Stores listeners by channel
// so stories can push events into them via getControl().emit(channel, payload).

import { getControl, type ChannelListener } from './control';

export type UnlistenFn = () => void;

export async function listen<T>(
  channel: string,
  cb: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const ctrl = getControl();
  let set = ctrl.channels.get(channel);
  if (!set) {
    set = new Set();
    ctrl.channels.set(channel, set);
  }
  const wrapped = cb as ChannelListener;
  set.add(wrapped);
  return () => {
    set?.delete(wrapped);
  };
}

export async function emit(_channel: string, _payload?: unknown): Promise<void> {
  // no-op — outbound emits are not needed for FlyoutApp stories
}

export async function emitTo(
  _target: string,
  _channel: string,
  _payload?: unknown,
): Promise<void> {
  // no-op — outbound emits are not needed for FlyoutApp stories
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-event.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/api/event listen/emitTo

listen() registers callbacks in the control-surface channel registry
so stories can push events. emit/emitTo are no-ops.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tauri mock — opener plugin and services-windows

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-opener.ts`
- Create: `src/BorgDock.Tauri/.storybook/mocks/services-windows.ts`

- [ ] **Step 1: Mock the opener plugin**

`tauri-plugin-opener.ts`:

```ts
// .storybook/mocks/tauri-plugin-opener.ts

import { getControl } from './control';

export async function openUrl(url: string): Promise<void> {
  getControl().invocations.push({ command: 'plugin:opener.openUrl', args: { url } });
}

export async function openPath(path: string): Promise<void> {
  getControl().invocations.push({ command: 'plugin:opener.openPath', args: { path } });
}
```

- [ ] **Step 2: Mock services/windows**

`services-windows.ts`:

```ts
// .storybook/mocks/services-windows.ts
//
// Mocks the subset of @/services/windows used by FlyoutApp.

import { getControl } from './control';

export interface OpenPrDetailArgs {
  owner: string;
  repo: string;
  number: number;
}

export async function openPrDetail(args: OpenPrDetailArgs): Promise<void> {
  getControl().invocations.push({ command: 'windows.openPrDetail', args });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-opener.ts src/BorgDock.Tauri/.storybook/mocks/services-windows.ts
git commit -m "$(cat <<'EOF'
storybook: mock plugin-opener and services/windows

Each mock logs to the control surface; no real navigation or
window creation happens under Storybook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Storybook main config + Vite alias mocks

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/main.ts`

- [ ] **Step 1: Write the config**

```ts
// .storybook/main.ts

import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';

const here = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  async viteFinal(config) {
    config.plugins = config.plugins ?? [];
    config.plugins.push(tailwindcss());

    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@': resolve(here, '../src'),
    };
    return config;
  },
};

export default config;
```

The `'@'` alias mirrors the project's existing TS path alias so non-mocked deep imports (e.g. `@/components/shared/...`) still resolve under Storybook's Vite config.

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook: main.ts with vite-alias tauri mocks + tailwind v4

Aliases swap @tauri-apps/api/core, /event, plugin-opener and
@/services/windows to mocks at story render time. Tailwind v4
plugin pulled into Storybook's Vite chain via viteFinal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Storybook preview + theme toolbar + decorator

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/preview.ts`

- [ ] **Step 1: Write the preview**

```ts
// .storybook/preview.ts

import type { Preview } from '@storybook/react-vite';
import '../src/styles/index.css';
import { getControl } from './mocks/control';

function applyTheme(theme: string) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color theme (mirrors FlyoutApp.applyTheme)',
      defaultValue: 'system',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'system', title: 'System' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
  decorators: [
    (Story, ctx) => {
      // Reset Tauri mock state and apply the toolbar theme before every story.
      getControl().reset();
      const theme = (ctx.globals as { theme?: string }).theme ?? 'system';
      applyTheme(theme);
      return Story();
    },
  ],
};

export default preview;
```

The CSS import path (`../src/styles/index.css`) matches BorgDock's existing Tailwind v4 entry. If the actual filename differs, the implementing engineer must adjust to the real path before testing.

- [ ] **Step 2: Verify the CSS path exists**

```bash
ls src/BorgDock.Tauri/src/styles/
```

If `index.css` does not exist, identify the project's Tailwind CSS entry (look for `@import "tailwindcss"` under `src/styles/`) and update the preview import accordingly. Recommit if changed.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/preview.ts
git commit -m "$(cat <<'EOF'
storybook: preview.ts with theme toolbar + global mock-reset

Mirrors FlyoutApp's applyTheme() so the toolbar drives the same
class-based dark mode. Resets the tauri mock control surface
between stories so state never leaks across renders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Smoke test — boot Storybook with no stories

**Files:** none

- [ ] **Step 1: Boot Storybook**

```bash
cd src/BorgDock.Tauri
npm run storybook
```

Expected: server boots on `http://localhost:6006`. The browser opens to a Storybook home page with the addon-themes toolbar visible. No stories are listed yet (or only the framework's empty-state notice).

If any errors surface (Tailwind plugin failure, alias resolution, addon load), debug them now before scaling up. Common fixes:
- Tailwind plugin not picked up → confirm `@tailwindcss/vite` is in `devDependencies` (it already is).
- Addon resolution → confirm Storybook's main framework is `@storybook/react-vite`, not `@storybook/react-webpack5`.

- [ ] **Step 2: Stop Storybook**

`Ctrl+C` in the terminal.

- [ ] **Step 3: Run build-storybook smoke**

```bash
npm run build-storybook
```

Expected: build completes; a `storybook-static/` directory is generated. No commit needed — `storybook-static/` is build output and should be added to `.gitignore` in the next step.

- [ ] **Step 4: Add `storybook-static/` to `.gitignore`**

```bash
cd ../..   # repo root
echo "storybook-static/" >> src/BorgDock.Tauri/.gitignore
```

If `.gitignore` does not yet exist at that path, create it with that single line. If it does and already contains the entry, skip.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/.gitignore
git commit -m "$(cat <<'EOF'
storybook: ignore storybook-static build output

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Flyout fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/flyout/__fixtures__/flyout-data.ts`

- [ ] **Step 1: Write the fixture factories and curated sets**

```ts
// src/components/flyout/__fixtures__/flyout-data.ts

import type { FlyoutData, FlyoutPr } from '../FlyoutGlance';
import type { ToastAction, ToastPayload } from '../flyout-mode';

export function makeFlyoutPr(overrides: Partial<FlyoutPr> = {}): FlyoutPr {
  return {
    number: 1,
    title: 'Add storybook scaffold',
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    authorLogin: 'octocat',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
    overallStatus: 'green',
    reviewStatus: 'approved',
    failedCount: 0,
    failedCheckNames: [],
    pendingCount: 0,
    passedCount: 4,
    totalChecks: 4,
    commentCount: 0,
    isMine: true,
    htmlUrl: 'https://github.com/borght-dev/BorgDock/pull/1',
    headRef: 'feature/storybook',
    isDraft: false,
    mergeScore: 92,
    mergeable: true,
    ...overrides,
  };
}

export function makeFlyoutData(overrides: Partial<FlyoutData> = {}): FlyoutData {
  return {
    pullRequests: [],
    failingCount: 0,
    pendingCount: 0,
    passingCount: 0,
    totalCount: 0,
    focusCount: 0,
    username: 'octocat',
    theme: 'system',
    lastSyncAgo: 'just now',
    hotkey: 'Ctrl+Win+Shift+G',
    ...overrides,
  };
}

export function makeToast(overrides: Partial<ToastPayload> = {}): ToastPayload {
  return {
    id: overrides.id ?? `toast-${Math.random().toString(36).slice(2, 8)}`,
    severity: 'info',
    title: 'Something happened',
    body: 'A neutral message body to occupy roughly two lines so the layout is exercised.',
    actions: [],
    ...overrides,
  };
}

export function makeAction(overrides: Partial<ToastAction> = {}): ToastAction {
  return {
    label: 'Open',
    action: 'open-url',
    url: 'https://github.com',
    ...overrides,
  };
}

// Curated sets

export const passingPrs: FlyoutPr[] = Array.from({ length: 5 }, (_, i) =>
  makeFlyoutPr({
    number: 100 + i,
    title: `Passing PR #${100 + i}`,
    overallStatus: 'green',
    failedCount: 0,
    pendingCount: 0,
    passedCount: 4,
    totalChecks: 4,
  }),
);

export const failingPrs: FlyoutPr[] = Array.from({ length: 5 }, (_, i) =>
  makeFlyoutPr({
    number: 200 + i,
    title: `Failing PR #${200 + i}`,
    overallStatus: 'red',
    failedCount: 2,
    failedCheckNames: ['ci/build', 'ci/test'],
    pendingCount: 0,
    passedCount: 2,
    totalChecks: 4,
    mergeScore: 24,
  }),
);

export const mixedPrs: FlyoutPr[] = [
  makeFlyoutPr({ number: 301, title: 'Mixed: green', overallStatus: 'green' }),
  makeFlyoutPr({
    number: 302,
    title: 'Mixed: yellow (pending)',
    overallStatus: 'yellow',
    pendingCount: 2,
    passedCount: 1,
    totalChecks: 3,
  }),
  makeFlyoutPr({
    number: 303,
    title: 'Mixed: red',
    overallStatus: 'red',
    failedCount: 1,
    failedCheckNames: ['ci/lint'],
    passedCount: 2,
    totalChecks: 3,
  }),
  makeFlyoutPr({
    number: 304,
    title: 'Mixed: gray (no checks)',
    overallStatus: 'gray',
    passedCount: 0,
    totalChecks: 0,
  }),
];

export const draftPrs: FlyoutPr[] = Array.from({ length: 3 }, (_, i) =>
  makeFlyoutPr({
    number: 400 + i,
    title: `Draft PR #${400 + i}`,
    isDraft: true,
    overallStatus: 'gray',
  }),
);

export const longTitlePrs: FlyoutPr[] = [
  makeFlyoutPr({
    number: 501,
    title:
      'feat(some-very-large-package-name): add an extremely long title that goes past the visible row width to exercise truncation in the FlyoutPrRow component',
  }),
  makeFlyoutPr({
    number: 502,
    title: 'fix: another exceptionally lengthy title that should also wrap or truncate',
  }),
];

export const longAuthorPrs: FlyoutPr[] = [
  makeFlyoutPr({
    number: 601,
    authorLogin: 'a-deliberately-long-github-username-for-layout-testing',
  }),
];

// Sparse — omits htmlUrl/headRef/isDraft/mergeScore/mergeable
export const sparsePrs: FlyoutPr[] = [
  {
    number: 701,
    title: 'Sparse payload — synthetic test seed shape',
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    authorLogin: 'octocat',
    authorAvatarUrl: '',
    overallStatus: 'green',
    reviewStatus: 'pending',
    failedCount: 0,
    failedCheckNames: [],
    pendingCount: 0,
    passedCount: 0,
    totalChecks: 0,
    commentCount: 0,
    isMine: false,
  },
];

export const manyPrs: FlyoutPr[] = Array.from({ length: 28 }, (_, i) =>
  makeFlyoutPr({
    number: 1000 + i,
    title: `Bulk PR #${1000 + i}`,
    overallStatus: ['green', 'yellow', 'red', 'gray'][i % 4] as FlyoutPr['overallStatus'],
  }),
);

export const mergeReadyPrs: FlyoutPr[] = [
  makeFlyoutPr({ number: 801, mergeScore: 95, mergeable: true, overallStatus: 'green' }),
  makeFlyoutPr({ number: 802, mergeScore: 88, mergeable: true, overallStatus: 'green' }),
];

export const mergeConflictPrs: FlyoutPr[] = [
  makeFlyoutPr({
    number: 901,
    mergeScore: 50,
    mergeable: false,
    overallStatus: 'yellow',
  }),
];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd src/BorgDock.Tauri
npx tsc --noEmit
```

Expected: no errors related to the fixture file.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add src/BorgDock.Tauri/src/components/flyout/__fixtures__/flyout-data.ts
git commit -m "$(cat <<'EOF'
storybook: flyout fixture factories + curated PR sets

makeFlyoutPr / makeFlyoutData / makeToast factories plus 11 curated
arrays (passing, failing, mixed, drafts, long-title, long-author,
sparse, many, merge-ready, merge-conflict) used across the catalog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Stories file scaffolding + Initializing story

**Files:**
- Create: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx`

- [ ] **Step 1: Create the stories file with meta, decorator, and the Initializing story**

```tsx
// src/components/flyout/FlyoutApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import { FlyoutApp } from './FlyoutApp';
import type { FlyoutData } from './FlyoutGlance';
import type { ToastPayload } from './flyout-mode';

interface FlyoutSeedPayload {
  data?: Partial<FlyoutData>;
  mode?: 'glance' | 'idle' | 'initializing';
}

interface FlyoutStoryParams {
  /** Seed pushed via window.__borgdock_test_flyout_seed once mount completes. */
  seed?: FlyoutSeedPayload;
  /** Toast payloads emitted on the 'flyout-toast' channel after mount. */
  toasts?: ToastPayload[];
  /** When set, FlyoutApp first lands in glance, then a banner is emitted. */
  bannerOnGlance?: ToastPayload;
  /** Push a 4th toast to validate FIFO trim at TOAST_MAX. */
  overflowToast?: ToastPayload;
}

declare global {
  interface Window {
    __borgdock_test_flyout_seed?: (payload: FlyoutSeedPayload) => void;
  }
}

function FlyoutHarness({ params }: { params: FlyoutStoryParams }) {
  useEffect(() => {
    const ctrl = getControl();
    let cancelled = false;

    // Two ticks: let FlyoutApp's effects subscribe to the mock channels first,
    // then push state. requestAnimationFrame double-rAF is sufficient.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (params.seed && window.__borgdock_test_flyout_seed) {
          window.__borgdock_test_flyout_seed(params.seed);
        }
        if (params.bannerOnGlance) {
          ctrl.emit('flyout-toast', params.bannerOnGlance);
        }
        if (params.toasts) {
          for (const t of params.toasts) ctrl.emit('flyout-toast', t);
        }
        if (params.overflowToast) {
          ctrl.emit('flyout-toast', params.overflowToast);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div style={{ width: 460, height: 512, padding: 16 }}>
      <FlyoutApp />
    </div>
  );
}

const meta: Meta<typeof FlyoutHarness> = {
  title: 'Flyout/FlyoutApp',
  component: FlyoutHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof FlyoutHarness>;

// Helper that reduces story boilerplate.
function story(params: FlyoutStoryParams): Story {
  return {
    args: { params },
  };
}

// ---------------------------------------------------------------------------
// Initializing
// ---------------------------------------------------------------------------

export const Initializing: Story = {
  args: {
    // No seed — FlyoutApp's reducer starts in 'initializing' and stays there
    // until __borgdock_test_flyout_seed sends 'init-complete'.
    params: {},
  },
};
```

- [ ] **Step 2: Boot Storybook and verify the Initializing story**

```bash
cd src/BorgDock.Tauri
npm run storybook
```

Open `http://localhost:6006`. The "Flyout / FlyoutApp / Initializing" story should appear and show the splash UI. The theme toolbar should toggle dark/light without reload. Stop Storybook with Ctrl+C.

If the story errors, the most likely cause is a path-alias mismatch — `./FlyoutApp` and the `../../../.storybook/mocks/control` import must both resolve. Inspect the browser devtools console.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: flyoutapp.stories.tsx scaffold + initializing story

FlyoutHarness wraps FlyoutApp at the real glance window dimensions
(460x512) and drives state via the existing __borgdock_test_flyout_seed
hook plus the mock event-channel registry. Includes the meta, the
story() helper, and the Initializing story as the first verification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Glance — base data variants (12 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx`

- [ ] **Step 1: Append a fixtures import block**

At the top of the file, after the existing imports, add:

```tsx
import {
  draftPrs,
  failingPrs,
  longAuthorPrs,
  longTitlePrs,
  makeFlyoutData,
  makeFlyoutPr,
  manyPrs,
  mergeConflictPrs,
  mergeReadyPrs,
  mixedPrs,
  passingPrs,
  sparsePrs,
} from './__fixtures__/flyout-data';
```

- [ ] **Step 2: Append all 12 glance stories at the end of the file**

```tsx
// ---------------------------------------------------------------------------
// Glance — base data variants
// ---------------------------------------------------------------------------

export const GlanceEmpty = story({
  seed: { mode: 'glance', data: makeFlyoutData() },
});

export const GlanceAllPassing = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: passingPrs,
      passingCount: passingPrs.length,
      totalCount: passingPrs.length,
    }),
  },
});

export const GlanceAllFailing = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: failingPrs,
      failingCount: failingPrs.length,
      totalCount: failingPrs.length,
    }),
  },
});

export const GlanceMixed = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: mixedPrs,
      failingCount: 1,
      pendingCount: 1,
      passingCount: 1,
      totalCount: mixedPrs.length,
    }),
  },
});

export const GlanceFocusOnly = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: [
        makeFlyoutPr({ number: 1100, title: 'Focus PR — needs your attention' }),
        makeFlyoutPr({ number: 1101, title: 'Another focus PR' }),
      ],
      focusCount: 2,
      totalCount: 2,
    }),
  },
});

export const GlanceMany = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: manyPrs,
      totalCount: manyPrs.length,
      passingCount: manyPrs.filter((p) => p.overallStatus === 'green').length,
      failingCount: manyPrs.filter((p) => p.overallStatus === 'red').length,
      pendingCount: manyPrs.filter((p) => p.overallStatus === 'yellow').length,
    }),
  },
});

export const GlanceDraftsOnly = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: draftPrs,
      totalCount: draftPrs.length,
    }),
  },
});

export const GlanceMergeReady = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: mergeReadyPrs,
      passingCount: mergeReadyPrs.length,
      totalCount: mergeReadyPrs.length,
    }),
  },
});

export const GlanceMergeConflict = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: mergeConflictPrs,
      pendingCount: mergeConflictPrs.length,
      totalCount: mergeConflictPrs.length,
    }),
  },
});

export const GlanceLongTitles = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: longTitlePrs,
      passingCount: longTitlePrs.length,
      totalCount: longTitlePrs.length,
    }),
  },
});

export const GlanceLongAuthors = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: longAuthorPrs,
      passingCount: longAuthorPrs.length,
      totalCount: longAuthorPrs.length,
    }),
  },
});

export const GlanceSparseFields = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: sparsePrs,
      totalCount: sparsePrs.length,
    }),
  },
});
```

- [ ] **Step 3: Boot Storybook and verify all 12 render**

```bash
cd src/BorgDock.Tauri
npm run storybook
```

Click each new story in the sidebar. None should throw. The list contents should match the curated fixture set. Stop Storybook.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: glance base data variants (12 stories)

Empty, AllPassing, AllFailing, Mixed, FocusOnly, Many, DraftsOnly,
MergeReady, MergeConflict, LongTitles, LongAuthors, SparseFields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Glance — banner overlay (4 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx`

- [ ] **Step 1: Append banner stories after the glance base stories**

```tsx
// ---------------------------------------------------------------------------
// Glance — banner overlay
// ---------------------------------------------------------------------------

import { makeToast } from './__fixtures__/flyout-data';

const glanceWithPassing = (overrides = {}) =>
  makeFlyoutData({
    pullRequests: passingPrs,
    passingCount: passingPrs.length,
    totalCount: passingPrs.length,
    ...overrides,
  });

export const GlanceBannerInfo = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-info',
    severity: 'info',
    title: 'Heads up',
    body: 'A new release of BorgDock is available.',
  }),
});

export const GlanceBannerSuccess = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-success',
    severity: 'success',
    title: 'PR merged',
    body: 'borght-dev/BorgDock#42 was merged successfully.',
  }),
});

export const GlanceBannerWarning = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-warn',
    severity: 'warning',
    title: 'Approaching API rate limit',
    body: 'GitHub API requests will be throttled in ~3 minutes.',
  }),
});

export const GlanceBannerError = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-err',
    severity: 'error',
    title: 'Token expired',
    body: 'Re-authenticate in Settings to resume polling.',
  }),
});
```

(Move the `makeToast` import up to the existing fixtures-import block instead of repeating; the `import` line above is illustrative — final code has a single import block at the top.)

- [ ] **Step 2: Boot Storybook and verify the banner overlay renders inside Glance**

```bash
cd src/BorgDock.Tauri
npm run storybook
```

Each banner story should show the same passing-PR list with a banner row above it. Stop Storybook.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: glance banner overlay stories (info/success/warning/error)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Toast — queue size + per-severity (7 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx`

- [ ] **Step 1: Append toast queue and severity stories**

```tsx
// ---------------------------------------------------------------------------
// Toast — queue size
// ---------------------------------------------------------------------------

const toastFromIdle = (toasts: ToastPayload[]): FlyoutStoryParams => ({
  seed: { mode: 'idle' },
  toasts,
});

export const Toast1Card = story(
  toastFromIdle([
    makeToast({ id: 't1', title: 'Build failed', severity: 'error', body: 'ci/test failed on main.' }),
  ]),
);

export const Toast2Cards = story(
  toastFromIdle([
    makeToast({ id: 't2a', title: 'Build queued', severity: 'info', body: 'Waiting for runner.' }),
    makeToast({ id: 't2b', title: 'Build started', severity: 'info', body: 'ci/build is running.' }),
  ]),
);

export const Toast3Cards = story(
  toastFromIdle([
    makeToast({ id: 't3a', title: 'PR opened', severity: 'info' }),
    makeToast({ id: 't3b', title: 'Checks running', severity: 'info' }),
    makeToast({ id: 't3c', title: 'Checks passed', severity: 'success' }),
  ]),
);

// ---------------------------------------------------------------------------
// Toast — per-severity (single card)
// ---------------------------------------------------------------------------

export const ToastSeverityInfo = story(
  toastFromIdle([makeToast({ id: 'sev-info', severity: 'info', title: 'FYI' })]),
);

export const ToastSeveritySuccess = story(
  toastFromIdle([makeToast({ id: 'sev-ok', severity: 'success', title: 'Merged' })]),
);

export const ToastSeverityWarning = story(
  toastFromIdle([makeToast({ id: 'sev-warn', severity: 'warning', title: 'Heads up' })]),
);

export const ToastSeverityError = story(
  toastFromIdle([makeToast({ id: 'sev-err', severity: 'error', title: 'Build failed' })]),
);
```

- [ ] **Step 2: Boot Storybook and verify queue/severity rendering**

```bash
cd src/BorgDock.Tauri
npm run storybook
```

Toast stories must render full queue cards immediately. The 7-second auto-hide will trigger after 7s — that's fine; visual reviewers will refresh the story to re-emit. Stop Storybook.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: toast queue size (1/2/3) + per-severity stories

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Toast — per-action variant (6 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx`

- [ ] **Step 1: Append per-action stories**

```tsx
// ---------------------------------------------------------------------------
// Toast — per-action variant
// ---------------------------------------------------------------------------

export const ToastActionOpenPr = story(
  toastFromIdle([
    makeToast({
      id: 'act-open',
      title: 'PR ready for review',
      severity: 'info',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 42,
      actions: [{ label: 'Open PR', action: 'open-pr' }],
    }),
  ]),
);

export const ToastActionFixPr = story(
  toastFromIdle([
    makeToast({
      id: 'act-fix',
      title: 'CI failing',
      severity: 'error',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 43,
      actions: [{ label: 'Fix with Claude', action: 'fix-pr' }],
    }),
  ]),
);

export const ToastActionMonitorPr = story(
  toastFromIdle([
    makeToast({
      id: 'act-mon',
      title: 'Long-running build',
      severity: 'warning',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 44,
      actions: [{ label: 'Monitor', action: 'monitor-pr' }],
    }),
  ]),
);

export const ToastActionOpenUrl = story(
  toastFromIdle([
    makeToast({
      id: 'act-url',
      title: 'Release notes',
      severity: 'info',
      actions: [{ label: 'Read', action: 'open-url', url: 'https://github.com/borght-dev/BorgDock/releases' }],
    }),
  ]),
);

export const ToastActionMergePr = story(
  toastFromIdle([
    makeToast({
      id: 'act-merge',
      title: 'Mergeable',
      severity: 'success',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 45,
      actions: [{ label: 'Merge', action: 'merge-pr', url: 'https://github.com/borght-dev/BorgDock/pull/45' }],
    }),
  ]),
);

export const ToastActionStartReview = story(
  toastFromIdle([
    makeToast({
      id: 'act-rev',
      title: 'Awaiting your review',
      severity: 'info',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 46,
      actions: [{ label: 'Start review', action: 'start-review', url: 'https://github.com/borght-dev/BorgDock/pull/46' }],
    }),
  ]),
);
```

- [ ] **Step 2: Boot Storybook, verify each action renders the correct button label**

```bash
cd src/BorgDock.Tauri
npm run storybook
```

Each story should render exactly one toast with one action button. Stop Storybook.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: toast per-action variant stories (6 actions)

open-pr, fix-pr, monitor-pr, open-url, merge-pr, start-review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Toast — interaction states + overflow (4 stories)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx`

- [ ] **Step 1: Extend `FlyoutHarness` to support hover and overflow**

Find the `FlyoutHarness` body (added in Task 10). Replace its `useEffect` with:

```tsx
  useEffect(() => {
    const ctrl = getControl();
    let cancelled = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (params.seed && window.__borgdock_test_flyout_seed) {
          window.__borgdock_test_flyout_seed(params.seed);
        }
        if (params.bannerOnGlance) {
          ctrl.emit('flyout-toast', params.bannerOnGlance);
        }
        if (params.toasts) {
          for (const t of params.toasts) ctrl.emit('flyout-toast', t);
        }
        if (params.hovered) {
          // Allow toast container to mount, then dispatch mouseenter on it.
          requestAnimationFrame(() => {
            const el = document.querySelector('[data-testid="flyout-toast-container"]');
            if (el) {
              el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            }
          });
        }
        if (params.overflowToast) {
          ctrl.emit('flyout-toast', params.overflowToast);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [params]);
```

Add `hovered?: boolean;` to the `FlyoutStoryParams` interface.

The hover story relies on `data-testid="flyout-toast-container"` existing on the toast wrapper. Inspect `FlyoutToast.tsx` — if no such test-id exists, the implementing engineer **must not** modify production code; instead, fall back to dispatching `mouseenter` on the first `<div>` child of the Storybook harness:

```tsx
const el = document.querySelector('#root [role="alert"], #storybook-root [role="alert"]');
```

Pick whichever selector cleanly matches the toast queue's outer element. Document the chosen selector in the story-file comment.

- [ ] **Step 2: Append the four interaction/overflow stories**

```tsx
// ---------------------------------------------------------------------------
// Toast — interaction states + overflow
// ---------------------------------------------------------------------------

export const ToastHovered = story({
  ...toastFromIdle([
    makeToast({ id: 'hov-1', title: 'Build started', severity: 'info' }),
    makeToast({ id: 'hov-2', title: 'Tests running', severity: 'info' }),
    makeToast({ id: 'hov-3', title: 'Lint failed', severity: 'error' }),
  ]),
  hovered: true,
});

export const ToastNoActions = story(
  toastFromIdle([
    makeToast({
      id: 'noact',
      title: 'Background sync complete',
      severity: 'success',
      actions: [],
    }),
  ]),
);

export const ToastLongBody = story(
  toastFromIdle([
    makeToast({
      id: 'long',
      title: 'A title that is itself fairly long but reasonable',
      severity: 'warning',
      body:
        'This body is intentionally written to exceed the comfortable single-card height so we ' +
        'can verify wrap, truncate, and clip behavior at the 340x~160px card budget defined in ' +
        'FlyoutApp.tsx around line 250. It should never overflow the window edge.',
    }),
  ]),
);

export const ToastOverflow = story({
  ...toastFromIdle([
    makeToast({ id: 'ovf-1', title: 'Toast 1', severity: 'info' }),
    makeToast({ id: 'ovf-2', title: 'Toast 2', severity: 'info' }),
    makeToast({ id: 'ovf-3', title: 'Toast 3', severity: 'info' }),
  ]),
  overflowToast: makeToast({ id: 'ovf-4', title: 'Toast 4 (oldest is dropped)', severity: 'success' }),
});
```

- [ ] **Step 3: Boot Storybook and verify**

```bash
cd src/BorgDock.Tauri
npm run storybook
```

- `ToastHovered` shows three cards; the auto-hide timer should be paused (no jump-to-idle after 7s — leave it open for 10s and confirm).
- `ToastNoActions` renders a card with no action row.
- `ToastLongBody` wraps within the card budget.
- `ToastOverflow` ends with the FIFO-trimmed queue: Toast 2, Toast 3, Toast 4.

Stop Storybook.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: toast interaction + overflow stories (4)

Hovered (timer paused), NoActions, LongBody, Overflow (FIFO trim).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Verification + acceptance

**Files:** none

- [ ] **Step 1: Run `build-storybook`**

```bash
cd src/BorgDock.Tauri
npm run build-storybook
```

Expected: build completes; `storybook-static/` is regenerated with no errors.

- [ ] **Step 2: Run vitest**

```bash
npm run test
```

Expected: all existing suites pass. No new tests were added in Phase 1, but the fixtures and stories must not break the project's TypeScript or runtime test config.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: zero errors. If Biome flags anything in `.storybook/` or `src/components/flyout/__fixtures__/` or the stories file, fix the violations and recommit.

- [ ] **Step 4: Verify FlyoutApp.tsx is byte-identical to its pre-spec version**

```bash
cd ../..
git log --oneline storybook-phase1-flyoutapp -- src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx
```

Expected: no commits on this branch touch `FlyoutApp.tsx`. If any commit appears, revert that file to its master version:

```bash
git checkout master -- src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx
git commit -m "fix: restore FlyoutApp.tsx to byte-identical state"
```

- [ ] **Step 5: Final story-count audit**

```bash
grep -c "^export const " src/BorgDock.Tauri/src/components/flyout/FlyoutApp.stories.tsx
```

Expected: **34** (the spec's exhaustive catalog).

- [ ] **Step 6: Commit a tiny verification note if any fixes were needed**

If steps 1–5 required fixes, commit them as a single follow-up:

```bash
git add -A
git commit -m "$(cat <<'EOF'
storybook: verification fixes (lint/build)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no fixes were needed, no commit is required — proceed to push.

---

## Task 17: Push and open PR

**Files:** none

- [ ] **Step 1: Confirm GitHub CLI is on the personal account**

This repo is `borght-dev/BorgDock` (personal). Per `~/.claude/CLAUDE.md`:

```bash
gh auth switch --user borght-dev
gh auth status
```

Expected: `Active account: true` next to `borght-dev`.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin storybook-phase1-flyoutapp
```

Expected: branch pushed; remote tracking established.

- [ ] **Step 3: Create the PR**

```bash
gh pr create --title "storybook phase 1: flyoutapp catalog + tauri mock layer" --body "$(cat <<'EOF'
## Summary
- Adds Storybook 9 (React-Vite) to `src/BorgDock.Tauri/` with a Vite-alias-based Tauri mock layer (`@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/plugin-opener`, `@/services/windows`).
- Reuses the existing dev-only `window.__borgdock_test_flyout_seed` hook for glance/idle/initializing seeding; mock event channels drive toasts.
- Ships **34 exhaustive stories** for `FlyoutApp.tsx` covering Initializing, 12 Glance variants, 4 banner overlays, 7 toast queue/severity, 6 toast actions, and 4 toast interaction/overflow cases.
- Production code (`FlyoutApp.tsx` and children) is byte-identical to master.

Spec: `docs/superpowers/specs/2026-05-05-storybook-phase1-flyoutapp-design.md`
Plan: `docs/superpowers/plans/2026-05-05-storybook-phase1-flyoutapp.md`

## Test plan
- [ ] `npm run storybook` boots; all 34 stories load without console errors
- [ ] Theme toolbar (light/dark/system) toggles every story without reload
- [ ] `npm run build-storybook` completes
- [ ] `npm run test` (vitest) green
- [ ] `npm run lint` (Biome) clean
- [ ] `git diff master...storybook-phase1-flyoutapp -- src/BorgDock.Tauri/src/components/flyout/FlyoutApp.tsx` shows zero changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Switch gh back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
```

- [ ] **Step 5: Capture the PR URL**

The PR URL printed by `gh pr create` is the watch target for the post-merge vitest monitoring step. Save it for reference.

---

## Self-Review Notes

- **Spec coverage:** All 34 stories from the spec catalog are covered (Tasks 10–15). Mock layer architecture mirrors the spec (Tasks 2–6). Theme toolbar (Task 7) matches the spec's theme handling. Acceptance criteria are explicitly checked in Task 16.
- **No prod code changes:** Verified in Task 16 step 4. The `FlyoutHarness` lives entirely in the stories file — `FlyoutApp.tsx` is never imported as anything but a black box.
- **Type consistency:** `FlyoutData`, `FlyoutPr`, `ToastPayload`, `ToastAction` are all imported from the production sources, never re-declared. The fixture `Partial<...>` overrides preserve those types.
- **Bite-sized steps:** Every task has 2–6 steps; every code-changing step contains the full code block; every commit step has the literal commit command.
- **Out of scope:** No visual regression tooling, no static Storybook hosting, no other window stories — all explicitly deferred per the spec's Non-Goals.
