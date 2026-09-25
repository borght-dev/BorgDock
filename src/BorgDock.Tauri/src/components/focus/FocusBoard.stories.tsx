// src/components/focus/FocusBoard.stories.tsx
//
// Focus: the Board (four computed
// columns, no drag) and the List (count strip, rows with a reason), over the
// 18 open PRs of the iteration-2 mockup. Merge on a ready card runs the
// fill → Merged → fade → tally sequence against the Storybook Tauri mocks;
// Later snoozes a review into Waiting on others.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  FIXTURE_ME,
  recentlyClosedPrs,
  workbenchPrs,
} from '@/components/pr/__fixtures__/pr-list-data';
import type { FocusFilter } from '@/services/focus-bucket';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { FocusLayout } from '@/types';
import { FocusList } from './FocusList';

interface HarnessProps {
  layout?: FocusLayout;
  filter?: FocusFilter;
  /** No open pull requests at all. */
  empty?: boolean;
  /** Selected card or row as `owner/repo#number`. */
  selected?: string | null;
}

function Harness({
  layout = 'board',
  filter = 'all',
  empty = false,
  selected = null,
}: HarnessProps) {
  useState(() => {
    const now = Date.now();
    usePrStore.setState({
      pullRequests: empty ? [] : workbenchPrs(now),
      closedPullRequests: empty ? [] : recentlyClosedPrs(now),
      username: FIXTURE_ME,
      teams: [],
      reviewRequestTimestamps: {},
      filter: 'all',
      searchQuery: '',
      isPolling: false,
      lastPollTime: new Date(now),
    });
    useUiStore.setState({
      activeSection: 'focus',
      focusFilter: filter,
      focusSnoozes: {},
      selectedPrKey: selected,
      selectedPrNumber: selected ? Number(selected.split('#')[1]) : null,
      viewStack: [{ kind: 'list' }],
    });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ui: { ...s.settings.ui, focusLayout: layout } },
    }));
    return null;
  });
  return (
    <div
      className="flex h-screen flex-col bg-[var(--color-background)]"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <FocusList />
      </div>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Focus/FocusBoard',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** The Board over 18 PRs: Needs you, Waiting on others, Ready to merge, Stale. */
export const Board: Story = {};

/** The Board in the light theme. */
export const BoardLight: Story = { globals: { theme: 'light' } };

/** A selected card: accent border and wash (J/K/H/L move it). */
export const BoardSelected: Story = { args: { selected: 'borght-dev/BorgDock#479' } };

/** Nothing open: four empty columns. */
export const BoardEmpty: Story = { args: { empty: true } };

/** The List: count strip and ranked rows with the reason in the meta line. */
export const List: Story = { args: { layout: 'list' } };

/** The List in the light theme. */
export const ListLight: Story = { args: { layout: 'list' }, globals: { theme: 'light' } };

/** The List filtered to Needs you. */
export const ListNeedsYou: Story = { args: { layout: 'list', filter: 'you' } };

/** The List with nothing open. */
export const ListEmpty: Story = { args: { layout: 'list', empty: true } };
