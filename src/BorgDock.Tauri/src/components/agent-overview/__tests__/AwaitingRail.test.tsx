import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '@/services/agent-overview-types';
import { AwaitingRail } from '../AwaitingRail';

function rec(id: string, msAgo: number, repo = 'BorgDock'): SessionRecord {
  return {
    sessionId: id,
    cwd: '/x',
    repo,
    worktree: 'master',
    branch: 'master',
    label: `${repo[0]}${repo[1] ?? ''} · master #${id}`,
    state: 'awaiting',
    stateSinceMs: msAgo,
    lastEventMs: msAgo,
    lastUserMsg: 'msg',
    lastAssistantMsg: null,
    task: 'Wants confirmation',
    model: 'claude-sonnet-4-6',
    tokensUsed: 0,
    tokensMax: 200_000,
    lastApiStopReason: 'end_turn',
    currentTurnFiles: [],
    snoozedUntilMs: null,
    seenAtMs: null,
  };
}

describe('AwaitingRail', () => {
  it('renders the count and oldest-since', () => {
    const agents = [rec('1', 60_000), rec('2', 240_000)];
    render(<AwaitingRail agents={agents} density="standard" />);
    expect(screen.getByText(/2 sessions waiting on you/)).toBeInTheDocument();
    expect(screen.getByText(/oldest 4m ago/)).toBeInTheDocument();
  });

  it('renders nothing when there are no agents', () => {
    const { container } = render(<AwaitingRail agents={[]} density="standard" />);
    expect(container.firstChild).toBeNull();
  });

  it('groups awaiting sessions by repo so each repo gets its own header', () => {
    const agents = [
      rec('a', 60_000, 'FSP-Horizon'),
      rec('b', 90_000, 'FSP-Horizon'),
      rec('c', 120_000, 'FSP-3'),
    ];
    const { container } = render(<AwaitingRail agents={agents} density="standard" />);
    const text = container.textContent ?? '';
    // Both repo names appear as section headers under the rail's "needs you" banner.
    expect(text).toContain('FSP-Horizon');
    expect(text).toContain('FSP-3');
    // The total banner still shows the global count.
    expect(text).toContain('3 sessions waiting on you');
  });

  it('keeps cards from the same repo together', () => {
    const agents = [
      rec('a', 60_000, 'BorgDock'),
      rec('b', 90_000, 'BorgDock'),
    ];
    const { container } = render(<AwaitingRail agents={agents} density="standard" />);
    // One repo header (we look for the visible name once).
    const occurrences = (container.textContent ?? '').match(/BorgDock/g)?.length ?? 0;
    // Banner doesn't say BorgDock, only the repo header should — exactly 1 match.
    expect(occurrences).toBe(1);
  });
});
