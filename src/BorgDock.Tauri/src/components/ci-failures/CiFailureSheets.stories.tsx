import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  LAUNCH_CATALOGUE,
  makeDispatchScene,
} from '@/components/dispatch/__fixtures__/dispatch-data';
import { makePr, PanelFrame } from '@/components/pr-detail/__fixtures__/pr-detail-data';
import { makeSignal } from '@/services/ci-failures/__fixtures__/evidence';
import { makeClaim, makeDetail, makeGroup } from '@/services/ci-failures/__fixtures__/store';
import type { CiGroupDetail } from '@/services/ci-failures/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { getControl } from '../../../.storybook/mocks/control';
import { GroupDetail } from './GroupDetail';
import { InvestigateSheet } from './InvestigateSheet';
import { RerunAffectedSheet } from './RerunAffectedSheet';
import { TrackIssueSheet } from './TrackIssueSheet';

const SCOPE = 'github.com||borght-dev/borgdock';
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const signal = makeSignal({
  kind: 'test',
  parser: 'playwright',
  testId: 'tests/checkout.spec.ts › pays with card',
  errorClass: 'Error',
  message: 'Error: expect(received).toBe(expected)',
  excerpt: [
    '  41 |   await page.click("#pay");',
    '> 42 |   expect(status).toBe(200);',
    '     |                  ^',
  ],
  expected: '200',
  actual: '503',
});

function occurrence(jobId: number, prNumber: number | null, hours: number, extra = {}) {
  return makeDetail(
    {
      id: `${SCOPE}#job:${jobId}`,
      scope: SCOPE,
      prNumber,
      source: prNumber === null ? 'default_branch' : 'pull_request',
      jobId,
      jobName: 'e2e (chromium)',
      testedSha: `${jobId}abcdef`,
      runAttempt: 1,
      runNumber: 4800 + jobId,
      completedAt: ago(hours),
      observedAt: ago(hours),
      htmlUrl: `https://github.com/borght-dev/BorgDock/actions/runs/70/job/${jobId}`,
      ...extra,
    },
    [{ signal, groupId: 'g-shared', fingerprint: 'fp:checkout' }],
  );
}

const summary = makeGroup({
  id: 'g-shared',
  scope: SCOPE,
  title: 'tests/checkout.spec.ts › pays with card',
  prNumbers: [1184, 1190, 1201, 1207],
  defaultBranchRuns: [4812],
  occurrenceCount: 6,
  runCount: 5,
  passedOnRetry: 1,
  failedSteps: ['Run bun run test:e2e'],
  firstObservedAt: ago(26),
  lastObservedAt: ago(1),
  candidateCount: 1,
  // The PR jobs the sheet stories fail with: #1184 and #1190 (number × 10), then 99 and 11.
  prJobIds: [11840, 11900, 99, 11],
});

const DETAIL: CiGroupDetail = {
  summary,
  occurrences: [
    occurrence(11, 1184, 1),
    {
      ...occurrence(10, 1184, 3, { runAttempt: 1 }),
      outcome: {
        occurrenceId: `${SCOPE}#job:10`,
        kind: 'passed_on_retry',
        byJobId: 12,
        observedAt: ago(2.5),
      },
    },
    occurrence(9, 1190, 5),
    occurrence(8, 1201, 9),
    occurrence(7, 1207, 20),
    occurrence(6, null, 26, { headBranch: 'master', event: 'push' }),
  ],
  candidates: [
    {
      group: makeGroup({
        id: 'g-other',
        scope: SCOPE,
        title: 'tests/checkout.spec.ts › pays with card (firefox)',
        prNumbers: [1199],
        maxTier: 'high',
      }),
      reasons: ['Same test, different message'],
      agentVerdict: { same: true, reason: 'Both fail on the payments stub returning 503.' },
    },
  ],
  decisions: [],
  claimEvents: [
    { claimId: 'c1', at: ago(4), kind: 'released', detail: null },
    { claimId: 'c1', at: ago(6), kind: 'claimed', detail: 'You' },
  ],
};

const pr = makePr({
  pullRequest: {
    number: 1184,
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    baseRef: 'master',
    headSha: '11abcdef',
  },
});

function seed() {
  const ctrl = getControl();
  ctrl.invokeResponses.ci_load_group = DETAIL;
  ctrl.invokeResponses.t3_catalogue = LAUNCH_CATALOGUE;
  ctrl.githubResponses.getReviewReadiness = {
    checks: [{ name: 'e2e (chromium)', state: 'failure' }],
    complete: true,
    warnings: [],
  };
}

const meta: Meta = { title: 'CI Failures/Sheets' };
export default meta;

/** A group's details: occurrences, why they match, evidence, cause, a candidate and history. */
export const GroupDetails: StoryObj = {
  render: () => {
    seed();
    return (
      <PanelFrame width={820} height={1100}>
        <div style={{ padding: 16 }}>
          <GroupDetail id="detail" groupId="g-shared" pr={pr} branch="master" />
        </div>
      </PanelFrame>
    );
  },
};

/** Investigate: evidence picked, a free slot and model, the first message to read. */
export const Investigate: StoryObj = {
  render: () => {
    seed();
    const scene = makeDispatchScene();
    useDispatchStore.setState({
      threads: scene.threads,
      projects: scene.projects,
      overview: scene.overview,
    });
    return <InvestigateSheet groupId="g-shared" onClose={() => {}} />;
  },
};

/** A fix merged: update the two PRs still red from the base branch. */
export const RerunAffected: StoryObj = {
  render: () => {
    seed();
    getControl().invokeResponses.ci_load_group = {
      ...DETAIL,
      summary: {
        ...summary,
        defaultBranchRuns: [],
        classification: 'infrastructure',
        fixPr: 'https://github.com/borght-dev/BorgDock/pull/1210',
        fixMergedAt: ago(2),
      },
    };
    usePrStore.setState({
      pullRequests: [1184, 1190].map((number) =>
        makePr({
          pullRequest: {
            number,
            title: number === 1184 ? 'Group checks by suite' : 'Settings search',
            repoOwner: 'borght-dev',
            repoName: 'BorgDock',
          },
          ciJobs: [
            {
              id: number * 10,
              kind: 'actions',
              name: 'e2e (chromium)',
              runId: number * 100,
              conclusion: 'failure',
            },
          ],
        }),
      ),
    });
    return <RerunAffectedSheet groupId="g-shared" onClose={() => {}} />;
  },
};

/** A base-branch fault without a fix yet: nothing to run until the base branch passes. */
export const RerunBaseBranch: StoryObj = {
  render: () => {
    seed();
    usePrStore.setState({
      pullRequests: [
        makePr({
          pullRequest: {
            number: 1184,
            title: 'Group checks by suite',
            repoOwner: 'borght-dev',
            repoName: 'BorgDock',
          },
          ciJobs: [
            { id: 99, kind: 'actions', name: 'e2e (chromium)', runId: 990, conclusion: 'failure' },
          ],
        }),
      ],
    });
    return <RerunAffectedSheet groupId="g-shared" onClose={() => {}} />;
  },
};

/** An infrastructure fault: rerun the failed jobs, no fix needed. */
export const RerunInfrastructure: StoryObj = {
  render: () => {
    seed();
    getControl().invokeResponses.ci_load_group = {
      ...DETAIL,
      summary: { ...summary, defaultBranchRuns: [], catalogIds: ['runner-lost'] },
    };
    usePrStore.setState({
      pullRequests: [
        makePr({
          pullRequest: {
            number: 1184,
            title: 'Group checks by suite',
            repoOwner: 'borght-dev',
            repoName: 'BorgDock',
          },
          ciJobs: [
            { id: 11, kind: 'actions', name: 'e2e (chromium)', runId: 1100, conclusion: 'failure' },
          ],
        }),
      ],
    });
    return <RerunAffectedSheet groupId="g-shared" onClose={() => {}} />;
  },
};

/** Track on GitHub: the issue as it will be posted. */
export const TrackOnGitHub: StoryObj = {
  render: () => {
    seed();
    getControl().invokeResponses.ci_load_group = {
      ...DETAIL,
      summary: { ...summary, claim: makeClaim() },
    };
    return <TrackIssueSheet groupId="g-shared" onClose={() => {}} />;
  },
};
