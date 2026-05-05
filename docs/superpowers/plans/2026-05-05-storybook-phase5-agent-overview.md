# Storybook Phase 5 — AgentOverviewApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 29 exhaustive Storybook stories for `AgentOverviewApp.tsx` and extend the existing Tauri mock layer with one new alias surface (`@tauri-apps/api/webviewWindow`), all without changing a byte of production code.

**Architecture:** Add one mock module under `.storybook/mocks/` (api/webviewWindow) and one Vite alias entry in `.storybook/main.ts`. The control singleton (`window.__borgdock_storybook_tauri`) is unchanged — agent-overview drives state entirely through the existing `invokeResponses` and `emit()` channels. Stories drive state via `parameters.agentOverview.*` consumed by an `AgentOverviewHarness` wrapper.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8 (already installed in Phase 1).

**Spec:** `docs/superpowers/specs/2026-05-05-storybook-phase5-agent-overview-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to `src/BorgDock.Tauri/` unless explicitly absolute.** The branch `storybook-phase5-agent-overview` is already created and tracks `origin/master`.

## Phase A — Mock layer extensions

### Task A1: Mock `@tauri-apps/api/webviewWindow`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-webviewWindow.ts`

- [ ] **Step 1: Write the mock**

```ts
// .storybook/mocks/tauri-api-webviewWindow.ts
//
// Drop-in replacement for @tauri-apps/api/webviewWindow. Only the surface
// AgentOverviewApp uses is implemented: getCurrentWebviewWindow() with
// minimize / toggleMaximize / close.
//
// close() is a no-op — without this, clicking the title-bar X would
// unmount the Storybook iframe.

import { getControl } from './control';

interface MockWebviewWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

export function getCurrentWebviewWindow(): MockWebviewWindow {
  const ctrl = getControl();
  return {
    async minimize() {
      ctrl.invocations.push({ command: 'webviewWindow.minimize' });
    },
    async toggleMaximize() {
      ctrl.invocations.push({ command: 'webviewWindow.toggleMaximize' });
    },
    async close() {
      ctrl.invocations.push({ command: 'webviewWindow.close' });
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview && git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-webviewWindow.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/api/webviewWindow getCurrentWebviewWindow

minimize / toggleMaximize / close are pure log-only no-ops. close() must
stay a no-op so the title-bar X click in AgentOverviewApp's Titlebar
doesn't unmount the Storybook iframe.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: Add Vite alias to Storybook config

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/main.ts`

- [ ] **Step 1: Add the alias entry**

Open `.storybook/main.ts`. Find the alias block; insert one new line directly after `'@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),` so the alphabetical grouping inside `@tauri-apps/api/*` stays sane. The new line is:

```ts
      '@tauri-apps/api/webviewWindow': resolve(here, 'mocks/tauri-api-webviewWindow.ts'),
```

After the edit the alias block reads (in order):

```ts
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
      '@tauri-apps/api/webviewWindow': resolve(here, 'mocks/tauri-api-webviewWindow.ts'),
      '@tauri-apps/api/app': resolve(here, 'mocks/tauri-api-app.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
      '@': resolve(here, '../src'),
    };
```

The `@`-prefixed deep aliases must still appear before the catch-all `@`. The list above preserves that ordering.

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook: register @tauri-apps/api/webviewWindow alias

Used by AgentOverviewApp's Titlebar (and only by it). Slotted next to
the existing api/window alias.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A3: Smoke-test the extended config

**Files:** none

- [ ] **Step 1: Run build-storybook**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri && npm run build-storybook 2>&1 | tail -20
```

Expected: completes without errors. The build still bundles only the existing FlyoutApp + WhatsNewApp stories — the new alias is wired but not yet referenced by any new story.

- [ ] **Step 2: Run vitest as a regression check**

```bash
npm run test 2>&1 | tail -20
```

Expected: same test count and result as `origin/master`. Vitest does not use Storybook's Vite config, so the new alias should not affect it.

No commit in this task.

---

> **Phase A review checkpoint:** stop and verify the mock + alias + smoke test all pass before proceeding. Commit history at this point should show two new commits on top of `origin/master = f29bece8`.

---

## Phase B — Fixtures + harness scaffold

### Task B1: AgentOverview fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/agent-overview/__fixtures__/agent-overview-data.ts`

- [ ] **Step 1: Write the fixtures**

```ts
// src/components/agent-overview/__fixtures__/agent-overview-data.ts
//
// Synthetic SessionRecord fixtures for AgentOverviewApp Storybook stories.
// Real SessionRecord/SessionState/TurnFile types come from production
// sources — never redeclared here.

import { ARCHIVE_CUTOFF_MS } from '@/services/agent-overview';
import type { SessionRecord, SessionState, TurnFile } from '@/services/agent-overview-types';

export function makeTurnFile(overrides: Partial<TurnFile> = {}): TurnFile {
  return {
    path: 'src/example.ts',
    tool: 'edit',
    timestampMs: Date.now(),
    ...overrides,
  };
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const repo = overrides.repo ?? 'BorgDock';
  const worktree = overrides.worktree ?? 'master';
  return {
    sessionId: `s-${repo}-${worktree}-${Math.random().toString(36).slice(2, 8)}`,
    cwd: `/projects/${repo}`,
    repo,
    worktree,
    branch: 'master',
    label: `${repo[0]}${repo[1] ?? ''} · ${worktree} #1`,
    state: 'working',
    stateSinceMs: 30_000,
    lastEventMs: 30_000,
    lastUserMsg: 'do the thing',
    lastAssistantMsg: null,
    task: 'Reading example.ts',
    model: 'claude-opus-4-7',
    tokensUsed: 20_000,
    tokensMax: 200_000,
    lastApiStopReason: null,
    currentTurnFiles: [],
    snoozedUntilMs: null,
    seenAtMs: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Curated single-state sessions
// ---------------------------------------------------------------------------

export const sessionWorking: SessionRecord = makeSession({
  sessionId: 'curated-working',
  state: 'working',
  stateSinceMs: 45_000,
  task: 'Reading AgentOverviewApp.tsx',
});

export const sessionTool: SessionRecord = makeSession({
  sessionId: 'curated-tool',
  state: 'tool',
  stateSinceMs: 90_000,
  task: 'Running npm run build',
});

export const sessionAwaiting: SessionRecord = makeSession({
  sessionId: 'curated-awaiting',
  state: 'awaiting',
  stateSinceMs: 60_000,
  lastUserMsg: 'Should I enable this flag?',
  lastAssistantMsg:
    'I can either enable the flag globally or scope it to the agent-overview window only — which do you prefer?',
});

export const sessionAwaitingOld: SessionRecord = makeSession({
  sessionId: 'curated-awaiting-old',
  repo: 'FSP-Horizon',
  state: 'awaiting',
  // 12 minutes — past the 10m alert tier cutoff.
  stateSinceMs: 12 * 60_000,
  lastUserMsg: 'Confirm the migration plan?',
  lastAssistantMsg: 'Need confirmation before I run the irreversible migration.',
});

export const sessionFinished: SessionRecord = makeSession({
  sessionId: 'curated-finished',
  state: 'finished',
  stateSinceMs: 4_000,
  task: 'Tests passed: 1247 passing',
});

export const sessionIdle: SessionRecord = makeSession({
  sessionId: 'curated-idle',
  state: 'idle',
  stateSinceMs: 600_000,
  // ~10 minutes idle — well under the 24h archive cutoff.
  lastEventMs: 600_000,
});

export const sessionEnded: SessionRecord = makeSession({
  sessionId: 'curated-ended',
  state: 'ended',
  stateSinceMs: 300_000,
  lastEventMs: 300_000,
});

export const sessionArchived: SessionRecord = makeSession({
  sessionId: 'curated-archived',
  state: 'idle',
  stateSinceMs: ARCHIVE_CUTOFF_MS + 60_000,
  // Past the 24h cutoff — auto-archived.
  lastEventMs: ARCHIVE_CUTOFF_MS + 60_000,
});

export const sessionSnoozed: SessionRecord = makeSession({
  sessionId: 'curated-snoozed',
  state: 'awaiting',
  stateSinceMs: 90_000,
  // Snoozed for the next 5 minutes — should be filtered out of awaiting.
  snoozedUntilMs: Date.now() + 5 * 60_000,
});

export const sessionSeen: SessionRecord = makeSession({
  sessionId: 'curated-seen',
  state: 'working',
  stateSinceMs: 120_000,
  seenAtMs: Date.now(),
});

export const sessionHighTokens: SessionRecord = makeSession({
  sessionId: 'curated-high-tokens',
  state: 'working',
  tokensUsed: 180_000,
  tokensMax: 200_000,
  task: 'Compacting context...',
});

export const sessionMidTokens: SessionRecord = makeSession({
  sessionId: 'curated-mid-tokens',
  state: 'working',
  tokensUsed: 150_000,
  tokensMax: 200_000,
});

export const sessionLongLabel: SessionRecord = makeSession({
  sessionId: 'curated-long-label',
  repo: 'extremely-long-repo-name-that-wraps',
  worktree: 'feature-with-an-unusually-verbose-branch-name',
  branch: 'feature/extremely-long-branch-name-for-truncation-tests',
  label: 'XL · feature-with-an-unusually-verbose-branch-name #1',
  state: 'working',
  stateSinceMs: 30_000,
});

export const sessionLongTask: SessionRecord = makeSession({
  sessionId: 'curated-long-task',
  state: 'working',
  task:
    'A very long task description that exceeds normal card width and should wrap or truncate gracefully without overflowing the surrounding container. ' +
    'It also exercises the assistant-markdown rendering path when surfaced in the inspector popover.',
});

export const sessionWithFiles: SessionRecord = makeSession({
  sessionId: 'curated-with-files',
  state: 'awaiting',
  stateSinceMs: 60_000,
  lastUserMsg: 'Review my changes?',
  lastAssistantMsg: 'I have edits across three files — please review and approve.',
  currentTurnFiles: [
    makeTurnFile({ path: 'src/components/agent-overview/AgentCard.tsx', tool: 'edit' }),
    makeTurnFile({ path: 'src/components/agent-overview/Titlebar.tsx', tool: 'edit' }),
    makeTurnFile({ path: 'src/services/agent-overview.ts', tool: 'read' }),
  ],
});

// ---------------------------------------------------------------------------
// Curated composite session lists
// ---------------------------------------------------------------------------

export const noSessions: SessionRecord[] = [];

export const oneAwaiting: SessionRecord[] = [sessionAwaiting];

export const oneWorking: SessionRecord[] = [sessionWorking];

export const allStates: SessionRecord[] = [
  sessionAwaiting,
  sessionWorking,
  sessionTool,
  sessionFinished,
  sessionIdle,
  sessionEnded,
];

export const multipleAwaiting: SessionRecord[] = [
  makeSession({ sessionId: 'ma-1', repo: 'BorgDock', state: 'awaiting', stateSinceMs: 30_000 }),
  makeSession({ sessionId: 'ma-2', repo: 'BorgDock', state: 'awaiting', stateSinceMs: 60_000 }),
  makeSession({ sessionId: 'ma-3', repo: 'BorgDock', state: 'awaiting', stateSinceMs: 90_000 }),
  makeSession({ sessionId: 'ma-4', repo: 'BorgDock', state: 'awaiting', stateSinceMs: 120_000 }),
];

export const multipleAwaitingMixedAge: SessionRecord[] = [
  // normal tier (<3m)
  makeSession({ sessionId: 'mam-1', repo: 'BorgDock', state: 'awaiting', stateSinceMs: 60_000 }),
  // warn tier (3m–10m)
  makeSession({ sessionId: 'mam-2', repo: 'BorgDock', state: 'awaiting', stateSinceMs: 5 * 60_000 }),
  // alert tier (>=10m)
  makeSession({ sessionId: 'mam-3', repo: 'FSP-Horizon', state: 'awaiting', stateSinceMs: 12 * 60_000 }),
  // very-old alert tier (>=30m)
  makeSession({ sessionId: 'mam-4', repo: 'FSP-Horizon', state: 'awaiting', stateSinceMs: 30 * 60_000 }),
];

export const multiRepoMixed: SessionRecord[] = [
  makeSession({ sessionId: 'mrm-1', repo: 'BorgDock', state: 'awaiting', stateSinceMs: 90_000 }),
  makeSession({ sessionId: 'mrm-2', repo: 'BorgDock', state: 'working', stateSinceMs: 30_000 }),
  makeSession({ sessionId: 'mrm-3', repo: 'BorgDock', state: 'tool', stateSinceMs: 45_000 }),
  makeSession({ sessionId: 'mrm-4', repo: 'FSP-Horizon', state: 'working', stateSinceMs: 10_000, tokensUsed: 180_000 }),
  makeSession({ sessionId: 'mrm-5', repo: 'FSP-Horizon', state: 'finished', stateSinceMs: 4_000 }),
  makeSession({ sessionId: 'mrm-6', repo: 'docs-site', state: 'working', stateSinceMs: 15_000, tokensUsed: 150_000 }),
  makeSession({ sessionId: 'mrm-7', repo: 'docs-site', state: 'idle', stateSinceMs: 30 * 60_000, lastEventMs: 30 * 60_000 }),
  makeSession({ sessionId: 'mrm-8', repo: 'docs-site', state: 'ended', stateSinceMs: 60 * 60_000, lastEventMs: 60 * 60_000 }),
];

// 18 sessions across 4 repos for density 'wall'.
export const heavyLoad: SessionRecord[] = (() => {
  const repos = ['BorgDock', 'FSP-Horizon', 'docs-site', 'platform-core'] as const;
  const states: SessionState[] = ['working', 'working', 'tool', 'awaiting', 'finished'];
  const out: SessionRecord[] = [];
  let n = 0;
  for (const repo of repos) {
    for (let i = 0; i < (repo === 'BorgDock' ? 6 : repo === 'FSP-Horizon' ? 5 : 4); i++) {
      out.push(
        makeSession({
          sessionId: `hl-${n++}`,
          repo,
          worktree: i === 0 ? 'master' : `branch-${i}`,
          branch: i === 0 ? 'master' : `feature/branch-${i}`,
          state: states[(i + n) % states.length] ?? 'working',
          stateSinceMs: (n * 7_000) % 600_000,
        }),
      );
      if (out.length >= 18) return out;
    }
  }
  return out;
})();

// 9 sessions for density 'standard'.
export const moderateLoad: SessionRecord[] = (() => {
  const out: SessionRecord[] = [];
  for (let i = 0; i < 9; i++) {
    out.push(
      makeSession({
        sessionId: `ml-${i}`,
        repo: i < 5 ? 'BorgDock' : 'FSP-Horizon',
        worktree: i % 2 === 0 ? 'master' : `branch-${i}`,
        state: i % 3 === 0 ? 'tool' : 'working',
        stateSinceMs: (i + 1) * 12_000,
      }),
    );
  }
  return out;
})();

export const allIdle: SessionRecord[] = [
  makeSession({ sessionId: 'ai-1', repo: 'BorgDock', state: 'idle', lastEventMs: 60 * 60_000 }),
  makeSession({ sessionId: 'ai-2', repo: 'BorgDock', state: 'idle', lastEventMs: 90 * 60_000 }),
  makeSession({ sessionId: 'ai-3', repo: 'FSP-Horizon', state: 'ended', lastEventMs: 120 * 60_000 }),
  makeSession({ sessionId: 'ai-4', repo: 'FSP-Horizon', state: 'idle', lastEventMs: 30 * 60_000 }),
  makeSession({ sessionId: 'ai-5', repo: 'docs-site', state: 'ended', lastEventMs: 240 * 60_000 }),
];

export const idleWithArchived: SessionRecord[] = [
  // archived
  makeSession({ sessionId: 'iwa-1', repo: 'BorgDock', state: 'idle', lastEventMs: ARCHIVE_CUTOFF_MS + 60_000 }),
  makeSession({ sessionId: 'iwa-2', repo: 'FSP-Horizon', state: 'idle', lastEventMs: ARCHIVE_CUTOFF_MS + 4 * 60 * 60_000 }),
  makeSession({ sessionId: 'iwa-3', repo: 'docs-site', state: 'ended', lastEventMs: ARCHIVE_CUTOFF_MS + 12 * 60 * 60_000 }),
  // fresh idle
  makeSession({ sessionId: 'iwa-4', repo: 'BorgDock', state: 'idle', lastEventMs: 30 * 60_000 }),
  makeSession({ sessionId: 'iwa-5', repo: 'FSP-Horizon', state: 'ended', lastEventMs: 60 * 60_000 }),
  // a couple of working sessions so the live grid isn't empty
  makeSession({ sessionId: 'iwa-6', repo: 'BorgDock', state: 'working', stateSinceMs: 30_000 }),
  makeSession({ sessionId: 'iwa-7', repo: 'docs-site', state: 'working', stateSinceMs: 60_000 }),
];

export const allArchived: SessionRecord[] = [
  makeSession({ sessionId: 'aa-1', repo: 'BorgDock', state: 'idle', lastEventMs: ARCHIVE_CUTOFF_MS + 60_000 }),
  makeSession({ sessionId: 'aa-2', repo: 'BorgDock', state: 'ended', lastEventMs: ARCHIVE_CUTOFF_MS + 6 * 60 * 60_000 }),
  makeSession({ sessionId: 'aa-3', repo: 'FSP-Horizon', state: 'idle', lastEventMs: ARCHIVE_CUTOFF_MS + 12 * 60 * 60_000 }),
  makeSession({ sessionId: 'aa-4', repo: 'FSP-Horizon', state: 'idle', lastEventMs: ARCHIVE_CUTOFF_MS + 24 * 60 * 60_000 }),
  makeSession({ sessionId: 'aa-5', repo: 'docs-site', state: 'ended', lastEventMs: ARCHIVE_CUTOFF_MS + 36 * 60 * 60_000 }),
];

// 6 awaiting sessions across 3 repos, multiple worktrees per repo.
export const awaitingAcrossRepos: SessionRecord[] = [
  makeSession({ sessionId: 'aar-1', repo: 'BorgDock', worktree: 'master', state: 'awaiting', stateSinceMs: 30_000 }),
  makeSession({ sessionId: 'aar-2', repo: 'BorgDock', worktree: 'feature/x', branch: 'feature/x', state: 'awaiting', stateSinceMs: 60_000 }),
  makeSession({ sessionId: 'aar-3', repo: 'FSP-Horizon', worktree: 'master', state: 'awaiting', stateSinceMs: 90_000 }),
  makeSession({ sessionId: 'aar-4', repo: 'FSP-Horizon', worktree: 'release/2.0', branch: 'release/2.0', state: 'awaiting', stateSinceMs: 4 * 60_000 }),
  makeSession({ sessionId: 'aar-5', repo: 'docs-site', worktree: 'master', state: 'awaiting', stateSinceMs: 11 * 60_000 }),
  makeSession({ sessionId: 'aar-6', repo: 'docs-site', worktree: 'wip/draft', branch: 'wip/draft', state: 'awaiting', stateSinceMs: 15 * 60_000 }),
];
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no errors. The `SessionRecord`, `SessionState`, `TurnFile` types resolve via the existing `@` alias.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview && git add src/BorgDock.Tauri/src/components/agent-overview/__fixtures__/agent-overview-data.ts
git commit -m "$(cat <<'EOF'
storybook: agent-overview fixture factories + curated states

makeSession / makeTurnFile factories plus 14 curated single-state
sessions (working, tool, awaiting, finished, idle, ended, archived,
snoozed, seen, high/mid tokens, long label, long task, with files)
and 11 curated session lists (noSessions, oneAwaiting, oneWorking,
allStates, multipleAwaiting, multipleAwaitingMixedAge, multiRepoMixed,
heavyLoad, moderateLoad, allIdle, idleWithArchived, allArchived,
awaitingAcrossRepos).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B2: Stories scaffold + first story (`Empty`)

**Files:**
- Create: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Write the file with meta, harness, helper, and the first two stories**

```tsx
// src/components/agent-overview/AgentOverviewApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import type { SessionDelta, SessionRecord } from '@/services/agent-overview-types';
import { AgentOverviewApp } from './AgentOverviewApp';

interface FileChangeRow {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  additions: number;
  deletions: number;
}

interface DiffSnippet {
  hunks: Array<{
    header: string;
    lines: Array<{ kind: 'add' | 'delete' | 'context'; content: string }>;
  }>;
}

interface AgentOverviewStoryParams {
  /** Initial list_agent_sessions response. Defaults to []. */
  sessions?: SessionRecord[];
  /** Initial list_worktree_changes response. Defaults to { files: [] }. */
  fileChanges?: { files: FileChangeRow[] };
  /** Per-file diff_worktree_vs_head response. Defaults to undefined (rejects). */
  diffSnippet?: DiffSnippet;
  /** SessionDelta payloads emitted on agent-sessions-changed after mount. */
  deltas?: SessionDelta[];
  /** Delay between successive deltas. Defaults to 0 (still macrotask-deferred). */
  deltaIntervalMs?: number;
  /** Outer wrapper width. Defaults to 1280. */
  viewportWidth?: number;
  /** Outer wrapper height. Defaults to 800. */
  viewportHeight?: number;
}

function AgentOverviewHarness({ params }: { params: AgentOverviewStoryParams }) {
  const ctrl = getControl();
  // Seed canned invoke responses BEFORE mount so the hook's first
  // invoke('list_agent_sessions') call returns the expected payload.
  ctrl.invokeResponses['list_agent_sessions'] = params.sessions ?? [];
  ctrl.invokeResponses['list_worktree_changes'] = params.fileChanges ?? { files: [] };
  if (params.diffSnippet !== undefined) {
    ctrl.invokeResponses['diff_worktree_vs_head'] = params.diffSnippet;
  }

  useEffect(() => {
    if (!params.deltas?.length) return;
    let cancelled = false;
    const timeouts: number[] = [];
    const interval = params.deltaIntervalMs ?? 0;
    let t = 0;
    for (const delta of params.deltas) {
      const id = window.setTimeout(() => {
        if (!cancelled) ctrl.emit('agent-sessions-changed', delta);
      }, t);
      timeouts.push(id);
      t += interval;
    }
    return () => {
      cancelled = true;
      for (const id of timeouts) window.clearTimeout(id);
    };
    // ctrl is the singleton; deltas/interval are the only relevant deps.
  }, [params.deltas, params.deltaIntervalMs, ctrl]);

  const w = params.viewportWidth ?? 1280;
  const h = params.viewportHeight ?? 800;
  return (
    <div
      style={{
        width: w,
        height: h,
        background: 'var(--color-background)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <AgentOverviewApp />
    </div>
  );
}

const meta: Meta<typeof AgentOverviewHarness> = {
  title: 'Agent Overview/AgentOverviewApp',
  component: AgentOverviewHarness,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof AgentOverviewHarness>;

function story(params: AgentOverviewStoryParams): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Empty / loading / single-state axis
// ---------------------------------------------------------------------------

export const Loading = story({
  // sessions omitted — invoke('list_agent_sessions') resolves to undefined,
  // which the hook treats as "no rows yet". Live grid empty, no rails.
});

export const Empty = story({
  sessions: [],
});
```

- [ ] **Step 2: Verify the stories render**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri && npm run build-storybook 2>&1 | tail -20
```

Expected: completes without errors. If there's a path-resolution error on `'../../../.storybook/mocks/control'`, double-check the directory depth from `src/components/agent-overview/`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview && git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agentoverviewapp.stories.tsx scaffold + Loading/Empty

AgentOverviewHarness seeds invokeResponses for list_agent_sessions /
list_worktree_changes / diff_worktree_vs_head, then schedules
agent-sessions-changed emits via setTimeout (macrotask-deferred so the
hook's await listen() resolves before we emit). Outer wrapper has a
fixed viewport so density picking is deterministic.

Loading omits sessions entirely (undefined response → empty grid).
Empty sets sessions: [] explicitly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

> **Phase B review checkpoint:** four commits on top of master. Fixtures + scaffold + 2 stories landed and verified.

---

## Phase C — Story implementation

### Task C1: Empty / single-state stories (3 more)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Add the fixtures import block at the top (after the existing imports)**

```tsx
import {
  allArchived,
  allIdle,
  allStates,
  awaitingAcrossRepos,
  heavyLoad,
  idleWithArchived,
  moderateLoad,
  multiRepoMixed,
  multipleAwaiting,
  multipleAwaitingMixedAge,
  oneAwaiting,
  oneWorking,
  sessionAwaiting,
  sessionIdle,
  sessionLongLabel,
  sessionSnoozed,
  sessionWithFiles,
  sessionWorking,
} from './__fixtures__/agent-overview-data';
```

- [ ] **Step 2: Append the three remaining empty/single-state stories**

```tsx
export const OneWorking = story({
  sessions: oneWorking,
});

export const OneAwaiting = story({
  sessions: oneAwaiting,
});

export const OneIdle = story({
  sessions: [sessionIdle],
});
```

- [ ] **Step 3: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `5`.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview empty/single-state stories (3)

OneWorking, OneAwaiting, OneIdle round out the empty/single-state axis
alongside Loading and Empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C2: State-coverage stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Append the four state-coverage stories**

The three "By X" stories use a `play` function that programmatically changes the grouping `<select>` via `userEvent.selectOptions`. `@storybook/test` is already installed.

```tsx
// ---------------------------------------------------------------------------
// State-coverage axis
// ---------------------------------------------------------------------------

export const AllStates = story({
  sessions: allStates,
});

export const AllStatesByStatus: Story = {
  args: { params: { sessions: allStates } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'status');
  },
};

export const AllStatesByContext: Story = {
  args: { params: { sessions: multiRepoMixed } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'context');
  },
};

export const AllStatesByActivity: Story = {
  args: { params: { sessions: multiRepoMixed } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'activity');
  },
};
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `9`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview state-coverage stories (4)

AllStates (default repo grouping), AllStatesByStatus, AllStatesByContext,
AllStatesByActivity. The latter three use play functions that fire
selectOptions on the Grouping select after mount, exercising the four
non-default grouping renderers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C3: Awaiting / urgency stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Append the three awaiting-axis stories**

```tsx
// ---------------------------------------------------------------------------
// Awaiting / urgency axis
// ---------------------------------------------------------------------------

export const MultipleAwaitingSameRepo = story({
  sessions: multipleAwaiting,
});

export const MultipleAwaitingMixedAge = story({
  sessions: multipleAwaitingMixedAge,
});

export const AwaitingAcrossRepos = story({
  sessions: awaitingAcrossRepos,
});
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `12`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview awaiting/urgency stories (3)

MultipleAwaitingSameRepo (4 sessions, single repo, no worktree
subheaders), MultipleAwaitingMixedAge (normal/warn/alert tier coverage
in one rail), AwaitingAcrossRepos (6 sessions, 3 repos, multiple
worktrees per repo — exercises the worktree subheader path).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C4: Density-axis stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Append the three density stories**

```tsx
// ---------------------------------------------------------------------------
// Density axis
// ---------------------------------------------------------------------------

export const DensityRoomy = story({
  sessions: oneWorking.concat(multiRepoMixed.slice(0, 4)).filter((s) => s.state !== 'awaiting' && s.state !== 'idle' && s.state !== 'ended'),
});

export const DensityStandard = story({
  sessions: moderateLoad,
});

export const DensityWall = story({
  sessions: heavyLoad,
});
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `15`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview density-axis stories (3)

DensityRoomy (≤6 live sessions → comfortable cards), DensityStandard
(7–12 → standard density), DensityWall (>12 → compact wall).
Driven by groupedAgents.length, not by viewport — the harness keeps
the wrapper at the default 1280px so pickDensity's narrow-viewport
branch is not triggered.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C5: Idle / archived stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Append the three idle/archived stories**

```tsx
// ---------------------------------------------------------------------------
// Idle / archived axis
// ---------------------------------------------------------------------------

export const IdleRailVisible = story({
  sessions: allIdle,
});

export const IdleRailWithArchived = story({
  sessions: idleWithArchived,
});

export const IdleRailArchivedExpanded: Story = {
  args: { params: { sessions: idleWithArchived } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const toggle = await canvas.findByTestId('statusbar-archived-toggle');
    await userEvent.click(toggle);
  },
};
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `18`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview idle/archived stories (3)

IdleRailVisible (5 fresh idle, no archived toggle), IdleRailWithArchived
(3 archived hidden by default, statusbar shows toggle),
IdleRailArchivedExpanded (play clicks the toggle to reveal archived
rows).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C6: Live-update stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Append the four live-update stories**

```tsx
// ---------------------------------------------------------------------------
// Live-update axis — drives agent-sessions-changed events post-mount
// ---------------------------------------------------------------------------

export const TransitionWorkingToAwaiting = story({
  sessions: [sessionWorking],
  deltas: [
    {
      kind: 'upsert',
      session: { ...sessionWorking, state: 'awaiting', stateSinceMs: 0, lastEventMs: 0 },
    },
  ],
  deltaIntervalMs: 600,
});

export const TransitionAwaitingToIdle = story({
  sessions: [sessionAwaiting],
  deltas: [
    { kind: 'upsert', session: { ...sessionAwaiting, state: 'idle', lastEventMs: 60_000 } },
  ],
  deltaIntervalMs: 800,
});

export const NewSessionArrives = story({
  sessions: [],
  deltas: [
    { kind: 'upsert', session: sessionWorking },
    { kind: 'upsert', session: sessionAwaiting },
  ],
  deltaIntervalMs: 800,
});

export const SessionEnds = story({
  sessions: [sessionWorking],
  deltas: [{ kind: 'remove', sessionId: sessionWorking.sessionId }],
  deltaIntervalMs: 1000,
});
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `22`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview live-update stories (4)

TransitionWorkingToAwaiting, TransitionAwaitingToIdle (state changes
move the card between rails), NewSessionArrives (progressive arrival
of two new sessions), SessionEnds (remove delta clears the live grid).
Each delta is dispatched via setTimeout to give useAgentSessions's
async listen() registration time to resolve before the emit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C7: Inspector axis stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Append the three inspector stories**

The inspector popover opens on `mouseenter` over a card with `data-session-id`. The `play` function dispatches the event directly because `userEvent.hover` would race with the popover's measurement effect. For the pinned/expanded story, we click the card (sets `pinnedSessionId`) and then click the file row to expand.

```tsx
// ---------------------------------------------------------------------------
// Inspector axis
// ---------------------------------------------------------------------------

export const InspectorHovered: Story = {
  args: { params: { sessions: [sessionAwaiting] } },
  play: async ({ canvasElement }) => {
    const { within } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const card = await canvas.findByText(sessionAwaiting.label);
    const cardEl = card.closest('[data-session-id]');
    if (!cardEl) return;
    cardEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const InspectorPinned: Story = {
  args: {
    params: {
      sessions: [sessionWithFiles],
      fileChanges: {
        files: [
          {
            path: 'src/components/agent-overview/AgentCard.tsx',
            status: 'modified',
            additions: 12,
            deletions: 4,
          },
          {
            path: 'src/components/agent-overview/Titlebar.tsx',
            status: 'modified',
            additions: 8,
            deletions: 2,
          },
        ],
      },
      diffSnippet: {
        hunks: [
          {
            header: '@@ -10,3 +10,4 @@',
            lines: [
              { kind: 'context', content: 'export function AgentCard() {' },
              { kind: 'add', content: '  const inspector = useInspector();' },
              { kind: 'context', content: '  return ( ... );' },
            ],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const card = await canvas.findByText(sessionWithFiles.label);
    const cardEl = card.closest('[data-session-id]') as HTMLElement | null;
    if (!cardEl) return;
    // Pin via click.
    await userEvent.click(cardEl);
  },
};

export const InspectorWithFiles: Story = {
  args: {
    params: {
      sessions: [sessionWithFiles],
      fileChanges: {
        files: [
          {
            path: 'src/components/agent-overview/AgentCard.tsx',
            status: 'modified',
            additions: 12,
            deletions: 4,
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { within } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const card = await canvas.findByText(sessionWithFiles.label);
    const cardEl = card.closest('[data-session-id]');
    if (!cardEl) return;
    cardEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `25`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview inspector axis stories (3)

InspectorHovered (mouseenter opens the popover via hover), InspectorPinned
(click pins the popover; fileChanges + diffSnippet seed the inspector's
file section), InspectorWithFiles (hover-open showing the file rows
section). Mouseenter is dispatched directly because userEvent.hover
races with the popover's placePopover() measurement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C8: Edge-case stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx`

- [ ] **Step 1: Append the four edge-case stories**

```tsx
// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

export const HeavyLoadManySessions = story({
  sessions: heavyLoad,
});

export const AllArchived = story({
  sessions: allArchived,
});

export const LongLabelsAndBranches = story({
  sessions: [sessionLongLabel],
});

export const OnlySnoozedAwaiting = story({
  sessions: [
    sessionSnoozed,
    {
      ...sessionSnoozed,
      sessionId: 'curated-snoozed-2',
      stateSinceMs: 5 * 60_000,
      snoozedUntilMs: Date.now() + 10 * 60_000,
    },
  ],
});
```

- [ ] **Step 2: Final story count check (must equal 29)**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `29`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: agent-overview edge-case stories (4)

HeavyLoadManySessions (18 cards across 4 repos), AllArchived (live grid
empty, idle rail collapsed behind the archived toggle), LongLabelsAndBranches
(chrome truncation), OnlySnoozedAwaiting (two snoozed awaiting sessions
should NOT surface in the awaiting rail or titlebar pill).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

> **Phase C review checkpoint:** twelve commits on top of master. All 29 stories landed and verified.

---

## Phase D — Verification, roadmap, PR

### Task D1: Final Verification

**Files:** none

- [ ] **Step 1: Run all verification gates**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri
npx tsc --noEmit
npm run lint
npm run test
npm run build-storybook
```

Each command must exit 0. Lint warnings in pre-existing files are acceptable (matches the Phase 1/2 baseline). Lint errors in the new fixtures or stories are NOT acceptable — fix them before proceeding.

- [ ] **Step 2: Production-code byte-identical assertion**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview
git diff origin/master...storybook-phase5-agent-overview -- \
  src/BorgDock.Tauri/src/components/agent-overview \
  src/BorgDock.Tauri/src/hooks/useAgentSessions.ts \
  src/BorgDock.Tauri/src/hooks/useInspectorState.ts \
  src/BorgDock.Tauri/src/hooks/useKeyboardShortcuts.ts \
  src/BorgDock.Tauri/src/services/agent-overview.ts \
  src/BorgDock.Tauri/src/services/agent-overview-types.ts \
  src/BorgDock.Tauri/src/services/notification.ts \
  ':(exclude)src/BorgDock.Tauri/src/components/agent-overview/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/agent-overview/*.stories.tsx'
```

Output MUST be empty. The `:(exclude)` pathspecs strip the new fixtures + stories; everything else MUST be unchanged.

- [ ] **Step 3: Story count assertion**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-agent-overview/src/BorgDock.Tauri/src/components/agent-overview/AgentOverviewApp.stories.tsx
```

Expected: `29`.

No commit in this task.

---

### Task D2: Roadmap update + plugin-shell correction

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Edit the roadmap**

Open `docs/superpowers/specs/storybook-roadmap.md`. Two edits:

(a) Move the Agent Overview row from "Pending" to "Done":

In the Done table, append:

```
| 3 | Agent Overview | `main-agent-overview.tsx` → `components/agent-overview/AgentOverviewApp.tsx` | `2026-05-05-storybook-phase5-agent-overview-design.md` | `2026-05-05-storybook-phase5-agent-overview.md` | _(filled in after PR opens)_ |
```

(Number `3` may need to bump to whatever's next given Phases 3/4 may have landed in parallel — pick the next free index.)

Delete the Agent Overview row from the Pending table.

(b) Correct the misleading "plugin-shell" claim. The pending Agent Overview row read:

```
| Agent Overview | `main-agent-overview.tsx` | **M** | `invoke` (agent status, claude api, sessions); `plugin-shell`; `emit/listen` for live status events | Several live-update flows — the mock event channel will get exercised hard. |
```

Since AgentOverviewApp does not import `@tauri-apps/plugin-shell` (verified by `grep -rn "plugin-shell" src/components/agent-overview/`), this row is being removed from Pending entirely, so no in-place correction is needed. But add a line in the Mock-layer-extensions section noting the new alias:

```
- `@tauri-apps/api/webviewWindow` → `mocks/tauri-api-webviewWindow.ts`
```

(Append to the existing alias bullet list, in `@tauri-apps/api/*` order.)

- [ ] **Step 2: Commit the roadmap update**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview && git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark agent-overview done, register webviewWindow alias

AgentOverviewApp does not actually import @tauri-apps/plugin-shell
despite the Pending row's claim — confirmed by grep over
src/components/agent-overview. The pending row is being removed and
no plugin-shell mock is added. plugin-shell will arrive with a phase
that touches a window that actually uses it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D3: Push and open PR

**Files:** none

- [ ] **Step 1: Switch to personal gh account**

```bash
gh auth switch --user borght-dev
gh auth status
```

Verify `Active account: true` next to `borght-dev`.

- [ ] **Step 2: Push the branch**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-agent-overview && git push -u origin storybook-phase5-agent-overview
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base master --head storybook-phase5-agent-overview \
  --title "storybook phase 5: agent overview catalog" \
  --body "$(cat <<'EOF'
## Summary
- Adds **29 exhaustive Storybook stories** for `AgentOverviewApp.tsx` covering empty/single-state (5), state coverage with grouping switches (4), awaiting/urgency (3), density tiers (3), idle/archived behavior (3), **live `agent-sessions-changed` deltas** (4), inspector hover/pin/files (3), and edge cases (4).
- Extends the existing mock layer with **one new alias surface**: `@tauri-apps/api/webviewWindow`. The existing `tauri-event` mock handles every live-update story without modification — the first window to exercise it heavily.
- Production code (every file under `src/components/agent-overview/`, `useAgentSessions`, `useInspectorState`, `useKeyboardShortcuts`, `services/agent-overview*.ts`, `services/notification.ts`) is byte-identical to master. No new test/seed hooks introduced into production.
- Updates the roadmap: Agent Overview moves from Pending to Done, the new alias is registered, and the misleading `plugin-shell` claim on the pending row is removed (verified by grep — AgentOverviewApp does not import plugin-shell).

Spec: `docs/superpowers/specs/2026-05-05-storybook-phase5-agent-overview-design.md`
Plan: `docs/superpowers/plans/2026-05-05-storybook-phase5-agent-overview.md`

## Test plan
- [ ] `npm run storybook` boots; all 29 stories load without console errors
- [ ] Theme toolbar (light/dark/system) toggles every story without reload
- [ ] Live-update stories visibly transition state (Working → Awaiting moves the card from the live grid into the awaiting rail; titlebar pill appears)
- [ ] Inspector stories open the popover (hover or pin) without unmounting the iframe; close button is a deliberate no-op mock
- [ ] `npm run build-storybook` completes
- [ ] `npm run test` (vitest) green
- [ ] `npm run lint` (Biome) clean
- [ ] `git diff origin/master...storybook-phase5-agent-overview -- <production paths>` shows zero changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Switch gh back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
gh auth status
```

Verify `KvanderBorght_gomocha` is active again.

- [ ] **Step 5: Watch CI**

Capture the PR URL from `gh pr create`. Then:

```bash
gh pr checks <PR-URL> --watch
```

Vitest must be green on macOS + Windows. Playwright is allowed to fail (precedent from Phase 2). If vitest fails, root-cause and fix forward — do NOT bump timeouts or skip tests.

---

## Self-Review Notes

- **Spec coverage:**
  - Mock layer extension (api/webviewWindow) — Tasks A1, A2.
  - Smoke test — Task A3.
  - Fixtures (14 single-state + 11 composite lists + factory) — Task B1.
  - Stories scaffold + harness — Task B2.
  - 29 stories — Tasks B2 + C1 (3) + C2 (4) + C3 (3) + C4 (3) + C5 (3) + C6 (4) + C7 (3) + C8 (4) = 2 + 3 + 4 + 3 + 3 + 3 + 4 + 3 + 4 = 29.
  - Verification — Task D1.
  - Roadmap update + plugin-shell correction — Task D2.
  - Push + PR — Task D3.
- **No prod code changes:** verified explicitly in Task D1 step 2 with `:(exclude)` pathspecs.
- **Type consistency:** `SessionRecord`, `SessionState`, `SessionDelta`, `TurnFile` imported from production sources only; never redeclared. `FileChangeRow` and `DiffSnippet` are local interfaces in the stories file (mirror the runtime payload shape used by `InspectorFilesSection` and `InspectorFileRow`); they're not re-exported and don't affect the type system at the production boundary.
- **Bite-sized steps:** every task has 2–4 steps; every code-changing step shows the literal code; every commit step has the literal command.
- **Out of scope:** per-component stories, visual regression, hero shots, plugin-shell mock — all deferred per spec.
- **Branch policy reminder:** stay on `storybook-phase5-agent-overview`. Do NOT rebase off any other phase. Do NOT `git pull`.
