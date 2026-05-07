# Storybook Phase 11 — PR Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Storybook coverage for the PR Detail window — `PRDetailApp.stories.tsx`, `PRDetailPanel.stories.tsx`, 5 per-tab stories files, and 3 auxiliary stories files (`CheckoutPanel`, `MergeReadinessChecklist`, `ReviewComposer`). ~48 stories total. Four new mock aliases (`@/services/github/{pulls,checks,auth}`, `@/services/pr-actions`), two new control-surface fields. Production code stays byte-identical.

**Architecture:** Per-window storybook catalog matching the pattern of Phases 1–10. Mock-layer first (control surface + 4 mocks + 4 aliases), shared fixtures second, then one task per stories file, then verification + roadmap edit.

**Tech Stack:** Storybook 9 + React-Vite, Tailwind v4, existing `@tauri-apps/*` + `@/services/*` mock layer under `.storybook/mocks/`, Zustand store seed via decorator.

**Spec:** `docs/superpowers/specs/2026-05-07-storybook-phase11-pr-detail-design.md` (must read before starting). Branch is `storybook-phase11-pr-detail`. Spec already committed (HEAD has `129cfd75 storybook phase 11: spec correction — mock pr-actions instead of usePrActions` and `315b49c8 storybook phase 11: pr-detail design`).

---

## Phase outline

- **Phase A — Mock layer (Tasks 1–3):** control-surface fields + 4 mock files + 4 main.ts aliases.
- **Phase B — Fixtures (Task 4):** `__fixtures__/pr-detail-data.ts` with `makePr`, ~12 named PR presets, `withPrDetail` decorator, `PanelFrame`.
- **Phase C — Window-shell (Task 5):** `PRDetailApp.stories.tsx` — 5 stories.
- **Phase D — Panel-level (Task 6):** `PRDetailPanel.stories.tsx` — 4 stories.
- **Phase E — Per-tab (Tasks 7–11):** OverviewTab, FilesTab, ChecksTab, CommitsTab, DiscussionTab. ~25 stories.
- **Phase F — Auxiliary (Tasks 12–14):** CheckoutPanel, MergeReadinessChecklist, ReviewComposer. ~14 stories.
- **Phase G — Verification & roadmap (Tasks 15–17):** byte-identical check, build-storybook, vitest, roadmap edit.

---

## Task 0: Verify branch & environment

**Files:** none (verification only).

- [ ] **Step 1: Confirm branch and recent commits**

```bash
cd /Users/koenvdb/projects/BorgDock
git rev-parse --abbrev-ref HEAD       # storybook-phase11-pr-detail
git log --oneline -3
```

Expected: branch is `storybook-phase11-pr-detail`. Recent commits include `spec correction — mock pr-actions instead of usePrActions` and `pr-detail design`.

- [ ] **Step 2: Confirm `node_modules/` is populated**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
ls node_modules/storybook >/dev/null && ls node_modules/@storybook/react-vite >/dev/null && echo "ok"
```

Expected: `ok`. If missing, run `npm install` ONCE — set `timeout: 600000` on the Bash call.

- [ ] **Step 3: Baseline test suite**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npm run test -- --run --reporter=basic 2>&1 | tail -5
```

Expected: all suites pass (baseline = 2772+). `timeout: 600000`. Record the exact test count for end-of-phase comparison.

---

## Task 1: Control-surface fields

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/control.ts`

- [ ] **Step 1: Read control.ts to confirm current shape**

```bash
sed -n '79,210p' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/.storybook/mocks/control.ts
```

Expected output: `interface StorybookTauriControl { … }` ending around line 109; `createControl()` initializer through line 207.

- [ ] **Step 2: Add type imports + types**

Edit `src/BorgDock.Tauri/.storybook/mocks/control.ts`. At the top of the file (line 6 area), update the type imports to add `PullRequest` and `CheckRun`:

```ts
import type { Release } from '../../src/types/whats-new';
import type { WorkItem, WorkItemComment } from '../../src/types/work-item';
import type { PullRequest } from '../../src/types/pull-request';
import type { CheckRun } from '../../src/types/check-run';
```

After `WebviewWindowRecord` (around line 78, just before `interface StorybookTauriControl`), insert the two new exported types:

```ts
// Phase 11 — github service responses
export type GithubResponses = {
  getOpenPRs?:
    | PullRequest[]
    | ((args: { owner: string; repo: string }) => PullRequest[] | Promise<PullRequest[]> | Promise<never>);
  getCheckRunsForRef?:
    | CheckRun[]
    | ((args: { ref: string }) => CheckRun[] | Promise<CheckRun[]> | Promise<never>);
  tokenGetter?: () => string | Promise<string>;
};

// Phase 11 — pr-actions overrides
export type PrActionResponses = Record<string, '__throw__' | '__fail__' | ((args: unknown) => unknown)>;
```

- [ ] **Step 3: Add fields to `StorybookTauriControl`**

In the same file, inside the `StorybookTauriControl` interface (currently ends around line 109), insert after the Phase 8 fields and before `reset()`:

```ts
  // Phase 11 fields
  githubResponses: GithubResponses;
  prActionResponses: PrActionResponses;
```

- [ ] **Step 4: Initialize fields in `createControl()`**

In `createControl()` (around line 151), add the new fields to the initializer (after `webviewWindowsCreated: []`):

```ts
    webviewWindowsCreated: [],

    // Phase 11
    githubResponses: {},
    prActionResponses: {},
```

- [ ] **Step 5: Reset fields in `reset()`**

Inside the `reset()` body (around line 174–201), add the resets at the end (after `ctrl.webviewWindowsCreated.length = 0`):

```ts
      ctrl.webviewWindowsCreated.length = 0;

      // Phase 11
      ctrl.githubResponses = {};
      ctrl.prActionResponses = {};
```

Both fields use simple reassignment to match the `pluginDialog` precedent. Mocks read via `getControl().<field>` on each call, so no captured references exist that need preservation.

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors. If errors mention the new types, recheck the import paths.

- [ ] **Step 7: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook phase 11: control surface — githubResponses + prActionResponses

Two new fields on the storybook control surface:
- githubResponses: per-call canned responses for the GH service mocks
  (getOpenPRs, getCheckRunsForRef, tokenGetter).
- prActionResponses: per-action override map for the pr-actions mock —
  '__throw__' rejects, '__fail__' resolves to false, function lets the
  story compute the result.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: GitHub service mocks (pulls, checks, auth)

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/services-github-pulls.ts`
- Create: `src/BorgDock.Tauri/.storybook/mocks/services-github-checks.ts`
- Create: `src/BorgDock.Tauri/.storybook/mocks/services-github-auth.ts`
- Modify: `src/BorgDock.Tauri/.storybook/main.ts` (add 3 alias lines)

- [ ] **Step 1: Confirm production exports**

```bash
grep -n "^export async function getOpenPRs\|^export async function getCheckRunsForRef\|^export async function getGitHubToken" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/services/github/{pulls,checks,auth}.ts
```

Expected: three matches confirming the exact function names. If any signature differs from this plan, update the mock signatures to match.

- [ ] **Step 2: Create pulls mock**

Write `src/BorgDock.Tauri/.storybook/mocks/services-github-pulls.ts`:

```ts
// .storybook/mocks/services-github-pulls.ts
//
// Drop-in replacement for @/services/github/pulls. The functions used
// by PR Detail are getOpenPRs() (called by PrDetailApp). Other exports
// from the production module aren't called by any PR-Detail story; if a
// future story needs them, add them here using the same getControl()
// pattern.
//
// To stub a never-resolving fetch:
//   getControl().githubResponses.getOpenPRs = () => new Promise(() => {});
// To stub a rejection:
//   getControl().githubResponses.getOpenPRs = () => Promise.reject(new Error('boom'));

import type { PullRequest } from '../../src/types/pull-request';
import { getControl } from './control';

export async function getOpenPRs(
  _client: unknown,
  owner: string,
  repo: string,
): Promise<PullRequest[]> {
  const r = getControl().githubResponses.getOpenPRs;
  if (typeof r === 'function') return r({ owner, repo });
  return r ?? [];
}
```

- [ ] **Step 3: Create checks mock**

Write `src/BorgDock.Tauri/.storybook/mocks/services-github-checks.ts`:

```ts
// .storybook/mocks/services-github-checks.ts
//
// Drop-in replacement for @/services/github/checks. PR Detail uses
// getCheckRunsForRef(); other exports (getCheckSuites, getCheckRuns,
// getJobLog, rerunWorkflow) aren't called by any PR-Detail story.

import type { CheckRun } from '../../src/types/check-run';
import { getControl } from './control';

export async function getCheckRunsForRef(
  _client: unknown,
  _owner: string,
  _repo: string,
  ref: string,
): Promise<CheckRun[]> {
  const r = getControl().githubResponses.getCheckRunsForRef;
  if (typeof r === 'function') return r({ ref });
  return r ?? [];
}
```

- [ ] **Step 4: Create auth mock**

Write `src/BorgDock.Tauri/.storybook/mocks/services-github-auth.ts`:

```ts
// .storybook/mocks/services-github-auth.ts
//
// Drop-in replacement for @/services/github/auth. Returns a token from
// the storybook control surface, or echoes the PAT it was passed.
// invalidateGitHubTokenCache() is a no-op; no PR-Detail story exercises
// the cache-invalidation path.

import { getControl } from './control';

export async function getGitHubToken(patFromSettings?: string): Promise<string> {
  const getter = getControl().githubResponses.tokenGetter;
  if (typeof getter === 'function') return getter();
  return patFromSettings ?? 'gh_storybook_dummy_token';
}

export function invalidateGitHubTokenCache(): void {
  // no-op in storybook
}
```

- [ ] **Step 5: Add aliases in main.ts**

Edit `src/BorgDock.Tauri/.storybook/main.ts`. After the existing `'@/services/ado/workitems': resolve(here, 'mocks/services-ado-workitems.ts'),` line (around line 58), insert:

```ts
      '@/services/ado/workitems': resolve(here, 'mocks/services-ado-workitems.ts'),
      '@/services/github/pulls': resolve(here, 'mocks/services-github-pulls.ts'),
      '@/services/github/checks': resolve(here, 'mocks/services-github-checks.ts'),
      '@/services/github/auth': resolve(here, 'mocks/services-github-auth.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
```

(The three new lines are inserted between the existing ado/workitems and generated/changelog entries.)

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/mocks/services-github-pulls.ts \
        src/BorgDock.Tauri/.storybook/mocks/services-github-checks.ts \
        src/BorgDock.Tauri/.storybook/mocks/services-github-auth.ts \
        src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook phase 11: github service mocks (pulls, checks, auth)

Adds three storybook-only mocks for the @/services/github/{pulls,checks,auth}
modules used by PrDetailApp's hydrate path. Each mock reads canned responses
from getControl().githubResponses, so stories control loading / rejection /
empty-result behaviour without going through GitHubClient.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: pr-actions mock

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/services-pr-actions.ts`
- Modify: `src/BorgDock.Tauri/.storybook/main.ts` (add 1 alias line)

- [ ] **Step 1: Confirm production exports**

```bash
grep -nE "^export (async function|interface|type) " \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/services/pr-actions.ts
```

Expected: seven `export async function` lines (`mergePr`, `bypassMergePr`, `closePr`, `toggleDraftPr`, `rerunChecks`, `checkoutPrBranch`, `openPrInBrowser`) plus exported interfaces (`PrRef`, `ActionOpts`, `MergePrOpts`, `CheckoutOpts`, `ClosePrInput`, `ToggleDraftInput`, `RerunChecksInput`, `CheckoutInput`). If the count differs, the mock below must add or remove functions to match.

- [ ] **Step 2: Locate the CheckoutResult export**

```bash
grep -nE "(interface|type) CheckoutResult" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/services/pr-actions.ts
```

Expected: one match. The mock's `checkoutPrBranch` return type is `CheckoutResult | null`. If the type is named differently (e.g., `CheckoutPrResult`), update the import in step 3.

- [ ] **Step 3: Create the mock**

Write `src/BorgDock.Tauri/.storybook/mocks/services-pr-actions.ts`:

```ts
// .storybook/mocks/services-pr-actions.ts
//
// Drop-in replacement for @/services/pr-actions. Each mutation records the
// call into getControl().invocations and returns true (success) by default.
//
// Override behaviour per-action via getControl().prActionResponses[name]:
//   '__throw__' → reject with an Error
//   '__fail__'  → resolve to false (production calls onError)
//   function    → call it; the function's return value is the result
//
// The 'name' key is the function name (e.g. 'mergePr', 'closePr').

import type {
  PrRef,
  MergePrOpts,
  ActionOpts,
  ClosePrInput,
  ToggleDraftInput,
  RerunChecksInput,
  CheckoutInput,
  CheckoutResult,
} from '../../src/services/pr-actions';
import { getControl } from './control';

type Behavior = '__throw__' | '__fail__' | ((args: unknown) => unknown);

async function record<T>(name: string, args: unknown, defaultResult: T): Promise<T> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: `prAction.${name}`, args });
  const override = ctrl.prActionResponses[name] as Behavior | undefined;
  if (override === '__throw__') throw new Error(`mock prAction.${name} threw`);
  if (override === '__fail__') return false as unknown as T;
  if (typeof override === 'function') return (await override(args)) as T;
  return defaultResult;
}

export async function mergePr(pr: PrRef, opts?: MergePrOpts): Promise<boolean> {
  return record('mergePr', { pr, opts }, true);
}

export async function bypassMergePr(pr: PrRef, opts?: ActionOpts): Promise<boolean> {
  return record('bypassMergePr', { pr, opts }, true);
}

export async function closePr(pr: ClosePrInput, opts?: ActionOpts): Promise<boolean> {
  return record('closePr', { pr, opts }, true);
}

export async function toggleDraftPr(
  pr: ToggleDraftInput,
  opts?: ActionOpts,
): Promise<boolean> {
  return record('toggleDraftPr', { pr, opts }, true);
}

export async function rerunChecks(
  input: RerunChecksInput,
  opts?: ActionOpts,
): Promise<boolean> {
  return record('rerunChecks', { input, opts }, true);
}

export async function checkoutPrBranch(
  input: CheckoutInput,
  opts?: ActionOpts,
): Promise<CheckoutResult | null> {
  return record(
    'checkoutPrBranch',
    { input, opts },
    { worktreePath: '/tmp/wt', terminalLaunched: true } as unknown as CheckoutResult,
  );
}

export async function openPrInBrowser(
  htmlUrl: string,
  opts?: ActionOpts,
): Promise<boolean> {
  return record('openPrInBrowser', { htmlUrl, opts }, true);
}
```

If step 1 surfaced a different export count, add/remove functions accordingly. If `CheckoutResult` is named `CheckoutPrResult` (or similar), update the import alias.

- [ ] **Step 4: Add alias in main.ts**

Edit `src/BorgDock.Tauri/.storybook/main.ts`. After the three `services/github/*` lines added in Task 2, insert:

```ts
      '@/services/github/auth': resolve(here, 'mocks/services-github-auth.ts'),
      '@/services/pr-actions': resolve(here, 'mocks/services-pr-actions.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
```

(One new line, alphabetical-ish, before generated/changelog.)

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/.storybook/mocks/services-pr-actions.ts \
        src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook phase 11: pr-actions mock

Drop-in replacement for @/services/pr-actions. Each mutation records the
call into getControl().invocations and supports per-action overrides via
getControl().prActionResponses ('__throw__', '__fail__', or a function).

The hook usePrActions runs unmodified — only the network-mutation layer
underneath it is intercepted, so confirm-dialog state, status text, and
isReady computation remain faithful in stories.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/__fixtures__/pr-detail-data.ts`

- [ ] **Step 1: Read the AppSettings type to get default shape**

```bash
grep -n "interface AppSettings\|defaultSettings\|DEFAULT_SETTINGS" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/types/settings.ts \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/stores/settings-store.ts | head -10
```

Note the location of the production default-settings object. The fixture's `withPrDetail` decorator copies that pattern; if the production exports a `defaultSettings` const, import it. Otherwise the fixture builds a minimal `AppSettings` inline.

- [ ] **Step 2: Read the Phase 10 fixtures file as a reference**

```bash
sed -n '1,80p' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/settings/__fixtures__/settings-data.ts
```

Use this as the structural reference for the fixture file, decorator pattern, and re-export shape.

- [ ] **Step 3: Create the fixture file**

Write `src/BorgDock.Tauri/src/components/pr-detail/__fixtures__/pr-detail-data.ts`. The file is large; split the writes into logical sections.

First, the imports + types + makePr:

```ts
// src/components/pr-detail/__fixtures__/pr-detail-data.ts

import type { Decorator } from '@storybook/react-vite';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { usePrDetailJumpStore } from '@/stores/pr-detail-jump-store';
import type {
  AppSettings,
  CheckRun,
  PullRequest,
  PullRequestWithChecks,
} from '@/types';
import {
  getControl,
  type GithubResponses,
  type PrActionResponses,
} from '../../../../.storybook/mocks/control';

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

const BASE_PR: PullRequest = {
  number: 42,
  title: 'feat: add PR detail storybook coverage',
  headRef: 'storybook-phase11-pr-detail',
  headSha: 'abcdef0123456789abcdef0123456789abcdef01',
  baseRef: 'master',
  authorLogin: 'borght-dev',
  authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
  state: 'open',
  createdAt: '2026-05-01T12:00:00Z',
  updatedAt: '2026-05-07T08:00:00Z',
  isDraft: false,
  mergeable: true,
  htmlUrl: 'https://github.com/borght-dev/BorgDock/pull/42',
  body: 'Adds Storybook stories for the PR Detail window — see spec for details.',
  repoOwner: 'borght-dev',
  repoName: 'BorgDock',
  reviewStatus: 'pending',
  commentCount: 0,
  labels: [],
  additions: 240,
  deletions: 18,
  changedFiles: 11,
  commitCount: 5,
  requestedReviewers: [],
};

const BASE_CHECKS: CheckRun[] = [
  {
    id: 1001,
    name: 'CI / build',
    status: 'in_progress',
    htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/1001',
    checkSuiteId: 9000,
  },
  {
    id: 1002,
    name: 'CI / test',
    status: 'queued',
    htmlUrl: 'https://github.com/borght-dev/BorgDock/runs/1002',
    checkSuiteId: 9000,
  },
];

const BASE: PullRequestWithChecks = {
  pullRequest: BASE_PR,
  checks: BASE_CHECKS,
  overallStatus: 'yellow',
  failedCheckNames: [],
  pendingCheckNames: ['CI / build', 'CI / test'],
  passedCount: 0,
  skippedCount: 0,
};

export function makePr(
  overrides?: DeepPartial<PullRequestWithChecks>,
): PullRequestWithChecks {
  return deepMerge(BASE, overrides);
}
```

- [ ] **Step 4: Append the named PR presets**

Append to the same file:

```ts
// ── Named presets ─────────────────────────────────────────────

export const openPr: PullRequestWithChecks = makePr();

export const draftPr: PullRequestWithChecks = makePr({
  pullRequest: {
    isDraft: true,
    title: 'WIP: refactor diff renderer',
    reviewStatus: 'none',
  },
  overallStatus: 'gray',
  pendingCheckNames: [],
  checks: [],
});

const APPROVED_REVIEW_PR: PullRequestWithChecks = {
  pullRequest: {
    ...BASE_PR,
    reviewStatus: 'approved',
    commentCount: 4,
  },
  checks: [
    { id: 2001, name: 'CI / build', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9001 },
    { id: 2002, name: 'CI / test', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9001 },
    { id: 2003, name: 'CI / lint', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9001 },
  ],
  overallStatus: 'green',
  failedCheckNames: [],
  pendingCheckNames: [],
  passedCount: 3,
  skippedCount: 0,
};
export const approvedPr: PullRequestWithChecks = APPROVED_REVIEW_PR;

export const changesRequestedPr: PullRequestWithChecks = makePr({
  pullRequest: {
    reviewStatus: 'changesRequested',
    commentCount: 6,
  },
  overallStatus: 'yellow',
});

export const mergedPr: PullRequestWithChecks = makePr({
  pullRequest: {
    state: 'closed',
    mergedAt: '2026-05-06T18:30:00Z',
    closedAt: '2026-05-06T18:30:00Z',
    reviewStatus: 'approved',
  },
  overallStatus: 'green',
  passedCount: 3,
  pendingCheckNames: [],
  checks: APPROVED_REVIEW_PR.checks,
});

export const closedPr: PullRequestWithChecks = makePr({
  pullRequest: {
    state: 'closed',
    closedAt: '2026-05-06T16:00:00Z',
    reviewStatus: 'commented',
  },
  overallStatus: 'gray',
});

export const mergeConflictPr: PullRequestWithChecks = makePr({
  pullRequest: {
    mergeable: false,
    reviewStatus: 'approved',
  },
  overallStatus: 'green',
  checks: APPROVED_REVIEW_PR.checks,
  passedCount: 3,
  pendingCheckNames: [],
});

export const staleChecksPr: PullRequestWithChecks = makePr({
  pullRequest: {
    headSha: 'newsha0000000000000000000000000000000000',
  },
  // checks reference an older head_sha (BASE's checks have suiteId 9000 but here the
  // PR moved to a new sha — the panel renders a "stale" pill).
});

export const bigDiffPr: PullRequestWithChecks = makePr({
  pullRequest: {
    additions: 4200,
    deletions: 980,
    changedFiles: 73,
    commitCount: 22,
  },
});

export const commitsRichPr: PullRequestWithChecks = makePr({
  pullRequest: {
    commitCount: 12,
  },
});

export const richDiscussionPr: PullRequestWithChecks = makePr({
  pullRequest: {
    commentCount: 17,
    reviewStatus: 'commented',
  },
});
```

- [ ] **Step 5: Append the decorator + frame**

Append the decorator and `PanelFrame` to the file:

```ts
// ── Decorator + frame ─────────────────────────────────────────

export interface WithPrDetailOptions {
  settings?: Partial<AppSettings>;
  injectedPrParams?: { owner: string; repo: string; number: number } | null;
  invokeResponses?: Record<string, unknown>;
  githubResponses?: Partial<GithubResponses>;
  prActionResponses?: PrActionResponses;
}

// Snapshot the initial store state once at module-load. Each story's
// withPrDetail decorator restores this baseline so prior stories' setState
// calls don't leak. Reading useSettingsStore.getState() captures whatever
// initial shape the production store ships with; if that's undefined,
// fall back to an empty object cast as AppSettings (the section/tab
// stories will rarely depend on settings beyond `repos`).
const SETTINGS_BASELINE: AppSettings =
  (useSettingsStore.getState().settings as AppSettings | undefined) ??
  ({} as AppSettings);
const UI_BASELINE = useUiStore.getState();
const JUMP_BASELINE = usePrDetailJumpStore.getState();

export function withPrDetail(
  pr: PullRequestWithChecks | null,
  options: WithPrDetailOptions = {},
): Decorator {
  return (Story) => {
    const ctrl = getControl();
    Object.assign(ctrl.invokeResponses, options.invokeResponses ?? {});
    Object.assign(ctrl.githubResponses, options.githubResponses ?? {});
    Object.assign(ctrl.prActionResponses, options.prActionResponses ?? {});

    if (options.injectedPrParams === null) {
      delete (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__;
    } else {
      const params =
        options.injectedPrParams ??
        (pr
          ? { owner: pr.pullRequest.repoOwner, repo: pr.pullRequest.repoName, number: pr.pullRequest.number }
          : { owner: 'borght-dev', repo: 'BorgDock', number: 1 });
      (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__ = params;
    }

    // Restore the baseline snapshot, then layer story overrides on top.
    useSettingsStore.setState({
      settings: { ...SETTINGS_BASELINE, ...(options.settings ?? {}) } as AppSettings,
      hasLoaded: true,
    });
    useUiStore.setState(UI_BASELINE, true);
    usePrDetailJumpStore.setState(JUMP_BASELINE, true);

    return <Story />;
  };
}

export function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]">
      <div className="relative flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
```

(If the imports flagged at step 1 indicate `useUiStore.setState({})` or `usePrDetailJumpStore.setState({})` reject empty objects, replace them with the stores' actual default-state object, e.g., `{ activeTab: 'overview' }`. Read the store files first if TS errors appear.)

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors. If errors mention store shapes, read `src/stores/ui-store.ts` and `src/stores/pr-detail-jump-store.ts` and fix the `setState` calls.

- [ ] **Step 7: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/__fixtures__/
git commit -m "$(cat <<'EOF'
storybook phase 11: pr-detail fixtures

12 named PullRequestWithChecks presets (open, draft, approved, mergedPr,
closedPr, mergeConflict, staleChecks, bigDiff, commitsRich, richDiscussion,
plus changesRequested) backed by a deep-merge makePr() helper.

withPrDetail decorator seeds settings store, __BORGDOCK_PR_DETAIL__,
invokeResponses, githubResponses, and prActionResponses on every render.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PRDetailApp.stories.tsx (window-shell, 5 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/PRDetailApp.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/pr-detail/PRDetailApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrDetailApp } from './PRDetailApp';
import {
  openPr,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof PrDetailApp> = {
  title: 'PR Detail/PRDetailApp',
  component: PrDetailApp,
};
export default meta;
type Story = StoryObj<typeof PrDetailApp>;

const baseInvokes = {
  load_settings: { gitHub: { personalAccessToken: 'gh_dummy' } },
  cache_init: undefined,
  window_ready: undefined,
};

export const Default: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};

export const LoadingNetwork: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: () => new Promise(() => {}),
      },
    }),
  ],
};

export const MissingParams: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      injectedPrParams: null,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};

export const PrNotFound: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [],
      },
    }),
  ],
};

export const LoadSettingsRejects: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: {
        ...baseInvokes,
        load_settings: '__throw__',
      },
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};
```

- [ ] **Step 2: Verify Storybook builds (full build is expensive — defer to Task 17 if iteration speed matters)**

For fast iteration, verify just the type:

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/PRDetailApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: PRDetailApp window-shell stories (5)

Default, LoadingNetwork, MissingParams, PrNotFound, LoadSettingsRejects.
Exercises the load/error/preload-header axes of the window shell with the
new @/services/github/* mocks providing the canned data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: PRDetailPanel.stories.tsx (panel-level, 4 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.stories.tsx`

- [ ] **Step 1: Confirm the panel's prop signature**

```bash
grep -n "export function PrDetailPanel\|interface PrDetailPanelProps\|type PrDetailPanelProps" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.tsx | head
```

Note the prop name (`pr`) and any optional flags (`popOutWindow?`).

- [ ] **Step 2: Write the stories file**

```tsx
// src/components/pr-detail/PRDetailPanel.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrDetailPanel } from './PRDetailPanel';
import {
  closedPr,
  mergedPr,
  openPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof PrDetailPanel> = {
  title: 'PR Detail/PRDetailPanel',
  component: PrDetailPanel,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof PrDetailPanel>;

export const Default: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr, popOutWindow: true },
};

export const EmbeddedInSidebar: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr, popOutWindow: false },
};

export const Merged: Story = {
  decorators: [withPrDetail(mergedPr)],
  args: { pr: mergedPr, popOutWindow: true },
};

export const Closed: Story = {
  decorators: [withPrDetail(closedPr)],
  args: { pr: closedPr, popOutWindow: true },
};
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

If `popOutWindow` is named differently (e.g., `popOut`), match the production prop name.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/PRDetailPanel.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: PRDetailPanel stories (4)

Default, EmbeddedInSidebar, Merged, Closed. Exercises the panel chrome
(title bar, tab strip, action bar) across the popout/embedded variants
and the open/merged/closed body states.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: OverviewTab.stories.tsx (6 stories + 3 click-through play functions)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.stories.tsx`

- [ ] **Step 1: Confirm OverviewTab's prop signature**

```bash
grep -n "export function OverviewTab\|export const OverviewTab\|interface OverviewTabProps" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.tsx | head
```

Note the exact prop names.

- [ ] **Step 2: Write the stories file (no play functions yet)**

```tsx
// src/components/pr-detail/OverviewTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverviewTab } from './OverviewTab';
import {
  approvedPr,
  changesRequestedPr,
  draftPr,
  mergeConflictPr,
  openPr,
  PanelFrame,
  staleChecksPr,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof OverviewTab> = {
  title: 'PR Detail/OverviewTab',
  component: OverviewTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof OverviewTab>;

export const OpenWithChecksRunning: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr },
};

export const OpenAllGreenMergeable: Story = {
  decorators: [withPrDetail(approvedPr)],
  args: { pr: approvedPr },
};

export const ChangesRequested: Story = {
  decorators: [withPrDetail(changesRequestedPr)],
  args: { pr: changesRequestedPr },
};

export const MergeConflict: Story = {
  decorators: [withPrDetail(mergeConflictPr)],
  args: { pr: mergeConflictPr },
};

export const StaleChecks: Story = {
  decorators: [withPrDetail(staleChecksPr)],
  args: { pr: staleChecksPr },
};

export const Draft: Story = {
  decorators: [withPrDetail(draftPr)],
  args: { pr: draftPr },
};
```

If `OverviewTab`'s prop is named differently from `pr`, adjust the `args`.

- [ ] **Step 3: Add the 3 click-through play functions**

Append to the same file, replacing the existing `OpenAllGreenMergeable`, `Draft`, and `OpenWithChecksRunning` exports with these versions that include `play`:

```tsx
import { expect } from 'storybook/test';
import { getControl } from '../../../.storybook/mocks/control';

function findButton(label: RegExp): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) =>
    label.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
}

async function waitFor<T>(get: () => T | undefined, timeoutMs = 1500): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = get();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor: timed out');
}
```

(Add the imports/helpers near the top of the file, just below the existing imports.)

Then update `OpenAllGreenMergeable`:

```tsx
export const OpenAllGreenMergeable: Story = {
  decorators: [withPrDetail(approvedPr)],
  args: { pr: approvedPr },
  play: async () => {
    const btn = await waitFor(() => findButton(/^merge$/i));
    btn.click();
    await waitFor(() =>
      getControl().invocations.find((i) => i.command === 'prAction.mergePr'),
    );
    expect(
      getControl().invocations.some((i) => i.command === 'prAction.mergePr'),
    ).toBe(true);
  },
};
```

Update `Draft`:

```tsx
export const Draft: Story = {
  decorators: [withPrDetail(draftPr)],
  args: { pr: draftPr },
  play: async () => {
    const btn = await waitFor(() => findButton(/mark.*ready/i));
    btn.click();
    await waitFor(() =>
      getControl().invocations.find((i) => i.command === 'prAction.toggleDraftPr'),
    );
    expect(
      getControl().invocations.some((i) => i.command === 'prAction.toggleDraftPr'),
    ).toBe(true);
  },
};
```

Update `OpenWithChecksRunning` to also include a click-through (Close + confirm):

```tsx
export const OpenWithChecksRunning: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr },
  play: async () => {
    // Open the close-confirmation dialog
    const closeBtn = await waitFor(() => findButton(/^close$/i));
    closeBtn.click();
    // Then click confirm inside the ConfirmDialog
    const confirmBtn = await waitFor(() =>
      Array.from(document.querySelectorAll('button')).find(
        (b) => /confirm|close/i.test(b.textContent ?? '') && b !== closeBtn,
      ) as HTMLButtonElement | undefined,
    );
    confirmBtn.click();
    await waitFor(() =>
      getControl().invocations.find((i) => i.command === 'prAction.closePr'),
    );
    expect(
      getControl().invocations.some((i) => i.command === 'prAction.closePr'),
    ).toBe(true);
  },
};
```

(If the production "Close" button has different label text or the confirm dialog's confirm button is found by a different pattern, update the regex matchers. The Phase 10 stories use the same `Array.from(document.querySelectorAll('button')).find(...)` pattern so the lookup style is consistent.)

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors. If `storybook/test` doesn't resolve, replace `expect` with native `if (!cond) throw new Error(...)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/OverviewTab.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: OverviewTab stories (6)

Six axes covering the Overview-tab body content: OpenWithChecksRunning,
OpenAllGreenMergeable, ChangesRequested, MergeConflict, StaleChecks, Draft.

Three play functions click through Merge / Mark-ready-for-review / Close
(via confirm) and assert the underlying prAction.{mergePr,toggleDraftPr,
closePr} call landed in the mocked invocations log.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: FilesTab.stories.tsx (6 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/FilesTab.stories.tsx`

- [ ] **Step 1: Confirm FilesTab's prop signature and the file-fetch path**

```bash
grep -n "export function FilesTab\|export const FilesTab\|interface FilesTabProps\|invoke\|fetch\|getPRFiles\|listFiles" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/FilesTab.tsx | head -20
```

If `FilesTab` calls `getPRFiles` from `@/services/github/pulls`, extend `services-github-pulls.ts` (Task 2) to also export `getPRFiles` reading from `getControl().githubResponses.getPRFiles` — defer that change to this task only if needed. Document the decision inline in this file's commit message.

- [ ] **Step 2: Write the stories file**

Use the per-tab pattern from Task 7 — `<PanelFrame>` decorator + `withPrDetail(fixture)` + `args: { pr: fixture }` per story.

```tsx
// src/components/pr-detail/FilesTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilesTab } from './FilesTab';
import {
  bigDiffPr,
  makePr,
  openPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof FilesTab> = {
  title: 'PR Detail/FilesTab',
  component: FilesTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof FilesTab>;

const smallDiffFiles = [
  {
    filename: 'src/util.ts',
    status: 'modified',
    additions: 12,
    deletions: 3,
    patch:
      '@@ -10,7 +10,16 @@\n const a = 1;\n-const b = 2;\n+const b = 22;\n+const c = 3;',
  },
];

const bigDiffFiles = Array.from({ length: 50 }).map((_, i) => ({
  filename: `src/big/${String(i).padStart(2, '0')}.ts`,
  status: 'modified',
  additions: Math.floor(Math.random() * 80),
  deletions: Math.floor(Math.random() * 40),
  patch: '@@ -1 +1 @@\n-old\n+new',
}));

const binaryFiles = [
  { filename: 'docs/screenshot.png', status: 'modified', additions: 0, deletions: 0 },
];

const renamedFiles = [
  {
    filename: 'src/renamed.ts',
    previousFilename: 'src/old-name.ts',
    status: 'renamed',
    additions: 0,
    deletions: 0,
  },
];

const deletedFiles = [
  { filename: 'src/legacy.ts', status: 'removed', additions: 0, deletions: 84 },
];

export const SmallDiff: Story = {
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: smallDiffFiles } as never,
    }),
  ],
  args: { pr: openPr },
};

export const BigDiffOverflow: Story = {
  decorators: [
    withPrDetail(bigDiffPr, {
      githubResponses: { getPRFiles: bigDiffFiles } as never,
    }),
  ],
  args: { pr: bigDiffPr },
};

export const BinaryFile: Story = {
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: binaryFiles } as never,
    }),
  ],
  args: { pr: openPr },
};

export const Renamed: Story = {
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: renamedFiles } as never,
    }),
  ],
  args: { pr: openPr },
};

export const Deleted: Story = {
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: deletedFiles } as never,
    }),
  ],
  args: { pr: openPr },
};

export const WithInlineThread: Story = {
  decorators: [
    withPrDetail(makePr({ pullRequest: { commentCount: 3 } }), {
      githubResponses: { getPRFiles: smallDiffFiles } as never,
    }),
  ],
  args: { pr: makePr({ pullRequest: { commentCount: 3 } }) },
};
```

If FilesTab fetches files via a different mechanism (e.g., a dedicated `getPRFilesWithComments` function or via `usePrFilesStore`), update the seeding accordingly. The `as never` casts above are placeholders — replace with the proper field on `GithubResponses` once Task 2's pulls mock is extended (or use `invokeResponses` if FilesTab fetches via `invoke`).

- [ ] **Step 3: If FilesTab uses an unmocked surface, extend the mock**

If the file-fetch surface in step 1 is not yet covered, extend `mocks/services-github-pulls.ts` with the new export (e.g., `getPRFiles`). Add the corresponding field to `GithubResponses` in `control.ts`. Both edits must land in this commit.

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/FilesTab.stories.tsx \
        src/BorgDock.Tauri/.storybook/mocks/services-github-pulls.ts \
        src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook phase 11: FilesTab stories (6)

SmallDiff, BigDiffOverflow, BinaryFile, Renamed, Deleted, WithInlineThread.
Extends services-github-pulls.ts mock with getPRFiles support if needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(If only the stories file changed, drop the other paths from `git add`.)

---

## Task 9: ChecksTab.stories.tsx (5 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/ChecksTab.stories.tsx`

- [ ] **Step 1: Write the stories file**

```tsx
// src/components/pr-detail/ChecksTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChecksTab } from './ChecksTab';
import type { CheckRun } from '@/types';
import {
  makePr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof ChecksTab> = {
  title: 'PR Detail/ChecksTab',
  component: ChecksTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof ChecksTab>;

const allPending: CheckRun[] = ['build', 'test', 'lint'].map((name, i) => ({
  id: 3000 + i,
  name: `CI / ${name}`,
  status: i === 2 ? 'queued' : 'in_progress',
  htmlUrl: '#',
  checkSuiteId: 9100,
}));

const allGreen: CheckRun[] = ['build', 'test', 'lint'].map((name, i) => ({
  id: 4000 + i,
  name: `CI / ${name}`,
  status: 'completed',
  conclusion: 'success',
  htmlUrl: '#',
  checkSuiteId: 9101,
}));

const mixed: CheckRun[] = [
  { id: 5001, name: 'CI / build', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5002, name: 'CI / test', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5003, name: 'CI / lint', status: 'completed', conclusion: 'failure', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5004, name: 'CI / typecheck', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5005, name: 'CI / e2e', status: 'completed', conclusion: 'failure', htmlUrl: '#', checkSuiteId: 9102 },
  { id: 5006, name: 'CI / docs', status: 'completed', conclusion: 'success', htmlUrl: '#', checkSuiteId: 9102 },
];

const allFailed: CheckRun[] = ['build', 'test', 'lint', 'typecheck', 'e2e', 'docs'].map(
  (name, i) => ({
    id: 6000 + i,
    name: `CI / ${name}`,
    status: 'completed',
    conclusion: 'failure',
    htmlUrl: '#',
    checkSuiteId: 9103,
  }),
);

export const AllPending: Story = {
  decorators: [withPrDetail(makePr({ checks: allPending, overallStatus: 'yellow', pendingCheckNames: allPending.map((c) => c.name), passedCount: 0 }))],
  args: { pr: makePr({ checks: allPending, overallStatus: 'yellow', pendingCheckNames: allPending.map((c) => c.name), passedCount: 0 }) },
};

export const AllGreen: Story = {
  decorators: [withPrDetail(makePr({ checks: allGreen, overallStatus: 'green', passedCount: 3, pendingCheckNames: [] }))],
  args: { pr: makePr({ checks: allGreen, overallStatus: 'green', passedCount: 3, pendingCheckNames: [] }) },
};

export const MixedSuccessFailure: Story = {
  decorators: [withPrDetail(makePr({ checks: mixed, overallStatus: 'red', passedCount: 4, failedCheckNames: ['CI / lint', 'CI / e2e'], pendingCheckNames: [] }))],
  args: { pr: makePr({ checks: mixed, overallStatus: 'red', passedCount: 4, failedCheckNames: ['CI / lint', 'CI / e2e'], pendingCheckNames: [] }) },
};

export const AllFailedExpandable: Story = {
  decorators: [withPrDetail(makePr({ checks: allFailed, overallStatus: 'red', passedCount: 0, failedCheckNames: allFailed.map((c) => c.name), pendingCheckNames: [] }))],
  args: { pr: makePr({ checks: allFailed, overallStatus: 'red', passedCount: 0, failedCheckNames: allFailed.map((c) => c.name), pendingCheckNames: [] }) },
};

export const NoChecks: Story = {
  decorators: [withPrDetail(makePr({ checks: [], overallStatus: 'gray', passedCount: 0, pendingCheckNames: [] }))],
  args: { pr: makePr({ checks: [], overallStatus: 'gray', passedCount: 0, pendingCheckNames: [] }) },
};
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/ChecksTab.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: ChecksTab stories (5)

AllPending, AllGreen, MixedSuccessFailure, AllFailedExpandable, NoChecks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: CommitsTab.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/CommitsTab.stories.tsx`

- [ ] **Step 1: Confirm CommitsTab's data source**

```bash
grep -n "getPRCommits\|invoke\|fetch\|services/github" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/CommitsTab.tsx | head
```

If `CommitsTab` calls `getPRCommits` from `services/github/pulls`, extend the mock (see Task 8 step 3 pattern).

- [ ] **Step 2: Write the stories file**

```tsx
// src/components/pr-detail/CommitsTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommitsTab } from './CommitsTab';
import type { PullRequestCommit } from '@/types';
import {
  commitsRichPr,
  makePr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof CommitsTab> = {
  title: 'PR Detail/CommitsTab',
  component: CommitsTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof CommitsTab>;

const oneCommit: PullRequestCommit[] = [
  {
    sha: '0000000000000000000000000000000000000001',
    message: 'feat: initial commit',
    authorLogin: 'borght-dev',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
    date: '2026-05-01T12:00:00Z',
  },
];

const manyCommits: PullRequestCommit[] = Array.from({ length: 12 }).map((_, i) => ({
  sha: `${String(i).padStart(40, '0')}`,
  message: i === 0 ? 'feat: initial commit' : `commit ${i}`,
  authorLogin: i % 3 === 0 ? 'koen' : 'borght-dev',
  authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
  date: `2026-05-${String(((i % 6) + 1)).padStart(2, '0')}T12:00:00Z`,
}));

// "MixedSignedUnsigned" requires the production CommitsTab to render a
// "verified" badge based on either a CheckRun-style signature field or
// a per-commit `verified` bool. Read CommitsTab.tsx; if no such field
// exists, drop this story or use the closest analogue.
const mixedSigned: PullRequestCommit[] = manyCommits.slice(0, 6);

export const SingleCommit: Story = {
  decorators: [
    withPrDetail(makePr({ pullRequest: { commitCount: 1 } }), {
      githubResponses: { getPRCommits: oneCommit } as never,
    }),
  ],
  args: { pr: makePr({ pullRequest: { commitCount: 1 } }) },
};

export const ManyCommits: Story = {
  decorators: [
    withPrDetail(commitsRichPr, {
      githubResponses: { getPRCommits: manyCommits } as never,
    }),
  ],
  args: { pr: commitsRichPr },
};

export const MixedSignedUnsigned: Story = {
  decorators: [
    withPrDetail(commitsRichPr, {
      githubResponses: { getPRCommits: mixedSigned } as never,
    }),
  ],
  args: { pr: commitsRichPr },
};
```

If CommitsTab does not have a per-commit `verified` axis, replace `MixedSignedUnsigned` with a meaningful alternative (e.g., `LongCommitMessages`) — base the choice on what the tab actually renders.

- [ ] **Step 3: TypeScript check + commit**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/CommitsTab.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: CommitsTab stories (3)

SingleCommit, ManyCommits, MixedSignedUnsigned (or analogous axis).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: DiscussionTab.stories.tsx (5 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/DiscussionTab.stories.tsx`

- [ ] **Step 1: Confirm DiscussionTab's data shape**

```bash
sed -n '1,40p' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/DiscussionTab.tsx
grep -n "buildDiscussionItems\|DiscussionItem" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/discussion/buildDiscussionItems.ts | head
```

The tab probably consumes `DiscussionItem[]` built from comments + reviews. If the production tab takes the items as a prop, the stories pass synthetic items directly. If it builds them inside, the stories seed the source comments via the appropriate mock surface (probably `services-github-pulls.ts` or a discussion-specific mock).

- [ ] **Step 2: Write the stories file**

```tsx
// src/components/pr-detail/DiscussionTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiscussionTab } from './DiscussionTab';
import {
  PanelFrame,
  richDiscussionPr,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof DiscussionTab> = {
  title: 'PR Detail/DiscussionTab',
  component: DiscussionTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof DiscussionTab>;

// The five stories vary the source comments + reviews data; DiscussionTab
// builds DiscussionItem[] internally via buildDiscussionItems(). The seed
// surface is whichever GH-services function the production tab calls
// (likely getPRComments / getPRReviewComments — confirm in step 1, then
// add to GithubResponses + the pulls mock in this commit if missing).
//
// Each story below uses synthetic comment shapes that match the production
// type. Where the type's exact field names aren't yet known, the unknown
// fields are filled with plausible defaults; adjust during build if TS or
// runtime errors surface.

const generalComment = (id: number, body: string, resolved = false) => ({
  id,
  body,
  user: { login: id % 2 === 0 ? 'koen' : 'reviewer-bot', avatar_url: '#' },
  createdAt: '2026-05-05T10:00:00Z',
  resolved,
});

const codeThread = (id: number, path: string, line: number, body: string, resolved = false) => ({
  id,
  path,
  line,
  body,
  user: { login: 'reviewer-bot', avatar_url: '#' },
  createdAt: '2026-05-05T11:00:00Z',
  resolved,
});

export const Empty: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getPRComments: [],
        getPRReviewComments: [],
      } as never,
    }),
  ],
  args: { pr: richDiscussionPr },
};

export const MixedThreadsResolvedAndOpen: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getPRComments: [generalComment(1, 'Overall LGTM'), generalComment(2, 'One small ask', true)],
        getPRReviewComments: [
          codeThread(10, 'src/util.ts', 12, 'Why not const here?'),
          codeThread(11, 'src/util.ts', 30, 'Naming nit.', true),
        ],
      } as never,
    }),
  ],
  args: { pr: richDiscussionPr },
};

export const CodeThreadOnly: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getPRComments: [],
        getPRReviewComments: [
          codeThread(20, 'src/a.ts', 5, 'Comment A'),
          codeThread(21, 'src/b.ts', 99, 'Comment B'),
        ],
      } as never,
    }),
  ],
  args: { pr: richDiscussionPr },
};

export const GeneralCommentsOnly: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getPRComments: [generalComment(30, 'Thoughts?'), generalComment(31, 'Another thought.')],
        getPRReviewComments: [],
      } as never,
    }),
  ],
  args: { pr: richDiscussionPr },
};

export const ComposerActive: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: { getPRComments: [], getPRReviewComments: [] } as never,
    }),
  ],
  args: { pr: richDiscussionPr },
  play: async () => {
    const composer = document.querySelector('textarea, [role="textbox"]');
    (composer as HTMLElement | null)?.focus();
  },
};
```

The synthetic comment shapes above use plausible field names (`id`, `body`, `user`, `createdAt`, `resolved`, plus `path`/`line` for code threads). Step 1's `buildDiscussionItems.ts` read confirms the actual production shape — adjust the synthetic objects to match before the commit. If the production tab's data fetch route differs (e.g., it goes through `invoke('cache_*')` rather than a GH service function), seed via `invokeResponses` instead and extend the mock there.

- [ ] **Step 3: TypeScript check + commit**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/DiscussionTab.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: DiscussionTab stories (5)

Empty, MixedThreadsResolvedAndOpen, CodeThreadOnly, GeneralCommentsOnly,
ComposerActive (focus-via-play).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: CheckoutPanel.stories.tsx (7 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/CheckoutPanel.stories.tsx`

- [ ] **Step 1: Confirm CheckoutPanel's prop signature and invokes**

```bash
grep -nE "interface CheckoutPanelProps|^export function CheckoutPanel|invoke<" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/CheckoutPanel.tsx | head
```

Note the props (likely `pr`, `repoBasePath`, `onClose`, etc.) and the exact invoke command names.

- [ ] **Step 2: Write the stories file**

```tsx
// src/components/pr-detail/CheckoutPanel.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckoutPanel } from './CheckoutPanel';
import {
  approvedPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof CheckoutPanel> = {
  title: 'PR Detail/CheckoutPanel',
  component: CheckoutPanel,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof CheckoutPanel>;

const noWorktrees = {
  list_worktrees_bare: [],
  list_worktrees: [],
};

const oneRepoNoWorktrees = noWorktrees;

const existingWorktree = {
  list_worktrees_bare: [{ path: '/work/repo.git', branch: null }],
  list_worktrees: [
    { path: '/work/wt/storybook-phase11-pr-detail', branch: 'storybook-phase11-pr-detail' },
  ],
};

const multipleWorktrees = {
  list_worktrees_bare: [{ path: '/work/repo.git', branch: null }],
  list_worktrees: [
    { path: '/work/wt/feature-a', branch: 'feature-a' },
    { path: '/work/wt/feature-b', branch: 'feature-b' },
    { path: '/work/wt/feature-c', branch: 'feature-c' },
  ],
};

const baseProps = {
  pr: approvedPr,
  isOpen: true,
  onClose: () => {},
};

export const NoWorktrees: Story = {
  decorators: [withPrDetail(approvedPr, { invokeResponses: noWorktrees })],
  args: baseProps,
};

export const OneRepoNoWorktrees: Story = {
  decorators: [withPrDetail(approvedPr, { invokeResponses: oneRepoNoWorktrees })],
  args: baseProps,
};

export const ExistingWorktreeForBranch: Story = {
  decorators: [withPrDetail(approvedPr, { invokeResponses: existingWorktree })],
  args: baseProps,
};

export const MultipleWorktreesPickByPath: Story = {
  decorators: [withPrDetail(approvedPr, { invokeResponses: multipleWorktrees })],
  args: baseProps,
};

export const CheckoutSuccess: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        ...noWorktrees,
        checkout_pr: () => ({ worktreePath: '/work/wt/new', terminalLaunched: true }),
      },
    }),
  ],
  args: baseProps,
};

export const CheckoutFailureGitConflict: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        ...noWorktrees,
        checkout_pr: '__throw__',
      },
    }),
  ],
  args: baseProps,
};

export const ListWorktreesError: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: '__throw__',
        list_worktrees: '__throw__',
      },
    }),
  ],
  args: baseProps,
};
```

If `CheckoutPanel`'s props differ (e.g., requires `repoBasePath` directly), update `baseProps`. The exact invoke names (`list_worktrees_bare`, `list_worktrees`, `checkout_pr`) are confirmed by step 1; if they differ, update the keys.

- [ ] **Step 3: TypeScript check + commit**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/CheckoutPanel.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: CheckoutPanel stories (7)

NoWorktrees, OneRepoNoWorktrees, ExistingWorktreeForBranch,
MultipleWorktreesPickByPath, CheckoutSuccess, CheckoutFailureGitConflict,
ListWorktreesError.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: MergeReadinessChecklist.stories.tsx (3 stories)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/MergeReadinessChecklist.stories.tsx`

- [ ] **Step 1: Confirm prop signature**

```bash
grep -n "export function MergeReadinessChecklist\|interface MergeReadinessChecklistProps" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/MergeReadinessChecklist.tsx | head
```

- [ ] **Step 2: Write the stories file**

```tsx
// src/components/pr-detail/MergeReadinessChecklist.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { MergeReadinessChecklist } from './MergeReadinessChecklist';
import {
  approvedPr,
  makePr,
  mergeConflictPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof MergeReadinessChecklist> = {
  title: 'PR Detail/MergeReadinessChecklist',
  component: MergeReadinessChecklist,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof MergeReadinessChecklist>;

export const AllChecksGreen: Story = {
  decorators: [withPrDetail(approvedPr)],
  args: { pr: approvedPr },
};

export const BlockedByFailingCheck: Story = {
  decorators: [
    withPrDetail(
      makePr({
        overallStatus: 'red',
        failedCheckNames: ['CI / lint'],
        passedCount: 2,
        pendingCheckNames: [],
        pullRequest: { reviewStatus: 'approved' },
      }),
    ),
  ],
  args: {
    pr: makePr({
      overallStatus: 'red',
      failedCheckNames: ['CI / lint'],
      passedCount: 2,
      pendingCheckNames: [],
      pullRequest: { reviewStatus: 'approved' },
    }),
  },
};

export const BlockedByMergeConflict: Story = {
  decorators: [withPrDetail(mergeConflictPr)],
  args: { pr: mergeConflictPr },
};
```

- [ ] **Step 3: TypeScript check + commit**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/MergeReadinessChecklist.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: MergeReadinessChecklist stories (3)

AllChecksGreen, BlockedByFailingCheck, BlockedByMergeConflict.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: ReviewComposer.stories.tsx (4 stories + 2 onSubmit-spy click-throughs)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/pr-detail/ReviewComposer.stories.tsx`

- [ ] **Step 1: Confirm ReviewComposer's prop signature**

```bash
sed -n '1,80p' /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/ReviewComposer.tsx | grep -n "interface\|export\|onSubmit"
```

Note the prop names (`onSubmit`, `defaultDecision`, `mode`, `body`, etc.).

- [ ] **Step 2: Write the stories file**

```tsx
// src/components/pr-detail/ReviewComposer.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ReviewComposer } from './ReviewComposer';

const meta: Meta<typeof ReviewComposer> = {
  title: 'PR Detail/ReviewComposer',
  component: ReviewComposer,
};
export default meta;
type Story = StoryObj<typeof ReviewComposer>;

function ComposerHarness({
  initialBody = '',
  initialMode = 'review' as const,
  onSubmit,
}: {
  initialBody?: string;
  initialMode?: 'comment' | 'review';
  onSubmit: (payload: unknown) => void;
}) {
  const [body, setBody] = useState(initialBody);
  return (
    <div style={{ padding: 16 }}>
      <ReviewComposer
        mode={initialMode}
        body={body}
        onChangeBody={setBody}
        onSubmit={onSubmit as never}
      />
    </div>
  );
}

export const Empty: Story = {
  render: () => <ComposerHarness onSubmit={fn()} />,
};

export const WithComment: Story = {
  render: () => <ComposerHarness initialBody="Looks good — small nit on naming." onSubmit={fn()} />,
};

export const Submitting: Story = {
  render: () => <ComposerHarness initialBody="..." onSubmit={() => new Promise(() => {})} />,
};

export const SubmitFailure: Story = {
  render: () => (
    <ComposerHarness
      initialBody="..."
      onSubmit={() => {
        throw new Error('mock submit failed');
      }}
    />
  ),
};

// Click-through play functions on WithComment for approve / comment.
// Both rely on document.querySelector('button[...]') — adjust selectors
// once ReviewComposer's button labels are confirmed.
export const ApproveClickThrough: Story = {
  render: () => {
    const spy = fn();
    return <ComposerHarness initialBody="LGTM" onSubmit={spy} />;
  },
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll('button');
    const approveBtn = Array.from(buttons).find((b) => /approve/i.test(b.textContent ?? ''));
    approveBtn?.click();
    const submitBtn = Array.from(buttons).find((b) => /submit/i.test(b.textContent ?? ''));
    submitBtn?.click();
  },
};

export const CommentClickThrough: Story = {
  render: () => {
    const spy = fn();
    return <ComposerHarness initialMode="comment" initialBody="Quick note" onSubmit={spy} />;
  },
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll('button');
    const submitBtn = Array.from(buttons).find((b) => /submit/i.test(b.textContent ?? ''));
    submitBtn?.click();
  },
};
```

If `ReviewComposer` doesn't take `onChangeBody` (production may use uncontrolled input), simplify the harness to render `<ReviewComposer mode={...} initialBody={...} onSubmit={spy} />` per the real prop API. Read step 1's output before writing.

- [ ] **Step 3: TypeScript check + commit**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npx tsc --noEmit 2>&1 | tail -10
cd /Users/koenvdb/projects/BorgDock
git add src/BorgDock.Tauri/src/components/pr-detail/ReviewComposer.stories.tsx
git commit -m "$(cat <<'EOF'
storybook phase 11: ReviewComposer stories (4 + 2 click-through)

Empty, WithComment, Submitting, SubmitFailure, plus ApproveClickThrough
and CommentClickThrough that exercise the onSubmit prop callback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Roadmap edit

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Move PR Detail row from Pending → Done**

In `docs/superpowers/specs/storybook-roadmap.md`, find the Pending table and move the `Pr Detail` row into the Done table at row 11. Replace the date placeholder columns:

Done table — append a new row after the existing row 10 (Settings):

```markdown
| 11 | PR Detail | `pr-detail-main.tsx` → `components/pr-detail/PRDetailApp.tsx` | `2026-05-07-storybook-phase11-pr-detail-design.md` | `2026-05-07-storybook-phase11-pr-detail.md` | _(filled in after PR opens)_ |
```

In the Pending table, delete the `Pr Detail` row. Only `Main / Sidebar` should remain pending.

- [ ] **Step 2: Update the section heading and prose**

Find the line `Twelve top-level windows live in src/BorgDock.Tauri/src/. Ten done, two to go.` and update to:

```markdown
Twelve top-level windows live in `src/BorgDock.Tauri/src/`. Eleven done, one to
go. Order below is arbitrary — pick whichever next phase makes sense at the
time.
```

- [ ] **Step 3: Add the alias inventory entries**

In the "Mock layer extensions" section, find the bullet list of aliases (around line 110–130) and add:

```markdown
- `@/services/github/pulls` → `mocks/services-github-pulls.ts`
- `@/services/github/checks` → `mocks/services-github-checks.ts`
- `@/services/github/auth` → `mocks/services-github-auth.ts`
- `@/services/pr-actions` → `mocks/services-pr-actions.ts`
```

(Insert in the same position relative to the existing `@/services/ado/workitems` line — keep the cluster of `@/services/*` aliases together.)

- [ ] **Step 4: Add the Phase 11 mock-layer extensions callout**

After the existing `> **Phase 10 mock-layer extensions:** …` block, append:

```markdown
> **Phase 11 mock-layer extensions:** four new string aliases —
> `@/services/github/pulls`, `@/services/github/checks`, and
> `@/services/github/auth` (mocks for the GitHub HTTP services that
> `PrDetailApp` calls during hydrate), plus `@/services/pr-actions`
> (intercepts the seven mutation functions `mergePr`, `bypassMergePr`,
> `closePr`, `toggleDraftPr`, `rerunChecks`, `checkoutPrBranch`,
> `openPrInBrowser`). The action mock intercepts the network-mutation
> layer rather than the `usePrActions` hook, so the hook's confirm-dialog
> state, status text, and `isReady` calculation remain faithful to
> production. Two new fields on `getControl()`: `githubResponses`
> (per-call canned values for the GH service mocks) and `prActionResponses`
> (per-action `'__throw__'` / `'__fail__'` / function override map keyed
> by the action's function name).
```

- [ ] **Step 5: Commit**

```bash
cd /Users/koenvdb/projects/BorgDock
git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark PR Detail done (phase 11 = row 11)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Build storybook + fix any breakage

**Files:** none (verification + reactive fixes).

- [ ] **Step 1: Build storybook**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npm run build-storybook 2>&1 | tail -50
```

`timeout: 600000`. Expected: build succeeds, `storybook-static/` directory exists.

- [ ] **Step 2: If the build fails, identify the cause**

Common failure modes:
- Missing import in a stories file → fix the import.
- Type mismatch in fixture (deep-merge typing failed) → cast `(over as never)` or adjust the type.
- A stories file references a prop/component that doesn't exist with that name → update the stories file to match the production export.
- A mock missing an export that the production code imports → add the missing export to the appropriate mock under `.storybook/mocks/`.

Make the fix in the same task, run the build again, and commit the fix:

```bash
cd /Users/koenvdb/projects/BorgDock
git add <fixed-file>
git commit -m "storybook phase 11: fix build (<short reason>)"
```

- [ ] **Step 3: Confirm build succeeds**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
ls storybook-static/index.html >/dev/null && echo "ok"
```

Expected: `ok`.

---

## Task 17: Vitest + byte-identical assertion + final verification

**Files:** none (verification only).

- [ ] **Step 1: Run vitest**

```bash
cd /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri
npm run test -- --run --reporter=basic 2>&1 | tail -10
```

`timeout: 600000`. Expected: same test count as Task 0's baseline. If any test fails because a stories file's import surfaced an issue in production code, that's a regression — fix it before proceeding.

- [ ] **Step 2: Byte-identical production diff**

```bash
cd /Users/koenvdb/projects/BorgDock
git diff origin/master...storybook-phase11-pr-detail -- \
  src/BorgDock.Tauri/src/components/pr-detail \
  src/BorgDock.Tauri/src/pr-detail-main.tsx \
  src/BorgDock.Tauri/src/services/github \
  src/BorgDock.Tauri/src/services/cache.ts \
  src/BorgDock.Tauri/src/stores \
  ':(exclude)src/BorgDock.Tauri/src/components/pr-detail/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/pr-detail/*.stories.tsx'
```

Expected: empty output. If anything appears, revert that change — the only allowed paths are fixtures + stories.

- [ ] **Step 3: pr-actions drift check**

```bash
grep -E "^export (async function)" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/services/pr-actions.ts | sort
grep -E "^export (async function)" \
  /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/.storybook/mocks/services-pr-actions.ts | sort
```

Expected: the two outputs list the same set of function names. If production has more, add them to the mock and commit.

- [ ] **Step 4: Verify story count via Storybook stories index**

```bash
ls /Users/koenvdb/projects/BorgDock/src/BorgDock.Tauri/src/components/pr-detail/*.stories.tsx | wc -l
```

Expected: 10 (PRDetailApp, PRDetailPanel, OverviewTab, FilesTab, ChecksTab, CommitsTab, DiscussionTab, CheckoutPanel, MergeReadinessChecklist, ReviewComposer).

- [ ] **Step 5: Commit checkpoint summary if any verification fixes landed**

If steps 1–4 produced fixes, commit them. Otherwise, skip.

```bash
cd /Users/koenvdb/projects/BorgDock
git status
```

Expected: clean working tree.

- [ ] **Step 6: Push the branch (do NOT open a PR yet — user controls PR creation)**

```bash
cd /Users/koenvdb/projects/BorgDock
git log --oneline origin/master..HEAD
```

Expected: ~17 commits — spec, spec-correction, control surface, GH mocks, pr-actions mock, fixtures, 10 stories files, roadmap, plus any verification fixes. Do NOT push or open a PR; the user runs `gh pr create` per the personal-account protocol in `~/.claude/CLAUDE.md`.

---

## Self-review checklist (run before reporting plan complete)

- [ ] Every task has exact file paths.
- [ ] Every code-writing step has the actual code (no `// implementation goes here` or "similar to Task N").
- [ ] Each tab task acknowledges that `services/github/pulls` may need extending (Task 8/10/11 step 1).
- [ ] Roadmap edit Task 15 covers the three roadmap mutations (row added, count updated, mock-layer note + alias inventory).
- [ ] Task 17 covers the byte-identical assertion verbatim from the spec.
- [ ] Every commit message is concrete (no `<short reason>` placeholder except for the reactive Task 16 fix).
- [ ] No `TBD`, `TODO`, `implement later`, or `fill in details` strings.
