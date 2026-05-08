// src/components/agent-overview/AgentOverviewApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { userEvent, within } from 'storybook/test';
import type { SessionDelta, SessionRecord } from '@/services/agent-overview-types';
import { getControl } from '../../../.storybook/mocks/control';
import { animation, screenshot } from '../../../.storybook/screenshot';
import {
  allArchived,
  allIdle,
  allStates,
  awaitingAcrossRepos,
  heavyLoad,
  idleWithArchived,
  moderateLoad,
  multipleAwaiting,
  multipleAwaitingMixedAge,
  multiRepoMixed,
  oneAwaiting,
  oneWorking,
  sessionAwaiting,
  sessionIdle,
  sessionLongLabel,
  sessionSnoozed,
  sessionWithFiles,
  sessionWorking,
} from './__fixtures__/agent-overview-data';
import { AgentOverviewApp } from './AgentOverviewApp';

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
  ctrl.invokeResponses.list_agent_sessions = params.sessions ?? [];
  ctrl.invokeResponses.list_worktree_changes = params.fileChanges ?? { files: [] };
  if (params.diffSnippet !== undefined) {
    ctrl.invokeResponses.diff_worktree_vs_head = params.diffSnippet;
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

export const AllStates: Story = {
  parameters: screenshot({
    output: 'site/public/screenshots/agent-overview.png',
    width: 720,
    height: 800,
  }),
  args: {
    params: {
      sessions: allStates,
    },
  },
};

export const AllStatesByStatus: Story = {
  args: { params: { sessions: allStates } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'status');
  },
};

export const AllStatesByContext: Story = {
  args: { params: { sessions: multiRepoMixed } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = await canvas.findByLabelText('Grouping');
    await userEvent.selectOptions(select, 'context');
  },
};

export const AllStatesByActivity: Story = {
  args: { params: { sessions: multiRepoMixed } },
  play: async ({ canvasElement }) => {
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
  sessions: oneWorking
    .concat(multiRepoMixed.slice(0, 4))
    .filter((s) => s.state !== 'awaiting' && s.state !== 'idle' && s.state !== 'ended'),
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
    const canvas = within(canvasElement);
    const toggle = await canvas.findByTestId('statusbar-archived-toggle');
    await userEvent.click(toggle);
  },
};

// ---------------------------------------------------------------------------
// Live-update axis — drives agent-sessions-changed events post-mount
// ---------------------------------------------------------------------------

export const TransitionWorkingToAwaiting = story({
  sessions: [sessionWorking],
  deltas: [
    {
      kind: 'upsert',
      session: { ...sessionWorking, state: 'awaiting', stateSinceMs: 0, lastEventMs: 0 },
    },
  ],
  deltaIntervalMs: 600,
});

export const TransitionAwaitingToIdle = story({
  sessions: [sessionAwaiting],
  deltas: [{ kind: 'upsert', session: { ...sessionAwaiting, state: 'idle', lastEventMs: 60_000 } }],
  deltaIntervalMs: 800,
});

export const NewSessionArrives = story({
  sessions: [],
  deltas: [
    { kind: 'upsert', session: sessionWorking },
    { kind: 'upsert', session: sessionAwaiting },
  ],
  deltaIntervalMs: 800,
});

export const SessionEnds = story({
  sessions: [sessionWorking],
  deltas: [{ kind: 'remove', sessionId: sessionWorking.sessionId }],
  deltaIntervalMs: 1000,
});

// ---------------------------------------------------------------------------
// Inspector axis
// ---------------------------------------------------------------------------

export const InspectorHovered: Story = {
  args: { params: { sessions: [sessionAwaiting] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await canvas.findByText(sessionAwaiting.label);
    const cardEl = card.closest('[data-session-id]');
    if (!cardEl) return;
    cardEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const InspectorPinned: Story = {
  args: {
    params: {
      sessions: [sessionWithFiles],
      fileChanges: {
        files: [
          {
            path: 'src/components/agent-overview/AgentCard.tsx',
            status: 'modified',
            additions: 12,
            deletions: 4,
          },
          {
            path: 'src/components/agent-overview/Titlebar.tsx',
            status: 'modified',
            additions: 8,
            deletions: 2,
          },
        ],
      },
      diffSnippet: {
        hunks: [
          {
            header: '@@ -10,3 +10,4 @@',
            lines: [
              { kind: 'context', content: 'export function AgentCard() {' },
              { kind: 'add', content: '  const inspector = useInspector();' },
              { kind: 'context', content: '  return ( ... );' },
            ],
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await canvas.findByText(sessionWithFiles.label);
    const cardEl = card.closest('[data-session-id]') as HTMLElement | null;
    if (!cardEl) return;
    // Pin via click.
    await userEvent.click(cardEl);
  },
};

export const InspectorWithFiles: Story = {
  args: {
    params: {
      sessions: [sessionWithFiles],
      fileChanges: {
        files: [
          {
            path: 'src/components/agent-overview/AgentCard.tsx',
            status: 'modified',
            additions: 12,
            deletions: 4,
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await canvas.findByText(sessionWithFiles.label);
    const cardEl = card.closest('[data-session-id]');
    if (!cardEl) return;
    cardEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

export const HeavyLoadManySessions = story({
  sessions: heavyLoad,
});

export const AllArchived = story({
  sessions: allArchived,
});

export const LongLabelsAndBranches = story({
  sessions: [sessionLongLabel],
});

export const OnlySnoozedAwaiting = story({
  sessions: [
    sessionSnoozed,
    {
      ...sessionSnoozed,
      sessionId: 'curated-snoozed-2',
      stateSinceMs: 5 * 60_000,
      snoozedUntilMs: Date.now() + 10 * 60_000,
    },
  ],
});

// ── Animation: state progression via live-update deltas ───────────────
//
// Starts with three sessions (working, awaiting, idle), then fires a
// sequence of agent-sessions-changed deltas at 1.2-second intervals to
// show state transitions: working→awaiting, awaiting→finished, finished→ended.
// The harness's built-in delta mechanism emits each event post-mount so
// the capture sees the transitions in motion.
// 6.5s @ 12fps = ~78 frames.
export const Anim_StateProgression: Story = {
  parameters: animation({
    output: 'site/public/anim/agent-overview-states.gif',
    width: 720,
    height: 800,
    fps: 12,
    duration: 6500,
  }),
  args: {
    params: {
      sessions: [sessionWorking, sessionAwaiting, sessionIdle],
      viewportWidth: 720,
      viewportHeight: 800,
      deltas: [
        // working → awaiting (needs your input)
        {
          kind: 'upsert',
          session: { ...sessionWorking, state: 'awaiting', stateSinceMs: 0, lastEventMs: 0 },
        },
        // awaiting (original) → finished
        {
          kind: 'upsert',
          session: {
            ...sessionAwaiting,
            state: 'finished',
            stateSinceMs: 0,
            task: 'All checks pass — 1247 passing',
          },
        },
        // finished → ended
        {
          kind: 'upsert',
          session: {
            ...sessionAwaiting,
            state: 'ended',
            stateSinceMs: 10_000,
            lastEventMs: 10_000,
          },
        },
      ],
      deltaIntervalMs: 1200,
    },
  },
};
