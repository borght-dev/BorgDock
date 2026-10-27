import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { makePr, PanelFrame } from '@/components/pr-detail/__fixtures__/pr-detail-data';
import { CiFailuresCard } from '@/components/settings/CiFailuresCard';
import { makeSignal } from '@/services/ci-failures/__fixtures__/evidence';
import { makeClaim, makeDetail, makeGroup } from '@/services/ci-failures/__fixtures__/store';
import { __seedBranchStory } from '@/services/ci-failures/culprit';
import { DEFAULT_CI_FAILURE_SETTINGS } from '@/services/ci-failures/settings';
import type {
  CiGroupSummary,
  CiOccurrenceDetail,
  CiPrFailures,
} from '@/services/ci-failures/types';
import type { AgentThread } from '@/services/dispatch/types';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useCiGuardStore } from '@/stores/ci-guard-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { CheckRun } from '@/types';
import { CiFailuresFocusCard } from './CiFailuresFocusCard';
import { LaunchGuardDialog } from './LaunchGuardDialog';
import { RelatedFailuresCard } from './RelatedFailuresCard';

const SCOPE = 'github.com||borght-dev/borgdock';
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const pr = makePr({
  pullRequest: {
    number: 1184,
    title: 'Group checks by suite in the detail view',
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    baseRef: 'master',
    headSha: 'a1b2c3d4e5',
  },
});

function check(id: number, name: string, conclusion = 'failure'): CheckRun {
  return {
    id,
    name,
    status: 'completed',
    conclusion,
    htmlUrl: `https://github.com/borght-dev/BorgDock/actions/runs/70/job/${id}`,
    checkSuiteId: 9,
    workflowName: 'CI',
  };
}

const CHECKS = [
  check(7001, 'e2e (chromium)'),
  check(7002, 'lint'),
  check(7003, 'build', 'success'),
];

const assertion = makeSignal({
  kind: 'test',
  parser: 'playwright',
  testId: 'tests/checkout.spec.ts › pays with card',
  path: 'tests/checkout.spec.ts',
  line: 42,
  errorClass: 'Error',
  message: 'Error: expect(received).toBe(expected)',
  expected: '200',
  actual: '503',
});

function occurrence(
  jobId: number,
  jobName: string,
  groupId: string,
  overrides = {},
  signal = assertion,
): CiOccurrenceDetail {
  return makeDetail(
    {
      id: `${SCOPE}#job:${jobId}`,
      scope: SCOPE,
      prNumber: 1184,
      jobId,
      jobName,
      testedSha: 'a1b2c3d4e5',
      completedAt: ago(1),
      observedAt: ago(1),
      ...overrides,
    },
    [{ signal, groupId, fingerprint: `fp:${groupId}` }],
  );
}

const sharedGroup = makeGroup({
  id: 'g-shared',
  scope: SCOPE,
  title: 'tests/checkout.spec.ts › pays with card',
  prNumbers: [1184, 1190, 1201, 1207],
  defaultBranchRuns: [4812],
  occurrenceCount: 6,
  runCount: 5,
  failedSteps: ['Run bun run test:e2e'],
  firstObservedAt: ago(26),
  lastObservedAt: ago(1),
});

const ownerThread = {
  id: 'mini:thread-9',
  hostId: 'mini',
  hostLabel: 'Mac mini',
  available: true,
  status: 'running',
  title: 'CI: checkout 503',
  lastActivityAt: ago(0.1),
  pullRequests: [],
} as unknown as AgentThread;

const ownedGroup: CiGroupSummary = {
  ...sharedGroup,
  claim: makeClaim({
    groupId: 'g-shared',
    ownerKind: 't3',
    ownerRef: 'mini:thread-9',
    hostId: 'mini',
    ownerLabel: 'CI: checkout 503',
    claimedAt: ago(2),
  }),
};

const lintCandidate = makeGroup({
  id: 'g-lint',
  scope: SCOPE,
  title: 'TS2322 in src/api/client.ts',
  prNumbers: [1184, 1199],
  maxTier: 'medium',
  occurrenceCount: 2,
  firstObservedAt: ago(5),
});

const lintSignal = makeSignal({
  code: 'TS2322',
  path: 'src/api/client.ts',
  line: 4,
  message: "Type 'string' is not assignable to type 'number'.",
});

function failures(
  occurrences: CiOccurrenceDetail[],
  groups: CiGroupSummary[],
): { scope: string; data: CiPrFailures; loading: false } {
  return { scope: SCOPE, data: { occurrences, groups }, loading: false };
}

const seedStores: Decorator = (Story) => {
  const { settings } = useSettingsStore.getState();
  useSettingsStore.setState({ settings: { ...settings, ciFailures: DEFAULT_CI_FAILURE_SETTINGS } });
  useDispatchStore.setState({ threads: [ownerThread] });
  useCiGuardStore.setState({ question: null });
  return <Story />;
};

const meta: Meta<typeof RelatedFailuresCard> = {
  title: 'CI Failures/RelatedFailuresCard',
  component: RelatedFailuresCard,
  decorators: [
    seedStores,
    (Story) => (
      <PanelFrame width={760} height={560}>
        <div style={{ padding: 16 }}>
          <Story />
        </div>
      </PanelFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof RelatedFailuresCard>;

/** Confident match in four PRs and on master, owned by a running T3 thread. */
export const SharedAndOwned: Story = {
  args: {
    pr,
    checks: CHECKS,
    failures: failures(
      [
        occurrence(7001, 'e2e (chromium)', 'g-shared'),
        occurrence(7002, 'lint', 'g-lint', {}, lintSignal),
      ],
      [ownedGroup, lintCandidate],
    ),
  },
};

/** Shared and unowned: Claim and Investigate are offered. */
export const SharedUnowned: Story = {
  args: {
    pr,
    checks: CHECKS,
    failures: failures([occurrence(7001, 'e2e (chromium)', 'g-shared')], [sharedGroup]),
  },
};

/** An infrastructure fault: runner lost, same step in three PRs. */
export const Infrastructure: Story = {
  args: {
    pr,
    checks: CHECKS,
    failures: failures(
      [
        occurrence(
          7001,
          'e2e (chromium)',
          'g-infra',
          {},
          makeSignal({
            kind: 'generic',
            parser: 'generic',
            message: 'The runner has received a shutdown signal.',
          }),
        ),
      ],
      [
        makeGroup({
          id: 'g-infra',
          scope: SCOPE,
          title: 'The runner stopped or lost contact (Run bun run test:e2e)',
          prNumbers: [1184, 1186, 1193],
          catalogIds: ['runner-lost'],
          failedSteps: ['Run bun run test:e2e'],
          firstObservedAt: ago(3),
        }),
      ],
    ),
  },
};

/** Flaky: the same job failed and passed on retry in this PR. */
export const Flaky: Story = {
  args: {
    pr,
    checks: CHECKS,
    failures: failures(
      [occurrence(7001, 'e2e (chromium)', 'g-flaky')],
      [
        makeGroup({
          id: 'g-flaky',
          scope: SCOPE,
          title: 'tests/search.spec.ts › filters by author',
          prNumbers: [1184],
          occurrenceCount: 3,
          runCount: 3,
          passedOnRetry: 2,
        }),
      ],
    ),
  },
};

/** The owner thread finished: "Investigation finished?" asks to resolve, release or keep. */
export const OwnerFinished: Story = {
  decorators: [
    (Story) => {
      useDispatchStore.setState({
        threads: [{ ...ownerThread, status: 'settled' } as AgentThread],
      });
      return <Story />;
    },
  ],
  args: {
    pr,
    checks: CHECKS,
    failures: failures([occurrence(7001, 'e2e (chromium)', 'g-shared')], [ownedGroup]),
  },
};

/** Fix merged, still red here and seen again: Rerun affected is offered. */
export const FixMerged: Story = {
  args: {
    pr,
    checks: CHECKS,
    failures: failures(
      [occurrence(7001, 'e2e (chromium)', 'g-shared')],
      [
        {
          ...sharedGroup,
          fixPr: 'https://github.com/borght-dev/BorgDock/pull/1210',
          fixMergedAt: ago(4),
          lastObservedAt: ago(1),
        },
      ],
    ),
  },
};

const masterGroup: CiGroupSummary = { ...sharedGroup, id: 'g-master' };

/**
 * Also failing on master, where it broke after one PR: ask its author or
 * open a draft revert. Master passes again, so the affected PRs can be
 * updated from it.
 */
export const BrokeOnMaster: Story = {
  decorators: [
    (Story) => {
      __seedBranchStory(masterGroup, {
        branch: 'master',
        firstRed: { runId: 4812, runNumber: 4812, sha: 'f00d', url: null },
        lastGreen: { runId: 4811, runNumber: 4811, sha: 'beef', url: null },
        commits: [],
        suspects: [
          {
            number: 466,
            title: 'Bump Playwright to 1.49',
            authorLogin: 'sasha',
            url: 'https://github.com/borght-dev/BorgDock/pull/466',
          },
        ],
        unresolved: [],
        commitCount: 0,
        newestRed: { runId: 4812, workflow: '.github/workflows/ci.yml' },
        recovered: { runId: 4820, runNumber: null, sha: '', url: null },
      });
      return <Story />;
    },
  ],
  args: {
    pr,
    checks: CHECKS,
    failures: failures([occurrence(7001, 'e2e (chromium)', 'g-master')], [masterGroup]),
  },
};

/** Evidence states: still reading one job, the other's log expired. */
export const EvidencePending: Story = {
  args: {
    pr,
    checks: CHECKS,
    failures: failures(
      [
        makeDetail(
          {
            id: `${SCOPE}#job:7001`,
            scope: SCOPE,
            jobId: 7001,
            jobName: 'e2e (chromium)',
            evidenceState: 'pending',
          },
          [],
        ),
        makeDetail(
          {
            id: `${SCOPE}#job:7002`,
            scope: SCOPE,
            jobId: 7002,
            jobName: 'lint',
            evidenceState: 'unavailable',
            evidenceReason: 'The log has expired',
          },
          [],
        ),
      ],
      [],
    ),
  },
};

/** No related failures: one quiet line says the check was done. */
export const NothingRelated: Story = {
  args: {
    pr,
    checks: CHECKS,
    failures: failures(
      [occurrence(7001, 'e2e (chromium)', 'g-single')],
      [makeGroup({ id: 'g-single', scope: SCOPE, prNumbers: [1184] })],
    ),
  },
};

/** Collection is off. */
export const CollectionOff: Story = {
  decorators: [
    (Story) => {
      const { settings } = useSettingsStore.getState();
      useSettingsStore.setState({
        settings: { ...settings, ciFailures: { ...DEFAULT_CI_FAILURE_SETTINGS, enabled: false } },
      });
      return <Story />;
    },
  ],
  args: { pr, checks: CHECKS, failures: { scope: SCOPE, data: null, loading: false } },
};

/** The launch guard on a failure someone owns. */
export const GuardOwned: StoryObj = {
  render: () => {
    useEffect(() => {
      useCiGuardStore.setState({
        question: {
          conflict: {
            kind: 'owned',
            group: ownedGroup,
            claim: ownedGroup.claim as NonNullable<CiGroupSummary['claim']>,
          },
          target: {
            owner: 'borght-dev',
            repo: 'BorgDock',
            prNumber: 1190,
            checkNames: ['e2e (chromium)'],
          },
          action: 'Fix',
        },
      });
    }, []);
    return <LaunchGuardDialog />;
  },
};

/** The launch guard on a shared failure nobody owns. */
export const GuardShared: StoryObj = {
  render: () => {
    useEffect(() => {
      useCiGuardStore.setState({
        question: {
          conflict: { kind: 'shared', group: sharedGroup },
          target: { owner: 'borght-dev', repo: 'BorgDock', prNumber: 1184, checkNames: [] },
          action: 'Fix',
        },
      });
    }, []);
    return <LaunchGuardDialog />;
  },
};

/** Focus: shared failures that need you. */
export const FocusCard: StoryObj = {
  render: () => {
    usePrStore.setState({
      username: 'koen',
      pullRequests: [
        makePr({
          pullRequest: {
            number: 1184,
            repoOwner: 'borght-dev',
            repoName: 'BorgDock',
            authorLogin: 'koen',
          },
        }),
      ],
    });
    useCiFailuresStore.setState({
      loaded: true,
      groups: [
        sharedGroup,
        {
          ...ownedGroup,
          id: 'g-quiet',
          title: 'Docker build: ERROR failed to solve',
          claim: makeClaim({ groupId: 'g-quiet', ownerKind: 'me', leaseUntil: ago(1) }),
        },
        {
          ...sharedGroup,
          id: 'g-fixed',
          title: 'TS2322 in src/api/client.ts',
          fixPr: 'https://github.com/borght-dev/BorgDock/pull/1210',
          fixMergedAt: ago(3),
        },
      ],
    });
    return (
      <div style={{ width: 420, background: 'var(--color-background)' }}>
        <CiFailuresFocusCard />
      </div>
    );
  },
};

/** Settings → GitHub → Related CI failures. */
export const SettingsCard: StoryObj = {
  render: () => (
    <div style={{ width: 640, padding: 16, background: 'var(--color-background)' }}>
      <CiFailuresCard ciFailures={DEFAULT_CI_FAILURE_SETTINGS} repos={[]} onChange={() => {}} />
    </div>
  ),
};
