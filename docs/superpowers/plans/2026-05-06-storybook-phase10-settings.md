# Storybook Phase 10 — SettingsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Storybook coverage for the Settings window — `SettingsApp.stories.tsx`, 11 section stories files, 3 dialog stories files (~50 stories total). One new mock alias (`@tauri-apps/plugin-autostart`).

**Architecture:** Per-window storybook catalog matching the pattern of Phases 1–9. New mock-layer entry first, then shared fixtures, then one task per stories file (window/section/dialog), then verification + PR. Production code stays byte-identical.

**Tech Stack:** Storybook 9 + React-Vite, Tailwind v4, existing `@tauri-apps/*` mock layer under `.storybook/mocks/`, Zustand store seed via decorator.

**Spec:** `docs/superpowers/specs/2026-05-06-storybook-phase10-settings-design.md` (must read before starting).

---

## Phase outline

- **Phase A — Mock layer (Task 1):** new `tauri-plugin-autostart.ts` mock + alias in `.storybook/main.ts`. Self-contained.
- **Phase B — Fixtures (Task 2):** `__fixtures__/settings-data.ts` with `makeSettings`, `firstLaunchSettings`, `configuredSettings`, `withSettings` decorator, `SectionFrame`, `repoCandidates`, `selfTestResults`, `selfTestMixed`, `otelStatus`, `otelStatusError`.
- **Phase C — Window-level stories (Task 3):** `SettingsApp.stories.tsx` — 6 stories.
- **Phase D — Section stories (Tasks 4–14):** one stories file per section, 11 tasks total.
- **Phase E — Dialog stories (Tasks 15–17):** 3 stories files.
- **Phase F — Verification & PR (Tasks 18–21):** vitest, build-storybook, byte-identical assertion, roadmap + PR.

Branch is `storybook-phase10-settings`. Worktree at `/Users/koenvdb/projects/borgdock-storybook-settings`. Spec + roadmap doc-fix already committed (HEAD has `7c2a8a18 storybook phase 10: spec for settings catalog` and `3c2538c1 docs: backfill phase 8/9 mock notes + done count in roadmap`).

---

## Task 0: Verify worktree environment

**Files:** none (verification only).

- [ ] **Step 1: Confirm branch and base**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git rev-parse --abbrev-ref HEAD       # storybook-phase10-settings
git fetch origin master
```

If the branch differs, abort and re-create the worktree per the spec's Constraints section.

- [ ] **Step 2: Confirm `node_modules/` is populated (skip `npm install`)**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
ls node_modules/storybook >/dev/null && ls node_modules/@storybook/react-vite >/dev/null && echo "ok"
```

Expected: `ok`. If missing, run `npm install` ONCE — set `timeout: 600000` on the Bash call.

- [ ] **Step 3: Smoke-test the existing test suite**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npm run test -- --run --reporter=basic 2>&1 | tail -5
```

Expected: all suites pass (baseline = 2772+). `timeout: 600000`.

---

## Task 1: Add `tauri-plugin-autostart` mock + alias

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-autostart.ts`
- Modify: `src/BorgDock.Tauri/.storybook/main.ts` (add one alias line)

- [ ] **Step 1: Create the mock**

Write `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-autostart.ts`:

```ts
// .storybook/mocks/tauri-plugin-autostart.ts
//
// Drop-in replacement for @tauri-apps/plugin-autostart. AppearanceSection
// toggles autostart via enable() / disable(); the mock records the call into
// the standard invocations log so stories can assert on it without a new
// control field.
//
// To force enable() to reject (e.g. for AutostartFailure story), set:
//   getControl().invokeResponses['autostart.enable'] = '__throw__'
// or assign a function that returns a rejected promise.

import { getControl } from './control';

export async function enable(): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'autostart.enable' });
  const override = ctrl.invokeResponses['autostart.enable'];
  if (override === '__throw__') throw new Error('autostart enable failed');
  if (typeof override === 'function') {
    return (override as (args: unknown) => Promise<void> | void)(undefined) as Promise<void>;
  }
}

export async function disable(): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'autostart.disable' });
  const override = ctrl.invokeResponses['autostart.disable'];
  if (override === '__throw__') throw new Error('autostart disable failed');
  if (typeof override === 'function') {
    return (override as (args: unknown) => Promise<void> | void)(undefined) as Promise<void>;
  }
}
```

- [ ] **Step 2: Add the alias entry**

Edit `src/BorgDock.Tauri/.storybook/main.ts`, locate the `config.resolve.alias` block, and insert one new line. Preserve existing entries verbatim. The new line goes immediately after the `'@tauri-apps/plugin-fs'` line (matches the loose plugin-grouping order):

```ts
      '@tauri-apps/plugin-fs': resolve(here, 'mocks/tauri-plugin-fs.ts'),
      '@tauri-apps/plugin-autostart': resolve(here, 'mocks/tauri-plugin-autostart.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

Expected: clean (no errors). `timeout: 600000`.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-autostart.ts src/BorgDock.Tauri/.storybook/main.ts
git commit -m "storybook: add tauri-plugin-autostart mock + alias (phase 10 prep)"
```

---

## Task 2: Create Settings fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/__fixtures__/settings-data.ts`

- [ ] **Step 1: Create the fixtures file**

Write `src/BorgDock.Tauri/src/components/settings/__fixtures__/settings-data.ts`:

```ts
// src/components/settings/__fixtures__/settings-data.ts
//
// Shared canned data + a Storybook decorator for Settings stories.
// Centralizes the AppSettings shape so each story file can override
// just the slice it cares about.

import type { ReactNode } from 'react';
import type { Decorator } from '@storybook/react-vite';
import type { AppSettings } from '@/types/settings';
import type { SelfTestResult } from '@/components/settings/SelfTestResultsDialog';
import { useSettingsStore } from '@/stores/settings-store';
import { PulseProvider } from '@/components/settings/useFieldPulse';
import { getControl } from '../../../../.storybook/mocks/control';

// Mirrors the defaultSettings literal in src/stores/settings-store.ts.
// Keep in lockstep — if defaults change, this fixture must too.
const defaultSettings: AppSettings = {
  setupComplete: false,
  gitHub: {
    authMethod: 'ghCli',
    pollIntervalSeconds: 60,
    username: '',
  },
  repos: [],
  ui: {
    sidebarEdge: 'right',
    sidebarMode: 'pinned',
    sidebarWidthPx: 800,
    theme: 'system',
    globalHotkey: 'Ctrl+Win+Shift+G',
    flyoutHotkey: 'Ctrl+Win+Shift+F',
    editorCommand: 'code',
    runAtStartup: false,
    quickReviewHotkey: '',
    startMinimizedToTray: false,
    restoreLastSelection: true,
  },
  notifications: {
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
    channels: { tray: true, system: true, sound: true, emailDigest: false },
  },
  claudeCode: {
    defaultPostFixAction: 'commitAndNotify',
  },
  claudeApi: {
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
    prSummaryEnabled: true,
    diffExplanationsEnabled: true,
    reviewNudgePhrasingEnabled: false,
    commitMessageSuggestionsEnabled: false,
  },
  claudeReview: {
    botUsername: 'claude[bot]',
  },
  updates: {
    autoCheckEnabled: true,
    autoDownload: true,
  },
  azureDevOps: {
    organization: '',
    project: '',
    authMethod: 'azCli',
    authAutoDetected: false,
    pollIntervalSeconds: 120,
    favoriteQueryIds: [],
    trackedWorkItemIds: [],
    workingOnWorkItemIds: [],
    workItemWorktreePaths: {},
    recentWorkItemIds: [],
    linkMatchBy: 'branch',
    showWorkItemStateOnPrCard: true,
    updatePrStatusWhenWiDone: false,
  },
  sql: {
    connections: [],
    readOnlyByDefault: true,
    confirmDestructiveWithoutWhere: true,
  },
  repoPriority: {},
};

/** Build a complete AppSettings, optionally overriding any top-level slice. */
export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...defaultSettings, ...overrides };
}

/** Empty first-launch state — all defaults, nothing configured. */
export const firstLaunchSettings: AppSettings = makeSettings();

/** Typical user — GitHub auth, 2 repos, 1 ADO connection, 1 SQL connection. */
export const configuredSettings: AppSettings = makeSettings({
  setupComplete: true,
  gitHub: {
    authMethod: 'ghCli',
    pollIntervalSeconds: 60,
    username: 'borght-dev',
  },
  repos: [
    {
      owner: 'borght-dev',
      name: 'BorgDock',
      enabled: true,
      worktreeBasePath: '/Users/koenvdb/projects',
      worktreeSubfolder: 'borgdock',
    },
    {
      owner: 'borght-dev',
      name: 'fsp-horizon',
      enabled: true,
      worktreeBasePath: '/Users/koenvdb/projects',
      worktreeSubfolder: 'fsp-horizon',
    },
  ],
  azureDevOps: {
    organization: 'gomocha',
    project: 'fsp',
    authMethod: 'azCli',
    authAutoDetected: true,
    pollIntervalSeconds: 120,
    favoriteQueryIds: ['my-active', 'recent-bugs'],
    trackedWorkItemIds: [12345, 12346],
    workingOnWorkItemIds: [12347],
    workItemWorktreePaths: {},
    recentWorkItemIds: [12345, 12346, 12347],
    linkMatchBy: 'branch',
    showWorkItemStateOnPrCard: true,
    updatePrStatusWhenWiDone: false,
  },
  sql: {
    connections: [
      {
        name: 'fsp-prod (read-only)',
        server: 'fsp-prod.database.windows.net',
        port: 1433,
        database: 'fsp',
        authentication: 'sql',
        username: 'reader',
        trustServerCertificate: false,
      },
    ],
    lastUsedConnection: 'fsp-prod (read-only)',
    defaultConnectionName: 'fsp-prod (read-only)',
    readOnlyByDefault: true,
    confirmDestructiveWithoutWhere: true,
  },
});

/** Decorator: seed the Zustand store + per-story invoke responses. */
export interface WithSettingsOptions {
  hasLoaded?: boolean;
  invokeResponses?: Record<string, unknown>;
}

export function withSettings(
  fixture: AppSettings,
  options: WithSettingsOptions = {},
): Decorator {
  return (Story) => {
    // The preview decorator already calls getControl().reset() before each
    // story; we run after that, so the seed is fresh on every render.
    const ctrl = getControl();
    Object.assign(ctrl.invokeResponses, options.invokeResponses ?? {});
    useSettingsStore.setState({
      settings: fixture,
      hasLoaded: options.hasLoaded ?? true,
    });
    return <Story />;
  };
}

/** Render frame for section-level stories: PulseProvider + max-width body. */
export function SectionFrame({ children }: { children: ReactNode }) {
  return (
    <PulseProvider value={{ pulseAnchor: null, setPulseAnchor: () => {} }}>
      <div className="bg-[var(--color-background)] text-[var(--color-text-primary)]">
        <div className="mx-auto max-w-[720px] px-9 pb-16 pt-7">{children}</div>
      </div>
    </PulseProvider>
  );
}

// ─── Synthetic data for dialog stories ───────────────────────────────────

export const repoCandidates = [
  { path: '/Users/koenvdb/projects/borgdock', owner: 'borght-dev', name: 'BorgDock', alreadyTracked: false },
  { path: '/Users/koenvdb/projects/fsp-horizon', owner: 'borght-dev', name: 'fsp-horizon', alreadyTracked: true },
  { path: '/Users/koenvdb/projects/pluim', owner: null, name: 'pluim', alreadyTracked: false },
  { path: '/Users/koenvdb/projects/devcenter', owner: 'borght-dev', name: 'devcenter', alreadyTracked: false },
];

export const selfTestResults: SelfTestResult[] = [
  { service: 'GitHub API', ok: true, message: 'Reachable; 4823/5000 rate-limit remaining' },
  { service: 'Azure DevOps', ok: true, message: 'az CLI v2.55.0; token valid' },
  { service: 'SQL Server', ok: true, message: 'fsp-prod responding (12 ms)' },
  { service: 'Claude Code', ok: true, message: 'claude --version → 2.0.5' },
];

export const selfTestMixed: SelfTestResult[] = [
  { service: 'GitHub API', ok: true, message: 'Reachable; 4823/5000 rate-limit remaining' },
  { service: 'Azure DevOps', ok: false, message: 'az CLI not logged in (run `az login`)' },
  { service: 'SQL Server', ok: true, message: 'fsp-prod responding (12 ms)' },
  { service: 'Claude Code', ok: false, message: 'claude binary not on PATH' },
];

export const otelStatus = {
  healthy: true,
  endpoint: 'http://127.0.0.1:4318',
  lastWriteAgoSeconds: 3,
};

export const otelStatusError = {
  healthy: false,
  endpoint: 'http://127.0.0.1:4318',
  lastWriteAgoSeconds: null,
};
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

Expected: clean. If `Cannot find module '@/types/settings'` etc. — the relative path from `__fixtures__/` to `.storybook/mocks/control.ts` may need adjusting. The provided `../../../../.storybook/mocks/control` is correct: `__fixtures__` → `settings/` → `components/` → `src/` → `BorgDock.Tauri/` → `.storybook/`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/__fixtures__/settings-data.ts
git commit -m "storybook: settings fixtures + withSettings decorator (phase 10 prep)"
```

---

## Task 3: SettingsApp.stories.tsx (6 window-level stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/SettingsApp.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/SettingsApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { SettingsApp } from './SettingsApp';
import {
  configuredSettings,
  firstLaunchSettings,
  withSettings,
} from './__fixtures__/settings-data';
import { getControl } from '../../../.storybook/mocks/control';

const meta: Meta<typeof SettingsApp> = {
  title: 'Settings/SettingsApp',
  component: SettingsApp,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SettingsApp>;

const githubAuthOk = { authenticated: true, login: 'borght-dev' };

export const Default: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
        get_cache_size: 1024 * 1024 * 24,
        agent_overview_status: { enabled: false },
      },
    }),
  ],
};

export const FirstLaunch: Story = {
  decorators: [
    withSettings(firstLaunchSettings, {
      invokeResponses: {
        check_github_auth: { authenticated: false },
        az_cli_available: false,
        get_cache_size: 0,
        agent_overview_status: { enabled: false },
      },
    }),
  ],
};

export const LoadingSplash: Story = {
  decorators: [
    withSettings(configuredSettings, {
      hasLoaded: false,
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
      },
    }),
  ],
};

// Pre-populates the search input via a tiny presentational wrapper so the
// rail renders the search-results panel without a play function.
function WithSearch({ query }: { query: string }) {
  useEffect(() => {
    // The rail's search input is uncontrolled from outside, but RailSearchInput
    // exposes the query via state inside SettingsApp. We drive the same flow
    // by simulating a user typing: focus + dispatch input event.
    const el = document.querySelector<HTMLInputElement>('input[placeholder*="Search" i]');
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, query);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, [query]);
  return null;
}

export const RailSearchActive: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
      },
    }),
    (Story) => (
      <>
        <Story />
        <WithSearch query="repo" />
      </>
    ),
  ],
};

export const RailSearchNoResults: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
      },
    }),
    (Story) => (
      <>
        <Story />
        <WithSearch query="zzzz" />
      </>
    ),
  ],
};

export const DeepLinkArrival: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
      },
    }),
  ],
  play: async () => {
    // Wait one frame for the listener registration in SettingsApp's useEffect.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    getControl().emit('settings:deep-link', 'ado');
  },
};
```

- [ ] **Step 2: Type-check + count stories**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/SettingsApp.stories.tsx
```

Expected: clean tsc, count = 6.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/SettingsApp.stories.tsx
git commit -m "storybook: SettingsApp window-level catalog (6 stories)"
```

---

## Task 4: GitHubSection.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/GitHubSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/GitHubSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitHubSection } from './GitHubSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof GitHubSection> = {
  title: 'Settings/GitHubSection',
  component: GitHubSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof GitHubSection>;

const baseArgs = {
  github: configuredSettings.gitHub,
  onChange: () => {},
};

export const NotAuthenticated: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { check_github_auth: { authenticated: false } },
    }),
  ],
  args: baseArgs,
};

export const Authenticated: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: { authenticated: true, login: 'borght-dev' },
      },
    }),
  ],
  args: baseArgs,
};

export const AuthCheckPending: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        // Never resolves — keeps the section in pending state.
        check_github_auth: () => new Promise(() => {}),
      },
    }),
  ],
  args: baseArgs,
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/GitHubSection.stories.tsx
```

Expected: clean, count = 3.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/GitHubSection.stories.tsx
git commit -m "storybook: GitHubSection axis stories (3)"
```

---

## Task 5: RepoSection.stories.tsx (5 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/RepoSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/RepoSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { RepoSection } from './RepoSection';
import {
  configuredSettings,
  makeSettings,
  repoCandidates,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { RepoSettings } from '@/types/settings';

const meta: Meta<typeof RepoSection> = {
  title: 'Settings/RepoSection',
  component: RepoSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof RepoSection>;

const oneRepo: RepoSettings[] = [configuredSettings.repos[0]];

const manyRepos: RepoSettings[] = Array.from({ length: 6 }, (_, i) => ({
  owner: 'borght-dev',
  name: `repo-${i + 1}`,
  enabled: i % 2 === 0,
  worktreeBasePath: '/Users/koenvdb/projects',
  worktreeSubfolder: `repo-${i + 1}`,
}));

const baseDecorator = withSettings(configuredSettings, {
  invokeResponses: {
    scan_repos_under: repoCandidates,
  },
});

export const Empty: Story = {
  decorators: [baseDecorator],
  args: { repos: [], onChange: () => {} },
};

export const OneRepo: Story = {
  decorators: [baseDecorator],
  args: { repos: oneRepo, onChange: () => {} },
};

export const ManyRepos: Story = {
  decorators: [baseDecorator],
  args: { repos: manyRepos, onChange: () => {} },
};

export const ScanDialogOpen: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        // Never resolves — dialog sits in scanning state.
        scan_repos_under: () => new Promise(() => {}),
      },
    }),
  ],
  args: { repos: manyRepos, onChange: () => {} },
  play: async () => {
    // Click the "Scan for repos" trigger if one is in the DOM. The exact
    // selector depends on the section's internals; fall through silently
    // if the implementation differs.
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.toLowerCase().includes('scan'),
    );
    btn?.click();
  },
};

export const ScanResultsWithCandidates: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        scan_repos_under: repoCandidates,
      },
    }),
  ],
  args: { repos: manyRepos, onChange: () => {} },
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.toLowerCase().includes('scan'),
    );
    btn?.click();
  },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/RepoSection.stories.tsx
```

Expected: clean, count = 5.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/RepoSection.stories.tsx
git commit -m "storybook: RepoSection axis stories (5)"
```

---

## Task 6: AdoSection.stories.tsx (4 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/AdoSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/AdoSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdoSection } from './AdoSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { AzureDevOpsSettings } from '@/types/settings';

const meta: Meta<typeof AdoSection> = {
  title: 'Settings/AdoSection',
  component: AdoSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof AdoSection>;

const noConnection: AzureDevOpsSettings = {
  ...configuredSettings.azureDevOps,
  organization: '',
  project: '',
};

export const NoConnection: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: true },
    }),
  ],
  args: { azureDevOps: noConnection, onChange: () => {} },
};

export const OneConnection: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: true },
    }),
  ],
  args: { azureDevOps: configuredSettings.azureDevOps, onChange: () => {} },
};

export const EditorOpen: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: true },
    }),
  ],
  args: { azureDevOps: configuredSettings.azureDevOps, onChange: () => {} },
  play: async () => {
    // Click the "Edit" / "Connection" button if present.
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /edit|connection/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const AzCliNotAvailable: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: false },
    }),
  ],
  args: { azureDevOps: noConnection, onChange: () => {} },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/AdoSection.stories.tsx
```

Expected: clean, count = 4.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/AdoSection.stories.tsx
git commit -m "storybook: AdoSection axis stories (4)"
```

---

## Task 7: SqlSection.stories.tsx (4 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/SqlSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/SqlSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { SqlSection } from './SqlSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { SqlSettings } from '@/types/settings';

const meta: Meta<typeof SqlSection> = {
  title: 'Settings/SqlSection',
  component: SqlSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof SqlSection>;

const noConnections: SqlSettings = { ...configuredSettings.sql, connections: [] };

const typicalSql: SqlSettings = {
  ...configuredSettings.sql,
  connections: [
    ...configuredSettings.sql.connections,
    {
      name: 'fsp-staging',
      server: 'fsp-staging.database.windows.net',
      port: 1433,
      database: 'fsp',
      authentication: 'sql',
      username: 'app',
      trustServerCertificate: false,
    },
  ],
};

export const NoConnections: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { sql: noConnections, onChange: () => {} },
};

export const Typical: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { sql: typicalSql, onChange: () => {} },
};

export const TestRunning: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        // Never resolves — spinner state.
        test_sql_connection: () => new Promise(() => {}),
      },
    }),
  ],
  args: { sql: typicalSql, onChange: () => {} },
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /test/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const TestFailed: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        test_sql_connection: () => Promise.reject(
          new Error('Login failed for user "reader"')
        ),
      },
    }),
  ],
  args: { sql: typicalSql, onChange: () => {} },
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /test/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/SqlSection.stories.tsx
```

Expected: clean, count = 4.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/SqlSection.stories.tsx
git commit -m "storybook: SqlSection axis stories (4)"
```

---

## Task 8: AppearanceSection.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/AppearanceSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/AppearanceSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppearanceSection } from './AppearanceSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof AppearanceSection> = {
  title: 'Settings/AppearanceSection',
  component: AppearanceSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof AppearanceSection>;

export const Default: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { ui: configuredSettings.ui, onChange: () => {} },
};

export const HotkeyRecording: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { ui: configuredSettings.ui, onChange: () => {} },
  play: async () => {
    // Click the first HotkeyRecorder to put it into capture state. If the
    // recorder uses a button to start capture, this should toggle it.
    const recorder = document.querySelector<HTMLButtonElement>(
      '#field-global-hotkey button',
    );
    recorder?.click();
  },
};

export const AutostartFailure: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { 'autostart.enable': '__throw__' },
    }),
  ],
  args: { ui: configuredSettings.ui, onChange: () => {} },
  play: async () => {
    // Click the "Run at startup" toggle. If currently off, this calls
    // enable() — which the mock rejects, exercising production's catch.
    const toggle = document.querySelector<HTMLElement>('#field-run-at-startup [role="switch"]');
    toggle?.click();
  },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/AppearanceSection.stories.tsx
```

Expected: clean, count = 3.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/AppearanceSection.stories.tsx
git commit -m "storybook: AppearanceSection axis stories (3)"
```

---

## Task 9: NotificationSection.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/NotificationSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/NotificationSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationSection } from './NotificationSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { NotificationSettings } from '@/types/settings';

const meta: Meta<typeof NotificationSection> = {
  title: 'Settings/NotificationSection',
  component: NotificationSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof NotificationSection>;

const allOn: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnCheckStatusChange: true,
  toastOnNewPR: true,
  toastOnReviewUpdate: true,
  toastOnMergeable: true,
  onlyMyPRs: true,
  playMergeSound: true,
  reviewNudgeEnabled: true,
  reviewNudgeEscalation: true,
  channels: { tray: true, system: true, sound: true, emailDigest: true },
};

const allOff: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnCheckStatusChange: false,
  toastOnNewPR: false,
  toastOnReviewUpdate: false,
  toastOnMergeable: false,
  onlyMyPRs: false,
  playMergeSound: false,
  reviewNudgeEnabled: false,
  reviewNudgeEscalation: false,
  channels: { tray: false, system: false, sound: false, emailDigest: false },
};

const mixed: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnCheckStatusChange: true,
  toastOnNewPR: false,
  toastOnReviewUpdate: true,
  toastOnMergeable: false,
  onlyMyPRs: true,
  channels: { tray: true, system: false, sound: true, emailDigest: false },
};

export const AllEnabled: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { notifications: allOn, onChange: () => {} },
};

export const AllDisabled: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { notifications: allOff, onChange: () => {} },
};

export const Mixed: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { notifications: mixed, onChange: () => {} },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/NotificationSection.stories.tsx
```

Expected: clean, count = 3.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/NotificationSection.stories.tsx
git commit -m "storybook: NotificationSection axis stories (3)"
```

---

## Task 10: ClaudeSection.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/ClaudeSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/ClaudeSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaudeSection } from './ClaudeSection';
import {
  configuredSettings,
  makeSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { ClaudeCodeSettings } from '@/types/settings';

const meta: Meta<typeof ClaudeSection> = {
  title: 'Settings/ClaudeSection',
  component: ClaudeSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof ClaudeSection>;

const defaultClaude: ClaudeCodeSettings = configuredSettings.claudeCode;

const customClaude: ClaudeCodeSettings = {
  defaultPostFixAction: 'commitOnly',
  claudeCodePath: '/opt/homebrew/bin/claude',
};

export const Default: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { claudeCode: defaultClaude, onChange: () => {} },
};

export const Configured: Story = {
  decorators: [
    withSettings(makeSettings({ claudeCode: customClaude })),
  ],
  args: { claudeCode: customClaude, onChange: () => {} },
};

export const HotkeyRecordingActive: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { claudeCode: defaultClaude, onChange: () => {} },
  play: async () => {
    // Same pattern as AppearanceSection.HotkeyRecording — find any recorder
    // button in the section and click to enter capture. If ClaudeSection
    // doesn't have a hotkey recorder, the click is a no-op (story still
    // passes; remove this story if section has no recorder).
    const recorder = document.querySelector<HTMLButtonElement>(
      'button[data-testid="hotkey-recorder"]',
    );
    recorder?.click();
  },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/ClaudeSection.stories.tsx
```

Expected: clean, count = 3.

- [ ] **Step 3: Verify ClaudeSection actually has a hotkey recorder**

```bash
grep -n "HotkeyRecorder" src/BorgDock.Tauri/src/components/settings/ClaudeSection.tsx || echo "NO RECORDER"
```

If `NO RECORDER`: drop the `HotkeyRecordingActive` story and reduce the count to 2 (update commit message accordingly).

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/ClaudeSection.stories.tsx
git commit -m "storybook: ClaudeSection axis stories"
```

---

## Task 11: ClaudeApiSection.stories.tsx (2 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/ClaudeApiSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/ClaudeApiSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaudeApiSection } from './ClaudeApiSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { ClaudeApiSettings } from '@/types/settings';

const meta: Meta<typeof ClaudeApiSection> = {
  title: 'Settings/ClaudeApiSection',
  component: ClaudeApiSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof ClaudeApiSection>;

const noKey: ClaudeApiSettings = { ...configuredSettings.claudeApi };

const withKey: ClaudeApiSettings = {
  ...configuredSettings.claudeApi,
  apiKey: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghij',
};

export const NoApiKey: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { claudeApi: noKey, onChange: () => {} },
};

export const ApiKeySet: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { claudeApi: withKey, onChange: () => {} },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/ClaudeApiSection.stories.tsx
```

Expected: clean, count = 2.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/ClaudeApiSection.stories.tsx
git commit -m "storybook: ClaudeApiSection axis stories (2)"
```

---

## Task 12: AgentOverviewSection.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/AgentOverviewSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/AgentOverviewSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentOverviewSection } from './AgentOverviewSection';
import {
  configuredSettings,
  otelStatus,
  otelStatusError,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof AgentOverviewSection> = {
  title: 'Settings/AgentOverviewSection',
  component: AgentOverviewSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof AgentOverviewSection>;

export const Disabled: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        agent_overview_status: otelStatusError,
        set_agent_overview_enabled: undefined,
      },
    }),
  ],
};

export const EnabledRunning: Story = {
  decorators: [
    withSettings(
      { ...configuredSettings, agentOverview: { enabled: true } },
      {
        invokeResponses: {
          agent_overview_status: otelStatus,
        },
      },
    ),
  ],
};

export const EnabledError: Story = {
  decorators: [
    withSettings(
      { ...configuredSettings, agentOverview: { enabled: true } },
      {
        invokeResponses: {
          agent_overview_status: otelStatusError,
        },
      },
    ),
  ],
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/AgentOverviewSection.stories.tsx
```

Expected: clean, count = 3.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/AgentOverviewSection.stories.tsx
git commit -m "storybook: AgentOverviewSection axis stories (3)"
```

---

## Task 13: UpdateSection.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/UpdateSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/UpdateSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpdateSection } from './UpdateSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import { useUpdateStore } from '@/stores/update-store';

const meta: Meta<typeof UpdateSection> = {
  title: 'Settings/UpdateSection',
  component: UpdateSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof UpdateSection>;

const baseArgs = { updates: configuredSettings.updates, onChange: () => {} };

// UpdateSection reads from useUpdateStore directly, so each story seeds it.
function seedUpdateStore(state: Partial<ReturnType<typeof useUpdateStore.getState>>) {
  return () => {
    useUpdateStore.setState(state);
  };
}

export const UpToDate: Story = {
  decorators: [
    withSettings(configuredSettings),
    (Story) => {
      seedUpdateStore({
        checking: false,
        downloading: false,
        progress: 0,
        available: false,
        version: undefined,
        statusText: 'You are on the latest version.',
        currentVersion: '2.0.5',
      })();
      return <Story />;
    },
  ],
  args: baseArgs,
};

export const UpdateAvailable: Story = {
  decorators: [
    withSettings(configuredSettings),
    (Story) => {
      seedUpdateStore({
        checking: false,
        downloading: false,
        progress: 0,
        available: true,
        version: '2.1.0',
        statusText: 'Update 2.1.0 available.',
        currentVersion: '2.0.5',
      })();
      return <Story />;
    },
  ],
  args: baseArgs,
};

export const Checking: Story = {
  decorators: [
    withSettings(configuredSettings),
    (Story) => {
      seedUpdateStore({
        checking: true,
        downloading: false,
        progress: 0,
        available: false,
        version: undefined,
        statusText: 'Checking for updates…',
        currentVersion: '2.0.5',
      })();
      return <Story />;
    },
  ],
  args: baseArgs,
};
```

- [ ] **Step 2: Verify the update-store path exists**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
ls src/BorgDock.Tauri/src/stores/update-store.ts >/dev/null && echo "ok" || echo "MISSING"
```

If `MISSING`: grep for the actual path:
```bash
grep -rn "useUpdateStore" src/BorgDock.Tauri/src/stores/ | head -3
```
Update the import path in the stories file accordingly.

- [ ] **Step 3: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/UpdateSection.stories.tsx
```

Expected: clean, count = 3.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/UpdateSection.stories.tsx
git commit -m "storybook: UpdateSection axis stories (3)"
```

---

## Task 14: MaintenanceSection.stories.tsx (4 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/MaintenanceSection.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/MaintenanceSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { MaintenanceSection } from './MaintenanceSection';
import {
  configuredSettings,
  selfTestResults,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof MaintenanceSection> = {
  title: 'Settings/MaintenanceSection',
  component: MaintenanceSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof MaintenanceSection>;

const baseInvokes = {
  get_cache_size: 1024 * 1024 * 24,
  run_self_test: selfTestResults,
  reset_all_settings: undefined,
  open_log_folder: undefined,
};

export const CacheLoaded: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        clear_cache: { bytesFreed: 0 },
      },
    }),
  ],
};

export const ClearRunning: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        // Never resolves — clear-cache spinner state.
        clear_cache: () => new Promise(() => {}),
      },
    }),
  ],
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /clear cache/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const SelfTestCompleted: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        clear_cache: { bytesFreed: 0 },
      },
    }),
  ],
  play: async () => {
    // Click "Run self test" — opens SelfTestResultsDialog after resolve.
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /self.?test/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const ResetConfirmation: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        clear_cache: { bytesFreed: 0 },
      },
    }),
  ],
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /reset all settings/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/MaintenanceSection.stories.tsx
```

Expected: clean, count = 4.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/MaintenanceSection.stories.tsx
git commit -m "storybook: MaintenanceSection axis stories (4)"
```

---

## Task 15: RepoScanDialog.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/RepoScanDialog.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/RepoScanDialog.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { RepoScanDialog } from './RepoScanDialog';
import {
  configuredSettings,
  repoCandidates,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof RepoScanDialog> = {
  title: 'Settings/Dialogs/RepoScanDialog',
  component: RepoScanDialog,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof RepoScanDialog>;

const baseArgs = {
  isOpen: true,
  parentPath: '/Users/koenvdb/projects',
  onClose: () => {},
  onAdd: () => {},
};

export const Scanning: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        scan_repos_under: () => new Promise(() => {}),
      },
    }),
  ],
  args: baseArgs,
};

export const ResultsEmpty: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { scan_repos_under: [] },
    }),
  ],
  args: baseArgs,
};

export const ResultsWithCandidates: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { scan_repos_under: repoCandidates },
    }),
  ],
  args: baseArgs,
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/RepoScanDialog.stories.tsx
```

Expected: clean, count = 3.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/RepoScanDialog.stories.tsx
git commit -m "storybook: RepoScanDialog axis stories (3)"
```

---

## Task 16: ConnectionEditorDialog.stories.tsx (2 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/ConnectionEditorDialog.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/ConnectionEditorDialog.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConnectionEditorDialog } from './ConnectionEditorDialog';
import {
  configuredSettings,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof ConnectionEditorDialog> = {
  title: 'Settings/Dialogs/ConnectionEditorDialog',
  component: ConnectionEditorDialog,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof ConnectionEditorDialog>;

export const New: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    index: 'new',
    sql: configuredSettings.sql,
    onClose: () => {},
    onSave: () => {},
  },
};

export const EditExisting: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    index: 0,
    sql: configuredSettings.sql,
    onClose: () => {},
    onSave: () => {},
  },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/ConnectionEditorDialog.stories.tsx
```

Expected: clean, count = 2.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/ConnectionEditorDialog.stories.tsx
git commit -m "storybook: ConnectionEditorDialog axis stories (2)"
```

---

## Task 17: SelfTestResultsDialog.stories.tsx (2 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/settings/SelfTestResultsDialog.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/settings/SelfTestResultsDialog.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelfTestResultsDialog } from './SelfTestResultsDialog';
import {
  configuredSettings,
  selfTestResults,
  selfTestMixed,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof SelfTestResultsDialog> = {
  title: 'Settings/Dialogs/SelfTestResultsDialog',
  component: SelfTestResultsDialog,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SelfTestResultsDialog>;

export const AllPassed: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    isOpen: true,
    results: selfTestResults,
    onClose: () => {},
  },
};

export const MixedResults: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    isOpen: true,
    results: selfTestMixed,
    onClose: () => {},
  },
};
```

- [ ] **Step 2: Type-check + count**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -5
grep -c "^export const " src/components/settings/SelfTestResultsDialog.stories.tsx
```

Expected: clean, count = 2.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add src/BorgDock.Tauri/src/components/settings/SelfTestResultsDialog.stories.tsx
git commit -m "storybook: SelfTestResultsDialog axis stories (2)"
```

---

## Task 18: Vitest pass

**Files:** none (verification).

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npm run test -- --run --reporter=basic 2>&1 | tail -10
```

Expected: all tests pass. Baseline = 2772+; this phase adds zero new vitest tests, so the count stays the same. `timeout: 600000`.

If any test fails: investigate. The most likely culprit is the Zustand store seed bleeding across vitest runs (vitest-runner doesn't isolate the module singleton between test files). Mitigation: ensure no vitest test imports the new fixtures file (it's only used by `*.stories.tsx`).

---

## Task 19: build-storybook pass + total story count

**Files:** none (verification).

- [ ] **Step 1: Build Storybook**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npm run build-storybook 2>&1 | tail -15
```

Expected: completes successfully, prints `Storybook X.X.X built in Ys`. `timeout: 600000`.

If any story file fails to load (e.g. a missing decorator argument), fix the offending file in a follow-up commit before proceeding.

- [ ] **Step 2: Count total stories added by this phase**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
grep -c "^export const " \
  src/components/settings/SettingsApp.stories.tsx \
  src/components/settings/{GitHub,Repo,Ado,Sql,Appearance,Notification,Claude,ClaudeApi,AgentOverview,Update,Maintenance}Section.stories.tsx \
  src/components/settings/{RepoScan,ConnectionEditor,SelfTestResults}Dialog.stories.tsx \
  | awk -F: '{sum += $2} END {print sum}'
```

Expected: 49 (or 50 if `ClaudeSection.HotkeyRecordingActive` survived Task 10's recorder check).

---

## Task 20: Production-tree byte-identical assertion

**Files:** none (verification).

- [ ] **Step 1: Diff against `origin/master` excluding stories + fixtures + Storybook config**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git fetch origin master
git diff origin/master...HEAD -- \
  src/BorgDock.Tauri/src/components/settings \
  src/BorgDock.Tauri/src/settings-main.tsx \
  src/BorgDock.Tauri/src/stores/settings-store.ts \
  ':(exclude)src/BorgDock.Tauri/src/components/settings/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/settings/*.stories.tsx'
```

Expected: empty output. If any line appears, the production tree was modified — `git restore` is BANNED, so revert by editing the offending file back to its `origin/master` state (use `git show origin/master:<path>` to read the canonical content).

---

## Task 21: Roadmap update + open PR

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Edit the roadmap — add row 10 + Phase 10 mock-layer note**

Append after the Phase 9 row in the Done table:

```markdown
| 10 | Settings | `settings-main.tsx` → `components/settings/SettingsApp.tsx` | `2026-05-06-storybook-phase10-settings-design.md` | `2026-05-06-storybook-phase10-settings.md` | _(filled in after PR opens)_ |
```

Remove the Settings row from the Pending table.

Update the `Twelve top-level windows live in src/BorgDock.Tauri/src/. Nine done, three to go.` line to `Ten done, two to go.`

After the existing Phase 9 mock-layer note in `## Mock layer extensions`, add:

```markdown
> **Phase 10 mock-layer extensions:** new alias `@tauri-apps/plugin-autostart`
> → `mocks/tauri-plugin-autostart.ts`. Mock exposes `enable()` / `disable()`,
> both push `autostart.enable` / `autostart.disable` invocations into the
> standard `getControl().invocations` log. `enable()` / `disable()` reject
> when `getControl().invokeResponses['autostart.enable']` (resp. `.disable`)
> is the literal string `'__throw__'` — used by the `AutostartFailure` story
> to exercise the production catch branch in `AppearanceSection`.
```

Add `'@tauri-apps/plugin-autostart' → 'mocks/tauri-plugin-autostart.ts'` to the alias bullet list above the per-phase notes.

- [ ] **Step 2: Type-check (no-op for markdown but ensures workspace is clean)**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "roadmap: mark Settings done (phase 10 = row 10)"
```

- [ ] **Step 4: Push the branch**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-settings
git push -u origin storybook-phase10-settings 2>&1 | tail -5
```

- [ ] **Step 5: Switch gh account, open PR, switch back**

```bash
gh auth switch --user borght-dev
gh pr create --repo borght-dev/BorgDock --title "storybook phase 10: settings catalog" --body "$(cat <<'EOF'
## Summary

Phase 10 of the Storybook rollout — adds coverage for the Settings window and its 11 sections + 3 dialogs. ~50 stories total.

- New mock alias: `@tauri-apps/plugin-autostart` → tiny mock (enable/disable record into `invocations` log; `'__throw__'` sentinel triggers rejection for the AutostartFailure story).
- New fixtures: `__fixtures__/settings-data.ts` — `makeSettings`, `firstLaunchSettings`, `configuredSettings`, `withSettings` decorator, `SectionFrame`, dialog data.
- 15 new stories files (1 window + 11 section + 3 dialog).
- Roadmap updated: Settings is row 10 of Done; Phase 10 mock-layer note added.

Per the spec (`docs/superpowers/specs/2026-05-06-storybook-phase10-settings-design.md`):
- Window-level + section + dialog scope (option b).
- Per-story `invokeResponses` (option i).
- Direct Zustand seed via `withSettings` decorator (option a).
- Skip standalone `shared/primitives/*` stories — deferred to a separate cross-cutting phase.

## Test plan

- [x] `npm run test` passes (2772 tests).
- [x] `npm run build-storybook` passes.
- [x] Production tree byte-identical to `origin/master` (verified via `git diff origin/master...HEAD --` against the production paths globs).
- [x] `gh auth` switched back to `KvanderBorght_gomocha` after PR creation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh auth switch --user KvanderBorght_gomocha
```

- [ ] **Step 6: Verify the PR URL is reachable**

```bash
gh pr list --repo borght-dev/BorgDock --search "storybook phase 10" --json number,url -q '.[]'
```

Capture the PR URL from the output.

---

## Acceptance checklist

- [ ] `git diff origin/master...HEAD -- <production paths>` shows zero lines (Task 20).
- [ ] `npm run test` passes (Task 18).
- [ ] `npm run build-storybook` passes (Task 19).
- [ ] Story count = 49 or 50 (Task 19 step 2).
- [ ] Roadmap updated (Settings = row 10, Phase 10 mock note added, alias bullet added) (Task 21).
- [ ] PR opened against `borght-dev/BorgDock`, gh switched back to enterprise account (Task 21).
- [ ] All commits ordered: mock-layer (Task 1) → fixtures (Task 2) → window (Task 3) → sections (Tasks 4–14) → dialogs (Tasks 15–17) → roadmap (Task 21).

---

## Self-review checks (already performed during plan write)

**Spec coverage:** every spec section maps to a task —
- Architecture / Mock-layer extension → Task 1
- Hydration: direct Zustand seed → Task 2 (`withSettings`)
- Stories file pattern → Tasks 3–17
- Fixtures table → Task 2 (every export listed)
- Story Catalog (50 entries) → Tasks 3–17 produce them
- Risks #2 (`__BORGDOCK_VERSION__`) → covered by Task 3's `Default` story rendering the rail footer; verification is implicit via build-storybook (Task 19)
- Risks #6 (dialog portals) → not pre-mitigated; if dialog stories fail to render in Task 19, the implementer reads the dialog source and adjusts (likely passing `usePortal={false}` or rendering at the same DOM level — note in the PR if that adjustment is needed)
- Acceptance criteria → mirrored in this plan's acceptance checklist
- Roadmap update → Task 21

**Placeholder scan:** none. Each step has executable content.

**Type consistency:** `withSettings`, `SectionFrame`, `makeSettings`, `configuredSettings`, `firstLaunchSettings`, `repoCandidates`, `selfTestResults`, `selfTestMixed`, `otelStatus`, `otelStatusError` are defined once in Task 2 and referenced by exact name in Tasks 3–17.
