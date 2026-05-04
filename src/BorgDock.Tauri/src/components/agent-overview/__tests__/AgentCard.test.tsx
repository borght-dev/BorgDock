import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '@/services/agent-overview-types';
import type { InspectorState } from '@/hooks/useInspectorState';
import { AgentCard } from '../AgentCard';
import { InspectorContext } from '../InspectorContext';

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('rehype-sanitize', () => ({ default: () => null }));
vi.mock('remark-gfm', () => ({ default: () => null }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

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
  lastAssistantMsg: null,
  task: 'Reading foo.ts',
  model: 'claude-sonnet-4-6',
  tokensUsed: 64_000,
  tokensMax: 200_000,
  lastApiStopReason: null,
  currentTurnFiles: [],
  snoozedUntilMs: null,
  seenAtMs: null,
};

function fakeInspector(): InspectorState {
  return {
    hoveredSessionId: null, pinnedSessionId: null, focusedSessionId: null, openSessionId: null,
    onCardEnter: () => {}, onCardLeave: () => {}, onPopoverEnter: () => {}, onPopoverLeave: () => {},
    onCardClick: () => {}, togglePin: () => {}, unpin: () => {}, cycleFocus: () => {}, closeAll: () => {},
  };
}

function renderCard(agent: SessionRecord) {
  return render(
    <InspectorContext.Provider value={fakeInspector()}>
      <AgentCard agent={agent} />
    </InspectorContext.Provider>,
  );
}

describe('AgentCard', () => {
  it.each([['awaiting'], ['working'], ['tool'], ['finished'], ['idle']] as const)(
    'renders %s without throwing',
    (state) => {
      const { container } = renderCard({ ...base, state });
      expect(container.firstChild).toBeTruthy();
    },
  );

  it('uses task as the hero line', () => {
    renderCard(base);
    expect(screen.getByTestId('agent-card-hero')).toHaveTextContent('Reading foo.ts');
  });

  it('falls back to lastAssistantMsg as the hero when task is missing', () => {
    renderCard({ ...base, task: null, lastAssistantMsg: 'Question: which approach?' });
    expect(screen.getByTestId('agent-card-hero')).toHaveTextContent('Question: which approach?');
  });

  it('renders the user message as a faint italic "re:" breadcrumb', () => {
    renderCard(base);
    const crumb = screen.getByTestId('agent-card-breadcrumb');
    expect(crumb).toHaveTextContent('re: Refactor the foo bar baz');
  });

  it('marching ants only for tool state', () => {
    const { container, rerender } = renderCard({ ...base, state: 'tool' });
    expect(container.querySelector('.bd-ants--left')).toBeTruthy();
    rerender(
      <InspectorContext.Provider value={fakeInspector()}>
        <AgentCard agent={{ ...base, state: 'working' }} />
      </InspectorContext.Provider>,
    );
    expect(container.querySelector('.bd-ants--left')).toBeFalsy();
  });

  it('hides the time-since label for sessions younger than 5s', () => {
    const { rerender, container } = renderCard({ ...base, stateSinceMs: 1_000 });
    expect(container.querySelector('[data-testid="agent-card-time"]')).toBeNull();
    rerender(
      <InspectorContext.Provider value={fakeInspector()}>
        <AgentCard agent={{ ...base, stateSinceMs: 30_000 }} />
      </InspectorContext.Provider>,
    );
    expect(container.querySelector('[data-testid="agent-card-time"]')).not.toBeNull();
  });

  it('applies the warn tier color when stateSinceMs >= 3m', () => {
    const { container } = renderCard({ ...base, stateSinceMs: 3 * 60_000 + 1_000 });
    const time = container.querySelector('[data-testid="agent-card-time"]');
    expect(time?.className).toContain('ag-time--warn');
  });
});
