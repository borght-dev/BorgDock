import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestCommit } from '@/types';

const mockGetClient = vi.fn();
const mockGetPRCommits = vi.fn();

vi.mock('@/services/github/singleton', () => ({
  getClient: () => mockGetClient(),
}));

vi.mock('@/services/github', () => ({
  getPRCommits: (...args: unknown[]) => mockGetPRCommits(...args),
}));

vi.mock('@/services/cache', () => ({
  loadTabData: vi.fn().mockResolvedValue(null),
  saveTabData: vi.fn().mockResolvedValue(undefined),
}));

import { CommitsTab } from '../CommitsTab';

function makeCommit(overrides: Partial<PullRequestCommit> = {}): PullRequestCommit {
  return {
    sha: 'abc1234567890def',
    message: 'feat: add new feature\n\nDetailed description',
    authorLogin: 'developer',
    authorAvatarUrl: '',
    date: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('CommitsTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockReturnValue({});
  });

  it('shows loading skeleton initially', () => {
    mockGetPRCommits.mockImplementation(() => new Promise(() => {}));
    const { container } = render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it('shows empty state when no commits', async () => {
    mockGetPRCommits.mockResolvedValue([]);
    render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No commits found.')).toBeTruthy();
    });
  });

  it('renders commit messages (first line only)', async () => {
    mockGetPRCommits.mockResolvedValue([
      makeCommit({ sha: 'abc1234', message: 'feat: add login\n\nMore details' }),
    ]);
    render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('feat: add login')).toBeTruthy();
    });
  });

  it('renders short SHA (first 7 chars)', async () => {
    mockGetPRCommits.mockResolvedValue([makeCommit({ sha: 'abc1234567890def' })]);
    render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('abc1234')).toBeTruthy();
    });
  });

  it('renders author login', async () => {
    mockGetPRCommits.mockResolvedValue([makeCommit({ authorLogin: 'alice' })]);
    render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/alice/)).toBeTruthy();
    });
  });

  it('renders multiple commits', async () => {
    mockGetPRCommits.mockResolvedValue([
      makeCommit({ sha: 'aaa1111', message: 'First commit' }),
      makeCommit({ sha: 'bbb2222', message: 'Second commit' }),
      makeCommit({ sha: 'ccc3333', message: 'Third commit' }),
    ]);
    render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('First commit')).toBeTruthy();
      expect(screen.getByText('Second commit')).toBeTruthy();
      expect(screen.getByText('Third commit')).toBeTruthy();
    });
  });

  it('handles error gracefully', async () => {
    mockGetPRCommits.mockRejectedValue(new Error('API error'));
    render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    // useCachedTabData catches the error internally; component shows empty state
    await waitFor(() => {
      expect(screen.getByText('No commits found.')).toBeTruthy();
    });
  });

  it('passes correct params to getPRCommits', async () => {
    mockGetPRCommits.mockResolvedValue([]);
    render(
      <CommitsTab
        prNumber={42}
        repoOwner="myorg"
        repoName="myrepo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    await waitFor(() => {
      expect(mockGetPRCommits).toHaveBeenCalledWith(expect.anything(), 'myorg', 'myrepo', 42);
    });
  });

  it('handles null client gracefully', async () => {
    mockGetClient.mockReturnValue(null);
    render(
      <CommitsTab
        prNumber={1}
        repoOwner="owner"
        repoName="repo"
        prUpdatedAt="2024-01-01T00:00:00Z"
      />,
    );
    // fetchFn throws, useCachedTabData catches it; component shows empty state
    await waitFor(() => {
      expect(screen.getByText('No commits found.')).toBeTruthy();
    });
  });
});
