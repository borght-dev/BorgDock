// src/components/agent-overview/AgentOverviewApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import type { SessionDelta, SessionRecord } from '@/services/agent-overview-types';
import { AgentOverviewApp } from './AgentOverviewApp';
import {
  allArchived,
  allIdle,
  allStates,
  awaitingAcrossRepos,
  heavyLoad,
  idleWithArchived,
  moderateLoad,
  multiRepoMixed,
  multipleAwaiting,
  multipleAwaitingMixedAge,
  oneAwaiting,
  oneWorking,
  sessionAwaiting,
  sessionIdle,
  sessionLongLabel,
  sessionSnoozed,
  sessionWithFiles,
  sessionWorking,
} from './__fixtures__/agent-overview-data';

interface FileChangeRow {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  additions: number;
  deletions: number;
}

interface DiffSnippet {
  hunks: Array<{
    header: string;
    lines: Array<{ kind: 'add' | 'delete' | 'context'; content: string }>;
  }>;
}

interface AgentOverviewStoryParams {
  /** Initial list_agent_sessions response. Defaults to []. */
  sessions?: SessionRecord[];
  /** Initial list_worktree_changes response. Defaults to { files: [] }. */
  fileChanges?: { files: FileChangeRow[] };
  /** Per-file diff_worktree_vs_head response. Defaults to undefined (rejects). */
  diffSnippet?: DiffSnippet;
  /** SessionDelta payloads emitted on agent-sessions-changed after mount. */
  deltas?: SessionDelta[];
  /** Delay between successive deltas. Defaults to 0 (still macrotask-deferred). */
  deltaIntervalMs?: number;
  /** Outer wrapper width. Defaults to 1280. */
  viewportWidth?: number;
  /** Outer wrapper height. Defaults to 800. */
  viewportHeight?: number;
}

function AgentOverviewHarness({ params }: { params: AgentOverviewStoryParams }) {
  const ctrl = getControl();
  // Seed canned invoke responses BEFORE mount so the hook's first
  // invoke('list_agent_sessions') call returns the expected payload.
  ctrl.invokeResponses['list_agent_sessions'] = params.sessions ?? [];
  ctrl.invokeResponses['list_worktree_changes'] = params.fileChanges ?? { files: [] };
  if (params.diffSnippet !== undefined) {
    ctrl.invokeResponses['diff_worktree_vs_head'] = params.diffSnippet;
  }

  useEffect(() => {
    if (!params.deltas?.length) return;
    let cancelled = false;
    const timeouts: number[] = [];
    const interval = params.deltaIntervalMs ?? 0;
    let t = 0;
    for (const delta of params.deltas) {
      const id = window.setTimeout(() => {
        if (!cancelled) ctrl.emit('agent-sessions-changed', delta);
      }, t);
      timeouts.push(id);
      t += interval;
    }
    return () => {
      cancelled = true;
      for (const id of timeouts) window.clearTimeout(id);
    };
    // ctrl is the singleton; deltas/interval are the only relevant deps.
  }, [params.deltas, params.deltaIntervalMs, ctrl]);

  const w = params.viewportWidth ?? 1280;
  const h = params.viewportHeight ?? 800;
  return (
    <div
      style={{
        width: w,
        height: h,
        background: 'var(--color-background)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <AgentOverviewApp />
    </div>
  );
}

const meta: Meta<typeof AgentOverviewHarness> = {
  title: 'Agent Overview/AgentOverviewApp',
  component: AgentOverviewHarness,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof AgentOverviewHarness>;

function story(params: AgentOverviewStoryParams): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// Empty / loading / single-state axis
// ---------------------------------------------------------------------------

export const Loading = story({
  // sessions omitted — invoke('list_agent_sessions') resolves to undefined,
  // which the hook treats as "no rows yet". Live grid empty, no rails.
});

export const Empty = story({
  sessions: [],
});

export const OneWorking = story({
  sessions: oneWorking,
});

export const OneAwaiting = story({
  sessions: oneAwaiting,
});

export const OneIdle = story({
  sessions: [sessionIdle],
});

// ---------------------------------------------------------------------------
// State-coverage axis
// ---------------------------------------------------------------------------

export const AllStates = story({
  sessions: allStates,
});

export const AllStatesByStatus: Story = {
  args: { params: { sessions: allStates } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'status');
  },
};

export const AllStatesByContext: Story = {
  args: { params: { sessions: multiRepoMixed } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'context');
  },
};

export const AllStatesByActivity: Story = {
  args: { params: { sessions: multiRepoMixed } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'activity');
  },
};

// ---------------------------------------------------------------------------
// Awaiting / urgency axis
// ---------------------------------------------------------------------------

export const MultipleAwaitingSameRepo = story({
  sessions: multipleAwaiting,
});

export const MultipleAwaitingMixedAge = story({
  sessions: multipleAwaitingMixedAge,
});

export const AwaitingAcrossRepos = story({
  sessions: awaitingAcrossRepos,
});

// ---------------------------------------------------------------------------
// Density axis
// ---------------------------------------------------------------------------

export const DensityRoomy = story({
  sessions: oneWorking.concat(multiRepoMixed.slice(0, 4)).filter((s) => s.state !== 'awaiting' && s.state !== 'idle' && s.state !== 'ended'),
});

export const DensityStandard = story({
  sessions: moderateLoad,
});

export const DensityWall = story({
  sessions: heavyLoad,
});

// ---------------------------------------------------------------------------
// Idle / archived axis
// ---------------------------------------------------------------------------

export const IdleRailVisible = story({
  sessions: allIdle,
});

export const IdleRailWithArchived = story({
  sessions: idleWithArchived,
});

export const IdleRailArchivedExpanded: Story = {
  args: { params: { sessions: idleWithArchived } },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    const canvas = within(canvasElement);
    const toggle = await canvas.findByTestId('statusbar-archived-toggle');
    await userEvent.click(toggle);
  },
};
