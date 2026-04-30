import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '@/services/agent-overview-types';
import { AgentCard } from '../AgentCard';

const base: SessionRecord = {
  sessionId: 'sid',
  cwd: '/x',
  repo: 'BorgDock',
  worktree: 'master',
  branch: 'master',
  label: 'BD · master #1',
  state: 'working',
  stateSinceMs: 9_000,
  lastEventMs: 1_000,
  lastUserMsg: 'Refactor the foo bar baz',
  task: 'Reading foo.ts',
  model: 'claude-sonnet-4-6',
  tokensUsed: 64_000,
  tokensMax: 200_000,
  lastApiStopReason: null,
};

describe('AgentCard', () => {
  it.each([['awaiting'], ['working'], ['tool'], ['finished'], ['idle']] as const)(
    'renders %s without throwing',
    (state) => {
      const { container } = render(<AgentCard agent={{ ...base, state }} />);
      expect(container.firstChild).toBeTruthy();
    },
  );

  it('shows quoted last user msg', () => {
    render(<AgentCard agent={base} />);
    expect(screen.getByText(/Refactor the foo bar baz/)).toBeInTheDocument();
  });

  it('marching ants only for tool state', () => {
    const { container, rerender } = render(<AgentCard agent={{ ...base, state: 'tool' }} />);
    expect(container.querySelector('.bd-ants')).toBeTruthy();
    rerender(<AgentCard agent={{ ...base, state: 'working' }} />);
    expect(container.querySelector('.bd-ants')).toBeFalsy();
  });
});
