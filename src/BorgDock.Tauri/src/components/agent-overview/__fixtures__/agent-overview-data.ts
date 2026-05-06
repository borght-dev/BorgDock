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
