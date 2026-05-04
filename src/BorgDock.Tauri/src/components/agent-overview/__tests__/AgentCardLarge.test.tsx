import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '@/services/agent-overview-types';
import { AgentCardLarge } from '../AgentCardLarge';

// react-markdown calls into ESM that vitest doesn't transform out of the box.
// Mocking it keeps these tests focused on the popover wiring, not markdown
// internals (those are exercised in QuickReviewCard tests).
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));
vi.mock('rehype-sanitize', () => ({ default: () => null }));
vi.mock('remark-gfm', () => ({ default: () => null }));

const invokeMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function makeAgent(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 's1',
    cwd: '/x',
    repo: 'FSP-Horizon',
    worktree: 'master',
    branch: 'main',
    label: 'FH · master #3',
    state: 'awaiting',
    stateSinceMs: 1_000,
    lastEventMs: 1_000,
    lastUserMsg: 'C',
    lastAssistantMsg: 'Question 7 of ~8 — Concurrency\n\nThree things write to Routes…',
    task: null,
    model: 'claude-opus-4-7',
    tokensUsed: 0,
    tokensMax: 200_000,
    lastApiStopReason: null,
    ...overrides,
  };
}

describe('AgentCardLarge', () => {
  it('renders the user reply ABOVE the assistant preview', () => {
    const { container } = render(<AgentCardLarge agent={makeAgent()} />);
    const userReply = container.querySelector('[data-testid="agent-card-user-reply"]') as HTMLElement;
    const assistantPreview = container.querySelector(
      '[data-testid="agent-card-assistant-preview"]',
    ) as HTMLElement;
    expect(userReply).not.toBeNull();
    expect(assistantPreview).not.toBeNull();
    // DOM order is the layout order — user reply must come first.
    const order = userReply.compareDocumentPosition(assistantPreview);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a markdown popover on hover with the full assistant message', () => {
    render(<AgentCardLarge agent={makeAgent()} />);
    // No popover visible initially.
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(screen.getByTestId('agent-card-assistant-preview'));
    const popover = screen.getByRole('tooltip');
    // Markdown is mocked to a passthrough; the FULL text (which the truncated
    // preview would clip at 4 lines) must be present inside the popover.
    expect(within(popover).getByTestId('markdown').textContent).toContain(
      'Question 7 of ~8 — Concurrency',
    );
    expect(within(popover).getByTestId('markdown').textContent).toContain('Three things write to Routes');
  });

  it('renders a dismiss button that invokes dismiss_agent_session with the session id', () => {
    invokeMock.mockClear();
    render(<AgentCardLarge agent={makeAgent({ sessionId: 'sid-42' })} />);
    const btn = screen.getByTestId('dismiss-button');
    fireEvent.click(btn);
    expect(invokeMock).toHaveBeenCalledWith('dismiss_agent_session', { sessionId: 'sid-42' });
  });

  it('falls back gracefully when no assistant message is present', () => {
    const { container } = render(
      <AgentCardLarge agent={makeAgent({ lastAssistantMsg: null })} />,
    );
    expect(container.querySelector('[data-testid="agent-card-assistant-preview"]')).toBeNull();
    // User reply still renders.
    expect(container.querySelector('[data-testid="agent-card-user-reply"]')).not.toBeNull();
  });
});
