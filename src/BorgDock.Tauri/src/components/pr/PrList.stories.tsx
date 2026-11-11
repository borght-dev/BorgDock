// src/components/pr/PrList.stories.tsx
//
// The Pull requests list (design/pr-overview/mockups.html): view tabs,
// filter chips, Group / Sort / Display, the shared CI failures line, and the
// PRs as a table, a list or a board. `Overview*` stories use the mockup's 23
// PRs and three shared failures; `Workbench*` the older 18-PR fixture.
// `TwoHundred` is the performance fixture: 200 open PRs (past the FLIP cap,
// so changes crossfade) and 200 recently closed (virtualized).

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { __seedBranchStory } from '@/services/ci-failures/culprit';
import { DEFAULT_CI_FAILURE_SETTINGS } from '@/services/ci-failures/settings';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { DEFAULT_DISPLAY, type PrDisplay } from '@/services/pr-list/display';
import type { SavedPrView } from '@/services/pr-list/facets';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { type PrFilter, usePrStore } from '@/stores/pr-store';
import { usePrViewStore } from '@/stores/pr-view-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity, PullRequestWithChecks } from '@/types';
import {
  FIXTURE_ME,
  listPr,
  manyClosedPrs,
  manyOpenPrs,
  recentlyClosedPrs,
  workbenchPrs,
} from './__fixtures__/pr-list-data';
import { overviewCiGroups, overviewPrs } from './__fixtures__/pr-overview-data';
import { PrList } from './PrList';
import { prRowKey } from './pr-card-data';

type Fixture = 'overview' | 'workbench' | 'many';

interface HarnessProps {
  fixture?: Fixture;
  reviewProgress?: boolean;
  density?: PrDensity;
  display?: Partial<PrDisplay>;
  filter?: PrFilter;
  query?: string;
  hideFailing?: boolean;
  showCiSummary?: boolean;
  savedViews?: SavedPrView[];
  activeViewId?: string | null;
  /** Selected row as `owner/repo#number`. */
  selected?: string | null;
  /** Recently closed PRs; above 50 the list virtualizes. */
  closedCount?: number;
  /** Open PRs for the `many` fixture. */
  openCount?: number;
  /** Width of the frame, to show the docked sidebar. */
  width?: number;
}

function seed(props: HarnessProps) {
  const {
    fixture = 'overview',
    reviewProgress = false,
    density = 'comfortable',
    display = {},
    filter = 'all',
    query = '',
    hideFailing = false,
    showCiSummary = true,
    savedViews = [],
    activeViewId = null,
    selected = null,
    closedCount = 3,
    openCount = 200,
  } = props;
  const now = Date.now();
  const prs: PullRequestWithChecks[] =
    fixture === 'overview'
      ? overviewPrs(now)
      : fixture === 'many'
        ? manyOpenPrs(openCount, now)
        : workbenchPrs(now);
  const groups: CiGroupSummary[] = fixture === 'overview' ? overviewCiGroups(now) : [];
  for (const group of groups) __seedBranchStory(group, null);
  useCiFailuresStore.setState({ groups, loaded: true, revision: 1 });
  useDispatchStore.setState({ threads: [] });
  useQuickReviewStore.setState({
    activity: reviewProgress
      ? Object.fromEntries(
          prs
            .slice(0, 5)
            .map((pr, i) => [
              prRowKey(pr.pullRequest),
              { pr, decision: i < 3 ? 'approved' : i === 3 ? 'commented' : 'skipped' },
            ]),
        )
      : {},
  });
  usePrStore.setState({
    pullRequests: prs,
    closedPullRequests: closedCount > 3 ? manyClosedPrs(closedCount, now) : recentlyClosedPrs(now),
    username: FIXTURE_ME,
    teams: [],
    filter,
    searchQuery: query,
    hideFailing,
    relatedFailure: null,
    isPolling: false,
    lastPollTime: new Date(now),
  });
  const full: PrDisplay = { ...DEFAULT_DISPLAY, ...display };
  const active = savedViews.find((v) => v.id === activeViewId);
  usePrViewStore.setState({
    display: full,
    baseDisplay: active ? DEFAULT_DISPLAY : full,
    savedViews,
    activeViewId,
    showCiSummary,
    expandedGroups: new Set(),
  });
  useUiStore.setState({
    activeSection: 'prs',
    selectedPrKey: selected,
    selectedPrNumber: selected ? Number(selected.split('#')[1]) : null,
    collapsedGroups: new Set(),
    viewStack: [{ kind: 'list' }],
  });
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      ciFailures: DEFAULT_CI_FAILURE_SETTINGS,
      ui: { ...s.settings.ui, prDensity: density },
    },
  }));
}

function Harness(props: HarnessProps) {
  useState(() => {
    seed(props);
    return null;
  });
  return (
    <div
      className="flex h-screen flex-col bg-[var(--color-background)]"
      style={{
        fontFamily: 'var(--font-ui)',
        ...(props.width
          ? { width: props.width, borderRight: '1px solid var(--color-subtle-border)' }
          : {}),
      }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PrList />
      </div>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'PR/PrList',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

const VERA_VIEW: SavedPrView = {
  id: 'view-vera',
  name: 'Vera’s red PRs',
  filter: 'all',
  query: 'author:vera checks:failing',
  display: { ...DEFAULT_DISPLAY, groupBy: 'status' },
};

const API_VIEW: SavedPrView = {
  id: 'view-api',
  name: 'Team shop-api',
  filter: 'all',
  query: 'repo:shop-api',
  display: { ...DEFAULT_DISPLAY, groupBy: 'author' },
};

/** The default: a table grouped by status, ordered by priority (mockup A). */
export const Overview: Story = {};

/** The same in the light theme. */
export const OverviewLight: Story = { globals: { theme: 'light' } };

/** Shared CI failures opened: each one with its cause and what to do. */
export const OverviewCiOpen: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { expanded: false, name: /shared CI failures/ }),
    );
  },
};

/** The CI failures summary hidden from Display. */
export const OverviewCiHidden: Story = {
  args: { showCiSummary: false },
  globals: { theme: 'light' },
};

/** Grouped by author, then by status (sub-groups). */
export const ByAuthorThenStatus: Story = {
  args: { display: { groupBy: 'author', subGroupBy: 'status' } },
  globals: { theme: 'light' },
};

/** Grouped by repository with "Your turn" pinned on top. */
export const ByRepository: Story = {
  args: { display: { groupBy: 'repo' } },
  globals: { theme: 'light' },
};

/** Grouped by who has to act next. */
export const ByWaitingOn: Story = {
  args: { display: { groupBy: 'waiting', sortBy: 'updated' } },
  globals: { theme: 'light' },
};

/** Columns: created, repository and author added; sorted by size. */
export const MoreColumns: Story = {
  args: {
    display: {
      groupBy: 'none',
      sortBy: 'size',
      columns: ['checks', 'reviews', 'next', 'size', 'created', 'updated', 'repo', 'author'],
    },
  },
  globals: { theme: 'light' },
};

/** Filters from the query: author and checks chips. */
export const Filtered: Story = {
  args: { query: 'author:vera checks:failing' },
  globals: { theme: 'light' },
};

/** A saved view on screen, changed since it was saved (the dot, Update view). */
export const SavedViewEdited: Story = {
  args: {
    savedViews: [VERA_VIEW, API_VIEW],
    activeViewId: VERA_VIEW.id,
    query: 'author:vera checks:failing repo:shop-web',
    display: VERA_VIEW.display,
  },
  globals: { theme: 'light' },
};

/** The filter menu open on Repository (mockup C). */
export const FilterMenu: Story = {
  args: { query: 'author:vera checks:failing', savedViews: [VERA_VIEW, API_VIEW] },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Filter' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('menuitem', { name: /Repository/ }));
    await waitFor(() =>
      expect(body.getByRole('menuitemcheckbox', { name: /shop-web/ })).toBeTruthy(),
    );
  },
};

/** The Display menu open (mockup B). */
export const DisplayMenu: Story = {
  args: { display: { groupBy: 'status', subGroupBy: 'repo' } },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Display' }));
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(body.getByRole('dialog', { name: 'Display options' })).toBeTruthy());
  },
};

/** The Group menu open. */
export const GroupMenu: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Group/ }));
  },
};

/** The board layout, columns by status (mockup D). */
export const Board: Story = { args: { display: { layout: 'board' } } };

export const BoardLight: Story = {
  args: { display: { layout: 'board' } },
  globals: { theme: 'light' },
};

/** The list layout: no column headings, checks and next step only. */
export const ListLayout: Story = {
  args: { display: { layout: 'list' } },
  globals: { theme: 'light' },
};

/** Docked sidebar width (mockup E): two-line rows, headings hidden. */
export const Docked: Story = {
  args: { width: 440, query: 'repo:shop-web' },
  globals: { theme: 'light' },
};

/** Compact density: 32 px rows without the meta line. */
export const Compact: Story = { args: { density: 'compact' }, globals: { theme: 'light' } };

/** "Your turn" tab. */
export const YourTurn: Story = { args: { filter: 'needsYou' }, globals: { theme: 'light' } };

/** "Hide failing" on: the chip in the view bar. */
export const HideFailing: Story = { args: { hideFailing: true }, globals: { theme: 'light' } };

/** Groups with nothing for you folded. */
export const CollapseQuiet: Story = {
  args: { display: { groupBy: 'repo', collapseQuiet: true, pinYourTurn: false } },
  globals: { theme: 'light' },
};

/** The older 18-PR fixture across three repositories, dark theme. */
export const Workbench: Story = { args: { fixture: 'workbench' } };

/** A selected row: accent bar and wash. */
export const Selected: Story = { args: { selected: 'acme/shop-web#6395' } };

export const AfterMyApproval: Story = {
  args: { fixture: 'workbench' },
  play: async ({ canvasElement }) => {
    const pending = listPr({
      number: 42,
      title: 'Approval immediately updates the merge action',
      repo: 'acme/app',
      author: 'mira',
      requestedReviewers: [FIXTURE_ME],
      reviewStatus: 'pending',
    });
    pending.pullRequest.requestedTeams = ['platform'];
    usePrStore.setState({
      pullRequests: [pending],
      closedPullRequests: [],
      username: FIXTURE_ME,
      teams: ['platform'],
    });
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Review #42' })).toBeTruthy());
    usePrStore.getState().recordApproval('acme', 'app', 42, FIXTURE_ME);
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Merge' })).toBeTruthy());
    expect(canvas.queryByRole('button', { name: 'Review #42' })).toBeNull();
  },
};

/** 60 recently closed PRs: that list virtualizes and crossfades instead of FLIPping. */
export const VirtualizedRecentlyClosed: Story = { args: { fixture: 'workbench', closedCount: 60 } };

/** 200 open and 200 recently closed PRs: no FLIP above the cap, long groups virtualized. */
export const TwoHundred: Story = { args: { fixture: 'many', closedCount: 200 } };

export const ReviewProgress: Story = {
  args: { reviewProgress: true },
  globals: { theme: 'light' },
};
