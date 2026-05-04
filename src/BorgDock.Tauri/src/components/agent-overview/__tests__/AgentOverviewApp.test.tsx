import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionRecord, SessionState } from '@/services/agent-overview-types';

// Mutable so each test can install its own session list before render.
let mockSessions: SessionRecord[] = [];

// Stub the Tauri-coupled hook so the component renders deterministic data
// in jsdom. The hook normally subscribes to Tauri events / invokes commands;
// neither exists in tests.
vi.mock('@/hooks/useAgentSessions', () => ({
  useAgentSessions: () => mockSessions,
}));

// Stub Tauri webviewWindow used by Titlebar's window controls.
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

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
    stateSinceMs: 1_000,
    lastEventMs: 1_000,
    lastUserMsg: 'do something',
    lastAssistantMsg: null,
    task: 'Reading Foo.cs',
    model: 'claude-opus-4-7',
    tokensUsed: 1_000,
    tokensMax: 200_000,
    lastApiStopReason: null,
    ...overrides,
  };
}

const LIVE_SESSIONS: SessionRecord[] = [
  rec('s1', 'FSP-Horizon', 'working'),
  rec('s2', 'BorgDock', 'finished'),
];

beforeEach(() => {
  mockSessions = LIVE_SESSIONS;
});

// Import AFTER the mocks are registered.
const { AgentOverviewApp } = await import('../AgentOverviewApp');

describe('AgentOverviewApp grouping toggle', () => {
  it('renders RepoGrouped sections by default and swaps to StatusGrouped when toggled', () => {
    const { container } = render(<AgentOverviewApp />);
    // RepoGrouped renders a per-worktree subheader containing ⎇; StatusGrouped does not.
    const initial = container.textContent ?? '';
    expect(initial).toContain('FSP-Horizon');
    expect(initial).toContain('⎇');

    fireEvent.click(screen.getByRole('button', { name: 'Status' }));

    const after = container.textContent ?? '';
    // StatusGrouped sections are present (state labels), worktree subheaders are gone.
    expect(after).not.toContain('⎇');
    expect(after).toContain('Working');
    expect(after).toContain('Just finished');
  });
});

describe('AgentOverviewApp density toggle', () => {
  it('switches from auto-roomy AgentCard to AgentTile when Wall is clicked', () => {
    const { container } = render(<AgentOverviewApp />);
    // In Roomy/Auto mode the cards use the .ag-card class.
    expect(container.querySelectorAll('.ag-card').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.ag-tile').length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Wall' }));
    // Wall mode should render AgentTile (.ag-tile) instead.
    expect(container.querySelectorAll('.ag-tile').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.ag-card').length).toBe(0);
  });
});

/// When every session is idle/ended the user still wants real cards (not just
/// the thin idle-rail strip), and the grouping/density toggles must affect
/// what's on screen. Without this, switching toggles becomes a no-op and the
/// dashboard looks broken.
describe('AgentOverviewApp all-idle state', () => {
  beforeEach(() => {
    mockSessions = [
      rec('s1', 'FSP-Horizon', 'idle'),
      rec('s2', 'BorgDock', 'ended'),
    ];
  });

  it('renders idle sessions as full cards when no live sessions exist', () => {
    const { container } = render(<AgentOverviewApp />);
    // RepoGrouped should show real AgentCards for the idle sessions, not just
    // the compact .ag-side-row IdleRail strip.
    expect(container.querySelectorAll('.ag-card').length).toBeGreaterThan(0);
    // Repo headers from RepoGrouped are present.
    expect(container.textContent ?? '').toContain('FSP-Horizon');
  });

  it('responds to grouping toggle when all sessions are idle', () => {
    const { container } = render(<AgentOverviewApp />);
    expect(container.textContent ?? '').toContain('⎇'); // RepoGrouped subheader

    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(container.textContent ?? '').not.toContain('⎇');
  });

  it('responds to density toggle when all sessions are idle', () => {
    const { container } = render(<AgentOverviewApp />);
    expect(container.querySelectorAll('.ag-tile').length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Wall' }));
    expect(container.querySelectorAll('.ag-tile').length).toBeGreaterThan(0);
  });
});
