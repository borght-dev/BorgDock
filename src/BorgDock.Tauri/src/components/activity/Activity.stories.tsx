import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { MainWindow } from '@/components/layout/MainWindow';
import { ViewStack } from '@/components/layout/ViewStack';
import { FIXTURE_ENTRIES, manyEntries } from '@/services/activity/__fixtures__/entries';
import { type ActivityFilter, useActivityViewStore } from '@/stores/activity-view-store';
import { type ActiveSection, useUiStore } from '@/stores/ui-store';
import { type ActivityScene, seedActivity } from './__fixtures__/activity-data';

interface HarnessProps extends ActivityScene {
  filter?: ActivityFilter;
  section?: ActiveSection;
  /** Select (and expand) the entry at this place in the list. */
  expand?: number;
  /** Long titles, to see how rows truncate. */
  longTitles?: boolean;
}

const LONG =
  ' — and the reason is long enough to need truncation on a narrow window, with room to spare';

function Harness({
  filter = 'unread',
  section = 'activity',
  expand,
  longTitles,
  entries,
  ...scene
}: HarnessProps) {
  useState(() => {
    const shown = (entries ?? FIXTURE_ENTRIES).map((entry) =>
      longTitles ? { ...entry, summary: `${entry.summary}${LONG}` } : entry,
    );
    seedActivity({ ...scene, entries: shown });
    const selected = expand !== undefined ? (shown[expand]?.id ?? null) : null;
    useActivityViewStore.setState({
      filter,
      group: null,
      sourceId: null,
      search: '',
      entries: [],
      loaded: false,
      selectedId: selected,
      expandedId: selected,
      openGroups: new Set(),
      undo: [],
    });
    useUiStore.setState({
      activeSection: section,
      viewStack: [{ kind: 'list' }],
      activityVisitedAt: '2026-10-27T09:12:00.000Z',
    });
    return null;
  });
  return (
    <MainWindow>
      <ViewStack />
    </MainWindow>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Activity/Activity',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** What changed since you last checked: questions, plans, failures, reviews, deploys. */
export const Unread: Story = { args: {} };

/** Only what needs you. */
export const NeedsYou: Story = { args: { filter: 'needs-you' } };

/** Everything, read and resolved too. */
export const All: Story = { args: { filter: 'all' } };

/** A selected question shows its options inline. */
export const Expanded: Story = { args: { filter: 'all', expand: 0 } };

/** Nothing new since the last visit. */
export const Empty: Story = { args: { entries: [] } };

/** The journal is still being read. */
export const Loading: Story = { args: { pending: true } };

/** A commit failed: the banner offers Retry. */
export const CommitError: Story = { args: { commitError: 'Activity store: disk full' } };

/** A newer BorgDock wrote the journal. */
export const ReadOnly: Story = { args: { readOnly: true } };

/** More than 5,000 unread entries need you. */
export const Full: Story = { args: { full: true } };

/** Long sentences truncate instead of wrapping the row. */
export const LongTitles: Story = { args: { filter: 'all', longTitles: true } };

/** Two thousand entries over two weeks, folded per entity and day. */
export const TwoThousand: Story = { args: { filter: 'all', entries: manyEntries(2000) } };

/** "Since you last checked" opens Focus. */
export const FocusCard: Story = { args: { section: 'focus' } };
