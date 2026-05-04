import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionRecord, SessionState } from '@/services/agent-overview-types';
import { ARCHIVE_CUTOFF_MS } from '@/services/agent-overview';

let mockSessions: SessionRecord[] = [];

vi.mock('@/hooks/useAgentSessions', () => ({
  useAgentSessions: () => mockSessions,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock('rehype-sanitize', () => ({ default: () => null }));
vi.mock('remark-gfm', () => ({ default: () => null }));

function rec(
  sessionId: string,
  repo: string,
  state: SessionState,
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    sessionId,
    cwd: `/x/${repo}`,
    repo,
    worktree: 'master',
    branch: 'master',
    label: `${repo[0]}${repo[1] ?? ''} · master #1`,
    state,
    stateSinceMs: 30_000,
    lastEventMs: 30_000,
    lastUserMsg: 'do something',
    lastAssistantMsg: null,
    task: 'Reading Foo.cs',
    model: 'claude-opus-4-7',
    tokensUsed: 1_000,
    tokensMax: 200_000,
    lastApiStopReason: null,
    currentTurnFiles: [],
    snoozedUntilMs: null,
    seenAtMs: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockSessions = [
    rec('s1', 'FSP-Horizon', 'working'),
    rec('s2', 'BorgDock', 'finished'),
  ];
});

const { AgentOverviewApp } = await import('../AgentOverviewApp');

describe('AgentOverviewApp grouping dropdown', () => {
  it('renders RepoGrouped by default and switches when grouping changes', () => {
    const { container } = render(<AgentOverviewApp />);
    // RepoGrouped renders worktree subheaders ("⎇"); StatusGrouped does not.
    expect(container.textContent ?? '').toContain('⎇');

    const select = screen.getByLabelText('Grouping') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'status' } });
    expect(container.textContent ?? '').not.toContain('⎇');
    // StatusGrouped uses STATE_DEFS labels.
    expect(container.textContent ?? '').toContain('Working');
  });

  it('exposes all five grouping modes', () => {
    render(<AgentOverviewApp />);
    const select = screen.getByLabelText('Grouping') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['repo', 'status', 'worktree', 'context', 'activity']);
  });
});

describe('AgentOverviewApp titlebar oldest-age pill', () => {
  it('shows the pill only when at least one session is awaiting', () => {
    mockSessions = [rec('s1', 'BorgDock', 'working', { stateSinceMs: 60_000 })];
    const { rerender } = render(<AgentOverviewApp />);
    expect(screen.queryByTestId('titlebar-oldest-age')).toBeNull();

    mockSessions = [rec('s1', 'BorgDock', 'awaiting', { stateSinceMs: 60_000 })];
    rerender(<AgentOverviewApp />);
    expect(screen.getByTestId('titlebar-oldest-age')).toBeInTheDocument();
  });

  it('uses the alert tier (red+bold) when oldest awaiting is >= 10m', () => {
    mockSessions = [rec('s1', 'BorgDock', 'awaiting', { stateSinceMs: 11 * 60_000 })];
    render(<AgentOverviewApp />);
    const pill = screen.getByTestId('titlebar-oldest-age');
    expect(pill.className).toContain('ag-tb-alert--alert');
  });
});

describe('AgentOverviewApp auto-archive', () => {
  beforeEach(() => {
    mockSessions = [
      rec('live', 'BorgDock', 'working'),
      // Past the 24h cutoff — archived by default.
      rec('old', 'FSP-Horizon', 'idle', { lastEventMs: ARCHIVE_CUTOFF_MS + 60_000 }),
    ];
  });

  it('hides archived sessions by default and exposes a toggle in the statusbar', () => {
    const { container } = render(<AgentOverviewApp />);
    // The archived idle session has lastEventMs > 24h, so its row in the
    // IdleRail prints "24h ago" — present iff the row is rendered.
    expect(container.textContent ?? '').not.toContain('24h ago');
    expect(screen.getByTestId('statusbar-archived-toggle')).toHaveTextContent('1 archived');

    fireEvent.click(screen.getByTestId('statusbar-archived-toggle'));
    expect(container.textContent ?? '').toContain('24h ago');
    expect(screen.getByTestId('statusbar-archived-toggle')).toHaveTextContent('hide 1 archived');
  });
});

describe('AgentOverviewApp snooze + mark-seen', () => {
  it('snoozed awaiting sessions vanish from rail and titlebar count', () => {
    mockSessions = [
      rec('a', 'BorgDock', 'awaiting', { stateSinceMs: 60_000, snoozedUntilMs: Date.now() + 60_000 }),
      rec('b', 'BorgDock', 'awaiting', { stateSinceMs: 120_000 }),
    ];
    render(<AgentOverviewApp />);
    const pill = screen.queryByTestId('titlebar-oldest-age');
    expect(pill?.textContent).toMatch(/1 awaiting/);
  });

  it('mark-seen sessions stay visible but get the seen class', () => {
    mockSessions = [
      rec('a', 'BorgDock', 'working', {
        stateSinceMs: 60_000,
        seenAtMs: Date.now(),
      }),
    ];
    const { container } = render(<AgentOverviewApp />);
    expect(container.querySelector('.ag-card--seen')).not.toBeNull();
  });
});
