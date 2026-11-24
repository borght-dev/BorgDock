import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FIXTURE_ENTRIES, questionEntry } from '@/services/activity/__fixtures__/entries';
import type { ActivityEntry } from '@/services/activity/types';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { seedActivity } from './__fixtures__/activity-data';
import { ActivityHistoryApp } from './ActivityHistoryApp';

interface HarnessProps {
  entries?: ActivityEntry[];
  /** The entry the window was opened for: selected and expanded. */
  entryId?: string;
}

function Harness({ entries = FIXTURE_ENTRIES, entryId }: HarnessProps) {
  useState(() => {
    seedActivity({ entries });
    // The history window has no threads or CI groups of its own: the main window has them.
    useDispatchStore.setState({ hosts: [], threads: [] });
    useCiFailuresStore.setState({ groups: [] });
    useActivityViewStore.setState({
      filter: 'unread',
      group: null,
      sourceId: null,
      search: '',
      entries: [],
      loaded: false,
      selectedId: null,
      expandedId: null,
      openGroups: new Set(),
      undo: [],
    });
    (
      window as unknown as { __BORGDOCK_ACTIVITY_HISTORY__?: { entryId: string | null } }
    ).__BORGDOCK_ACTIVITY_HISTORY__ = { entryId: entryId ?? null };
    return null;
  });
  return (
    <div style={{ height: '100vh' }}>
      <ActivityHistoryApp />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Activity/History window',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** All history: everything the journal holds, read and resolved too. */
export const AllHistory: Story = { args: {} };

/** Opened for one entry, from the Recent card or a notification. */
export const OpenedForAnEntry: Story = { args: { entryId: questionEntry.id } };

/** A journal with nothing in it yet. */
export const Empty: Story = { args: { entries: [] } };
