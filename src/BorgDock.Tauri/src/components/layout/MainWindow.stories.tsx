// src/components/layout/MainWindow.stories.tsx
//
// Window-level catalog for the main BorgDock window (the docked-sidebar
// replacement). App.tsx renders <MainWindow><ViewStack /></MainWindow>; this
// harness renders the same tree, so Storybook and the app cannot drift, and
// seeds the stores directly so the Focus, PRs, and Work Items sections render
// with realistic data — the source for the "What's new" hero screenshots and
// the site's captures. `view` pushes a detail view on the stack.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  LAUNCH_CATALOGUE,
  makeDispatchScene,
  makeLaneSyncScene,
  makeRunScene,
  WIDE_CATALOGUE,
} from '@/components/dispatch/__fixtures__/dispatch-data';
import {
  bugWithReproSteps,
  epicWithCustomFields,
  itemAssignedToOther,
  itemNeverModified,
  makeComment,
  taskMinimalFields,
  userStoryWithRichBody,
} from '@/components/work-items/__fixtures__/work-item-data';
import type { BriefFilter } from '@/services/dispatch/walk';
import { reviewRequestKey } from '@/services/priority-scoring';
import { type DispatchViewMode, type RunIntent, useDispatchStore } from '@/stores/dispatch-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { type ActiveSection, type MainView, useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type {
  AdoQuery,
  FocusLayout,
  OverallStatus,
  PrDensity,
  PullRequestWithChecks,
  ReviewStatus,
} from '@/types';
import { getControl } from '../../../.storybook/mocks/control';
import { MainWindow } from './MainWindow';
import { ViewStack } from './ViewStack';

// ── PR fixtures ──────────────────────────────────────────────────────────────

const ME = 'koen';
const HOUR = 1000 * 60 * 60;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

interface PrSpec {
  number: number;
  title: string;
  repoName: string;
  author?: string;
  status?: OverallStatus;
  reviewStatus?: ReviewStatus;
  isDraft?: boolean;
  mergeable?: boolean;
  requestedReviewers?: string[];
  updatedHoursAgo?: number;
  additions?: number;
  deletions?: number;
  commentCount?: number;
  labels?: string[];
}

function pr(spec: PrSpec): PullRequestWithChecks {
  const status = spec.status ?? 'green';
  return {
    pullRequest: {
      number: spec.number,
      title: spec.title,
      headRef: `feature/${spec.number}`,
      baseRef: 'main',
      authorLogin: spec.author ?? ME,
      authorAvatarUrl: '',
      state: 'open',
      createdAt: ago((spec.updatedHoursAgo ?? 2) + 24),
      updatedAt: ago(spec.updatedHoursAgo ?? 2),
      isDraft: spec.isDraft ?? false,
      htmlUrl: '',
      body: '',
      repoOwner: 'borght-dev',
      repoName: spec.repoName,
      reviewStatus: spec.reviewStatus ?? 'none',
      commentCount: spec.commentCount ?? 0,
      labels: spec.labels ?? [],
      additions: spec.additions ?? 40,
      deletions: spec.deletions ?? 10,
      changedFiles: 3,
      commitCount: 4,
      mergeable: spec.mergeable,
      requestedReviewers: spec.requestedReviewers ?? [],
    },
    overallStatus: status,
    failedCheckNames: status === 'red' ? ['build', 'e2e'] : [],
    failedCheckSuiteIds: status === 'red' ? [1] : [],
    pendingCheckNames: status === 'yellow' ? ['build'] : [],
    passedCount: status === 'green' ? 6 : status === 'yellow' ? 4 : 3,
    skippedCount: 0,
    totalCheckCount: 6,
  };
}

const OPEN_PRS: PullRequestWithChecks[] = [
  pr({
    number: 482,
    title: 'T3 Code: live agent sessions on pull requests',
    repoName: 'BorgDock',
    author: ME,
    status: 'green',
    reviewStatus: 'approved',
    mergeable: true,
    updatedHoursAgo: 1,
    additions: 1840,
    deletions: 220,
    commentCount: 12,
    labels: ['feature'],
  }),
  pr({
    number: 479,
    title: 'GraphQL polling — one call per repo',
    repoName: 'BorgDock',
    author: 'mira',
    status: 'green',
    reviewStatus: 'none',
    requestedReviewers: [ME],
    updatedHoursAgo: 30,
    additions: 612,
    deletions: 410,
    commentCount: 3,
  }),
  pr({
    number: 471,
    title: 'SQL: virtualize the results grid',
    repoName: 'BorgDock',
    author: ME,
    status: 'red',
    reviewStatus: 'changesRequested',
    updatedHoursAgo: 74,
    additions: 320,
    deletions: 96,
    commentCount: 6,
  }),
  pr({
    number: 88,
    title: 'Marketing site: real, sourced changelog page',
    repoName: 'site',
    author: 'sasha',
    status: 'yellow',
    reviewStatus: 'none',
    requestedReviewers: [ME],
    updatedHoursAgo: 5,
    additions: 210,
    deletions: 34,
  }),
  pr({
    number: 86,
    title: 'Hero pipeline: capture screenshots from Storybook',
    repoName: 'site',
    author: ME,
    status: 'green',
    reviewStatus: 'commented',
    mergeable: true,
    updatedHoursAgo: 9,
    additions: 95,
    deletions: 12,
  }),
  // Mine, waiting on someone else's review: Focus's "Waiting on others".
  pr({
    number: 476,
    title: 'Flyout: open pull requests in the main window',
    repoName: 'BorgDock',
    author: ME,
    status: 'green',
    reviewStatus: 'none',
    requestedReviewers: ['mira'],
    updatedHoursAgo: 20,
    additions: 140,
    deletions: 62,
  }),
  // No update in over a week: Focus's "Stale".
  pr({
    number: 452,
    title: 'Docs: document the release checklist',
    repoName: 'BorgDock',
    author: ME,
    status: 'green',
    reviewStatus: 'commented',
    updatedHoursAgo: 12 * 24,
    additions: 48,
    deletions: 6,
  }),
  pr({
    number: 84,
    title: 'Bump deps: Vite 8, Vitest 4, Storybook 10',
    repoName: 'site',
    author: 'renovate',
    status: 'green',
    isDraft: true,
    updatedHoursAgo: 18,
  }),
];

const closed = pr({
  number: 470,
  title: 'Settings: dedicated window + search',
  repoName: 'BorgDock',
  author: ME,
});
const CLOSED_PRS: PullRequestWithChecks[] = [
  { ...closed, pullRequest: { ...closed.pullRequest, state: 'closed', mergedAt: ago(20) } },
];

function seedPrStore() {
  const s = usePrStore.getState();
  s.setUsername(ME);
  s.setPullRequests(OPEN_PRS);
  s.setClosedPullRequests(CLOSED_PRS);
  s.setPollingState(false, new Date());
  s.setRateLimit({ remaining: 4837, limit: 5000, resetAt: new Date(Date.now() + 30 * HOUR) });
  // When each review was requested from me, so Focus reads "mira asked for
  // your review 2 d ago." instead of "just now" (first seen on this poll).
  usePrStore.setState((state) => ({
    reviewRequestTimestamps: {
      ...state.reviewRequestTimestamps,
      [reviewRequestKey(OPEN_PRS[1]!.pullRequest, ME)]: ago(50),
      [reviewRequestKey(OPEN_PRS[3]!.pullRequest, ME)]: ago(5),
    },
  }));
  useOnboardingStore.setState({
    dismissedBadges: new Set(['focus-mode', 'review-mode', 'pr-summary']),
    dismissedHints: new Set([
      'focus-priority-ranking',
      'review-mode-shortcuts',
      'pr-summary-generate',
    ]),
  });
}

// ── Work Items fixtures ──────────────────────────────────────────────────────

const QUERY_TREE: AdoQuery[] = [
  {
    id: 'q-active',
    name: 'Active bugs & stories',
    path: 'My Queries/Active',
    isFolder: false,
    hasChildren: false,
    children: [],
  },
  {
    id: 'q-mine',
    name: 'Assigned to me',
    path: 'My Queries/Mine',
    isFolder: false,
    hasChildren: false,
    children: [],
  },
  {
    id: 'q-sprint',
    name: 'Current sprint',
    path: 'My Queries/Sprint 42',
    isFolder: false,
    hasChildren: false,
    children: [],
  },
];

const WORK_ITEMS = [
  bugWithReproSteps,
  userStoryWithRichBody,
  epicWithCustomFields,
  taskMinimalFields,
  itemAssignedToOther,
  itemNeverModified,
];

function seedWorkItems() {
  const wi = useWorkItemsStore.getState();
  wi.setQueryTree(QUERY_TREE);
  wi.toggleFavorite('q-active');
  wi.selectQuery('q-active');
  wi.setWorkItems(WORK_ITEMS);
  wi.setCurrentUserDisplayName('Koen van der Borght');
  wi.setIsLoading(false);

  useSettingsStore.getState().updateSettings({
    azureDevOps: {
      organization: 'borght-dev',
      project: 'BorgDock',
      personalAccessToken: 'storybook-token',
    },
  } as never);

  // Drive the detail pane: the ADO mock serves workItemScenario.workItem, and
  // WorkItemsSection's mount-restore loads whatever ui-store has selected.
  const ctrl = getControl();
  ctrl.workItemScenario = {
    ...ctrl.workItemScenario,
    workItem: bugWithReproSteps,
    states: ['New', 'Active', 'Resolved', 'Closed'],
    comments: [
      makeComment({
        id: 1,
        text: '<p>Repro confirmed on Windows — the Save button never re-enables.</p>',
        createdBy: { displayName: 'Mira Chen', uniqueName: 'mira@example.com' },
      }),
      makeComment({
        id: 2,
        text: '<p>Root cause: the autosave effect bound members by identity. Fix incoming.</p>',
        createdBy: { displayName: 'Koen van der Borght', uniqueName: 'koen@example.com' },
      }),
    ],
    loadBehavior: 'normal',
  };
  useUiStore.setState({ workItemsSelectedId: bugWithReproSteps.id });
}

function seedDispatch(
  selectedItemId: number | null,
  launching: boolean,
  viewMode: DispatchViewMode,
  withRuns: boolean | 'syncing' = false,
  runSheet: RunIntent | null = null,
  briefFilter: BriefFilter | null = null,
) {
  const scene = makeDispatchScene();
  const runScene =
    withRuns === 'syncing'
      ? makeLaneSyncScene()
      : withRuns
        ? makeRunScene()
        : { threads: [], runs: [] };
  getControl().invokeResponses.t3_catalogue = runSheet ? WIDE_CATALOGUE : LAUNCH_CATALOGUE;
  useDispatchStore.setState({
    briefFilter,
    launch: launching && selectedItemId !== null ? { itemId: selectedItemId } : null,
    viewMode,
    runs: runScene.runs,
    runSheet,
    items: scene.items,
    threads: [...scene.threads, ...runScene.threads],
    projects: scene.projects,
    overview: scene.overview,
    ado: scene.ado,
    hosts: scene.hosts,
    selectedItemId,
  });
  useSettingsStore.getState().updateSettings({
    azureDevOps: {
      organization: 'acme',
      project: 'Shop',
      personalAccessToken: 'storybook-token',
    },
  } as never);
}

// ── harness ──────────────────────────────────────────────────────────────────

function Harness({
  section,
  groupBy = 'repo',
  density = 'comfortable',
  focusLayout = 'list',
  view,
  dispatchItem = 60214,
  launching = false,
  dispatchBoard = false,
  dispatchView,
  dispatchRuns = false,
  dispatchRunSheet = null,
  dispatchFilter = null,
  agentsWaiting = false,
}: {
  section: ActiveSection;
  groupBy?: 'repo' | 'author' | 'status';
  density?: PrDensity;
  /** Focus as a list or as the board. */
  focusLayout?: FocusLayout;
  /** A detail view pushed on top of the list. */
  view?: MainView;
  /** The item selected in Dispatch; `null` selects none. */
  dispatchItem?: number | null;
  /** Open the launch sheet for the selected Dispatch item. */
  launching?: boolean;
  /** Dispatch as the board instead of the list. */
  dispatchBoard?: boolean;
  /** Dispatch in this layout; wins over `dispatchBoard`. */
  dispatchView?: DispatchViewMode;
  /** A finished Sync all and a suggestion still at work. */
  dispatchRuns?: boolean | 'syncing';
  /** Open the run sheet for this. */
  dispatchRunSheet?: RunIntent | null;
  /** Narrow Dispatch to one count of the briefing. */
  dispatchFilter?: BriefFilter | null;
  /** Seed Dispatch in another section too, so Focus shows the agents that wait. */
  agentsWaiting?: boolean;
}) {
  // Seed synchronously on first render so child mount effects (e.g. the Work
  // Items selection restore) observe the data before they run.
  useState(() => {
    seedPrStore();
    if (section === 'workitems') seedWorkItems();
    if (section === 'dispatch' || agentsWaiting) {
      seedDispatch(
        dispatchItem,
        launching,
        dispatchView ?? (dispatchBoard ? 'board' : 'list'),
        dispatchRuns,
        dispatchRunSheet,
        dispatchFilter,
      );
    }
    useUiStore.setState({
      activeSection: section,
      prGroupBy: groupBy,
      viewStack: view ? [{ kind: 'list' }, view] : [{ kind: 'list' }],
    });
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        ui: { ...s.settings.ui, prDensity: density, focusLayout },
      },
    }));
    return null;
  });
  return (
    <MainWindow>
      <ViewStack />
    </MainWindow>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Main Window/MainWindow',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** Pull requests: "Needs you" first, then the repositories, Review load and Recently closed. */
export const RailPrs: Story = { args: { section: 'prs' } };

/** Pull requests grouped by author, with the current user first. */
export const PrsByAuthor: Story = { args: { section: 'prs', groupBy: 'author' } };

/** Compact density: one 32 px line per pull request. */
export const PrsCompact: Story = { args: { section: 'prs', density: 'compact' } };

/** Focus as a list: the count strip and the ranked rows with a reason each. */
export const RailFocus: Story = { args: { section: 'focus' } };

/** Focus as the board: four computed columns, no drag. */
export const RailFocusBoard: Story = { args: { section: 'focus', focusLayout: 'board' } };

/** The Worktrees section. */
/** Dispatch: your work by what it needs, an agent's question open beside the list. */
export const RailDispatch: Story = { args: { section: 'dispatch' } };

export const RailDispatchWideList: Story = {
  args: { section: 'dispatch' },
  decorators: [
    (Story) => {
      localStorage.setItem('borgdock-dispatch-list-width', '560');
      return <Story />;
    },
  ],
};

/** Dispatch with a plan to approve selected. */
export const RailDispatchPlan: Story = { args: { section: 'dispatch', dispatchItem: 59877 } };

/** Dispatch with an item whose pull request merged while ADO still says Code Review. */
export const RailDispatchOutOfSync: Story = {
  args: { section: 'dispatch', dispatchItem: 59403 },
};

/** The launch sheet: a slot, a model, how the agent begins and its first message. */
export const RailDispatchLaunch: Story = {
  args: { section: 'dispatch', dispatchItem: 60201, launching: true },
};

/** Dispatch as a board: needs you, agents working, up next and not started. */
export const RailDispatchBoard: Story = {
  args: { section: 'dispatch', dispatchBoard: true, dispatchItem: null },
};

/** The board with a card's detail open in the drawer. */
export const RailDispatchBoardDrawer: Story = {
  args: { section: 'dispatch', dispatchBoard: true, dispatchItem: 59877 },
};

/** Dispatch walking the states: the briefing, then one section per ADO state. */
export const RailDispatchStates: Story = {
  args: { section: 'dispatch', dispatchView: 'walk', dispatchItem: null },
};

/** The walk after a Sync all finished, with a suggestion still at work. */
export const RailDispatchStatesRuns: Story = {
  args: { section: 'dispatch', dispatchView: 'walk', dispatchItem: null, dispatchRuns: true },
};

/** A sync of Code Review at work: its card in the lane, its items marked. */
export const RailDispatchStatesSyncing: Story = {
  args: { section: 'dispatch', dispatchView: 'walk', dispatchItem: null, dispatchRuns: 'syncing' },
};

/** The run sheet for Sync all: the items, a slot, a model, the message and the schedule. */
export const RailDispatchSyncSheet: Story = {
  args: {
    section: 'dispatch',
    dispatchView: 'walk',
    dispatchItem: null,
    dispatchRunSheet: { kind: 'sync', scope: { kind: 'all' } },
  },
};

/** Fix out of sync: the items grouped by where they move, a slot, a model and its reasoning. */
export const RailDispatchFixSheet: Story = {
  args: {
    section: 'dispatch',
    dispatchView: 'walk',
    dispatchItem: null,
    dispatchRunSheet: { kind: 'sync', scope: { kind: 'drift' } },
  },
};

/** Fix out of sync with the model picker open: recent models, then one section per account. */
export const RailDispatchFixSheetModels: Story = {
  args: RailDispatchFixSheet.args,
  play: async ({ canvasElement }) => {
    const model = await within(canvasElement).findByRole('button', { name: 'Model' });
    await waitFor(() => expect(model).toBeEnabled());
    await userEvent.click(model);
  },
};

/** The walk narrowed to the items out of sync, from its count in the briefing. */
export const RailDispatchStatesFiltered: Story = {
  args: {
    section: 'dispatch',
    dispatchView: 'walk',
    dispatchItem: null,
    dispatchFilter: 'outOfSync',
  },
};

/** The list narrowed to what needs you, from the counts above it. */
export const RailDispatchListFiltered: Story = {
  args: { section: 'dispatch', dispatchView: 'list', dispatchFilter: 'needsYou' },
};

/** An item out of sync, moved by an agent: the run sheet for that one item. */
export const RailDispatchMoveSheet: Story = {
  args: {
    section: 'dispatch',
    dispatchView: 'walk',
    dispatchItem: null,
    dispatchRunSheet: { kind: 'sync', scope: { kind: 'item', itemId: 59403, to: 'Ready For QA' } },
  },
};

/** The walk with an item's detail open in the drawer. */
export const RailDispatchStatesDrawer: Story = {
  args: { section: 'dispatch', dispatchView: 'walk', dispatchItem: 60240 },
};

/** Focus with agents waiting: they show above the pull requests. */
export const RailFocusAgents: Story = { args: { section: 'focus', agentsWaiting: true } };

export const RailWorktrees: Story = { args: { section: 'worktrees' } };

/** Work items: rows grouped by state, query picker in the head row. */
export const RailWorkItems: Story = { args: { section: 'workitems' } };

/** A pull request pushed on the view stack: the full-screen detail with Back. */
export const RailPrDetailPushed: Story = {
  args: {
    section: 'prs',
    view: { kind: 'pr-detail', owner: 'borght-dev', repo: 'BorgDock', number: 482 },
  },
};
