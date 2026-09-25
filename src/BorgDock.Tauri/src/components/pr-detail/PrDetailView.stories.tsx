// src/components/pr-detail/PrDetailView.stories.tsx
//
// The full-screen PR detail of the main window (plans/ui-overhaul-workbench.md,
// phase 3): header with Back, readiness sentence and action bar, then the
// tabs. The PR is seeded into the pr-store, so it shows at once, the same way
// a row click opens it in the app.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { usePrStore } from '@/stores/pr-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { makePr, withPrDetail } from './__fixtures__/pr-detail-data';
import { PrDetailView } from './PrDetailView';

const JOB = 'https://github.com/borght-dev/BorgDock/actions/runs/7001/job';

function run(
  id: number,
  name: string,
  state: 'passed' | 'failed' | 'running' | 'skipped',
  seconds = 64,
  suite = 9300,
): CheckRun {
  const startedAt = '2026-09-25T08:00:00Z';
  const completedAt = new Date(Date.parse(startedAt) + seconds * 1000).toISOString();
  const base = { id, name, htmlUrl: `${JOB}/${id}`, checkSuiteId: suite, startedAt };
  switch (state) {
    case 'running':
      return { ...base, status: 'in_progress' };
    case 'failed':
      return { ...base, status: 'completed', conclusion: 'failure', completedAt };
    case 'skipped':
      return { ...base, status: 'completed', conclusion: 'skipped', completedAt };
    default:
      return { ...base, status: 'completed', conclusion: 'success', completedAt };
  }
}

/** Actions names a check run by its job; the suite's workflow gives the group its name. */
function inWorkflow(workflowName: string, runs: CheckRun[]): CheckRun[] {
  return runs.map((r) => ({ ...r, workflowName }));
}

const FAILING_CHECKS: CheckRun[] = [
  ...inWorkflow('CI', [
    run(1, 'build', 'passed', 212),
    run(2, 'unit tests', 'failed', 148),
    run(3, 'e2e (chromium)', 'failed', 402),
    run(4, 'lint', 'passed', 41),
    run(5, 'typecheck', 'passed', 77),
  ]),
  ...inWorkflow('Docs', [run(6, 'build', 'passed', 55, 9301), run(7, 'links', 'passed', 23, 9301)]),
  ...inWorkflow('Release', [run(8, 'notes', 'skipped', 0, 9302)]),
];

const FAILING_LOG = [
  '2026-09-25T08:02:11.0000000Z ##[group]Run bun run test',
  'src/components/pr-detail/__tests__/ChecksGrouped.test.tsx(88,5): error TS2345: Argument of type string is not assignable to parameter of type number.',
  'src/services/first-failure.ts(41,9): error TS2322: Type null is not assignable to type string[].',
  '##[error]Process completed with exit code 1.',
].join('\n');

const failingPr = makePr({
  pullRequest: {
    number: 1184,
    title: 'Group checks by suite in the detail view',
    headRef: 'feat/grouped-checks',
    baseRef: 'master',
    reviewStatus: 'commented',
    additions: 412,
    deletions: 96,
    changedFiles: 14,
    commitCount: 6,
    body: [
      '## Summary',
      '',
      'Checks are grouped by suite, failing suites open first, and the first failure shows a log excerpt.',
      '',
      '## Why',
      '',
      'At 80 checks the flat list hid the two that failed.',
      '',
      '## Testing',
      '',
      '- Unit tests for the grouping and ordering',
      '- Storybook stories for each state',
      '- e2e for the in-window detail',
    ].join('\n'),
  },
  overallStatus: 'red',
  failedCheckNames: ['unit tests', 'e2e (chromium)'],
  failedCheckSuiteIds: [9300, 9300],
  pendingCheckNames: [],
  passedCount: 5,
  skippedCount: 1,
  totalCheckCount: 8,
});

const READY_CHECKS: CheckRun[] = [
  run(11, 'CI / build', 'passed', 190),
  run(12, 'CI / unit tests', 'passed', 131),
  run(13, 'CI / lint', 'passed', 38),
];

const readyPr = makePr({
  pullRequest: {
    number: 1179,
    title: 'Self-host Inter and Instrument Sans',
    headRef: 'feat/self-host-fonts',
    reviewStatus: 'approved',
    body: 'Bundles the fonts under `public/fonts/` so the first run needs no network.',
  },
  overallStatus: 'green',
  pendingCheckNames: [],
  passedCount: 3,
  totalCheckCount: 3,
});

const waitingPr = makePr({
  pullRequest: {
    number: 1181,
    title: 'Rail counts follow the filter',
    headRef: 'feat/rail-counts',
    reviewStatus: 'pending',
    requestedReviewers: ['sasha'],
    body: 'The rail shows the same counts as the filter control.',
  },
  overallStatus: 'green',
  pendingCheckNames: [],
  passedCount: 3,
  totalCheckCount: 3,
});

const draftBase = makePr({
  pullRequest: {
    number: 1187,
    title: 'WIP: Focus board columns',
    headRef: 'feat/focus-board',
    isDraft: true,
    reviewStatus: 'none',
    body: 'Four computed columns. Not ready for review yet.',
  },
  overallStatus: 'yellow',
  pendingCheckNames: ['CI / e2e (chromium)'],
  passedCount: 2,
  totalCheckCount: 3,
});
// Set after makePr: its deep merge keeps the base value for a `false` override.
const draftConflictsPr: PullRequestWithChecks = {
  ...draftBase,
  pullRequest: { ...draftBase.pullRequest, mergeable: false },
};

/** Seeds the PR into the list store so the view shows it at once, like a row click. */
function inList(pr: PullRequestWithChecks): Decorator {
  return (Story) => {
    usePrStore.setState({ pullRequests: [pr], closedPullRequests: [], username: 'borght-dev' });
    return Story();
  };
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: 1040,
        height: 860,
        maxWidth: '100%',
        margin: '24px auto',
        overflow: 'hidden',
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)',
      }}
    >
      {children}
    </div>
  );
}

const meta: Meta<typeof PrDetailView> = {
  title: 'PR Detail/PrDetailView',
  component: PrDetailView,
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PrDetailView>;

function target(pr: PullRequestWithChecks) {
  return {
    owner: pr.pullRequest.repoOwner,
    repo: pr.pullRequest.repoName,
    number: pr.pullRequest.number,
  };
}

/** Failing: grouped checks with the failing suite open and the first failure's log excerpt. */
export const Failing: Story = {
  decorators: [
    inList(failingPr),
    withPrDetail(failingPr, {
      githubResponses: { getCheckRunsForRef: FAILING_CHECKS, getJobLog: FAILING_LOG },
    }),
  ],
  args: { ...target(failingPr), initialTab: 'checks' },
};

/** Failing, on the Overview tab: the clamped description and its "Show more". */
export const FailingOverview: Story = {
  decorators: [
    inList(failingPr),
    withPrDetail(failingPr, {
      githubResponses: { getCheckRunsForRef: FAILING_CHECKS, getJobLog: FAILING_LOG },
    }),
  ],
  args: target(failingPr),
};

export const ReadyToMerge: Story = {
  decorators: [
    inList(readyPr),
    withPrDetail(readyPr, { githubResponses: { getCheckRunsForRef: READY_CHECKS } }),
  ],
  args: target(readyPr),
};

export const WaitingForReview: Story = {
  decorators: [
    inList(waitingPr),
    withPrDetail(waitingPr, { githubResponses: { getCheckRunsForRef: READY_CHECKS } }),
  ],
  args: target(waitingPr),
};

export const DraftWithConflicts: Story = {
  decorators: [
    inList(draftConflictsPr),
    withPrDetail(draftConflictsPr, {
      githubResponses: {
        getCheckRunsForRef: [
          run(21, 'CI / build', 'passed'),
          run(22, 'CI / lint', 'passed'),
          run(23, 'CI / e2e (chromium)', 'running'),
        ],
      },
    }),
  ],
  args: target(draftConflictsPr),
};

/** A PR that is not in the list: Back and the number while it loads. */
export const Loading: Story = {
  decorators: [
    inList(readyPr),
    withPrDetail(null, {
      githubResponses: { getOpenPRs: () => new Promise(() => {}) },
    }),
  ],
  args: { owner: 'borght-dev', repo: 'BorgDock', number: 999 },
};
