// src/components/pr/PrList.stories.tsx
//
// The Pull requests list: the 18 open PRs of the iteration-2 mockup across
// three repositories (80-check PRs, a running one, stale ones) plus recently
// closed PRs. Click a filter segment or pick a grouping to watch the FLIP.
// `TwoHundred` is the performance fixture: 200 open PRs (past the FLIP cap,
// so filter changes crossfade) and 200 recently closed (virtualized).

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
  manyOpenPrs,
  recentlyClosedPrs,
  workbenchPrs,
} from './__fixtures__/pr-list-data';
import { PrList } from './PrList';

interface HarnessProps {
  density?: PrDensity;
  groupBy?: PrGroupBy;
  filter?: PrFilter;
  /** Selected row as `owner/repo#number`. */
  selected?: string | null;
  /** Recently closed PRs; above 50 the list virtualizes. */
  closedCount?: number;
  /** Open PRs; above 18 the list is the generated `manyOpenPrs` fixture. */
  openCount?: number;
}

function Harness({
  density = 'comfortable',
  groupBy = 'repo',
  filter = 'all',
  selected = null,
  closedCount = 3,
  openCount = 18,
}: HarnessProps) {
  useState(() => {
    const now = Date.now();
    usePrStore.setState({
      pullRequests: openCount > 18 ? manyOpenPrs(openCount, now) : workbenchPrs(now),
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
      collapsedGroups: new Set(),
      viewStack: [{ kind: 'list' }],
    });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ui: { ...s.settings.ui, prDensity: density } },
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

/** 200 open and 200 recently closed PRs: no FLIP above the cap, Recently closed virtualized. */
export const TwoHundred: Story = { args: { openCount: 200, closedCount: 200 } };
