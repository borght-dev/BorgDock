// The Pull requests list with shared CI failures: the strip above the list,
// the row markers that name the failure, a PR red only from failures that are
// not its doing (its Review stays), and "Hide failing".

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import { FIXTURE_ME, workbenchPrs } from '@/components/pr/__fixtures__/pr-list-data';
import { PrList } from '@/components/pr/PrList';
import { makeClaim, makeGroup } from '@/services/ci-failures/__fixtures__/store';
import { __seedBranchStory, type BranchStory } from '@/services/ci-failures/culprit';
import { DEFAULT_CI_FAILURE_SETTINGS } from '@/services/ci-failures/settings';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { type RelatedFailureFilter, usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';

const SCOPE = 'github.com||borght-dev/borgdock';
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

/** Red with these failed Actions jobs: `[job id, check name]`. */
function redWith(pr: PullRequestWithChecks, jobs: [number, string][]): PullRequestWithChecks {
  return {
    ...pr,
    overallStatus: 'red',
    failedCheckNames: jobs.map(([, name]) => name),
    passedCount: Math.max(0, pr.totalCheckCount - jobs.length),
    ciJobs: jobs.map(([id, name]) => ({
      id,
      kind: 'actions',
      name,
      runId: 70_000 + id,
      conclusion: 'failure',
    })),
  };
}

/** The workbench PRs, with five BorgDock PRs red from two shared failures. */
function prsWithFailures(now: number): PullRequestWithChecks[] {
  const red: Record<number, [number, string][]> = {
    // Mine: the master failure and a lint error of its own.
    471: [
      [7101, 'e2e (chromium)'],
      [7102, 'lint'],
    ],
    // Waits on my review; red only from master.
    479: [[7201, 'e2e (chromium)']],
    474: [[7301, 'e2e (chromium)']],
    // Waits on my review; the cart failure may be theirs.
    458: [[7401, 'unit']],
    476: [[7402, 'unit']],
  };
  return workbenchPrs(now).map((pr) => {
    const jobs = red[pr.pullRequest.number];
    return jobs && pr.pullRequest.repoName === 'BorgDock' ? redWith(pr, jobs) : pr;
  });
}

const masterGroup = makeGroup({
  id: 'g-checkout',
  scope: SCOPE,
  title: 'tests/checkout.spec.ts › pays with card',
  prNumbers: [471, 474, 479],
  prJobIds: [7101, 7201, 7301],
  defaultBranchRuns: [4812, 4813],
  occurrenceCount: 5,
  runCount: 5,
  failedSteps: ['Run bun run test:e2e'],
  firstObservedAt: ago(6),
  lastObservedAt: ago(1),
});

const cartGroup = makeGroup({
  id: 'g-cart',
  scope: SCOPE,
  title: 'src/stores/__tests__/cart.test.ts › totals include tax',
  prNumbers: [458, 476],
  prJobIds: [7401, 7402],
  occurrenceCount: 2,
  runCount: 2,
  failedSteps: ['Run bun run test'],
  firstObservedAt: ago(3),
  lastObservedAt: ago(2),
  claim: makeClaim({ groupId: 'g-cart', ownerKind: 'me', ownerRef: 'me', claimedAt: ago(1) }),
});

const brokeAfter: BranchStory = {
  branch: 'main',
  firstRed: { runId: 4812, runNumber: 4812, sha: 'f00d', url: null },
  lastGreen: { runId: 4811, runNumber: 4811, sha: 'beef', url: null },
  commits: [
    {
      sha: 'c1',
      title: 'Bump Playwright to 1.49 (#466)',
      message: 'Bump Playwright to 1.49 (#466)',
      authorLogin: 'sasha',
      htmlUrl: null,
      parents: ['beef'],
    },
  ],
  suspects: [
    {
      number: 466,
      title: 'Bump Playwright to 1.49',
      authorLogin: 'sasha',
      url: 'https://github.com/borght-dev/BorgDock/pull/466',
    },
  ],
  unresolved: [],
  commitCount: 1,
  newestRed: { runId: 4813, workflow: '.github/workflows/ci.yml' },
  recovered: null,
};

interface HarnessProps {
  groups?: CiGroupSummary[];
  story?: BranchStory;
  hideFailing?: boolean;
  relatedFailure?: RelatedFailureFilter | null;
}

function Harness({
  groups = [masterGroup, cartGroup],
  story = brokeAfter,
  hideFailing = false,
  relatedFailure = null,
}: HarnessProps) {
  useState(() => {
    const now = Date.now();
    for (const group of groups) {
      __seedBranchStory(group, group.defaultBranchRuns.length > 0 ? story : null);
    }
    useCiFailuresStore.setState({ groups, loaded: true, revision: 1 });
    useDispatchStore.setState({ threads: [] });
    usePrStore.setState({
      pullRequests: prsWithFailures(now),
      closedPullRequests: [],
      username: FIXTURE_ME,
      teams: [],
      filter: 'all',
      searchQuery: '',
      sortBy: 'updated',
      relatedFailure,
      hideFailing,
      isPolling: false,
      lastPollTime: new Date(now),
    });
    useUiStore.setState({
      activeSection: 'prs',
      prGroupBy: 'repo',
      selectedPrKey: null,
      selectedPrNumber: null,
      collapsedGroups: new Set(),
      viewStack: [{ kind: 'list' }],
    });
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        ciFailures: DEFAULT_CI_FAILURE_SETTINGS,
        ui: { ...s.settings.ui, prDensity: 'comfortable' },
      },
    }));
    return null;
  });
  return (
    <div
      className="flex h-screen flex-col bg-[var(--color-background)]"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PrList />
      </div>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'CI Failures/PR list',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
};
export default meta;
type Story = StoryObj<typeof Harness>;

/**
 * Two shared failures above the list. The checkout failure is also on
 * master and broke after #466; its PRs are marked "Not caused by this PR"
 * and #479 keeps its Review.
 */
export const SharedFailures: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('2 shared CI failures block 5 PRs')).toBeInTheDocument();
    await expect(
      await canvas.findByText('Broke after #466 by sasha: Bump Playwright to 1.49'),
    ).toBeInTheDocument();
    const row = canvasElement.querySelector('[data-pr-key="borght-dev/BorgDock#479"]');
    await expect(
      row?.closest('.bd-wb-rowwrap')?.querySelector('[data-pr-card-action]'),
    ).toBeTruthy();
    await expect(row?.querySelector('[data-ci-marker][data-not-caused]')).toBeTruthy();
  },
};

export const SharedFailuresLight: Story = { globals: { theme: 'light' } };

/** Master passes again: every affected PR can be updated in one go. */
export const FixedOnMaster: Story = {
  args: {
    story: {
      ...brokeAfter,
      recovered: { runId: 4820, runNumber: 4820, sha: 'cafe', url: null },
    },
  },
};

/** Narrowed to one failure from a row marker. */
export const NarrowedToOneFailure: Story = {
  args: {
    relatedFailure: {
      groupId: 'g-checkout',
      title: masterGroup.title,
      prKeys: ['borght-dev/BorgDock#471', 'borght-dev/BorgDock#474', 'borght-dev/BorgDock#479'],
    },
  },
};

/**
 * Failure names too long for the window: the strip and the row markers cut
 * them at the column's edge, and hovering one shows the whole failure.
 */
export const LongTitles: Story = {
  args: {
    groups: [
      {
        ...masterGroup,
        title:
          'tests/checkout/payment-provider.spec.ts › pays with a saved card when the 3-D Secure challenge is skipped and the order total changes after a coupon is applied',
        workflowNames: ['CI'],
      },
      {
        ...cartGroup,
        title:
          'Deployment Failed, Error: Failed to deploy web package using OneDeploy to App Service. See the deployment log at https://example.scm.azurewebsites.net/api/deployments/latest for details.',
        workflowNames: ['Deploy'],
      },
    ],
  },
};

export const LongTitlesLight: Story = { ...LongTitles, globals: { theme: 'light' } };

/** "Hide failing" on: only green and running PRs stay. */
export const HideFailing: Story = {
  args: { hideFailing: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pr-key="borght-dev/BorgDock#479"]')).toBeNull();
    await expect(
      canvasElement.querySelector('[data-hide-failing]')?.getAttribute('aria-pressed'),
    ).toBe('true');
  },
};
