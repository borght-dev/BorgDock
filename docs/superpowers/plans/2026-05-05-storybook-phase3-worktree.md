# Storybook Phase 3 — Worktree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 28 exhaustive Storybook stories for `WorktreePaletteApp.tsx` (the window mounted by `worktree-main.tsx`), plus the mock-layer extensions that unlock palette-style auto-resize and arg-discriminated invoke responses for every future window. Production code stays byte-identical.

**Architecture:** Add one new mock module (`tauri-api-dpi.ts`), one Vite alias (`@tauri-apps/api/dpi`), extend `tauri-api-window.ts` with `currentMonitor` and `getCurrentWindow().{hide,setSize,innerSize,scaleFactor}`, extend `tauri-core.ts` so `invokeResponses[command]` accepts a function `(args) => T` for arg-discriminated responses, and extend the `control.ts` singleton with `windowSize` + `monitorState` plus the widened `invokeResponses` value type. Stories drive state via `parameters.worktree.*` consumed by a `WorktreeHarness` wrapper; no `__borgdock_test_*` seed is added to production code.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8 (already installed in Phase 1).

**Spec:** `docs/superpowers/specs/2026-05-05-storybook-phase3-worktree-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to the repo root unless explicitly absolute.**

---

## Implementer phase grouping (review checkpoints)

The plan has 11 tasks grouped into 4 implementer phases with reviews between them. Subagent-driven mode hands one phase to one implementer at a time.

- **Phase A — Branch + mock layer extensions:** Tasks 0–5
- **Phase B — Fixtures:** Task 6
- **Phase C — Stories:** Task 7
- **Phase D — Roadmap, verification, push, PR:** Tasks 8–10

---

## Task 0: Create feature branch

**Files:** none

- [ ] **Step 1: Verify clean tree on master**

```bash
cd /Users/koenvdb/projects/BorgDock && git status && git rev-parse --abbrev-ref HEAD
```
Expected: `On branch master`, `nothing to commit, working tree clean`, output `master`.

- [ ] **Step 2: Pull latest master**

```bash
git pull --ff-only
```
Expected: `Already up to date` (or fast-forward summary).

- [ ] **Step 3: Create branch**

```bash
git checkout -b storybook-phase3-worktree
```
Expected: `Switched to a new branch 'storybook-phase3-worktree'`.

---

## Task 1: Extend control surface

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/control.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `src/BorgDock.Tauri/.storybook/mocks/control.ts`:

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

export type InvokeResponse = unknown | ((args: unknown) => unknown);

export interface MonitorState {
  size: { width: number; height: number };
  scaleFactor: number;
}

export interface WindowSizeState {
  width: number;
  height: number;
  scaleFactor: number;
}

export interface StorybookTauriControl {
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, InvokeResponse>;

  // Phase 2 additions
  windowState: { isMaximized: boolean };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  // Phase 3 additions
  windowSize: WindowSizeState;
  monitorState: MonitorState | null;

  reset(): void;
  emit(channel: string, payload: unknown): void;
}

declare global {
  interface Window {
    __borgdock_storybook_tauri?: StorybookTauriControl;
  }
}

const DEFAULT_WINDOW_SIZE: WindowSizeState = { width: 480, height: 600, scaleFactor: 1 };

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

    windowSize: { ...DEFAULT_WINDOW_SIZE },
    monitorState: null,

    reset() {
      ctrl.channels.clear();
      ctrl.invocations.length = 0;
      for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];
      ctrl.windowState.isMaximized = false;
      ctrl.pluginStore.clear();
      ctrl.pluginStoreBehavior = 'normal';
      ctrl.appVersion = null;
      ctrl.releasesOverride = null;
      ctrl.windowSize.width = DEFAULT_WINDOW_SIZE.width;
      ctrl.windowSize.height = DEFAULT_WINDOW_SIZE.height;
      ctrl.windowSize.scaleFactor = DEFAULT_WINDOW_SIZE.scaleFactor;
      ctrl.monitorState = null;
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
cd src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook: extend control surface for phase 3 (windowSize/monitor + fn responses)

Adds windowSize (width/height/scaleFactor) and monitorState fields, widens
invokeResponses values to InvokeResponse = unknown | ((args) => unknown).
reset() now wipes both new fields back to their defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Honor function-form `invokeResponses` in `tauri-core`

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/tauri-core.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `src/BorgDock.Tauri/.storybook/mocks/tauri-core.ts`:

```ts
// .storybook/mocks/tauri-core.ts
//
// Drop-in replacement for @tauri-apps/api/core in Storybook.
// Logs every invocation and returns canned responses from the control surface.
//
// invokeResponses values can be either a static value OR a function
// (args) => T | Promise<T>. The function form lets stories vary the
// response by argument — required when a window fans out the same
// command per repo / per file / per work item.

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

- [ ] **Step 2: Verify tsc still clean**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/mocks/tauri-core.ts
git commit -m "$(cat <<'EOF'
storybook: support function-form invokeResponses

When a story sets invokeResponses[command] to a function, the mock calls
it with the live args and awaits the result. Static values keep working
unchanged. Required for arg-discriminated stories like 'one repo errors,
others succeed'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend `tauri-api-window` mock

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts`:

```ts
// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Covers the surfaces
// every window storied so far uses:
//   - getCurrentWindow().close/minimize/maximize/unmaximize/isMaximized  (Phase 2)
//   - getCurrentWindow().hide/setSize/innerSize/scaleFactor              (Phase 3)
//   - currentMonitor()                                                   (Phase 3)
//
// hide() and close() are no-ops — without them, the Worktree palette's
// Esc-to-hide and the WhatsNew "Got it" button would unmount the
// Storybook iframe. setSize() updates the recorded windowSize so a
// follow-up innerSize() reflects the resize, but the iframe itself is
// unaffected (Storybook controls visible bounds).

import { getControl } from './control';

interface MockPhysicalSize {
  width: number;
  height: number;
}

interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  hide(): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
  innerSize(): Promise<MockPhysicalSize>;
  scaleFactor(): Promise<number>;
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
    async hide() {
      ctrl.invocations.push({ command: 'window.hide' });
    },
    async setSize(size) {
      ctrl.invocations.push({ command: 'window.setSize', args: size });
      ctrl.windowSize.width = size.width;
      ctrl.windowSize.height = size.height;
    },
    async innerSize() {
      // Production code expects PhysicalSize, so return width*scaleFactor.
      return {
        width: ctrl.windowSize.width * ctrl.windowSize.scaleFactor,
        height: ctrl.windowSize.height * ctrl.windowSize.scaleFactor,
      };
    },
    async scaleFactor() {
      return ctrl.windowSize.scaleFactor;
    },
  };
}

export async function currentMonitor() {
  const ctrl = getControl();
  return (
    ctrl.monitorState ?? {
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    }
  );
}
```

- [ ] **Step 2: Verify tsc still clean**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts
git commit -m "$(cat <<'EOF'
storybook: extend tauri-api-window with hide/setSize/innerSize/scaleFactor + currentMonitor

Required by WorktreePaletteApp's auto-resize logic and Esc-to-hide. setSize
updates the recorded windowSize so subsequent innerSize() calls reflect the
resize. innerSize returns physical pixels (real Tauri behavior). currentMonitor
defaults to 1920x1080 @ 1x; stories override via getControl().monitorState.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Mock `@tauri-apps/api/dpi`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-dpi.ts`

- [ ] **Step 1: Write the mock**

Full content of `src/BorgDock.Tauri/.storybook/mocks/tauri-api-dpi.ts`:

```ts
// .storybook/mocks/tauri-api-dpi.ts
//
// Drop-in replacement for @tauri-apps/api/dpi. Only the constructors used
// by WorktreePaletteApp (and by extension future palette windows) are
// stubbed. The `type` discriminator field mirrors the real Tauri shape in
// case a future window introspects it. Position classes are included
// preemptively so the next window pulling them in doesn't trigger another
// mock-layer extension.

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

- [ ] **Step 2: Verify tsc still clean**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-dpi.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/api/dpi

LogicalSize / PhysicalSize / LogicalPosition / PhysicalPosition stubs with
the same `type` discriminator the real Tauri classes carry. Required by
the worktree palette's setSize(new LogicalSize(...)) call.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire the new alias in `.storybook/main.ts`

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/main.ts`

- [ ] **Step 1: Add the alias**

Open `src/BorgDock.Tauri/.storybook/main.ts`. Inside `viteFinal`, the `config.resolve.alias` block currently looks like:

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

Add the `@tauri-apps/api/dpi` entry between `@tauri-apps/api/app` and `@tauri-apps/plugin-opener`. The `@: resolve(here, '../src')` entry MUST stay last — it's the catch-all and must not shadow more specific aliases.

After edit:

```ts
config.resolve.alias = {
  ...(config.resolve.alias ?? {}),
  '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
  '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
  '@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
  '@tauri-apps/api/app': resolve(here, 'mocks/tauri-api-app.ts'),
  '@tauri-apps/api/dpi': resolve(here, 'mocks/tauri-api-dpi.ts'),
  '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
  '@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
  '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
  '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
  '@': resolve(here, '../src'),
};
```

- [ ] **Step 2: Smoke-test that Storybook still boots**

```bash
cd src/BorgDock.Tauri && npm run build-storybook
```
Expected: build completes without errors. The Phase 1+2 stories continue to compile.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook: alias @tauri-apps/api/dpi to local mock

Wires the new dpi mock so dynamic imports of LogicalSize from the worktree
palette resolve to the stub at story-render time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase A review checkpoint

The mock layer is now ready. Phase 1+2 stories must still render and `build-storybook` must pass. If a Phase 1 or Phase 2 story regresses, root-cause the regression — do NOT proceed. Likely culprits if regression occurs: (a) the function-form check in `tauri-core.ts` mishandled a Date-like value, (b) a method removed from the `MockWindow` interface that an existing story uses.

---

## Task 6: Worktree fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/worktree-palette/__fixtures__/worktree-data.ts`

- [ ] **Step 1: Write the fixtures file**

Full content of `src/BorgDock.Tauri/src/components/worktree-palette/__fixtures__/worktree-data.ts`:

```ts
// Synthetic fixtures for WorktreePaletteApp stories.
//
// `WorktreeEntry` mirrors the local interface inside WorktreePaletteApp.tsx
// (the production interface is not exported). If the production interface
// changes shape, stories will fail to type-check at the call site —
// caught by `npm run lint` / `npm run test`.

import type { AppSettings, RepoSettings, UiSettings } from '@/types/settings';

export interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

// ── Factory helpers ──────────────────────────────────────────────────

export function makeRepo(overrides?: Partial<RepoSettings>): RepoSettings {
  return {
    owner: 'borght-dev',
    name: 'BorgDock',
    enabled: true,
    worktreeBasePath: '/Users/dev/worktrees/borgdock',
    worktreeSubfolder: '',
    ...overrides,
  };
}

export function makeWorktree(overrides?: Partial<WorktreeEntry>): WorktreeEntry {
  return {
    path: '/Users/dev/worktrees/borgdock/feature-branch',
    branchName: 'feature-branch',
    isMainWorktree: false,
    ...overrides,
  };
}

const BASE_UI: UiSettings = {
  sidebarEdge: 'right',
  sidebarMode: 'pinned',
  sidebarWidthPx: 380,
  theme: 'system',
  globalHotkey: 'CommandOrControl+Shift+B',
  flyoutHotkey: 'CommandOrControl+Shift+F',
  editorCommand: 'code',
  runAtStartup: false,
  quickReviewHotkey: 'CommandOrControl+Shift+R',
  startMinimizedToTray: false,
  restoreLastSelection: true,
};

export function makeSettings(repos: RepoSettings[], ui?: Partial<UiSettings>): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 30,
      username: 'storybook',
    },
    repos,
    ui: { ...BASE_UI, ...ui },
    notifications: {
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: true,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: true, system: false, sound: false, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      prSummaryEnabled: false,
      diffExplanationsEnabled: false,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: 'claude[bot]' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      pollIntervalSeconds: 30,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: false,
      updatePrStatusWhenWiDone: false,
    },
    sql: {
      connections: [],
      readOnlyByDefault: true,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
  };
}

// ── Curated repo fixtures ────────────────────────────────────────────

export const repoBorgDock: RepoSettings = makeRepo({
  owner: 'borght-dev',
  name: 'BorgDock',
  worktreeBasePath: '/Users/dev/worktrees/borgdock',
});

export const repoFspHorizon: RepoSettings = makeRepo({
  owner: 'gomocha',
  name: 'fsp-horizon',
  worktreeBasePath: 'C:\\Dev\\fsp-horizon-worktrees',
});

export const repoLongName: RepoSettings = makeRepo({
  owner: 'very-long-organization-name',
  name: 'and-an-equally-long-repository-name-that-overflows',
  worktreeBasePath: '/very/deeply/nested/path/that/is/quite/long/worktrees',
});

export const repoNoBasePath: RepoSettings = makeRepo({
  owner: 'orphan',
  name: 'no-base',
  worktreeBasePath: '',
});

export const repoDisabled: RepoSettings = makeRepo({
  owner: 'archived',
  name: 'old-repo',
  enabled: false,
  worktreeBasePath: '/Users/dev/worktrees/archived',
});

export const repoWithFavs: RepoSettings = makeRepo({
  owner: 'borght-dev',
  name: 'BorgDock',
  worktreeBasePath: '/Users/dev/worktrees/borgdock',
  favoriteWorktreePaths: [
    '/Users/dev/worktrees/borgdock/feature-favorite-a',
    '/Users/dev/worktrees/borgdock/feature-favorite-b',
  ],
});

// ── Curated worktree fixtures ────────────────────────────────────────

export const wtMain: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/main',
  branchName: 'master',
  isMainWorktree: true,
});

export const wtFeature: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/feature-storybook',
  branchName: 'feature/storybook-rollout',
});

export const wtDetached: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/detached-abc123',
  branchName: '',
});

export const wtLongBranch: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/long-branch',
  branchName: 'feature/an-extremely-long-branch-name-that-tests-overflow-and-truncation-behavior-in-the-row',
});

export const wtLongPath: WorktreeEntry = makeWorktree({
  path: '/Users/dev/projects/some/deeply/nested/parent/folders/borgdock/long-path-feature',
  branchName: 'feature/long-path',
});

export const wtFavoriteCandidate1: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/feature-favorite-a',
  branchName: 'feature/favorite-a',
});

export const wtFavoriteCandidate2: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/feature-favorite-b',
  branchName: 'feature/favorite-b',
});

// ── Curated histories ────────────────────────────────────────────────

export interface RepoTrees {
  repo: RepoSettings;
  trees: WorktreeEntry[];
}

export const oneRepoFew: RepoTrees = {
  repo: repoBorgDock,
  trees: [
    { ...wtMain },
    { ...wtFeature },
    makeWorktree({
      path: '/Users/dev/worktrees/borgdock/bugfix-toast',
      branchName: 'bugfix/toast-reposition',
    }),
  ],
};

export const oneRepoMany: RepoTrees = {
  repo: repoBorgDock,
  trees: [
    { ...wtMain },
    ...Array.from({ length: 29 }, (_, i) =>
      makeWorktree({
        path: `/Users/dev/worktrees/borgdock/feature-${String(i).padStart(2, '0')}`,
        branchName: `feature/branch-${String(i).padStart(2, '0')}`,
      }),
    ),
  ],
};

export const twoReposBalanced: RepoTrees[] = [
  {
    repo: repoBorgDock,
    trees: [
      { ...wtMain },
      { ...wtFeature },
      makeWorktree({
        path: '/Users/dev/worktrees/borgdock/refactor-mocks',
        branchName: 'refactor/storybook-mocks',
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/borgdock/docs-update',
        branchName: 'docs/readme-update',
      }),
    ],
  },
  {
    repo: repoFspHorizon,
    trees: [
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\main',
        branchName: 'main',
        isMainWorktree: true,
      }),
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\feature-mobile-api',
        branchName: 'feature/mobile-api',
      }),
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\bugfix-receive',
        branchName: 'bugfix/receive-handler',
      }),
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\spike-mappers',
        branchName: 'spike/mappers',
      }),
    ],
  },
];

export const twoReposLopsided: RepoTrees[] = [
  {
    repo: repoBorgDock,
    trees: [{ ...wtMain }],
  },
  {
    repo: repoFspHorizon,
    trees: [
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\main',
        branchName: 'main',
        isMainWorktree: true,
      }),
      ...Array.from({ length: 24 }, (_, i) =>
        makeWorktree({
          path: `C:\\Dev\\fsp-horizon-worktrees\\feature-${String(i).padStart(2, '0')}`,
          branchName: `feature/branch-${String(i).padStart(2, '0')}`,
        }),
      ),
    ],
  },
];

export const fiveRepos: RepoTrees[] = [
  twoReposBalanced[0],
  twoReposBalanced[1],
  {
    repo: makeRepo({
      owner: 'gomocha',
      name: 'cosmetic-tracker',
      worktreeBasePath: '/Users/dev/worktrees/cosmetic-tracker',
    }),
    trees: [
      makeWorktree({
        path: '/Users/dev/worktrees/cosmetic-tracker/master',
        branchName: 'master',
        isMainWorktree: true,
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/cosmetic-tracker/feature-supabase',
        branchName: 'feature/supabase-migration',
      }),
    ],
  },
  {
    repo: makeRepo({
      owner: 'borght-dev',
      name: 'PRDock',
      worktreeBasePath: '/Users/dev/worktrees/prdock',
    }),
    trees: [
      makeWorktree({
        path: '/Users/dev/worktrees/prdock/master',
        branchName: 'master',
        isMainWorktree: true,
      }),
    ],
  },
  {
    repo: makeRepo({
      owner: 'borght-dev',
      name: 'pluim',
      worktreeBasePath: '/Users/dev/worktrees/pluim',
    }),
    trees: [
      makeWorktree({
        path: '/Users/dev/worktrees/pluim/master',
        branchName: 'master',
        isMainWorktree: true,
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/pluim/feature-stripe',
        branchName: 'feature/stripe-checkout',
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/pluim/feature-messagebird',
        branchName: 'feature/messagebird-sms',
      }),
    ],
  },
];
```

- [ ] **Step 2: Verify tsc + lint clean**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit && npm run lint
```
Expected: no errors. If lint flags the path-style mix (POSIX vs Windows backslashes), they're literal string content — not paths — so should pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/worktree-palette/__fixtures__/worktree-data.ts
git commit -m "$(cat <<'EOF'
storybook: worktree palette fixtures

Synthetic factories (makeRepo / makeWorktree / makeSettings) plus curated
repo, worktree, and history constants. Mirrors the local WorktreeEntry
interface in WorktreePaletteApp.tsx since the production interface is not
exported. AppSettings is built from a complete-shape default so stories
don't drift if @/types/settings adds new required fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B review checkpoint

The fixtures file is the foundation for every story. Verify by reading it cold: every export is a complete, type-checked AppSettings / RepoSettings / WorktreeEntry. The Windows-style paths exist only inside the `repoFspHorizon` and `twoReposBalanced[1]` / `twoReposLopsided[1]` entries, demonstrating the row's `\\` → `/` normalization in `folderName()` / `parentFolder()`.

---

## Task 7: Story file

**Files:**
- Create: `src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.stories.tsx`

- [ ] **Step 1: Write the story file**

Full content of `src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { getControl } from '../../../.storybook/mocks/control';
import { WorktreePaletteApp } from './WorktreePaletteApp';
import {
  fiveRepos,
  makeRepo,
  makeSettings,
  oneRepoFew,
  oneRepoMany,
  repoBorgDock,
  repoDisabled,
  repoFspHorizon,
  repoNoBasePath,
  repoWithFavs,
  twoReposBalanced,
  twoReposLopsided,
  wtDetached,
  wtFavoriteCandidate1,
  wtFavoriteCandidate2,
  wtFeature,
  wtLongBranch,
  wtLongPath,
  wtMain,
  type RepoTrees,
  type WorktreeEntry,
} from './__fixtures__/worktree-data';

// ── Story parameters ─────────────────────────────────────────────────

interface WorktreeStoryParameters {
  /** Static AppSettings the load_settings invoke returns. */
  settings?: ReturnType<typeof makeSettings>;
  /** Either a static array (used regardless of basePath) or a function (args) => entries[]. */
  listResponses?:
    | WorktreeEntry[]
    | ((args: { basePath: string }) => WorktreeEntry[] | Promise<WorktreeEntry[]>);
  /** Override currentMonitor's response. */
  monitorState?: { size: { width: number; height: number }; scaleFactor: number } | null;
  /** Seed initial windowSize before render. */
  windowSize?: { width?: number; height?: number; scaleFactor?: number };
  /** When true, load_settings returns a never-resolving promise. */
  loadSettingsPending?: boolean;
  /** When true, load_settings rejects. */
  loadSettingsReject?: boolean;
}

declare module '@storybook/react-vite' {
  interface Parameters {
    worktree?: WorktreeStoryParameters;
  }
}

// ── Harness ──────────────────────────────────────────────────────────

function buildRepoListResponses(history: RepoTrees[]): (args: {
  basePath: string;
}) => WorktreeEntry[] {
  const map = new Map<string, WorktreeEntry[]>();
  for (const { repo, trees } of history) {
    map.set(repo.worktreeBasePath, trees);
  }
  return (args) => map.get(args.basePath) ?? [];
}

function settingsFromHistory(history: RepoTrees[]): ReturnType<typeof makeSettings> {
  return makeSettings(history.map((h) => h.repo));
}

function WorktreeHarness({ params }: { params: WorktreeStoryParameters }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ctrl = getControl();

    if (params.loadSettingsPending) {
      ctrl.invokeResponses['load_settings'] = () => new Promise(() => {});
    } else if (params.loadSettingsReject) {
      ctrl.invokeResponses['load_settings'] = () => Promise.reject(new Error('settings unavailable'));
    } else if (params.settings) {
      ctrl.invokeResponses['load_settings'] = params.settings;
    }

    if (params.listResponses !== undefined) {
      ctrl.invokeResponses['list_worktrees_bare'] = params.listResponses;
    }
    // save_settings — accept silently, return undefined.
    ctrl.invokeResponses['save_settings'] = undefined;
    // window_ready / open_in_terminal / reveal_in_file_manager / open_in_editor — log only.
    ctrl.invokeResponses['window_ready'] = undefined;
    ctrl.invokeResponses['open_in_terminal'] = undefined;
    ctrl.invokeResponses['reveal_in_file_manager'] = undefined;
    ctrl.invokeResponses['open_in_editor'] = undefined;

    if (params.monitorState !== undefined) {
      ctrl.monitorState = params.monitorState;
    }
    if (params.windowSize) {
      Object.assign(ctrl.windowSize, params.windowSize);
    }

    setReady(true);
  }, [params]);

  if (!ready) return null;
  return <WorktreePaletteApp />;
}

const meta: Meta<typeof WorktreePaletteApp> = {
  title: 'Windows/WorktreePalette',
  component: WorktreePaletteApp,
  parameters: { layout: 'fullscreen' },
  render: (_args, ctx) => {
    const params = (ctx.parameters as { worktree?: WorktreeStoryParameters }).worktree ?? {};
    return <WorktreeHarness params={params} />;
  },
};

export default meta;
type Story = StoryObj<typeof WorktreePaletteApp>;

// ── 1. Loading axis ──────────────────────────────────────────────────

export const Loading: Story = {
  parameters: {
    worktree: {
      loadSettingsPending: true,
    } satisfies WorktreeStoryParameters,
  },
};

export const Refreshing: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const refresh = await canvas.findByRole('button', { name: /refresh/i });
    await userEvent.click(refresh);
  },
};

export const WindowReadyDeferred: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory([{ repo: repoBorgDock, trees: oneRepoFew.trees }]),
      listResponses: oneRepoFew.trees,
    } satisfies WorktreeStoryParameters,
  },
  play: async () => {
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'window_ready')).toBe(true);
    });
  },
};

// ── 2. Empty / no-data axis ──────────────────────────────────────────

export const NoReposConfigured: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([]),
      listResponses: [],
    } satisfies WorktreeStoryParameters,
  },
};

export const AllReposDisabled: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([
        { ...repoBorgDock, enabled: false },
        { ...repoDisabled },
      ]),
      listResponses: [],
    } satisfies WorktreeStoryParameters,
  },
};

export const AllReposNoBasePath: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([
        { ...repoNoBasePath },
        makeRepo({ owner: 'a', name: 'b', worktreeBasePath: '' }),
      ]),
      listResponses: [],
    } satisfies WorktreeStoryParameters,
  },
};

// ── 3. Single-repo / list-shape axis ─────────────────────────────────

export const OneRepoMainOnly: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([repoBorgDock]),
      listResponses: [{ ...wtMain }],
    } satisfies WorktreeStoryParameters,
  },
};

export const OneRepoFewTrees: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([oneRepoFew.repo]),
      listResponses: oneRepoFew.trees,
    } satisfies WorktreeStoryParameters,
  },
};

export const OneRepoManyTrees: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([oneRepoMany.repo]),
      listResponses: oneRepoMany.trees,
    } satisfies WorktreeStoryParameters,
  },
  play: async () => {
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'window.setSize')).toBe(true);
    });
  },
};

export const OneRepoMixedDetached: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([repoBorgDock]),
      listResponses: [{ ...wtMain }, { ...wtFeature }, { ...wtDetached }, { ...wtLongBranch }, { ...wtLongPath }],
    } satisfies WorktreeStoryParameters,
  },
};

// ── 4. Multi-repo grouping axis ──────────────────────────────────────

export const TwoReposBalanced: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    } satisfies WorktreeStoryParameters,
  },
};

export const TwoReposLopsided: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposLopsided),
      listResponses: buildRepoListResponses(twoReposLopsided),
    } satisfies WorktreeStoryParameters,
  },
};

export const FiveRepos: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(fiveRepos),
      listResponses: buildRepoListResponses(fiveRepos),
    } satisfies WorktreeStoryParameters,
  },
};

// ── 5. Error axis ────────────────────────────────────────────────────

export const OneRepoErrored: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: (args) => {
        if (args.basePath === twoReposBalanced[1].repo.worktreeBasePath) {
          return Promise.reject(new Error('git: not a git repository (or any of the parent directories): .git'));
        }
        return twoReposBalanced[0].trees;
      },
    } satisfies WorktreeStoryParameters,
  },
};

export const AllReposErrored: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: () => Promise.reject(new Error('git: command not found')),
    } satisfies WorktreeStoryParameters,
  },
};

export const MixedSuccessAndError: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(fiveRepos.slice(0, 3)),
      listResponses: (args) => {
        if (args.basePath === fiveRepos[0].repo.worktreeBasePath) return fiveRepos[0].trees;
        if (args.basePath === fiveRepos[1].repo.worktreeBasePath) {
          return Promise.reject(new Error('permission denied'));
        }
        return [];
      },
    } satisfies WorktreeStoryParameters,
  },
};

export const SettingsLoadFailed: Story = {
  parameters: {
    worktree: {
      loadSettingsReject: true,
      listResponses: [],
    } satisfies WorktreeStoryParameters,
  },
};

// ── 6. Filter / favorites axis ───────────────────────────────────────

export const FilterMatchingByBranch: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'feature');
  },
};

export const FilterMatchingByFolder: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'storybook');
  },
};

export const FilterMatchingByRepo: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'borgdock');
  },
};

export const FilterNoMatch: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'zzz');
  },
};

export const FavoritesOnlyEmpty: Story = {
  parameters: {
    worktree: {
      settings: makeSettings(
        [{ ...repoBorgDock, favoriteWorktreePaths: [] }],
        { worktreePaletteFavoritesOnly: true },
      ),
      listResponses: [{ ...wtMain }, { ...wtFeature }],
    } satisfies WorktreeStoryParameters,
  },
};

export const FavoritesOnlyWithMix: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([repoWithFavs], { worktreePaletteFavoritesOnly: true }),
      listResponses: [
        { ...wtMain },
        { ...wtFavoriteCandidate1 },
        { ...wtFavoriteCandidate2 },
        { ...wtFeature },
      ],
    } satisfies WorktreeStoryParameters,
  },
};

// ── 7. Selection / keyboard axis ─────────────────────────────────────

export const FirstRowSelected: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([repoBorgDock]),
      listResponses: oneRepoFew.trees,
    } satisfies WorktreeStoryParameters,
  },
};

export const MidListSelected: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([oneRepoMany.repo]),
      listResponses: oneRepoMany.trees,
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    input.focus();
    for (let i = 0; i < 5; i++) await userEvent.keyboard('{ArrowDown}');
  },
};

export const EnterOpensTerminal: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([repoBorgDock]),
      listResponses: oneRepoFew.trees,
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    input.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      const ctrl = getControl();
      const last = ctrl.invocations[ctrl.invocations.length - 1];
      expect(last?.command).toBe('open_in_terminal');
    });
  },
};

// ── 8. Interaction axis ──────────────────────────────────────────────

export const ToggleFavoriteOptimistic: Story = {
  parameters: {
    worktree: {
      settings: makeSettings([repoBorgDock]),
      listResponses: [{ ...wtMain }, { ...wtFeature }],
    } satisfies WorktreeStoryParameters,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const star = await canvas.findByRole('button', { name: /mark as favorite/i });
    await userEvent.click(star);
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'save_settings')).toBe(true);
    });
  },
};

export const PaletteReshown: Story = {
  parameters: {
    worktree: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    } satisfies WorktreeStoryParameters,
  },
  play: async () => {
    // Wait for first load to complete, then emit palette-shown.
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'load_settings')).toBe(true);
    });
    getControl().emit('palette-shown', null);
    await waitFor(() => {
      const ctrl = getControl();
      const loadCalls = ctrl.invocations.filter((i) => i.command === 'load_settings').length;
      expect(loadCalls).toBeGreaterThanOrEqual(2);
    });
  },
};
```

- [ ] **Step 2: Verify Storybook boots and the file's stories are discovered**

```bash
cd src/BorgDock.Tauri && npm run build-storybook 2>&1 | tail -40
```
Expected: build completes. Phase 1+2 stories continue compiling. The 28 new stories appear in the build output.

- [ ] **Step 3: Verify lint + tsc clean**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 4: Verify production tree is byte-identical**

```bash
cd /Users/koenvdb/projects/BorgDock
git diff master...HEAD -- \
  src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.tsx \
  src/BorgDock.Tauri/src/types/settings.ts \
  src/BorgDock.Tauri/src/utils/parse-error.ts \
  src/BorgDock.Tauri/src/worktree-main.tsx
```
Expected: empty output. (The `__fixtures__/` and `*.stories.tsx` files are new and intentionally excluded from this diff.)

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: 28 worktree palette stories

Catalogs WorktreePaletteApp across 8 axes: loading, empty/no-data,
single-repo shape, multi-repo grouping, error, filter/favorites,
selection/keyboard, interaction. Drives state via parameters.worktree.*
through a WorktreeHarness wrapper. The fn-form list_worktrees_bare
response unlocks per-basePath success/error mixes (OneRepoErrored,
MixedSuccessAndError).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C review checkpoint

The catalog should now be browsable via `npm run storybook`. Spot-check at least one story per axis (8 stories) and verify the global theme toolbar still toggles light/dark on Worktree stories without reload.

---

## Task 8: Update the roadmap

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Move Worktree from Pending to Done and correct the description**

In the "### Done" table, append a new row after the WhatsNew row:

```md
| 3 | Worktree (palette) | `worktree-main.tsx` → `components/worktree-palette/WorktreePaletteApp.tsx` | `2026-05-05-storybook-phase3-worktree-design.md` | `2026-05-05-storybook-phase3-worktree.md` | _(filled in after PR opens)_ |
```

In the "### Pending" table, **remove the Worktree row entirely**. Then, immediately after the Pending table, add a short note:

```md
> **Roadmap correction (Phase 3):** the previous Worktree row described the
> window as containing the prune dialog and changes panel. That was wrong.
> `worktree-main.tsx` mounts `WorktreePaletteApp` (a palette listing
> worktrees across configured repos for quick terminal-launch). The
> `WorktreePruneDialog` is rendered from `components/settings/MaintenanceSection.tsx`
> — Settings phase territory. `WorktreeChangesPanel` /
> `WorktreeDiffOverlay` exist under `components/worktree-changes/` but are
> not rendered by any window today (orphaned but committed).
```

- [ ] **Step 2: Update the "Mock layer extensions" list**

Append two entries to the bullet list:

```md
- `@tauri-apps/api/dpi` → `mocks/tauri-api-dpi.ts`
```

And append a one-line note at the end of that section, before the "When a new window's spec needs a plugin not in this list" sub-section:

```md
> **Phase 3 mock-layer extensions:** `tauri-api-window` now also exports
> `currentMonitor` and `getCurrentWindow().{hide,setSize,innerSize,scaleFactor}`.
> `tauri-core` now supports function-form `invokeResponses` —
> `invokeResponses[command]` may be `(args) => T | Promise<T>` for
> arg-discriminated responses (used by stories that vary
> `list_worktrees_bare` per `basePath`).
```

- [ ] **Step 3: Verify the roadmap is consistent**

Open the file and confirm:
- "### Done" has rows 1, 2, 3 (Flyout, WhatsNew, Worktree).
- "### Pending" no longer has a Worktree row.
- The correction note follows the Pending table.
- The Mock layer extensions list ends with `@tauri-apps/api/dpi`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: storybook phase 3 — worktree done; roadmap correction

Moves Worktree from Pending to Done, corrects the description (it's a
palette, not a prune-dialog/changes-panel host), registers the new
@tauri-apps/api/dpi mock alias, and notes the tauri-api-window /
tauri-core extensions added in this phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

**Files:** none

- [ ] **Step 1: Confirm production tree is byte-identical to master**

```bash
cd /Users/koenvdb/projects/BorgDock
git diff master...HEAD -- \
  src/BorgDock.Tauri/src/components/worktree-palette \
  src/BorgDock.Tauri/src/types/settings.ts \
  src/BorgDock.Tauri/src/utils/parse-error.ts \
  src/BorgDock.Tauri/src/worktree-main.tsx \
  ':(exclude)src/BorgDock.Tauri/src/components/worktree-palette/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.stories.tsx'
```
Expected: empty output. If non-empty, a story or fixture commit accidentally touched production code — `git restore --source=master --staged --worktree` the file and re-run.

- [ ] **Step 2: Run vitest**

```bash
cd src/BorgDock.Tauri && npm run test
```
Expected: all tests pass on local (mac).

- [ ] **Step 3: Run lint**

```bash
cd src/BorgDock.Tauri && npm run lint
```
Expected: no errors.

- [ ] **Step 4: Build Storybook**

```bash
cd src/BorgDock.Tauri && npm run build-storybook
```
Expected: build completes; output directory populated.

- [ ] **Step 5: Boot Storybook, smoke-test the catalog**

```bash
cd src/BorgDock.Tauri && npm run storybook &
```

Open the browser to the printed URL and click through one story per axis (8 spot-checks). Verify the global theme toggle re-renders without reload. Stop with `kill %1`.

- [ ] **Step 6: All clear → ready for push**

If any step fails, root-cause the issue. Phase 2's CI surfaced two real production bugs (a post-unmount `setState` race in `useReleasesToShow.ts` and four wizard tests missing a `discover_repos` `await` before clicking Next) — both fixed in master already, so the regressions are unlikely. If a new real bug surfaces, **stop and report** rather than papering over it with `setTimeout`s or skipped tests.

---

## Task 10: Push, switch gh accounts, open PR

**Files:** none

- [ ] **Step 1: Switch `gh` to the personal account**

```bash
gh auth switch --user borght-dev
gh auth status
```
Expected: `Active account: true` for `borght-dev`.

- [ ] **Step 2: Push the branch**

```bash
cd /Users/koenvdb/projects/BorgDock
git push -u origin storybook-phase3-worktree
```
Expected: branch published, no errors.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base master --head storybook-phase3-worktree \
  --title "storybook phase 3: worktree palette catalog" \
  --body "$(cat <<'EOF'
## Summary
- 28 exhaustive stories for `WorktreePaletteApp.tsx` across 8 axes (loading, empty/no-data, single-repo shape, multi-repo grouping, error, filter/favorites, selection/keyboard, interaction).
- Mock-layer extensions: new `@tauri-apps/api/dpi` alias, `tauri-api-window` gains `currentMonitor` + full `getCurrentWindow()` resize methods, `tauri-core` supports function-form `invokeResponses[command]` for arg-discriminated responses.
- Roadmap correction: Worktree window is a palette, not a prune-dialog/changes-panel host. Moved Pending → Done; the prune dialog will be picked up by Settings phase, and the changes panel is currently orphaned (no window renders it).

## Test plan
- [ ] vitest green on macOS CI
- [ ] vitest green on Windows CI
- [ ] `npm run build-storybook` green on both platforms
- [ ] `npm run lint` green
- [ ] Production tree byte-identical to master under `src/BorgDock.Tauri/src/components/worktree-palette/WorktreePaletteApp.tsx`, `src/types/settings.ts`, `src/utils/parse-error.ts`, `src/worktree-main.tsx` (verified with `git diff master...HEAD --` excluding fixtures and stories file).
- [ ] Spot-check one story per axis in `npm run storybook` and verify theme toolbar re-renders.

Spec: `docs/superpowers/specs/2026-05-05-storybook-phase3-worktree-design.md`
Plan: `docs/superpowers/plans/2026-05-05-storybook-phase3-worktree.md`
Roadmap: `docs/superpowers/specs/storybook-roadmap.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 4: Switch `gh` back to the enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
```
Expected: `Active account: true` for `KvanderBorght_gomocha`.

- [ ] **Step 5: Watch CI**

```bash
gh pr checks <PR-URL> --watch
```

Vitest must go green on both macOS and Windows. Playwright is allowed to fail (pre-existing flakiness — established Phase 2 precedent). If vitest fails on Windows, diagnose properly — do NOT bump timeouts or skip tests. Phase 2's CI surfaced two real bugs (post-unmount setState race; tests not awaiting `discover_repos`); root-cause failures the same way. The fix lands as a separate commit on this branch (or, if it touches production code, requires explicit user approval first per the guidance in the original prompt).

---

## Phase D review checkpoint

PR opened, CI watched until vitest green on both platforms. Once green, hand back to the user for merge.

---

## Self-review

**Spec coverage:**
- 28 stories across 8 axes — Task 7 enumerates all 28 by name. ✓
- Mock extensions (control.ts widening, tauri-core function-form, tauri-api-window methods, tauri-api-dpi new file) — Tasks 1–4. ✓
- Vite alias for dpi — Task 5. ✓
- Fixtures with synthetic factories + curated histories — Task 6. ✓
- Roadmap correction (Worktree is a palette; prune dialog lives in Settings; changes panel orphaned) — Task 8. ✓
- Mock layer extensions registered in roadmap — Task 8 step 2. ✓
- Production code byte-identical — Task 9 step 1 explicit diff command. ✓
- CI green on macOS + Windows; Playwright allowed to fail — Task 10 step 5. ✓
- gh account switch protocol — Task 10 steps 1, 4. ✓

**Placeholder scan:** no "TBD"/"TODO"/"fill in"/"add appropriate"/"similar to" left.

**Type consistency:** `WorktreeStoryParameters`, `RepoTrees`, `MockWindow`, `InvokeResponse`, `MonitorState`, `WindowSizeState` are defined once and referenced consistently. The `WorktreeEntry` interface is mirrored in fixtures (matches the local interface inside `WorktreePaletteApp.tsx` — three fields: `path`, `branchName`, `isMainWorktree`). The `WorktreeHarness` reads `parameters.worktree` from Storybook context — same pattern as Phase 2's `WhatsNewHarness`.
