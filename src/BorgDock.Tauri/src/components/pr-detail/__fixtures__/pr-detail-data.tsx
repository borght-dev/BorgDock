// src/components/pr-detail/__fixtures__/pr-detail-data.ts

import type { ReactNode } from 'react';
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

// ── Base PR shape ─────────────────────────────────────────────

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
    useUiStore.setState(UI_BASELINE);
    usePrDetailJumpStore.setState(JUMP_BASELINE);

    return Story();
  };
}

export function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]">
      <div className="relative flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
