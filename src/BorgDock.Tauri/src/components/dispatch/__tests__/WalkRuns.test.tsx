import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeItem, makeThread } from '@/services/dispatch/__tests__/fixtures';
import { buildOverview } from '@/services/dispatch/engine';
import { type AgentRun, useDispatchStore } from '@/stores/dispatch-store';
import { RunCard } from '../WalkRuns';

const run: AgentRun = {
  threadId: 'batch',
  kind: 'sync',
  scope: 'drift',
  states: ['Code Review'],
  itemIds: [1, 2],
  fromStates: { 1: 'Code Review', 2: 'Code Review' },
  slot: 'W7',
  startedAt: '2026-10-19T10:00:00Z',
};

describe('RunCard progress', () => {
  it('marks moves unverified when ADO failed, then shows the refreshed count', () => {
    const overview = buildOverview({
      items: [makeItem({ id: 1, state: 'Code Review' }), makeItem({ id: 2, state: 'Code Review' })],
      threads: [],
      projects: [],
      pullRequests: [],
      queued: new Set(),
      hiddenSuggestions: new Set(),
      manualLinks: new Map(),
      slotPattern: null,
    }).overview;
    useDispatchStore.setState({
      overview,
      threads: [makeThread({ id: 'batch', status: 'your-turn', lastAgentMessage: 'Done' })],
      ado: { ok: false, at: '2026-10-19T09:00:00Z', error: 'Sign-in expired' },
    });
    const { rerender } = render(<RunCard run={run} />);
    expect(screen.getByText(/Moves unverified/)).toBeInTheDocument();
    expect(screen.queryByText(/0 of 2 moved/)).not.toBeInTheDocument();
    act(() =>
      useDispatchStore.setState({
        overview: { ...overview, items: [] },
        ado: { ok: true, at: '2026-10-19T10:15:00Z', error: null },
      }),
    );
    rerender(<RunCard run={run} />);
    expect(screen.getByText(/2 of 2 moved/)).toBeInTheDocument();
  });

  it('waits for an ADO read after the agent stopped before counting missing items as moved', () => {
    useDispatchStore.setState({
      overview: null,
      threads: [
        makeThread({ id: 'batch', status: 'your-turn', lastActivityAt: '2026-10-19T10:10:00Z' }),
      ],
      ado: { ok: true, at: '2026-10-19T10:05:00Z', error: null },
    });
    render(<RunCard run={run} />);
    expect(screen.getByText(/Checking moves in ADO/)).toBeInTheDocument();
    expect(screen.queryByText(/2 of 2 moved/)).not.toBeInTheDocument();
  });
});
