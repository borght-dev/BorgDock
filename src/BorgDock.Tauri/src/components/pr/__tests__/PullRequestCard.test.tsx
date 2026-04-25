import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { PullRequestCard } from '../PullRequestCard';

afterEach(cleanup);

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

// Mock services
vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => ({ graphql: vi.fn() })),
}));

vi.mock('@/services/github/checks', () => ({
  rerunWorkflow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/github/mutations', () => ({
  mergePullRequest: vi.fn().mockResolvedValue(undefined),
  closePullRequest: vi.fn().mockResolvedValue(undefined),
  toggleDraft: vi.fn().mockResolvedValue(undefined),
  bypassMergePullRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/work-item-linker', () => ({
  detectWorkItemIds: vi.fn(() => []),
}));

// Mock hooks
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn().mockResolvedValue(undefined),
    monitorPr: vi.fn().mockResolvedValue(undefined),
    resolveConflicts: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock stores
let uiState: Record<string, unknown> = {};

vi.mock('@/stores/ui-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
    selector(uiState),
  );
  return { useUiStore: fn };
});

vi.mock('@/stores/pr-store', () => {
  const fn = vi.fn() as unknown as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> };
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    return selector({ username: 'testuser' });
  });
  fn.getState = vi.fn(() => ({}));
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
    return selector({
      settings: {
        repos: [{ owner: 'test', name: 'repo', worktreeBasePath: '/code/repo' }],
      },
    });
  });
  return { useSettingsStore: fn };
});

// Mock child components that are complex
vi.mock('@/components/pr-detail/MergeReadinessChecklist', () => ({
  MergeReadinessChecklist: () => <div data-testid="merge-checklist" />,
}));

vi.mock('@/components/focus/PriorityReasonLabel', () => ({
  PriorityReasonLabel: ({ factors }: { factors: unknown[] }) => (
    <div data-testid="priority-reason">{factors.length} factors</div>
  ),
}));

vi.mock('@/components/pr-detail/LinkedWorkItemBadge', () => ({
  LinkedWorkItemBadge: ({ workItemId }: { workItemId: number }) => (
    <span data-testid="work-item-badge">AB#{workItemId}</span>
  ),
}));

function makePr(overrides: Partial<PullRequestWithChecks> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'Add feature X',
      headRef: 'feature/x',
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/test/repo/pull/42',
      body: 'Some description',
      repoOwner: 'test',
      repoName: 'repo',
      reviewStatus: 'approved',
      commentCount: 3,
      labels: [],
      additions: 100,
      deletions: 20,
      changedFiles: 5,
      commitCount: 3,
      requestedReviewers: [],
      ...overrides.pullRequest,
    },
    checks: overrides.checks ?? [
      {
        id: 1,
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        htmlUrl: '',
        checkSuiteId: 1,
      },
    ],
    overallStatus: overrides.overallStatus ?? 'green',
    failedCheckNames: overrides.failedCheckNames ?? [],
    pendingCheckNames: overrides.pendingCheckNames ?? [],
    passedCount: overrides.passedCount ?? 1,
    skippedCount: overrides.skippedCount ?? 0,
  };
}

describe('PullRequestCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiState = {
      selectPr: vi.fn(),
      selectedPrNumber: null,
      togglePrExpanded: vi.fn(),
      expandedPrNumbers: new Set<number>(),
      worktreeBranchMap: new Map(),
    };
  });

  describe('basic rendering', () => {
    it('renders the PR title', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('Add feature X')).toBeInTheDocument();
    });

    it('renders the PR number', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      // PRCard primitive renders the number in both the meta row and the right column
      expect(screen.getAllByText('#42').length).toBeGreaterThan(0);
    });

    it('renders the branch name', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('feature/x')).toBeInTheDocument();
    });

    it('renders the author avatar initials', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('TE')).toBeInTheDocument();
    });

    it('renders additions and deletions', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('+100')).toBeInTheDocument();
    });

    it('renders commit count', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText(/3c/)).toBeInTheDocument();
    });

    it('renders the merge score badge', () => {
      const { container } = render(<PullRequestCard prWithChecks={makePr()} />);
      // Ring primitive carries `.bd-ring`; numeric value rendered inside
      expect(container.querySelector('.bd-ring')).toBeInTheDocument();
      expect(container.querySelector('.bd-ring__label')?.textContent).toBe('100');
    });

    it('renders the status indicator', () => {
      const { container } = render(<PullRequestCard prWithChecks={makePr()} />);
      // Dot primitive carries `.bd-dot--green` for green status
      expect(container.querySelector('.bd-dot--green')).toBeInTheDocument();
    });
  });

  describe('conditional badges', () => {
    it('shows draft badge when PR is draft', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { isDraft: true } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('draft')).toBeInTheDocument();
    });

    it('shows merged badge when PR has mergedAt', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: {
              mergedAt: '2024-01-02T00:00:00Z',
            } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('merged')).toBeInTheDocument();
    });

    it('shows closed badge when PR has closedAt but not mergedAt', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: {
              closedAt: '2024-01-02T00:00:00Z',
              state: 'closed',
            } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('closed')).toBeInTheDocument();
    });

    it('does not show closed badge when PR is merged', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: {
              mergedAt: '2024-01-02T00:00:00Z',
              closedAt: '2024-01-02T00:00:00Z',
            } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.queryByText('closed')).not.toBeInTheDocument();
      expect(screen.getByText('merged')).toBeInTheDocument();
    });

    it('shows conflicts badge when mergeable is false', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { mergeable: false } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('conflicts')).toBeInTheDocument();
    });

    it('shows in-progress badge when there are pending checks', () => {
      render(<PullRequestCard prWithChecks={makePr({ pendingCheckNames: ['lint'] })} />);
      expect(screen.getByText('in progress')).toBeInTheDocument();
    });

    it('shows worktree badge when branch has a worktree mapping', () => {
      uiState.worktreeBranchMap = new Map([
        ['feature/x', { fullPath: '/code/repo/slots/slot-1', slotName: 'slot-1' }],
      ]);
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('slot-1')).toBeInTheDocument();
    });
  });

  describe('labels and work items', () => {
    it('renders labels when present', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: {
              labels: ['bug', 'urgent'],
            } as unknown as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('urgent')).toBeInTheDocument();
    });

    it('renders work item badges when detectWorkItemIds returns ids', async () => {
      const { detectWorkItemIds } = await import('@/services/work-item-linker');
      (detectWorkItemIds as ReturnType<typeof vi.fn>).mockReturnValue([12345]);
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('AB#12345')).toBeInTheDocument();
    });
  });

  describe('focus mode', () => {
    it('shows the repo path on every PR card', () => {
      // PRCard primitive always renders repo in meta row, regardless of focus mode
      render(<PullRequestCard prWithChecks={makePr()} focusMode={true} />);
      expect(screen.getByText('test/repo')).toBeInTheDocument();
    });

    it('shows priority reason label when factors are provided in focus mode', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr()}
          focusMode={true}
          priorityFactors={[{ type: 'readyToMerge', points: 10, label: 'Ready to merge' }]}
        />,
      );
      expect(screen.getByTestId('priority-reason')).toBeInTheDocument();
    });

    it('does not render priority reason label when not in focus mode', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr()}
          priorityFactors={[{ type: 'readyToMerge', points: 10, label: 'Ready to merge' }]}
        />,
      );
      expect(screen.queryByTestId('priority-reason')).not.toBeInTheDocument();
    });
  });

  describe('click interactions', () => {
    it('calls selectPr when card is clicked', () => {
      const selectPr = vi.fn();
      uiState.selectPr = selectPr;
      render(<PullRequestCard prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Add feature X'));
      expect(selectPr).toHaveBeenCalledWith(42);
    });

    it('opens context menu on right click', () => {
      const { container } = render(<PullRequestCard prWithChecks={makePr()} />);
      // PRCard primitive renders an interactive Card div with .bd-pr-card class
      const card = container.querySelector('.bd-pr-card');
      expect(card).toBeInTheDocument();
      fireEvent.contextMenu(card!);
      expect(screen.getByText('Open in GitHub')).toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('shows "Open in Browser" button', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('Open in Browser')).toBeInTheDocument();
    });

    it('shows "Copy Branch" button', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('Copy Branch')).toBeInTheDocument();
    });

    it('shows "Monitor" button', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('Monitor')).toBeInTheDocument();
    });

    it('shows "Re-run" button when status is red and there is a failed check', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            overallStatus: 'red',
            checks: [
              {
                id: 1,
                name: 'build',
                status: 'completed',
                conclusion: 'failure',
                htmlUrl: '',
                checkSuiteId: 1,
              },
            ],
            failedCheckNames: ['build'],
          })}
        />,
      );
      expect(screen.getByText('Re-run')).toBeInTheDocument();
    });

    it('shows "Fix" button when status is red', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            overallStatus: 'red',
            failedCheckNames: ['build'],
          })}
        />,
      );
      expect(screen.getByText('Fix')).toBeInTheDocument();
    });

    it('does not show "Re-run" or "Fix" for green status', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.queryByText('Re-run')).not.toBeInTheDocument();
      expect(screen.queryByText('Fix')).not.toBeInTheDocument();
    });

    it('shows "Copy" button when there are failed checks', () => {
      render(<PullRequestCard prWithChecks={makePr({ failedCheckNames: ['build'] })} />);
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('shows "Merge" button when PR can be merged', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            overallStatus: 'green',
            pullRequest: { state: 'open', isDraft: false } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('Merge')).toBeInTheDocument();
    });

    it('does not show "Merge" for draft PRs', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            overallStatus: 'green',
            pullRequest: { state: 'open', isDraft: true } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.queryByText('Merge')).not.toBeInTheDocument();
    });

    it('shows "Resolve Conflicts" button when mergeable is false', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { mergeable: false } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('Resolve Conflicts')).toBeInTheDocument();
    });

    it('shows "Mark Draft" for non-draft open PRs', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { state: 'open', isDraft: false } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('Mark Draft')).toBeInTheDocument();
    });

    it('shows "Mark Ready" for draft open PRs', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { state: 'open', isDraft: true } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('Mark Ready')).toBeInTheDocument();
    });

    it('shows "Close PR" and "Bypass Merge" for open PRs', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { state: 'open' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('Close PR')).toBeInTheDocument();
      expect(screen.getByText('Bypass Merge')).toBeInTheDocument();
    });

    it('does not show open-only buttons for closed PRs', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { state: 'closed' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.queryByText('Close PR')).not.toBeInTheDocument();
      expect(screen.queryByText('Bypass Merge')).not.toBeInTheDocument();
      expect(screen.queryByText('Mark Draft')).not.toBeInTheDocument();
    });

    it('shows "Checkout" button when repo has worktreeBasePath', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('Checkout')).toBeInTheDocument();
    });
  });

  describe('button click handlers', () => {
    it('calls openUrl when "Open in Browser" is clicked', async () => {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      render(<PullRequestCard prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Open in Browser'));
      expect(openUrl).toHaveBeenCalledWith('https://github.com/test/repo/pull/42');
    });

    it('calls writeText when "Copy Branch" is clicked', async () => {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      render(<PullRequestCard prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Copy Branch'));
      expect(writeText).toHaveBeenCalledWith('feature/x');
    });

    it('calls invoke for checkout when "Checkout" is clicked', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      render(<PullRequestCard prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Checkout'));
      expect(invoke).toHaveBeenCalledWith('git_fetch', {
        repoPath: '/code/repo',
        remote: 'origin',
      });
    });
  });

  describe('selected state', () => {
    it('applies the focused-ring class via PRCard isFocused prop when PR is selected', () => {
      uiState.selectedPrNumber = 42;
      const { container } = render(<PullRequestCard prWithChecks={makePr()} />);
      // PullRequestCard maps store selectedPrNumber === pr.number to PRCard isFocused, which adds ring-2
      const card = container.querySelector('.bd-pr-card');
      expect(card?.className).toContain('ring-2');
    });

    it('marks active=true via the isFocused prop on the underlying PRCard', () => {
      const { container } = render(<PullRequestCard prWithChecks={makePr()} isFocused={true} />);
      const card = container.querySelector('.bd-pr-card');
      // active prop on PRCard emits data-active="true"
      expect(card?.getAttribute('data-active')).toBe('true');
    });

    it('preserves data-pr-card on the wrapper for keyboard navigation', () => {
      const { container } = render(<PullRequestCard prWithChecks={makePr()} />);
      expect(container.querySelector('[data-pr-card]')).toBeInTheDocument();
    });
  });

  describe('my PR styling', () => {
    it('uses the own-avatar tone for own PRs', () => {
      const { container } = render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { authorLogin: 'testuser' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(container.querySelector('.bd-avatar--own')).toBeInTheDocument();
    });

    it('uses the them-avatar tone for other PRs', () => {
      const { container } = render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { authorLogin: 'otheruser' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(container.querySelector('.bd-avatar--them')).toBeInTheDocument();
    });
  });

  describe('expanded content', () => {
    it('shows expanded content when PR number is in expanded set', () => {
      uiState.expandedPrNumbers = new Set([42]);
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByTestId('merge-checklist')).toBeInTheDocument();
      // baseRef "main" appears in both the PRCard primitive meta row and the expanded panel
      expect(screen.getAllByText('main').length).toBeGreaterThan(0);
    });

    it('shows PR body when expanded and body exists', () => {
      uiState.expandedPrNumbers = new Set([42]);
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.getByText('Summary')).toBeInTheDocument();
    });

    it('does not show expanded content when not expanded', () => {
      uiState.expandedPrNumbers = new Set();
      render(<PullRequestCard prWithChecks={makePr()} />);
      expect(screen.queryByTestId('merge-checklist')).not.toBeInTheDocument();
    });

    it('does not show Summary heading when body is empty', () => {
      uiState.expandedPrNumbers = new Set([42]);
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { body: '' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    });
  });

  describe('confirm dialogs', () => {
    it('shows close confirm dialog when Close PR is clicked', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Close PR'));
      expect(screen.getByText('Close pull request?')).toBeInTheDocument();
    });

    it('shows bypass merge confirm dialog', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Bypass Merge'));
      expect(screen.getByText('Bypass merge?')).toBeInTheDocument();
    });

    it('shows toggle draft confirm dialog', () => {
      render(<PullRequestCard prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Mark Draft'));
      expect(screen.getByText('Convert to draft?')).toBeInTheDocument();
    });

    it('shows "Mark as ready" confirm dialog for draft PRs', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            pullRequest: { state: 'open', isDraft: true } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      fireEvent.click(screen.getByText('Mark Ready'));
      expect(screen.getByText('Mark as ready for review?')).toBeInTheDocument();
    });
  });

  describe('checks display', () => {
    it('shows check pass ratio when checks exist', () => {
      render(
        <PullRequestCard
          prWithChecks={makePr({
            checks: [
              {
                id: 1,
                name: 'build',
                status: 'completed',
                conclusion: 'success',
                htmlUrl: '',
                checkSuiteId: 1,
              },
              {
                id: 2,
                name: 'lint',
                status: 'completed',
                conclusion: 'success',
                htmlUrl: '',
                checkSuiteId: 1,
              },
            ],
            passedCount: 2,
            skippedCount: 0,
          })}
        />,
      );
      // PRCard primitive renders the pass ratio inside the status label
      expect(screen.getByText('2/2 passing')).toBeInTheDocument();
    });
  });
});
