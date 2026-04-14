import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockSetTitle = vi.fn().mockResolvedValue(undefined);
const mockGetCurrentWindow = vi.fn(() => ({
  setTitle: mockSetTitle,
  listen: vi.fn(),
  show: vi.fn(),
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn().mockResolvedValue(false),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockGetCurrentWindow(),
}));

vi.mock('../PRDetailPanel', () => ({
  PRDetailPanel: ({ pr }: { pr: { pullRequest: { title: string; number: number } } }) => (
    <div data-testid="pr-detail-panel">
      Panel: {pr.pullRequest.title} #{pr.pullRequest.number}
    </div>
  ),
}));

vi.mock('@/components/shared/WindowTitleBar', () => ({
  WindowTitleBar: ({ title }: { title: string }) => (
    <div data-testid="window-title-bar">{title}</div>
  ),
}));

vi.mock('@/services/github/aggregate', () => ({
  aggregatePrWithChecks: (pr: unknown, checks: unknown) => ({
    pullRequest: pr,
    checks,
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  }),
}));

vi.mock('@/services/github/auth', () => ({
  getGitHubToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/services/github/checks', () => ({
  getCheckRunsForRef: vi.fn().mockResolvedValue([]),
}));

const mockInitClient = vi.fn(() => ({ markPollStart: vi.fn() }));

vi.mock('@/services/github/singleton', () => ({
  initClient: (...args: unknown[]) => mockInitClient(...args),
}));

vi.mock('@/services/github/pulls', () => ({
  getOpenPRs: vi.fn().mockResolvedValue([]),
}));

import { PRDetailApp } from '../PRDetailApp';

const mockPr = {
  number: 42,
  title: 'Test PR',
  headRef: 'feature',
  baseRef: 'main',
  authorLogin: 'dev',
  authorAvatarUrl: '',
  state: 'open',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  isDraft: false,
  mergeable: true,
  htmlUrl: 'https://github.com/owner/repo/pull/42',
  body: '',
  repoOwner: 'owner',
  repoName: 'repo',
  reviewStatus: 'none',
  commentCount: 0,
  labels: [],
  additions: 0,
  deletions: 0,
  changedFiles: 0,
  commitCount: 0,
  requestedReviewers: [],
};

describe('PRDetailApp', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset URL to have no params by default
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '' },
    });
  });

  it('shows error when missing PR parameters', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '' },
    });

    render(<PRDetailApp />);
    await waitFor(() => {
      expect(screen.getByText('Missing PR parameters (owner, repo, number)')).toBeTruthy();
    });
  });

  it('shows loading spinner initially when params are provided', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?owner=test&repo=app&number=42' },
    });

    mockInvoke.mockImplementation(() => new Promise(() => {})); // never resolves

    render(<PRDetailApp />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('shows title bar with generic PR number when loading', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?owner=test&repo=app&number=42' },
    });

    mockInvoke.mockImplementation(() => new Promise(() => {}));

    render(<PRDetailApp />);
    expect(screen.getByText('PR #42')).toBeTruthy();
  });

  it('shows error when PR is not found', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?owner=test&repo=app&number=99' },
    });

    mockInvoke.mockResolvedValue({
      gitHub: { personalAccessToken: 'pat' },
      ui: { theme: 'light' },
    });

    const { getOpenPRs } = await import('@/services/github/pulls');
    (getOpenPRs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(<PRDetailApp />);
    await waitFor(() => {
      expect(screen.getByText('PR #99 not found in test/app')).toBeTruthy();
    });
  });

  it('renders PRDetailPanel when PR is loaded', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?owner=owner&repo=repo&number=42' },
    });

    mockInvoke.mockResolvedValue({
      gitHub: { personalAccessToken: 'pat' },
      ui: { theme: 'light' },
    });

    const { getOpenPRs } = await import('@/services/github/pulls');
    (getOpenPRs as ReturnType<typeof vi.fn>).mockResolvedValue([mockPr]);

    render(<PRDetailApp />);
    await waitFor(() => {
      expect(screen.getByTestId('pr-detail-panel')).toBeTruthy();
    });
    expect(mockInitClient).toHaveBeenCalledWith(expect.any(Function));
  });

  it('shows generic "Pull Request" title when no number', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?owner=&repo=&number=' },
    });

    render(<PRDetailApp />);
    await waitFor(() => {
      expect(screen.getByText('Pull Request')).toBeTruthy();
    });
  });

  it('shows error when loading fails', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?owner=test&repo=app&number=1' },
    });

    mockInvoke.mockRejectedValue(new Error('Network error'));

    render(<PRDetailApp />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load pull request')).toBeTruthy();
    });
  });
});
