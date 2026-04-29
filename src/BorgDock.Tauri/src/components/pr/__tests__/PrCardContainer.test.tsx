import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { PrCardContainer } from '../PrCardContainer';

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

describe('PrCardContainer', () => {
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
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText('Add feature X')).toBeInTheDocument();
    });

    it('renders the PR number', () => {
      render(<PrCardContainer prWithChecks={makePr()} />);
      // PrCardView primitive renders the number in both the meta row and the right column
      expect(screen.getAllByText('#42').length).toBeGreaterThan(0);
    });

    it('renders the branch name', () => {
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText('feature/x')).toBeInTheDocument();
    });

    it('renders the author avatar initials', () => {
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText('TE')).toBeInTheDocument();
    });

    it('renders additions and deletions', () => {
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText('+100')).toBeInTheDocument();
    });

    it('renders commit count', () => {
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText(/3c/)).toBeInTheDocument();
    });

    it('renders the merge score badge', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      // Ring primitive carries `.bd-ring`; numeric value rendered inside
      expect(container.querySelector('.bd-ring')).toBeInTheDocument();
      expect(container.querySelector('.bd-ring__label')?.textContent).toBe('100');
    });

    it('renders the status indicator', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      // Dot primitive carries `.bd-dot--green` for green status
      expect(container.querySelector('.bd-dot--green')).toBeInTheDocument();
    });
  });

  describe('conditional badges', () => {
    it('shows draft badge when PR is draft', () => {
      render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { isDraft: true } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('draft')).toBeInTheDocument();
    });

    it('shows merged badge when PR has mergedAt', () => {
      render(
        <PrCardContainer
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
        <PrCardContainer
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
        <PrCardContainer
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
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { mergeable: false } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.getByText('conflicts')).toBeInTheDocument();
    });

    it('shows in-progress badge when there are pending checks', () => {
      render(<PrCardContainer prWithChecks={makePr({ pendingCheckNames: ['lint'] })} />);
      expect(screen.getByText('in progress')).toBeInTheDocument();
    });

    it('shows worktree badge when branch has a worktree mapping', () => {
      uiState.worktreeBranchMap = new Map([
        ['feature/x', { fullPath: '/code/repo/slots/slot-1', slotName: 'slot-1' }],
      ]);
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText('slot-1')).toBeInTheDocument();
    });
  });

  describe('labels and work items', () => {
    it('renders labels when present', () => {
      render(
        <PrCardContainer
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
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText('AB#12345')).toBeInTheDocument();
    });
  });

  describe('focus mode', () => {
    it('shows the repo path on every PR card', () => {
      // PrCardView primitive always renders repo in meta row, regardless of focus mode
      render(<PrCardContainer prWithChecks={makePr()} focusMode={true} />);
      expect(screen.getByText('test/repo')).toBeInTheDocument();
    });

    it('shows priority reason label when factors are provided in focus mode', () => {
      render(
        <PrCardContainer
          prWithChecks={makePr()}
          focusMode={true}
          priorityFactors={[{ type: 'readyToMerge', points: 10, label: 'Ready to merge' }]}
        />,
      );
      expect(screen.getByTestId('priority-reason')).toBeInTheDocument();
    });

    it('does not render priority reason label when not in focus mode', () => {
      render(
        <PrCardContainer
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
      render(<PrCardContainer prWithChecks={makePr()} />);
      fireEvent.click(screen.getByText('Add feature X'));
      expect(selectPr).toHaveBeenCalledWith(42);
    });

    it('opens context menu on right click', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      // PrCardView primitive renders an interactive Card div with .bd-pr-card class
      const card = container.querySelector('.bd-pr-card');
      expect(card).toBeInTheDocument();
      fireEvent.contextMenu(card!);
      expect(screen.getByText('Open in GitHub')).toBeInTheDocument();
    });
  });

  describe('action buttons (Variant A — compact hover-reveal pill bar)', () => {
    it('renders the state-aware primary action button on open PRs', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      // PR is approved but author is not the current user → primary = 'open'
      expect(container.querySelector('[data-pr-primary-action]')).toBeInTheDocument();
    });

    it('chooses "rerun" as primary when status is red and a failed check exists', () => {
      const { container } = render(
        <PrCardContainer
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
      expect(
        container.querySelector('[data-pr-primary-action="rerun"]'),
      ).toBeInTheDocument();
    });

    it('chooses "merge" as primary when PR is approved and owned by current user', () => {
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: {
              authorLogin: 'testuser',
              reviewStatus: 'approved',
              state: 'open',
              isDraft: false,
            } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(
        container.querySelector('[data-pr-primary-action="merge"]'),
      ).toBeInTheDocument();
    });

    it('chooses "checkout" as primary when PR is owned but not yet approved', () => {
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: {
              authorLogin: 'testuser',
              reviewStatus: 'commented',
            } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(
        container.querySelector('[data-pr-primary-action="checkout"]'),
      ).toBeInTheDocument();
    });

    it('renders Checkout secondary button when primary is not checkout', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      expect(container.querySelector('[data-pr-action="checkout"]')).toBeInTheDocument();
    });

    it('renders Review secondary button when primary is not review', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      expect(container.querySelector('[data-pr-action="review"]')).toBeInTheDocument();
    });

    it('renders the More icon button on every open PR card', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      expect(container.querySelector('[data-pr-action="more"]')).toBeInTheDocument();
    });

    it('does not render the action pill bar on closed PRs', () => {
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { state: 'closed' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(container.querySelector('[data-pr-action-bar]')).not.toBeInTheDocument();
    });

    it('shows "Resolve Conflicts" button inside the hover pill bar when mergeable is false', () => {
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { mergeable: false } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      const btn = container.querySelector('[data-pr-action="resolve-conflicts"]');
      expect(btn).toBeInTheDocument();
      expect(btn?.textContent).toContain('Resolve Conflicts');
      // It must live inside the hover pill bar (not as a standalone block).
      expect(btn?.closest('[data-pr-action-bar]')).not.toBeNull();
    });

    it('does not render "Resolve Conflicts" when the PR is mergeable', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      expect(container.querySelector('[data-pr-action="resolve-conflicts"]')).toBeNull();
    });
  });

  describe('button click handlers (Variant A pill bar)', () => {
    it('calls openUrl when primary "open" action is clicked', async () => {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      // Force primary = 'open' by making PR not failing, not approved+own, not reviewing, not own.
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: {
              authorLogin: 'someone-else',
              reviewStatus: 'commented',
            } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      const primary = container.querySelector('[data-pr-primary-action="open"]');
      expect(primary).toBeInTheDocument();
      fireEvent.click(primary!);
      expect(openUrl).toHaveBeenCalledWith('https://github.com/test/repo/pull/42');
    });

    it('calls invoke for git_fetch when secondary Checkout is clicked', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      const checkoutBtn = container.querySelector('[data-pr-action="checkout"]')!;
      fireEvent.click(checkoutBtn);
      expect(invoke).toHaveBeenCalledWith('git_fetch', {
        repoPath: '/code/repo',
        remote: 'origin',
      });
    });

    it('opens the context menu when More is clicked', async () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      const moreBtn = container.querySelector('[data-pr-action="more"]')!;
      fireEvent.click(moreBtn);
      // Context menu surfaces "Open in GitHub" — heavy actions live here now.
      expect(await screen.findByText('Open in GitHub')).toBeInTheDocument();
    });
  });

  describe('selected state', () => {
    it('applies the focused-ring class via PrCardView isFocused prop when PR is selected', () => {
      uiState.selectedPrNumber = 42;
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      // PrCardContainer maps store selectedPrNumber === pr.number to PrCardView isFocused, which adds ring-2
      const card = container.querySelector('.bd-pr-card');
      expect(card?.className).toContain('ring-2');
    });

    it('marks active=true via the isFocused prop on the underlying PrCardView', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} isFocused={true} />);
      const card = container.querySelector('.bd-pr-card');
      // active prop on PrCardView emits data-active="true"
      expect(card?.getAttribute('data-active')).toBe('true');
    });

    it('preserves data-pr-card on the wrapper for keyboard navigation', () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      expect(container.querySelector('[data-pr-card]')).toBeInTheDocument();
    });
  });

  describe('my PR styling', () => {
    it('uses the own-avatar tone for own PRs', () => {
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { authorLogin: 'testuser' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(container.querySelector('.bd-avatar--own')).toBeInTheDocument();
    });

    it('uses the them-avatar tone for other PRs', () => {
      const { container } = render(
        <PrCardContainer
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
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByTestId('merge-checklist')).toBeInTheDocument();
      // baseRef "main" appears in both the PrCardView primitive meta row and the expanded panel
      expect(screen.getAllByText('main').length).toBeGreaterThan(0);
    });

    it('shows PR body when expanded and body exists', () => {
      uiState.expandedPrNumbers = new Set([42]);
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.getByText('Summary')).toBeInTheDocument();
    });

    it('does not show expanded content when not expanded', () => {
      uiState.expandedPrNumbers = new Set();
      render(<PrCardContainer prWithChecks={makePr()} />);
      expect(screen.queryByTestId('merge-checklist')).not.toBeInTheDocument();
    });

    it('does not show Summary heading when body is empty', () => {
      uiState.expandedPrNumbers = new Set([42]);
      render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { body: '' } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      expect(screen.queryByText('Summary')).not.toBeInTheDocument();
    });
  });

  describe('confirm dialogs (triggered via context menu)', () => {
    function openMenu(container: HTMLElement) {
      fireEvent.click(container.querySelector('[data-pr-action="more"]')!);
    }

    it('shows close confirm dialog when "Close PR" is selected from the context menu', async () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      openMenu(container);
      fireEvent.click(await screen.findByText('Close PR'));
      expect(await screen.findByText('Close pull request?')).toBeInTheDocument();
    });

    it('shows bypass merge confirm dialog when "Bypass merge (admin)" is selected', async () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      openMenu(container);
      fireEvent.click(await screen.findByText('Bypass merge (admin)'));
      expect(await screen.findByText('Bypass merge?')).toBeInTheDocument();
    });

    it('shows toggle draft confirm dialog when "Mark as draft" is selected', async () => {
      const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
      openMenu(container);
      fireEvent.click(await screen.findByText('Mark as draft'));
      expect(await screen.findByText('Convert to draft?')).toBeInTheDocument();
    });

    it('shows "Mark as ready" confirm dialog for draft PRs', async () => {
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { state: 'open', isDraft: true } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      openMenu(container);
      fireEvent.click(await screen.findByText('Mark as ready'));
      expect(await screen.findByText('Mark as ready for review?')).toBeInTheDocument();
    });
  });

  describe('resolve conflicts visibility', () => {
    it('renders Resolve Conflicts button inside the hover pill bar', () => {
      // Resolve Conflicts moved into the hover pill bar, alongside Checkout, as
      // a purple action. It is now revealed only on hover/focus — same group
      // as the rest of the pill bar — so the surrounding opacity-0 wrapper is
      // expected.
      const pr = makePr({
        pullRequest: { mergeable: false } as PullRequestWithChecks['pullRequest'],
      });
      const { container } = render(<PrCardContainer prWithChecks={pr} />);
      const resolveBtn = container.querySelector('[data-pr-action="resolve-conflicts"]');
      expect(resolveBtn).not.toBeNull();
      expect(resolveBtn?.closest('[data-pr-action-bar]')).not.toBeNull();
    });
  });

  describe('comment count', () => {
    it('shows comment count when there are comments', () => {
      const { container } = render(
        <PrCardContainer
          prWithChecks={makePr({
            pullRequest: { commentCount: 5 } as PullRequestWithChecks['pullRequest'],
          })}
        />,
      );
      // Comment count is rendered via the PrCardView primitive's stats row, marked with data-comment-icon
      expect(container.querySelector('[data-comment-icon]')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('checks display', () => {
    it('shows check pass ratio when checks exist', () => {
      render(
        <PrCardContainer
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
      // PrCardView primitive renders the pass ratio inside the status label
      expect(screen.getByText('2/2 passing')).toBeInTheDocument();
    });
  });
});
