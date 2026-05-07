# Storybook Phase 12 — Main / Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Storybook coverage for the BorgDock main window — `App.stories.tsx` with 25 stories (21 catalog + 4 screenshot-targeted bodies). New mock surface for `plugin-updater` and `plugin-notification`. Fixtures live at `src/components/main/__fixtures__/main-window-data.tsx`. Production code stays byte-identical.

**Architecture:** Per-window storybook catalog matching the pattern of Phases 1–11. Mock-layer first (new aliases for two plugins App's hooks pull in), shared fixtures second (`withMainWindow` decorator + animation freezer + multi-store seeding + `MainWindowFrame`), then stories grouped by lifecycle / wizard / focus / prs / workitems / screenshots, finally verification + roadmap edit.

**Tech Stack:** Storybook 9 + React-Vite, Tailwind v4, existing `@tauri-apps/*` + `@/services/*` mock layer under `.storybook/mocks/`, Zustand store seed via decorator.

**Spec:** `docs/superpowers/specs/2026-05-08-storybook-phase12-main-sidebar-design.md` (must read before starting). Branch is `storybook-phase12-main-sidebar`. Spec must be committed on this branch before Task 1.

**Sibling plan:** `docs/superpowers/plans/2026-05-08-screenshot-pipeline.md` — the hero-shot pipeline that consumes the `Hero_*` story bodies created here. Lands as a separate PR after this one.

---

## Phase outline

- **Phase A — Mock-layer extensions (Tasks 1–3):** new mocks for `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-notification`, plus aliases in `.storybook/main.ts`.
- **Phase B — Fixtures and helpers (Tasks 4–6):** `__fixtures__/main-window-data.tsx` with `deepMerge`, baselines, named presets, `withMainWindow` decorator, `freezeAnimations` decorator, `MainWindowFrame`.
- **Phase C — Lifecycle / gating stories (Task 7):** 4 stories.
- **Phase D — Wizard stories (Task 8):** 3 stories.
- **Phase E — Focus section stories (Task 9):** 4 stories.
- **Phase F — PR section stories (Task 10):** 6 stories.
- **Phase G — Work-items section stories (Task 11):** 4 stories.
- **Phase H — Screenshot-targeted story bodies (Task 12):** 4 stories (no `parameters.screenshot` — pipeline PR adds those).
- **Phase I — Verification + roadmap (Tasks 13–15):** byte-identical check, build-storybook, addon-vitest, roadmap edit.

---

## Task 0: Verify branch & environment

**Files:** none (verification only).

- [ ] **Step 1: Confirm branch and recent commits**

```bash
cd /Users/koenvdb/projects/BorgDock
git rev-parse --abbrev-ref HEAD
git log --oneline -3
```

Expected: branch is `storybook-phase12-main-sidebar`. Recent commits include the spec for Phase 12. If branch is wrong, create it from `master`:

```bash
git checkout master && git pull --ff-only && git checkout -b storybook-phase12-main-sidebar
```

- [ ] **Step 2: Confirm `node_modules/` is populated**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
ls node_modules/storybook >/dev/null && ls node_modules/@storybook/react-vite >/dev/null && echo "ok"
```

Expected: `ok`. If missing, run `bun install` from the repo root once. Set `timeout: 600000` on the Bash call.

- [ ] **Step 3: Baseline test suite**

```bash
cd /Users/koenvdb/projects/BorgDock
bun run test 2>&1 | tail -10
```

Expected: all suites pass. Record the exact test count for end-of-phase comparison. `timeout: 600000`.

---

## Task 1: New mock — `@tauri-apps/plugin-updater`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-updater.ts`

`useAutoUpdate` calls `check()` and the resulting `Update.downloadAndInstall()`. Mock records into `getControl().invocations` and returns a configurable shape via `invokeResponses['updater.check']`.

- [ ] **Step 1: Create the mock file**

Write `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-updater.ts`:

```ts
// .storybook/mocks/tauri-plugin-updater.ts
//
// Mock for @tauri-apps/plugin-updater. Records calls into getControl()
// and returns either no update (default) or a fake Update object whose
// downloadAndInstall() / download() methods also record.

import { getControl } from './control';

export interface MockUpdate {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall(): Promise<void>;
  download(): Promise<void>;
  install(): Promise<void>;
}

export async function check(): Promise<MockUpdate | null> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'updater.check' });
  const override = ctrl.invokeResponses['updater.check'];
  if (override === '__throw__') {
    throw new Error('updater.check rejected (storybook mock)');
  }
  if (typeof override === 'function') {
    return (override as (args: unknown) => MockUpdate | null)(undefined);
  }
  if (override && typeof override === 'object') {
    return wrapUpdate(override as Partial<MockUpdate>);
  }
  return null;
}

function wrapUpdate(over: Partial<MockUpdate>): MockUpdate {
  return {
    version: over.version ?? '99.0.0',
    date: over.date,
    body: over.body,
    async downloadAndInstall() {
      getControl().invocations.push({ command: 'updater.downloadAndInstall' });
    },
    async download() {
      getControl().invocations.push({ command: 'updater.download' });
    },
    async install() {
      getControl().invocations.push({ command: 'updater.install' });
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-updater.ts
git commit -m "storybook phase 12: mock @tauri-apps/plugin-updater"
```

---

## Task 2: New mock — `@tauri-apps/plugin-notification`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-notification.ts`

`useReviewNudges` and any other notification consumer calls `isPermissionGranted()`, `requestPermission()`, and `sendNotification()`. Mock no-ops, defaults to permission granted, records every call.

- [ ] **Step 1: Create the mock file**

Write `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-notification.ts`:

```ts
// .storybook/mocks/tauri-plugin-notification.ts
//
// Mock for @tauri-apps/plugin-notification. Default: permission granted,
// sendNotification is a no-op that records into getControl().invocations.

import { getControl } from './control';

export type Permission = 'granted' | 'denied' | 'default';

export async function isPermissionGranted(): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'notification.isPermissionGranted' });
  const override = ctrl.invokeResponses['notification.isPermissionGranted'];
  if (typeof override === 'boolean') return override;
  return true;
}

export async function requestPermission(): Promise<Permission> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'notification.requestPermission' });
  const override = ctrl.invokeResponses['notification.requestPermission'];
  if (typeof override === 'string') return override as Permission;
  return 'granted';
}

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  [key: string]: unknown;
}

export function sendNotification(options: NotificationOptions | string): void {
  const args = typeof options === 'string' ? { title: options } : options;
  getControl().invocations.push({ command: 'notification.sendNotification', args });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-notification.ts
git commit -m "storybook phase 12: mock @tauri-apps/plugin-notification"
```

---

## Task 3: Wire new aliases in `.storybook/main.ts`

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/main.ts`

- [ ] **Step 1: Read current alias block**

```bash
sed -n '95,125p' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/.storybook/main.ts
```

Expected: alias array starting around line 96 with entries for tauri-plugin-autostart, services-windows, etc.

- [ ] **Step 2: Add updater + notification aliases**

Edit `src/BorgDock.Tauri/.storybook/main.ts`. Find the line:

```ts
      { find: '@tauri-apps/plugin-autostart', replacement: resolve(here, 'mocks/tauri-plugin-autostart.ts') },
```

Insert immediately after it:

```ts
      { find: '@tauri-apps/plugin-updater', replacement: resolve(here, 'mocks/tauri-plugin-updater.ts') },
      { find: '@tauri-apps/plugin-notification', replacement: resolve(here, 'mocks/tauri-plugin-notification.ts') },
```

- [ ] **Step 3: Smoke-build storybook to confirm aliases resolve**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -20
```

Expected: build completes without "Cannot resolve" / "Failed to resolve module" errors. The build will succeed even though no story uses these mocks yet — Vite only fails on missing aliases when imported.

If the script `build-storybook` doesn't exist yet in `package.json`, add it:

```bash
grep '"build-storybook"' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/package.json
```

If empty, add `"build-storybook": "storybook build"` to the scripts block. If the script already exists in another form (e.g. `"storybook:build"`), use that name instead.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/main.ts src/BorgDock.Tauri/package.json
git commit -m "storybook phase 12: alias updater + notification plugin mocks"
```

---

## Task 4: Fixtures scaffold — settings/init/ui store baselines + helpers

**Files:**
- Create: `src/BorgDock.Tauri/src/components/main/__fixtures__/main-window-data.tsx`

The fixtures file is the largest single file in this phase. We build it across Tasks 4–6:
- Task 4: imports, `deepMerge`, store baselines, `freezeAnimations`, `MainWindowFrame`.
- Task 5: PR + focus + work-item fixtures.
- Task 6: `withMainWindow` decorator + named scenario presets.

- [ ] **Step 1: Verify the directory does not exist yet**

```bash
ls /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/main 2>&1
```

Expected: `No such file or directory`. If it exists already, stop and report — the plan assumes a clean slate.

- [ ] **Step 2: Create `__fixtures__/main-window-data.tsx`** with imports, helpers, and frame component:

```tsx
// src/components/main/__fixtures__/main-window-data.tsx

import type { ReactNode } from 'react';
import type { Decorator } from '@storybook/react-vite';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useInitStore } from '@/stores/initStore';
import { usePrStore } from '@/stores/pr-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { AppSettings } from '@/types';
import type { PullRequest } from '@/types/pull-request';
import type { CheckRun } from '@/types/check-run';
import type { WorkItem } from '@/types/work-item';
import { getControl, type GithubResponses } from '../../../../.storybook/mocks/control';

// ── Deep-merge helper ─────────────────────────────────────────

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

function deepMerge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (!over) return base;
  if (Array.isArray(base)) return (over as unknown as T) ?? base;
  if (typeof base !== 'object' || base === null) return (over as unknown as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k] as never, v as never);
  }
  return out as T;
}

// ── Store baselines (snapshot once at module load) ────────────

export const SETTINGS_BASELINE: AppSettings =
  (useSettingsStore.getState().settings as AppSettings | undefined) ??
  ({} as AppSettings);
const UI_BASELINE = useUiStore.getState();
const INIT_BASELINE = useInitStore.getState();
const PR_BASELINE = usePrStore.getState();
const ONBOARDING_BASELINE = useOnboardingStore.getState();
const WORKITEMS_BASELINE = useWorkItemsStore.getState();

// ── Animation freezer decorator ───────────────────────────────

const FREEZE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`;

export const freezeAnimations: Decorator = (Story) => (
  <>
    <style>{FREEZE_ANIMATIONS_CSS}</style>
    {Story()}
  </>
);

// ── MainWindowFrame ───────────────────────────────────────────

// Production main window opens at 480x900 (sidebar) per
// src-tauri/src/lib.rs. The frame mirrors that shape so stories feel
// like the real sidebar instead of the default fullscreen iframe.

const FRAME_STYLE = `
.storybook-main-frame .h-screen { height: 100% !important; }
.storybook-main-frame .w-screen { width: 100% !important; }
`;

export function MainWindowFrame({
  children,
  width = 480,
  height = 900,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        background: 'var(--color-app-background, #1a1a1a)',
      }}
    >
      <style>{FRAME_STYLE}</style>
      <div
        className="storybook-main-frame"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)',
          position: 'relative',
        }}
      >
        <div className="flex h-full flex-col bg-[var(--color-background)]">
          <div className="relative flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Larger frame for the README hero composition (App + PR Detail).
export function HeroCompositionFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        background: 'var(--color-app-background, #1a1a1a)',
      }}
    >
      <style>{FRAME_STYLE}</style>
      <div
        className="storybook-main-frame"
        style={{
          display: 'grid',
          gridTemplateColumns: '480px 1fr',
          gap: '16px',
          width: '1600px',
          height: '1000px',
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the file compiles in isolation by running storybook build**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -10
```

Expected: build still completes. The fixture file isn't imported anywhere yet, so any import errors here would be detected by `bun run lint`. Skip the lint until Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/main/__fixtures__/main-window-data.tsx
git commit -m "storybook phase 12: fixture scaffold — baselines + frame + freeze-animations"
```

---

## Task 5: Fixtures — PR / focus / work-item presets

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/main/__fixtures__/main-window-data.tsx`

Add named PR, focus, and work-item presets. These power the section variant stories.

- [ ] **Step 1: Append PR fixtures** to the bottom of `main-window-data.tsx`:

```tsx
// ── PR fixtures ───────────────────────────────────────────────

const BASE_PR: PullRequest = {
  number: 42,
  title: 'feat: storybook phase 12 main window catalog',
  headRef: 'storybook-phase12-main-sidebar',
  headSha: '0123456789abcdef0123456789abcdef01234567',
  baseRef: 'master',
  authorLogin: 'borght-dev',
  authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
  state: 'open',
  createdAt: '2026-05-08T09:00:00Z',
  updatedAt: '2026-05-08T11:00:00Z',
  isDraft: false,
  mergeable: true,
  htmlUrl: 'https://github.com/borght-dev/BorgDock/pull/42',
  body: '',
  repoOwner: 'borght-dev',
  repoName: 'BorgDock',
  reviewStatus: 'pending',
  commentCount: 0,
  labels: [],
  additions: 0,
  deletions: 0,
  changedFiles: 0,
  commitCount: 1,
  requestedReviewers: [],
};

export function makePr(overrides?: DeepPartial<PullRequest>): PullRequest {
  return deepMerge(BASE_PR, overrides);
}

export const PRS_CANONICAL: PullRequest[] = [
  makePr({ number: 41, title: 'feat: add focus section keyboard nav', authorLogin: 'borght-dev', repoName: 'BorgDock' }),
  makePr({ number: 42, title: 'feat: storybook phase 12 main window catalog' }),
  makePr({ number: 43, title: 'fix: rate-limit banner copy', reviewStatus: 'approved' }),
  makePr({ number: 200, title: 'chore: bump deps', repoOwner: 'borght-dev', repoName: 'borgdock-site', commentCount: 2 }),
];

export const PRS_MANY_REPOS: PullRequest[] = [
  ...PRS_CANONICAL,
  makePr({ number: 18, repoName: 'docs-experiments', title: 'docs: revamp install guide' }),
  makePr({ number: 9, repoName: 'release-tooling', title: 'feat: add release notes generator' }),
  makePr({ number: 7, repoName: 'ci-utils', title: 'fix: cache miss in storybook job' }),
];

export const PRS_WITH_FAILURES: PullRequest[] = [
  makePr({ number: 50, title: 'feat: triggers a flaky test' }),
  makePr({ number: 51, title: 'fix: hangs on Windows', mergeable: false }),
];

export const PRS_MERGE_CONFLICTS: PullRequest[] = [
  makePr({ number: 60, mergeable: false, title: 'feat: conflicts with main' }),
  makePr({ number: 61, mergeable: false, title: 'feat: also conflicts' }),
];

export const PRS_EMPTY: PullRequest[] = [];

const BASE_CHECKS: CheckRun[] = [
  { id: 1001, name: 'CI / build', status: 'success', htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/1001', checkSuiteId: 9000 },
  { id: 1002, name: 'CI / test', status: 'success', htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/1002', checkSuiteId: 9000 },
];

const FAILING_CHECKS: CheckRun[] = [
  { id: 2001, name: 'CI / build', status: 'failure', htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/2001', checkSuiteId: 9000 },
  { id: 2002, name: 'CI / test', status: 'success', htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/2002', checkSuiteId: 9000 },
];

export const CHECKS_FOR_REF: Record<string, CheckRun[]> = {
  default: BASE_CHECKS,
  failing: FAILING_CHECKS,
};

// ── Work-item fixtures ────────────────────────────────────────

const BASE_WORK_ITEM: WorkItem = {
  id: 1234,
  title: 'Investigate sidebar polling cadence',
  state: 'Active',
  workItemType: 'Task',
  assignedTo: 'koen@borgdock.dev',
  iterationPath: 'BorgDock\\Sprint 12',
  areaPath: 'BorgDock\\Frontend',
  url: 'https://dev.azure.com/borght/BorgDock/_workitems/edit/1234',
  changedDate: '2026-05-07T13:00:00Z',
  // Other fields default to empty / null per WorkItem shape — extend as needed.
};

export function makeWorkItem(overrides?: DeepPartial<WorkItem>): WorkItem {
  return deepMerge(BASE_WORK_ITEM, overrides);
}

export const WORK_ITEMS_CANONICAL: WorkItem[] = [
  makeWorkItem({ id: 1234, title: 'Investigate sidebar polling cadence' }),
  makeWorkItem({ id: 1235, title: 'Wire React Compiler escape hatch into docs', state: 'New' }),
  makeWorkItem({ id: 1236, title: 'Audit grammar wasm sizes', state: 'Resolved' }),
];

// ── Focus / quick-review fixtures ─────────────────────────────

// FocusList consumes a derived priority shape from PR data — there's no
// separate "focus store" with prebuilt priority objects. Stories drive
// the focus list by populating usePrStore + the priority-derivation logic
// under hooks/usePriorities.ts. For story purposes we set the same PRs
// that power PrsCanonical and let the section render its own derivation.
```

Verify the `WorkItem` type's shape against `src/types/work-item.ts` before finalizing — the `BASE_WORK_ITEM` above uses common fields but the actual interface may have additional required fields. If the file refuses to compile, run:

```bash
grep -n "export interface WorkItem\b\|export type WorkItem\b" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/types/work-item.ts
```

…and add any missing required fields with sensible defaults to `BASE_WORK_ITEM`.

- [ ] **Step 2: Run lint to surface type errors early**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -20
```

Expected: no errors in the new file. Fix any reported field mismatches before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/main/__fixtures__/main-window-data.tsx
git commit -m "storybook phase 12: fixture presets — PRs / checks / work items"
```

---

## Task 6: Fixtures — `withMainWindow` decorator + scenario presets

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/main/__fixtures__/main-window-data.tsx`

The decorator seeds the six stores synchronously and pins mock control responses. Stories pass a small options object naming which preset to use.

- [ ] **Step 1: Append decorator and scenario types** to the bottom of `main-window-data.tsx`:

```tsx
// ── Decorator ─────────────────────────────────────────────────

export interface WithMainWindowOptions {
  /** Top-level override only. Merges shallowly. */
  settings?: Partial<AppSettings>;
  /** Override init state (default: complete). Set { isComplete: false } to render splash. */
  init?: Partial<{ isComplete: boolean }>;
  /** Override UI store (default: section='focus'). */
  ui?: Partial<{ activeSection: 'focus' | 'prs' | 'workitems' }>;
  /** Pull requests to seed into usePrStore. Default: PRS_CANONICAL. */
  pullRequests?: PullRequest[];
  /** Work items to seed into useWorkItemsStore. Default: WORK_ITEMS_CANONICAL. */
  workItems?: WorkItem[];
  /** Tauri invoke responses (e.g. load_settings, set_badge_visible). */
  invokeResponses?: Record<string, unknown>;
  /** GitHub service mock responses. */
  githubResponses?: Partial<GithubResponses>;
  /** Force the App.tsx fade-out branch by toggling the local fadingOut state to true.
   *  Implementation note: App.tsx uses a local useState; to simulate fadingOut without
   *  modifying the component, the FadingOut story sets isInitComplete=true and then
   *  immediately toggles fadingOut via the fade-out useEffect path.
   *  This option is reserved for future use; FadingOut handles its own setup. */
  forceFadingOut?: boolean;
}

const DEFAULT_INVOKES: Record<string, unknown> = {
  load_settings: undefined,
  cache_init: undefined,
  set_badge_visible: undefined,
  resize_badge: undefined,
  show_setup_wizard: undefined,
  open_settings_window: undefined,
  register_user_hotkeys: undefined,
  unregister_hotkey: undefined,
};

export function withMainWindow(options: WithMainWindowOptions = {}): Decorator {
  return (Story) => {
    const ctrl = getControl();

    // Default invoke responses — every command App's hooks call must have a defined response
    // or tauri-core falls through to the "no response" path which logs a warning.
    Object.assign(ctrl.invokeResponses, DEFAULT_INVOKES, options.invokeResponses ?? {});
    Object.assign(ctrl.githubResponses, options.githubResponses ?? {});

    // Restore baselines first, then layer overrides.
    useSettingsStore.setState({
      settings: { ...SETTINGS_BASELINE, ...(options.settings ?? {}) } as AppSettings,
      isLoading: false,
      hasLoaded: true,
    });

    useUiStore.setState({
      ...UI_BASELINE,
      activeSection: options.ui?.activeSection ?? 'focus',
    });

    useInitStore.setState({
      ...INIT_BASELINE,
      isComplete: options.init?.isComplete ?? true,
    });

    usePrStore.setState({
      ...PR_BASELINE,
      pullRequests: options.pullRequests ?? PRS_CANONICAL,
    });

    useOnboardingStore.setState({ ...ONBOARDING_BASELINE });
    useWorkItemsStore.setState({
      ...WORKITEMS_BASELINE,
      workItems: options.workItems ?? WORK_ITEMS_CANONICAL,
    });

    return Story();
  };
}

// ── Wizard helpers ────────────────────────────────────────────

/**
 * Force the wizard to render by leaving setup incomplete. Pass an authMethod
 * to toggle between the AuthStep variants.
 */
export function withWizard(options: {
  authMethod?: 'pat' | 'gh-cli' | 'browser-app';
  hasToken?: boolean;
  hasRepos?: boolean;
} = {}): Decorator {
  return withMainWindow({
    settings: {
      setupComplete: false,
      gitHub: {
        ...(SETTINGS_BASELINE as { gitHub?: object }).gitHub,
        authMethod: options.authMethod ?? 'gh-cli',
        personalAccessToken: options.hasToken ? 'mock-token' : '',
      },
      repos: options.hasRepos ? [{ owner: 'borght-dev', name: 'BorgDock' }] : [],
    } as Partial<AppSettings>,
  });
}
```

The `withWizard` shape may need adjustment depending on the actual `AppSettings` shape — verify by reading `src/types/index.ts` or wherever `AppSettings` lives:

```bash
grep -rn "export interface AppSettings\|export type AppSettings" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/types/ | head
```

Adjust field names (`gitHub`, `authMethod`, `personalAccessToken`, `repos`, `setupComplete`) to match the real shape exactly.

- [ ] **Step 2: Run lint**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -20
```

Expected: no errors. Fix any field mismatches.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/main/__fixtures__/main-window-data.tsx
git commit -m "storybook phase 12: withMainWindow decorator + wizard helper"
```

---

## Task 7: Lifecycle / gating stories (4)

**Files:**
- Create: `src/BorgDock.Tauri/src/App.stories.tsx`

Four stories: `LoadingSettings`, `InitInProgress`, `FadingOut`, `Loaded`.

- [ ] **Step 1: Create the stories file**

Write `src/BorgDock.Tauri/src/App.stories.tsx`:

```tsx
// src/App.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import App from './App';
import {
  freezeAnimations,
  MainWindowFrame,
  PRS_CANONICAL,
  withMainWindow,
} from './components/main/__fixtures__/main-window-data';

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Lifecycle',
  component: App,
  decorators: [(Story) => <MainWindowFrame><Story /></MainWindowFrame>],
};
export default meta;
type Story = StoryObj<typeof App>;

// ── A. Lifecycle / gating ─────────────────────────────────────

export const LoadingSettings: Story = {
  decorators: [
    withMainWindow({
      // Override settings store directly — withMainWindow sets isLoading=false,
      // but this story needs isLoading=true. The decorator order matters:
      // withMainWindow runs first, then this anonymous one re-toggles isLoading.
    }),
    (Story) => {
      // Lazy import to avoid forcing a re-render before stores are seeded.
      const { useSettingsStore } = require('@/stores/settings-store') as typeof import('@/stores/settings-store');
      useSettingsStore.setState({ isLoading: true, hasLoaded: false });
      return <Story />;
    },
  ],
};

export const InitInProgress: Story = {
  decorators: [
    withMainWindow({ init: { isComplete: false } }),
  ],
};

export const FadingOut: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({ init: { isComplete: true } }),
    (Story) => {
      // The fade-out branch is gated by App.tsx's local `fadingOut` state.
      // App's own useEffect sets it true for 200ms when init transitions
      // to complete. To capture this state stably:
      //   1. We mount App with isInitComplete=true → the useEffect fires,
      //      setting fadingOut=true and starting the 200ms setTimeout.
      //   2. We replace window.setTimeout with a no-op for the duration of
      //      this story so the timer never resolves and fadingOut stays true.
      const realSetTimeout = window.setTimeout;
      window.setTimeout = ((fn: TimerHandler, ms?: number) => {
        if (ms === 200) return 0 as unknown as ReturnType<typeof setTimeout>;
        return realSetTimeout(fn, ms);
      }) as typeof window.setTimeout;
      return <Story />;
    },
  ],
};

export const Loaded: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_CANONICAL,
    }),
  ],
};
```

- [ ] **Step 2: Run storybook dev to confirm stories load**

In a separate terminal:

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run storybook
```

Open the URL it prints, navigate to `Main Window/App/Lifecycle/*`. Each story should render without console errors. Stop the dev server (Ctrl+C) once verified. (If running in an automated environment, skip this step and rely on `bun run build-storybook` in Task 13.)

- [ ] **Step 3: Run lint**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/App.stories.tsx
git commit -m "storybook phase 12: lifecycle / gating stories (4)"
```

---

## Task 8: Setup wizard stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/App.stories.tsx`

Three stories: `WizardAuth`, `WizardRepos`, `WizardPatMissing`. They share a `meta.title` sub-folder under `Wizard`.

- [ ] **Step 1: Append wizard stories** to `App.stories.tsx`. Add a new sub-meta block by exporting a second module pattern is not possible — Storybook 9 allows only one default export per file. Instead, use story-level `parameters: { docs: { story: { ... } } }` or rely on naming convention. We'll use naming: keep stories in this same file; the sidebar will group them under `Main Window/App/Lifecycle/Wizard*` because the meta title already contains `Lifecycle`. To get a separate sub-folder, we need a separate stories file.

Create `src/BorgDock.Tauri/src/components/wizard/Wizard.stories.tsx` instead:

```tsx
// src/components/wizard/Wizard.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import App from '../../App';
import {
  MainWindowFrame,
  withWizard,
} from '../main/__fixtures__/main-window-data';

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Wizard',
  component: App,
  decorators: [(Story) => <MainWindowFrame><Story /></MainWindowFrame>],
};
export default meta;
type Story = StoryObj<typeof App>;

export const WizardAuth: Story = {
  decorators: [withWizard({ authMethod: 'gh-cli', hasToken: false, hasRepos: false })],
};

export const WizardRepos: Story = {
  decorators: [withWizard({ authMethod: 'gh-cli', hasToken: true, hasRepos: true })],
};

export const WizardPatMissing: Story = {
  decorators: [withWizard({ authMethod: 'pat', hasToken: false, hasRepos: false })],
};
```

The `WizardRepos` story needs the wizard to advance past AuthStep into RepoStep. Since `App.tsx` returns `<SetupWizard />` and `SetupWizard` manages its own internal `step` state, this story's "RepoStep" assumption may not work without further fixturing — verify by running the story and checking which step appears. If it stays on AuthStep, additional intervention is needed (either a prop to seed the step, or a synthetic click on the `next` button via `play` function from `storybook/test`).

If the wizard needs interaction:

```tsx
import { within } from 'storybook/test';

export const WizardRepos: Story = {
  decorators: [withWizard({ authMethod: 'gh-cli', hasToken: true, hasRepos: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const next = await canvas.findByRole('button', { name: /next|continue/i });
    next.click();
  },
};
```

Choose the approach that matches `SetupWizard.tsx`'s actual API after reading it:

```bash
grep -n "useState\|step\|AuthStep\|RepoStep" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/wizard/SetupWizard.tsx | head
```

- [ ] **Step 2: Run storybook build**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/wizard/Wizard.stories.tsx
git commit -m "storybook phase 12: wizard stories (3)"
```

---

## Task 9: Focus section stories (4)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/focus/Focus.stories.tsx`

Four stories: `FocusCanonical`, `FocusEmpty`, `FocusWithQuickReview`, `FocusWithMergeToast`. Stories mount `<App />` (not `<FocusList />` directly) so the merge toast and quick-review overlay can layer on top — they're rendered by `App.tsx`, not `FocusList.tsx`.

- [ ] **Step 1: Create the file**

Write `src/BorgDock.Tauri/src/components/focus/Focus.stories.tsx`:

```tsx
// src/components/focus/Focus.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import App from '../../App';
import {
  MainWindowFrame,
  PRS_CANONICAL,
  PRS_EMPTY,
  withMainWindow,
} from '../main/__fixtures__/main-window-data';

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Focus',
  component: App,
  decorators: [(Story) => <MainWindowFrame><Story /></MainWindowFrame>],
};
export default meta;
type Story = StoryObj<typeof App>;

const focusBase = { ui: { activeSection: 'focus' as const } };

export const FocusCanonical: Story = {
  decorators: [withMainWindow({ ...focusBase, pullRequests: PRS_CANONICAL })],
};

export const FocusEmpty: Story = {
  decorators: [withMainWindow({ ...focusBase, pullRequests: PRS_EMPTY })],
};

export const FocusWithQuickReview: Story = {
  decorators: [
    withMainWindow({ ...focusBase, pullRequests: PRS_CANONICAL }),
    (Story) => {
      // QuickReviewOverlay reads from useQuickReviewStore; trigger it open.
      const { useQuickReviewStore } = require('@/stores/quick-review-store') as typeof import('@/stores/quick-review-store');
      useQuickReviewStore.setState({ isOpen: true });
      return <Story />;
    },
  ],
};

export const FocusWithMergeToast: Story = {
  decorators: [
    withMainWindow({ ...focusBase, pullRequests: PRS_CANONICAL }),
    (Story) => {
      // MergeToast is event-driven (external-merge-celebration). Emit the event:
      const { getControl } = require('../../../.storybook/mocks/control') as typeof import('../../../.storybook/mocks/control');
      // Defer the emit to next tick so listeners in the rendered tree are attached.
      setTimeout(() => {
        getControl().emit('borgdock-merge-celebration', { number: 42, repo: 'BorgDock' });
      }, 0);
      return <Story />;
    },
  ],
};
```

The `useQuickReviewStore` field name (`isOpen`) and the merge celebration event channel name (`borgdock-merge-celebration`) are placeholders — verify by reading the actual hook and store source:

```bash
grep -rn "useQuickReviewStore\|setState\|isOpen" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/stores/quick-review-store.ts | head
grep -rn "emit\|listen\|merge-celebration" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/hooks/useExternalMergeCelebration.ts | head
```

Adjust the field name and event channel exactly. Do not guess.

- [ ] **Step 2: Run storybook build**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/focus/Focus.stories.tsx
git commit -m "storybook phase 12: focus section stories (4)"
```

---

## Task 10: PR section stories (6)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr/Pr.stories.tsx`

Six stories: `PrsCanonical`, `PrsEmpty`, `PrsManyRepos`, `PrsWithFailures`, `PrsMergeConflicts`, `PrsRateLimited`.

- [ ] **Step 1: Create the file**

Write `src/BorgDock.Tauri/src/components/pr/Pr.stories.tsx`:

```tsx
// src/components/pr/Pr.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import App from '../../App';
import {
  MainWindowFrame,
  PRS_CANONICAL,
  PRS_EMPTY,
  PRS_MANY_REPOS,
  PRS_MERGE_CONFLICTS,
  PRS_WITH_FAILURES,
  withMainWindow,
} from '../main/__fixtures__/main-window-data';

const meta: Meta<typeof App> = {
  title: 'Main Window/App/PRs',
  component: App,
  decorators: [(Story) => <MainWindowFrame><Story /></MainWindowFrame>],
};
export default meta;
type Story = StoryObj<typeof App>;

const prsBase = { ui: { activeSection: 'prs' as const } };

export const PrsCanonical: Story = {
  decorators: [withMainWindow({ ...prsBase, pullRequests: PRS_CANONICAL })],
};

export const PrsEmpty: Story = {
  decorators: [withMainWindow({ ...prsBase, pullRequests: PRS_EMPTY })],
};

export const PrsManyRepos: Story = {
  decorators: [withMainWindow({ ...prsBase, pullRequests: PRS_MANY_REPOS })],
};

export const PrsWithFailures: Story = {
  decorators: [withMainWindow({ ...prsBase, pullRequests: PRS_WITH_FAILURES })],
};

export const PrsMergeConflicts: Story = {
  decorators: [withMainWindow({ ...prsBase, pullRequests: PRS_MERGE_CONFLICTS })],
};

export const PrsRateLimited: Story = {
  decorators: [
    withMainWindow({ ...prsBase, pullRequests: PRS_CANONICAL }),
    (Story) => {
      // The PR list shows a rate-limit banner when usePrStore.rateLimit is set.
      const { usePrStore } = require('@/stores/pr-store') as typeof import('@/stores/pr-store');
      usePrStore.setState({
        rateLimit: { remaining: 0, resetAt: Date.now() + 60_000, limit: 5000 },
      });
      return <Story />;
    },
  ],
};
```

Verify the rate-limit field name on `usePrStore`:

```bash
grep -n "rateLimit\|RateLimit\|remaining" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/stores/pr-store.ts | head
```

Adjust the field shape exactly.

- [ ] **Step 2: Run storybook build**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr/Pr.stories.tsx
git commit -m "storybook phase 12: PR section stories (6)"
```

---

## Task 11: Work-items section stories (4)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.stories.tsx`

Four stories: `WorkItemsCanonical`, `WorkItemsLoading`, `WorkItemsFailure`, `WorkItemsSearching`.

- [ ] **Step 1: Create the file**

Write `src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.stories.tsx`:

```tsx
// src/components/work-items/WorkItemsSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import App from '../../App';
import {
  MainWindowFrame,
  WORK_ITEMS_CANONICAL,
  withMainWindow,
} from '../main/__fixtures__/main-window-data';

const meta: Meta<typeof App> = {
  title: 'Main Window/App/WorkItems',
  component: App,
  decorators: [(Story) => <MainWindowFrame><Story /></MainWindowFrame>],
};
export default meta;
type Story = StoryObj<typeof App>;

const wiBase = { ui: { activeSection: 'workitems' as const } };

export const WorkItemsCanonical: Story = {
  decorators: [withMainWindow({ ...wiBase, workItems: WORK_ITEMS_CANONICAL })],
};

export const WorkItemsLoading: Story = {
  decorators: [
    withMainWindow({ ...wiBase, workItems: [] }),
    (Story) => {
      const { useWorkItemsStore } = require('@/stores/work-items-store') as typeof import('@/stores/work-items-store');
      useWorkItemsStore.setState({ isLoading: true, error: null });
      return <Story />;
    },
  ],
};

export const WorkItemsFailure: Story = {
  decorators: [
    withMainWindow({ ...wiBase, workItems: [] }),
    (Story) => {
      const { useWorkItemsStore } = require('@/stores/work-items-store') as typeof import('@/stores/work-items-store');
      useWorkItemsStore.setState({ isLoading: false, error: 'ADO request failed: 401 Unauthorized' });
      return <Story />;
    },
  ],
};

export const WorkItemsSearching: Story = {
  decorators: [
    withMainWindow({ ...wiBase, workItems: WORK_ITEMS_CANONICAL }),
    (Story) => {
      const { useWorkItemsStore } = require('@/stores/work-items-store') as typeof import('@/stores/work-items-store');
      useWorkItemsStore.setState({ searchQuery: 'storybook', filterMode: 'search' });
      return <Story />;
    },
  ],
};
```

Verify field names against the actual store:

```bash
grep -n "isLoading\|error\|searchQuery\|filterMode" /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/stores/work-items-store.ts | head
```

Adjust exactly.

- [ ] **Step 2: Build storybook**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.stories.tsx
git commit -m "storybook phase 12: work-items section stories (4)"
```

---

## Task 12: Screenshot-targeted stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/App.stories.tsx` — append `Hero_*` stories.

Four story bodies: `Hero_ReadmeMain` (composed App + PR Detail scene), `Hero_DocFocusList`, `Hero_DocPrsList`, `Hero_DocWorkItems`. **Phase 12 ships only the bodies**; the sibling pipeline PR adds `parameters.screenshot` on top.

- [ ] **Step 1: Append to `App.stories.tsx`**

Add the following exports to the existing `src/BorgDock.Tauri/src/App.stories.tsx` (after the `Loaded` story):

```tsx
// ── F. Screenshot-targeted (story bodies only — pipeline PR tags) ─────

import { PrDetailApp } from './components/pr-detail/PRDetailApp';
import { HeroCompositionFrame, freezeAnimations as freezeAnimationsRef } from './components/main/__fixtures__/main-window-data';

export const Hero_ReadmeMain: Story = {
  decorators: [
    freezeAnimationsRef,
    (Story) => {
      // Override the meta-level MainWindowFrame decorator with the larger
      // composition frame. Storybook applies decorators outermost-first;
      // since this story decorator runs BEFORE the meta one, we reach into
      // the seed but render our own frame.
      return Story();
    },
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      githubResponses: {
        getOpenPRs: PRS_CANONICAL,
      },
    }),
    (Story) => {
      // Seed the PR-Detail params so PrDetailApp picks the same PR as the
      // sidebar's "active" item. PrDetailApp reads window.__BORGDOCK_PR_DETAIL__.
      (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__ = {
        owner: 'borght-dev',
        repo: 'BorgDock',
        number: 42,
      };
      return (
        <HeroCompositionFrame>
          <Story />
          <PrDetailApp />
        </HeroCompositionFrame>
      );
    },
  ],
};

export const Hero_DocFocusList: Story = {
  decorators: [
    withMainWindow({ ui: { activeSection: 'focus' }, pullRequests: PRS_CANONICAL }),
  ],
};

export const Hero_DocPrsList: Story = {
  decorators: [
    withMainWindow({ ui: { activeSection: 'prs' }, pullRequests: PRS_CANONICAL }),
  ],
};

export const Hero_DocWorkItems: Story = {
  decorators: [
    withMainWindow({ ui: { activeSection: 'workitems' }, workItems: WORK_ITEMS_CANONICAL }),
  ],
};
```

Wait — the meta default decorator wraps every story in `MainWindowFrame`. `Hero_ReadmeMain` needs `HeroCompositionFrame` instead. Decorator override pattern in Storybook 9: per-story decorators are applied *inside* the meta decorator. To replace the meta frame, set `parameters: { layout: 'fullscreen' }` and handle the frame inside the story decorator chain — or split `Hero_ReadmeMain` into its own meta block.

**Simpler approach — split into a separate stories file** so it has its own meta with no `MainWindowFrame` wrapper:

Create `src/BorgDock.Tauri/src/App.hero.stories.tsx`:

```tsx
// src/App.hero.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import App from './App';
import { PrDetailApp } from './components/pr-detail/PRDetailApp';
import {
  freezeAnimations,
  HeroCompositionFrame,
  MainWindowFrame,
  PRS_CANONICAL,
  WORK_ITEMS_CANONICAL,
  withMainWindow,
} from './components/main/__fixtures__/main-window-data';

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Screenshots',
  component: App,
};
export default meta;
type Story = StoryObj<typeof App>;

export const Hero_ReadmeMain: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      githubResponses: { getOpenPRs: PRS_CANONICAL },
    }),
    (Story) => {
      (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__ = {
        owner: 'borght-dev',
        repo: 'BorgDock',
        number: 42,
      };
      return (
        <HeroCompositionFrame>
          <Story />
          <PrDetailApp />
        </HeroCompositionFrame>
      );
    },
  ],
};

export const Hero_DocFocusList: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({ ui: { activeSection: 'focus' }, pullRequests: PRS_CANONICAL }),
    (Story) => <MainWindowFrame>{Story()}</MainWindowFrame>,
  ],
};

export const Hero_DocPrsList: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({ ui: { activeSection: 'prs' }, pullRequests: PRS_CANONICAL }),
    (Story) => <MainWindowFrame>{Story()}</MainWindowFrame>,
  ],
};

export const Hero_DocWorkItems: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({ ui: { activeSection: 'workitems' }, workItems: WORK_ITEMS_CANONICAL }),
    (Story) => <MainWindowFrame>{Story()}</MainWindowFrame>,
  ],
};
```

Use this file structure (separate `App.hero.stories.tsx`) instead of trying to inline the hero stories into `App.stories.tsx`. Delete the embedded `Hero_*` exports from `App.stories.tsx` if they were added.

- [ ] **Step 2: Build storybook + run lint**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run lint 2>&1 | tail -20
bun run build-storybook 2>&1 | tail -10
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/App.hero.stories.tsx
git commit -m "storybook phase 12: hero / screenshot story bodies (4)"
```

---

## Task 13: Verification — addon-vitest + byte-identical production

**Files:** none (verification only).

- [ ] **Step 1: Run vitest (catalog smoke test)**

```bash
cd /Users/koenvdb/projects/BorgDock
bun run test 2>&1 | tail -20
```

Expected: same baseline test count from Task 0 plus N additional storybook smoke tests (one per new story = 25). Actual count depends on addon-vitest configuration.

If addon-vitest is configured to crawl all stories, expect 2772+25 ≈ 2797 tests, all passing. Adjust expectations to match the baseline observed in Task 0. `timeout: 600000`.

- [ ] **Step 2: Confirm production code is byte-identical**

```bash
git diff master --stat -- 'src/BorgDock.Tauri/src/**' \
  | grep -v '\.stories\.tsx$\|__fixtures__/\|\.storybook/'
```

Expected: empty output. If any production file appears, investigate before merging — Phase 12 must not edit production code.

- [ ] **Step 3: Build storybook one final time**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
bun run build-storybook 2>&1 | tail -5
```

Expected: clean build.

---

## Task 14: Roadmap update

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Move Main / Sidebar from Pending to Done**

Edit `docs/superpowers/specs/storybook-roadmap.md`. In the `### Done` table (around line 52), add a new row:

```markdown
| 12 | Main / Sidebar | `main.tsx` → `App.tsx` | `2026-05-08-storybook-phase12-main-sidebar-design.md` | `2026-05-08-storybook-phase12-main-sidebar.md` | _(filled in after PR opens)_ |
```

Remove the corresponding row from the `### Pending` section.

- [ ] **Step 2: Add a Phase 12 mock-layer extension note**

Append to the "Mock layer extensions" tracked-list block (around line 138) — add the two new aliases:

```markdown
- `@tauri-apps/plugin-updater` → `mocks/tauri-plugin-updater.ts`
- `@tauri-apps/plugin-notification` → `mocks/tauri-plugin-notification.ts`
```

And below the existing `> **Phase 11 mock-layer extensions:** …` note, add:

```markdown
> **Phase 12 mock-layer extensions:** two new aliases —
> `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-notification` — for the
> auto-update and review-nudge surfaces. Stories drive the main window via
> `withMainWindow` (multi-store seed: settings + init + ui + pr + onboarding +
> work-items) and a `freezeAnimations` decorator. The README hero composition
> mounts both `<App />` and `<PrDetailApp />` simultaneously inside a CSS-grid
> `HeroCompositionFrame`; both share Zustand stores so the seeded fixtures must
> be coherent across both windows.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "storybook phase 12: roadmap update — main / sidebar done"
```

---

## Task 15: Open the PR

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin storybook-phase12-main-sidebar
```

- [ ] **Step 2: Switch to personal `gh` account**

```bash
gh auth switch --user borght-dev
gh auth status
```

Expected: `borght-dev` is the active user.

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --repo borght-dev/BorgDock \
  --base master \
  --title "storybook phase 12: main / sidebar catalog" \
  --body "$(cat <<'EOF'
## Summary
- Adds Storybook coverage for the BorgDock main window — 25 stories across lifecycle, wizard, focus, prs, work-items, and screenshot-targeted bodies.
- New mock surface for `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-notification`.
- Production code byte-identical: `git diff master --stat -- 'src/BorgDock.Tauri/src/**' | grep -v '\.stories\.tsx$\|__fixtures__/\|\.storybook/'` returns empty.

This is the final per-screen Storybook phase. The hero-shot pipeline (cross-cutting workstream) ships next as a separate PR — see `docs/superpowers/specs/2026-05-08-screenshot-pipeline-design.md`.

## Test plan
- [ ] `bun run storybook` — all 25 stories under `Main Window/App/*` render without console errors.
- [ ] `bun run build-storybook` — clean build.
- [ ] `bun run test` — baseline test count + new storybook smoke tests, all passing.
- [ ] Theme toolbar toggles light/dark across every story.
- [ ] No edits to `src/App.tsx`, `src/main.tsx`, or any production component file.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Switch back to the enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
```

Expected: `KvanderBorght_gomocha` is the active user.

- [ ] **Step 5: Update roadmap with PR number**

Once the PR URL is known, edit the roadmap row for Main / Sidebar to replace `_(filled in after PR opens)_` with the actual PR link, and commit:

```bash
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "storybook phase 12: roadmap — link PR"
git push
```

---

## Self-review checklist

Before marking this plan done:

- [ ] Spec coverage: every spec section has at least one task. Lifecycle ✓, Wizard ✓, Focus ✓, PRs ✓, WorkItems ✓, Screenshots (bodies only) ✓, mock layer extensions ✓, byte-identical production ✓, roadmap update ✓.
- [ ] No placeholders. The only "TBD"-shaped items are field names that the implementer must verify against the actual store source — these are documented inline with the exact `grep` command to run.
- [ ] Type consistency: `withMainWindow`, `withWizard`, `freezeAnimations`, `MainWindowFrame`, `HeroCompositionFrame`, `PRS_*`, `WORK_ITEMS_*` are referenced consistently across all stories tasks.

---

## What comes next

Once this PR merges, proceed to the screenshot pipeline plan: `docs/superpowers/plans/2026-05-08-screenshot-pipeline.md` (sibling spec: `docs/superpowers/specs/2026-05-08-screenshot-pipeline-design.md`).
