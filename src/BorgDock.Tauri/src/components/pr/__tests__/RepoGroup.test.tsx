import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { RepoGroup } from '../RepoGroup';

afterEach(cleanup);

// Mock Tauri APIs used transitively by PrCardContainer
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

// Track collapsed state so toggle works across re-renders
const collapsed = new Set<string>();

vi.mock('@/stores/ui-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    const state: Record<string, unknown> = {
      expandedRepoGroups: collapsed,
      toggleRepoGroup: (key: string) => {
        if (collapsed.has(key)) collapsed.delete(key);
        else collapsed.add(key);
      },
      selectedPrNumber: null,
      selectPr: vi.fn(),
      togglePrExpanded: vi.fn(),
      expandedPrNumbers: new Set<number>(),
      worktreeBranchMap: new Map(),
    };
    return selector(state);
  });
  return { useUiStore: fn };
});

vi.mock('@/stores/pr-store', () => {
  const fn = vi.fn() as unknown as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> };
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({ username: 'testuser' });
  });
  fn.getState = vi.fn(() => ({ getReviewRequestedAt: vi.fn() }));
  return { usePrStore: fn };
});

vi.mock('@/stores/notification-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({ show: vi.fn() });
  });
  return { useNotificationStore: fn };
});

vi.mock('@/stores/settings-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({ settings: { repos: [] } });
  });
  return { useSettingsStore: fn };
});

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn(),
    monitorPr: vi.fn(),
    resolveConflicts: vi.fn(),
  }),
}));

vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => null),
}));

vi.mock('@/services/work-item-linker', () => ({
  detectWorkItemIds: vi.fn(() => []),
}));

function makePr(
  number: number,
  status: 'green' | 'red' | 'yellow' | 'gray' = 'green',
): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR #${number}`,
      headRef: `feature/pr-${number}`,
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: `https://github.com/test/repo/pull/${number}`,
      body: '',
      repoOwner: 'test',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: status,
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  };
}

describe('RepoGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collapsed.clear();
  });

  it('renders the repo key in the header', () => {
    const { container } = render(<RepoGroup repoKey="test/repo" prs={[makePr(1)]} />);
    // The header is the only <button> at this layer; PR cards use a div interactively.
    const header = container.querySelector('button');
    expect(header?.textContent).toContain('test/repo');
  });

  it('shows the PR count badge', () => {
    render(<RepoGroup repoKey="test/repo" prs={[makePr(1), makePr(2)]} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders PR cards for each PR', () => {
    render(<RepoGroup repoKey="test/repo" prs={[makePr(1), makePr(2)]} />);
    expect(screen.getByText('PR #1')).toBeInTheDocument();
    expect(screen.getByText('PR #2')).toBeInTheDocument();
  });

  it('shows failing count badge when PRs are failing', () => {
    const { container } = render(
      <RepoGroup
        repoKey="test/repo"
        prs={[makePr(1, 'red'), makePr(2, 'red'), makePr(3, 'green')]}
      />,
    );
    const headerButton = container.querySelector('button')!;
    const badges = headerButton.querySelectorAll('[class*="tabular-nums"]');
    // Should have 2 badges in header: failing count and total count
    expect(badges.length).toBe(2);
  });

  it('does not show failing badge when no PRs are failing', () => {
    const { container } = render(<RepoGroup repoKey="test/repo" prs={[makePr(1, 'green')]} />);
    // Only one badge: the count Pill. No failing badge.
    const headerButton = container.querySelector('button')!;
    const badges = headerButton.querySelectorAll('[class*="tabular-nums"]');
    expect(badges).toHaveLength(1);
  });

  it('has a clickable header button', () => {
    const { container } = render(<RepoGroup repoKey="test/repo" prs={[makePr(1)]} />);
    const header = container.querySelector('button');
    expect(header).toBeInTheDocument();
    // Click should not throw
    fireEvent.click(header!);
  });
});
