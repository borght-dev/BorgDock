import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestWithChecks } from '@/types';

// Mock @tauri-apps/api/core BEFORE importing PrCardContainer (which imports
// services/windows.ts → invokes Tauri). vi.mock is hoisted, so we use
// vi.hoisted() to make the mock fn safely accessible from both the factory
// and the test bodies.
const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => ({ graphql: vi.fn() })),
}));

vi.mock('@/services/work-item-linker', () => ({
  detectWorkItemIds: vi.fn(() => []),
}));

vi.mock('@/services/pr-actions', () => ({
  mergePr: vi.fn().mockResolvedValue(true),
  bypassMergePr: vi.fn().mockResolvedValue(true),
  closePr: vi.fn().mockResolvedValue(true),
  toggleDraftPr: vi.fn().mockResolvedValue(true),
  rerunChecks: vi.fn().mockResolvedValue(true),
  checkoutPrBranch: vi.fn().mockResolvedValue(true),
  openPrInBrowser: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn(),
    monitorPr: vi.fn(),
    resolveConflicts: vi.fn(),
  }),
}));

let uiState: Record<string, unknown> = {};
vi.mock('@/stores/ui-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
    selector(uiState),
  );
  return { useUiStore: fn };
});

vi.mock('@/stores/pr-store', () => {
  const fn = vi.fn() as unknown as ReturnType<typeof vi.fn> & {
    getState: ReturnType<typeof vi.fn>;
  };
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
    selector({ username: 'testuser' }),
  );
  fn.getState = vi.fn(() => ({}));
  return { usePrStore: fn };
});

vi.mock('@/stores/settings-store', () => {
  const fn = vi.fn();
  fn.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
    selector({ settings: { repos: [{ owner: 'test', name: 'repo' }] } }),
  );
  return { useSettingsStore: fn };
});

import { PrCardContainer } from '../PrCardContainer';

afterEach(cleanup);

function makePr(): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 42,
      title: 'Add feature X',
      headRef: 'feature/x',
      baseRef: 'main',
      authorLogin: 'someone-else',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/test/repo/pull/42',
      body: '',
      repoOwner: 'test',
      repoName: 'repo',
      reviewStatus: 'commented',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
    totalCheckCount: 0,
  };
}

describe('PrCardContainer card-click → pop-out detail', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    uiState = {
      selectPr: vi.fn(),
      selectedPrNumber: null,
      worktreeBranchMap: new Map(),
    };
  });

  it('opens the pop-out detail window when the card is clicked', () => {
    const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
    const card = container.querySelector('.bd-pr-card');
    expect(card).toBeInTheDocument();
    fireEvent.click(card!);
    expect(invokeMock).toHaveBeenCalledWith(
      'open_pr_detail_window',
      expect.objectContaining({ owner: 'test', repo: 'repo', number: 42 }),
    );
  });

  it('does not open the detail window when an inner action button is clicked', () => {
    const { container } = render(<PrCardContainer prWithChecks={makePr()} />);
    const moreBtn = container.querySelector('[data-pr-action="more"]') as HTMLElement;
    expect(moreBtn).toBeInTheDocument();
    fireEvent.click(moreBtn);
    expect(invokeMock).not.toHaveBeenCalledWith('open_pr_detail_window', expect.anything());
  });

  it('clicking the title also opens the pop-out', () => {
    render(<PrCardContainer prWithChecks={makePr()} />);
    fireEvent.click(screen.getByText('Add feature X'));
    expect(invokeMock).toHaveBeenCalledWith(
      'open_pr_detail_window',
      expect.objectContaining({ owner: 'test', repo: 'repo', number: 42 }),
    );
  });
});
