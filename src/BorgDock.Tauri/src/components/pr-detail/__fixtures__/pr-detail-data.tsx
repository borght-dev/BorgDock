// src/components/pr-detail/__fixtures__/pr-detail-data.tsx

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
  /** Top-level override only. Merges shallowly — passing { gitHub: { username: 'x' } }
   *  replaces the entire gitHub sub-object. For deep overrides, build a complete
   *  AppSettings via Object.assign / spread before passing. */
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
export const SETTINGS_BASELINE: AppSettings =
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

// Production PR Detail window opens at 800x900 (min 480x480) per
// src-tauri/src/platform/window.rs::open_pr_detail_window. PanelFrame
// constrains stories to that size with a subtle macOS-style chrome so the
// catalog reflects how the window actually feels in use, instead of the
// stretched-edge-to-edge default Storybook iframe.
//
// The scoped CSS overrides are necessary because production components
// (PrDetailApp, PrDetailPanel) use Tailwind's h-screen / w-screen which
// resolve to 100vh / 100vw and would still reach to the iframe edges
// without the override. Scoped to .storybook-pr-detail-frame so we don't
// affect any other story group.

const PR_DETAIL_FRAME_STYLE = `
.storybook-pr-detail-frame .h-screen { height: 100% !important; }
.storybook-pr-detail-frame .w-screen { width: 100% !important; }
`;

export function PanelFrame({
  children,
  width = 800,
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
      <style>{PR_DETAIL_FRAME_STYLE}</style>
      <div
        className="storybook-pr-detail-frame"
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
