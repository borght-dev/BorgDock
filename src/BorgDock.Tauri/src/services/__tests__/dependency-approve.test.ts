import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, submitMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock('@/services/github/singleton', () => ({
  getClientForRepo: vi.fn((owner: string) => (owner === 'nobody' ? null : { get: getMock })),
}));
vi.mock('@/services/pr-review', () => ({ submitPrReview: submitMock }));

import { APPROVAL_UNDO_MS } from '@/components/focus/quick-review-approval';
import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { useDependencyUpdatesStore } from '@/stores/dependency-updates-store';
import { useToastStore } from '@/stores/toast-store';
import {
  type ApprovalOutcome,
  type ApprovalTarget,
  approvalSummary,
  approveDependencyPrs,
  holdDependencyApprovals,
  readMergePreference,
  writeMergePreference,
} from '../dependency-approve';

const target = (number: number, owner = 'acme'): ApprovalTarget => ({
  owner,
  repo: 'web',
  number,
  headSha: `sha${number}`,
});

function head(sha: string, state = 'open', merged = false) {
  return { state, merged, head: { sha } };
}

beforeEach(() => {
  getMock.mockReset();
  submitMock.mockReset();
  useToastStore.getState().clear();
  useDependencyUpdatesStore.setState({ pending: new Set() });
});

describe('approveDependencyPrs', () => {
  it('approves at the commit on screen and turns on auto-merge', async () => {
    getMock.mockResolvedValue(head('sha1'));
    submitMock.mockResolvedValue({ autoMerge: Promise.resolve('enabled') });
    const [outcome] = await approveDependencyPrs([target(1)], true);
    expect(submitMock).toHaveBeenCalledWith(
      expect.anything(),
      'acme',
      'web',
      1,
      'APPROVE',
      undefined,
      { commit_id: 'sha1', comments: [] },
      'auto',
    );
    expect(outcome?.result).toEqual({ status: 'approved', merge: 'enabled' });
  });

  it('approves without merging when asked', async () => {
    getMock.mockResolvedValue(head('sha1'));
    submitMock.mockResolvedValue({});
    const [outcome] = await approveDependencyPrs([target(1)], false);
    expect(submitMock.mock.calls[0]?.[7]).toBeUndefined();
    expect(outcome?.result).toEqual({ status: 'approved' });
  });

  it('leaves a PR alone that moved past the commit on screen, closed or merged', async () => {
    getMock
      .mockResolvedValueOnce(head('newer'))
      .mockResolvedValueOnce(head('sha2', 'closed'))
      .mockResolvedValueOnce(head('sha3', 'closed', true));
    const outcomes = await approveDependencyPrs([target(1), target(2), target(3)], true);
    expect(submitMock).not.toHaveBeenCalled();
    expect(outcomes.map((o) => o.result)).toEqual([
      { status: 'skipped', reason: 'changed after you looked' },
      { status: 'skipped', reason: 'closed' },
      { status: 'skipped', reason: 'merged already' },
    ]);
  });

  it('keeps the approval when auto-merge is refused, and goes on after a failure', async () => {
    getMock.mockResolvedValue(head('sha1'));
    submitMock
      .mockImplementationOnce(async () => ({
        autoMerge: Promise.reject(new Error('Auto merge is not allowed')),
      }))
      .mockRejectedValueOnce(new Error('Rate limited'));
    getMock.mockResolvedValueOnce(head('sha1')).mockResolvedValueOnce(head('sha2'));
    const outcomes = await approveDependencyPrs([target(1), target(2), target(3, 'nobody')], true);
    expect(outcomes.map((o) => o.result)).toEqual([
      { status: 'approved', mergeError: 'Auto merge is not allowed' },
      { status: 'failed', reason: 'Rate limited' },
      { status: 'failed', reason: 'not signed in to GitHub' },
    ]);
  });
});

describe('approvalSummary', () => {
  const outcome = (number: number, result: ApprovalOutcome['result']): ApprovalOutcome => ({
    target: target(number),
    result,
  });

  it('names one PR', () => {
    expect(approvalSummary([outcome(4, { status: 'approved', merge: 'enabled' })])).toEqual({
      tone: 'success',
      message: 'Approved #4 · auto-merge on',
    });
    expect(approvalSummary([outcome(4, { status: 'approved', merge: 'merged' })]).message).toBe(
      'Approved #4 and merged',
    );
    expect(
      approvalSummary([outcome(4, { status: 'skipped', reason: 'changed after you looked' })]),
    ).toEqual({ tone: 'error', title: '#4 not approved', message: 'changed after you looked' });
  });

  it('counts a batch and says why any PR was left out', () => {
    expect(
      approvalSummary([
        outcome(1, { status: 'approved', merge: 'enabled' }),
        outcome(2, { status: 'approved', merge: 'merged' }),
      ]),
    ).toEqual({
      tone: 'success',
      title: 'Approved 2 dependency updates',
      message: 'auto-merge on for #1 · merged #2',
    });
    expect(
      approvalSummary([
        outcome(1, { status: 'approved', merge: 'enabled' }),
        outcome(2, { status: 'skipped', reason: 'changed after you looked' }),
        outcome(3, { status: 'approved', mergeError: 'not allowed' }),
      ]),
    ).toEqual({
      tone: 'error',
      title: 'Approved 2 of 3',
      message: '#2 changed after you looked; #3 approved, auto-merge not on: not allowed',
    });
  });
});

describe('holdDependencyApprovals', () => {
  const prs = [
    listPr({ number: 1, title: 'Bump a from 1.0.0 to 1.0.1', repo: 'acme/web' }),
    listPr({ number: 2, title: 'Bump b from 1.0.0 to 1.0.1', repo: 'acme/web' }),
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for Undo, then approves and reports', async () => {
    getMock.mockImplementation(async (path: string) => head(`sha${path.split('/').pop()}`));
    submitMock.mockResolvedValue({ autoMerge: Promise.resolve('enabled') });
    holdDependencyApprovals(prs, true);
    expect([...useDependencyUpdatesStore.getState().pending]).toEqual(['acme/web#1', 'acme/web#2']);
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      title: 'Approving 2 dependency updates',
      actionLabel: 'Undo',
    });
    expect(submitMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(APPROVAL_UNDO_MS);
    expect(submitMock).toHaveBeenCalledTimes(2);
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      title: 'Approved 2 dependency updates',
    });
    expect(useDependencyUpdatesStore.getState().pending.size).toBe(0);
  });

  it('offers to open the first PR that was left out', async () => {
    getMock.mockResolvedValueOnce(head('moved')).mockResolvedValueOnce(head('sha2'));
    submitMock.mockResolvedValue({});
    holdDependencyApprovals(prs, false);
    await vi.advanceTimersByTimeAsync(APPROVAL_UNDO_MS);
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      tone: 'error',
      title: 'Approved 1 of 2',
      message: '#1 changed after you looked',
      actionLabel: 'Open #1',
      durationMs: 0,
    });
  });

  it('sends nothing after Undo', async () => {
    holdDependencyApprovals(prs.slice(0, 1), false);
    const toast = useToastStore.getState().toasts[0]!;
    expect(toast.message).toBe('Approving #1');
    useToastStore.getState().act(toast.id);
    await vi.advanceTimersByTimeAsync(APPROVAL_UNDO_MS * 2);
    expect(getMock).not.toHaveBeenCalled();
    expect(useDependencyUpdatesStore.getState().pending.size).toBe(0);
  });
});

describe('merge preference', () => {
  it('defaults to merging and remembers a change', () => {
    localStorage.removeItem('borgdock-dependency-merge');
    expect(readMergePreference()).toBe(true);
    writeMergePreference(false);
    expect(readMergePreference()).toBe(false);
    writeMergePreference(true);
  });
});
