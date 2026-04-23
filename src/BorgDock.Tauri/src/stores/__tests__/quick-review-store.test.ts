import { beforeEach, describe, expect, it } from 'vitest';
import type { PullRequestWithChecks } from '@/types';
import { useQuickReviewStore } from '../quick-review-store';

function makePr(number: number): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR #${number}`,
      headRef: 'feature/test',
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: '',
      body: '',
      repoOwner: 'owner',
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
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  };
}

describe('quick-review-store', () => {
  beforeEach(() => {
    useQuickReviewStore.setState({
      state: 'idle',
      queue: [],
      currentIndex: 0,
      decisions: new Map(),
      error: null,
    });
  });

  describe('initial state', () => {
    it('starts idle with empty queue', () => {
      const s = useQuickReviewStore.getState();
      expect(s.state).toBe('idle');
      expect(s.queue).toHaveLength(0);
      expect(s.currentIndex).toBe(0);
      expect(s.decisions.size).toBe(0);
      expect(s.error).toBeNull();
    });
  });

  describe('startSession', () => {
    it('sets state to reviewing with provided PRs', () => {
      const prs = [makePr(1), makePr(2), makePr(3)];
      useQuickReviewStore.getState().startSession(prs);

      const s = useQuickReviewStore.getState();
      expect(s.state).toBe('reviewing');
      expect(s.queue).toHaveLength(3);
      expect(s.currentIndex).toBe(0);
      expect(s.decisions.size).toBe(0);
      expect(s.error).toBeNull();
    });

    it('does nothing when given empty array', () => {
      useQuickReviewStore.getState().startSession([]);
      expect(useQuickReviewStore.getState().state).toBe('idle');
    });

    it('resets decisions from a previous session', () => {
      useQuickReviewStore.setState({ decisions: new Map([[1, 'approved']]) });
      useQuickReviewStore.getState().startSession([makePr(5)]);
      expect(useQuickReviewStore.getState().decisions.size).toBe(0);
    });
  });

  describe('startSinglePr', () => {
    it('sets state to reviewing with a single PR', () => {
      const pr = makePr(42);
      useQuickReviewStore.getState().startSinglePr(pr);

      const s = useQuickReviewStore.getState();
      expect(s.state).toBe('reviewing');
      expect(s.queue).toHaveLength(1);
      expect(s.queue[0]!.pullRequest.number).toBe(42);
      expect(s.currentIndex).toBe(0);
    });
  });

  describe('currentPr', () => {
    it('returns current PR based on index', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2)]);
      expect(useQuickReviewStore.getState().currentPr()?.pullRequest.number).toBe(1);
    });

    it('returns undefined when queue is empty', () => {
      expect(useQuickReviewStore.getState().currentPr()).toBeUndefined();
    });
  });

  describe('remaining', () => {
    it('returns number of PRs after current', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2), makePr(3)]);
      expect(useQuickReviewStore.getState().remaining()).toBe(2);
    });

    it('returns 0 when on last PR', () => {
      useQuickReviewStore.getState().startSession([makePr(1)]);
      expect(useQuickReviewStore.getState().remaining()).toBe(0);
    });

    it('returns 0 when queue is empty', () => {
      expect(useQuickReviewStore.getState().remaining()).toBe(0);
    });
  });

  describe('advance', () => {
    it('records decision and moves to next PR', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2), makePr(3)]);
      useQuickReviewStore.getState().advance('approved');

      const s = useQuickReviewStore.getState();
      expect(s.currentIndex).toBe(1);
      expect(s.state).toBe('reviewing');
      expect(s.decisions.get(1)).toBe('approved');
    });

    it('sets state to complete on last PR', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2)]);
      useQuickReviewStore.getState().advance('approved');
      useQuickReviewStore.getState().advance('commented');

      const s = useQuickReviewStore.getState();
      expect(s.state).toBe('complete');
      expect(s.decisions.get(1)).toBe('approved');
      expect(s.decisions.get(2)).toBe('commented');
    });

    it('handles single PR session', () => {
      useQuickReviewStore.getState().startSinglePr(makePr(99));
      useQuickReviewStore.getState().advance('skipped');

      expect(useQuickReviewStore.getState().state).toBe('complete');
      expect(useQuickReviewStore.getState().decisions.get(99)).toBe('skipped');
    });

    it('does nothing when queue is empty', () => {
      useQuickReviewStore.getState().advance('approved');
      expect(useQuickReviewStore.getState().state).toBe('idle');
      expect(useQuickReviewStore.getState().decisions.size).toBe(0);
    });
  });

  describe('goBack', () => {
    it('moves to previous PR', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2), makePr(3)]);
      useQuickReviewStore.getState().advance('approved');
      expect(useQuickReviewStore.getState().currentIndex).toBe(1);

      useQuickReviewStore.getState().goBack();
      expect(useQuickReviewStore.getState().currentIndex).toBe(0);
      expect(useQuickReviewStore.getState().state).toBe('reviewing');
    });

    it('does nothing at the start of queue', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2)]);
      useQuickReviewStore.getState().goBack();
      expect(useQuickReviewStore.getState().currentIndex).toBe(0);
    });

    it('sets state back to reviewing from complete', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2), makePr(3)]);
      useQuickReviewStore.getState().advance('approved');
      useQuickReviewStore.getState().advance('approved');
      useQuickReviewStore.getState().advance('approved');
      expect(useQuickReviewStore.getState().state).toBe('complete');
      // currentIndex stayed at 2 (last item) when marked complete
      expect(useQuickReviewStore.getState().currentIndex).toBe(2);

      useQuickReviewStore.getState().goBack();
      expect(useQuickReviewStore.getState().state).toBe('reviewing');
      expect(useQuickReviewStore.getState().currentIndex).toBe(1);
    });
  });

  describe('setSubmitting', () => {
    it('sets state to submitting', () => {
      useQuickReviewStore.getState().startSession([makePr(1)]);
      useQuickReviewStore.getState().setSubmitting();
      expect(useQuickReviewStore.getState().state).toBe('submitting');
    });
  });

  describe('setError / clearError', () => {
    it('sets error state with message', () => {
      useQuickReviewStore.getState().setError('Something went wrong');
      const s = useQuickReviewStore.getState();
      expect(s.state).toBe('error');
      expect(s.error).toBe('Something went wrong');
    });

    it('clears error and returns to reviewing', () => {
      useQuickReviewStore.getState().setError('Oops');
      useQuickReviewStore.getState().clearError();
      const s = useQuickReviewStore.getState();
      expect(s.state).toBe('reviewing');
      expect(s.error).toBeNull();
    });
  });

  describe('endSession', () => {
    it('resets all state to idle', () => {
      useQuickReviewStore.getState().startSession([makePr(1), makePr(2)]);
      useQuickReviewStore.getState().advance('approved');
      useQuickReviewStore.getState().endSession();

      const s = useQuickReviewStore.getState();
      expect(s.state).toBe('idle');
      expect(s.queue).toHaveLength(0);
      expect(s.currentIndex).toBe(0);
      expect(s.decisions.size).toBe(0);
      expect(s.error).toBeNull();
    });
  });
});
