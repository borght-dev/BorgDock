import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePrActions } from '../usePrActions';
import type { PullRequestWithChecks } from '@/types';

vi.mock('@/services/pr-actions', () => ({
  mergePr: vi.fn(async () => true),
  bypassMergePr: vi.fn(async () => true),
  closePr: vi.fn(async () => true),
  toggleDraftPr: vi.fn(async () => true),
}));

vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({ resolveConflicts: vi.fn(async () => undefined) }),
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => undefined),
}));

vi.mock('@/services/repo-lookup', () => ({
  findRepoConfig: () => ({ worktreeBasePath: '', worktreeSubfolder: '.worktrees' }),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ settings: { repos: [], ui: {} } }),
    { getState: () => ({ settings: { repos: [], ui: {} } }) },
  ),
}));

function fakePr(overrides: Partial<PullRequestWithChecks['pullRequest']> = {}): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 1,
      title: 't',
      headRef: 'head',
      baseRef: 'main',
      authorLogin: 'me',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://example.invalid',
      body: '',
      repoOwner: 'o',
      repoName: 'r',
      reviewStatus: 'approved',
      commentCount: 0,
      labels: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commitCount: 0,
      requestedReviewers: [],
      ...overrides,
    },
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 0,
    skippedCount: 0,
  };
}

describe('usePrActions', () => {
  it('exposes default state', () => {
    const { result } = renderHook(() => usePrActions(fakePr()));
    expect(result.current.actionStatus).toBe('');
    expect(result.current.checkoutOpen).toBe(false);
    expect(result.current.confirmClose).toBe(false);
    expect(result.current.confirmBypass).toBe(false);
  });

  it('isReady=true for green + approved + non-draft + mergeable', () => {
    const { result } = renderHook(() =>
      usePrActions(fakePr({ mergeable: true })),
    );
    expect(result.current.isReady).toBe(true);
  });

  it('isReady=false when draft', () => {
    const { result } = renderHook(() => usePrActions(fakePr({ isDraft: true })));
    expect(result.current.isReady).toBe(false);
  });

  it('onBypassConfirm sets confirmBypass=true', () => {
    const { result } = renderHook(() => usePrActions(fakePr()));
    act(() => result.current.onBypassConfirm());
    expect(result.current.confirmBypass).toBe(true);
  });

  it('onCloseConfirm sets confirmClose=true', () => {
    const { result } = renderHook(() => usePrActions(fakePr()));
    act(() => result.current.onCloseConfirm());
    expect(result.current.confirmClose).toBe(true);
  });

  it('onCheckoutToggle toggles checkoutOpen', () => {
    const { result } = renderHook(() => usePrActions(fakePr()));
    act(() => result.current.onCheckoutToggle());
    expect(result.current.checkoutOpen).toBe(true);
    act(() => result.current.onCheckoutToggle());
    expect(result.current.checkoutOpen).toBe(false);
  });
});
