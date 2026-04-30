import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '@/services/agent-overview-types';
import { AwaitingRail } from '../AwaitingRail';

function rec(id: string, msAgo: number): SessionRecord {
  return {
    sessionId: id,
    cwd: '/x',
    repo: 'BorgDock',
    worktree: 'master',
    branch: 'master',
    label: `BD · master #${id}`,
    state: 'awaiting',
    stateSinceMs: msAgo,
    lastEventMs: msAgo,
    lastUserMsg: 'msg',
    task: 'Wants confirmation',
    model: 'claude-sonnet-4-6',
    tokensUsed: 0,
    tokensMax: 200_000,
    lastApiStopReason: 'end_turn',
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
});
