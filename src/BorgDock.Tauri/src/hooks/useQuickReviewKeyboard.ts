import { useCallback, useEffect } from 'react';
import { submitReview } from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useQuickReviewStore } from '@/stores/quick-review-store';

export function useQuickReviewKeyboard() {
  const state = useQuickReviewStore((s) => s.state);

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      // Only active during review session
      if (state !== 'reviewing') return;

      // Don't intercept when typing
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const store = useQuickReviewStore.getState();
      const pr = store.currentPr();
      if (!pr) return;

      switch (e.key) {
        case 'a':
        case 'A': {
          e.preventDefault();
          const client = getClient();
          if (!client) return;
          store.setSubmitting();
          try {
            await submitReview(
              client,
              pr.pullRequest.repoOwner,
              pr.pullRequest.repoName,
              pr.pullRequest.number,
              'APPROVE',
            );
            store.advance('approved');
          } catch (err) {
            store.setError(`Approve failed: ${err}`);
          }
          break;
        }
        case 's':
        case 'S':
        case 'ArrowRight': {
          e.preventDefault();
          store.advance('skipped');
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          store.goBack();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          store.endSession();
          break;
        }
      }
    },
    [state],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
