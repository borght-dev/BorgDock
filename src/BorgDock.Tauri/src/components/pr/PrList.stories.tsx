// src/components/pr/PrList.stories.tsx
//
// The Pull requests list with the Workbench rows (`ui.layoutV3`): the 18
// open PRs of the iteration-2 mockup across three repositories (80-check
// PRs, a running one, stale ones) plus recently closed PRs. Click a filter
// segment or pick a grouping to watch the FLIP; the Classic story is the
// tab layout's list for comparison.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { PrGroupBy } from '@/services/pr-grouping';
import { type PrFilter, usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity } from '@/types';
import {
  FIXTURE_ME,
  manyClosedPrs,
  recentlyClosedPrs,
  workbenchPrs,
} from './__fixtures__/pr-list-data';
import { PrList } from './PrList';

interface HarnessProps {
  layoutV3?: boolean;
  density?: PrDensity;
  groupBy?: PrGroupBy;
  filter?: PrFilter;
  /** Selected row as `owner/repo#number`. */
  selected?: string | null;
  /** Recently closed PRs; above 50 the list virtualizes. */
  closedCount?: number;
}

function Harness({
  layoutV3 = true,
  density = 'comfortable',
  groupBy = 'repo',
  filter = 'all',
  selected = null,
  closedCount = 3,
}: HarnessProps) {
  useState(() => {
    const now = Date.now();
    usePrStore.setState({
      pullRequests: workbenchPrs(now),
      closedPullRequests:
        closedCount > 3 ? manyClosedPrs(closedCount, now) : recentlyClosedPrs(now),
      username: FIXTURE_ME,
      teams: [],
      filter,
      searchQuery: '',
      sortBy: 'updated',
      isPolling: false,
      lastPollTime: new Date(now),
    });
    useUiStore.setState({
      activeSection: 'prs',
      prGroupBy: groupBy,
      selectedPrKey: selected,
      selectedPrNumber: selected ? Number(selected.split('#')[1]) : null,
      expandedRepoGroups: new Set(),
      viewStack: [{ kind: 'list' }],
    });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ui: { ...s.settings.ui, prDensity: density, layoutV3 } },
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
  title: 'PR/PrList',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** 18 PRs across three repositories, "Needs you" pinned first, dark theme. */
export const Workbench: Story = {};

/** The same list in the light theme. */
export const WorkbenchLight: Story = { globals: { theme: 'light' } };

/** Compact density: 32 px rows without the meta line. */
export const Compact: Story = { args: { density: 'compact' } };

/** Filtered to "Needs you": no pinned group, the rest grouped by repository. */
export const NeedsYou: Story = { args: { filter: 'needsYou' } };

/** Grouped by author, the current user first. */
export const ByAuthor: Story = { args: { groupBy: 'author' } };

/** Grouped by status. */
export const ByStatus: Story = { args: { groupBy: 'status' } };

/** A selected row: accent bar and wash. */
export const Selected: Story = { args: { selected: 'borght-dev/BorgDock#474' } };

/** 60 recently closed PRs: that list virtualizes and crossfades instead of FLIPping. */
export const VirtualizedRecentlyClosed: Story = { args: { closedCount: 60 } };

/** The tab layout's list (`ui.layoutV3` off), for comparison. */
export const Classic: Story = { args: { layoutV3: false } };
