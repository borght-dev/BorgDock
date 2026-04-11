import { useCallback, useEffect, useRef } from 'react';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useUiStore } from '@/stores/ui-store';

type QueueMergeFn = (owner: string, repo: string, prNumber: number) => void;

export function useKeyboardNav() {
  const focusedIndexRef = useRef(0);
  const selectPr = useUiStore((s) => s.selectPr);
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const filter = usePrStore((s) => s.filter);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const filteredPrs = usePrStore.getState().filteredPrs();
      if (filteredPrs.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          focusedIndexRef.current = Math.min(focusedIndexRef.current + 1, filteredPrs.length - 1);
          const pr = filteredPrs[focusedIndexRef.current];
          if (pr) selectPr(pr.pullRequest.number);
          // Scroll focused card into view
          scrollFocusedIntoView(focusedIndexRef.current);
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          focusedIndexRef.current = Math.max(focusedIndexRef.current - 1, 0);
          const pr = filteredPrs[focusedIndexRef.current];
          if (pr) selectPr(pr.pullRequest.number);
          scrollFocusedIntoView(focusedIndexRef.current);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          // Already selected via arrow keys
          break;
        }
        case 'Escape': {
          e.preventDefault();
          if (selectedPrNumber !== null) {
            selectPr(null);
          }
          break;
        }
        case 'r': {
          // Ctrl+R or just 'r' to refresh
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            document.dispatchEvent(new CustomEvent('prdock-refresh'));
          } else if (useUiStore.getState().activeSection === 'focus' && !e.shiftKey) {
            // R in Focus: start Quick Review for selected PR
            e.preventDefault();
            const focusPrs = usePrStore.getState().focusPrs();
            const selected = focusPrs[focusedIndexRef.current];
            if (selected) {
              useQuickReviewStore.getState().startSinglePr(selected);
            }
          }
          break;
        }
        case 'R': {
          // Shift+R: start Quick Review session for all review-requested PRs
          if (e.shiftKey) {
            e.preventDefault();
            const reviewPrs = usePrStore.getState().needsMyReview();
            if (reviewPrs.length > 0) {
              useQuickReviewStore.getState().startSession(reviewPrs);
            }
          }
          break;
        }
        case 'e':
        case 'E': {
          e.preventDefault();
          useUiStore.getState().collapseAllRepoGroups();
          useUiStore.getState().collapseAllPrs();
          break;
        }
        case 'm':
        case 'M': {
          // Merge with undo toast — only in Focus section
          if (useUiStore.getState().activeSection !== 'focus') break;
          e.preventDefault();
          const focusPrs = usePrStore.getState().focusPrs();
          const selected = focusPrs[focusedIndexRef.current];
          if (!selected) break;
          const p = selected.pullRequest;
          const queueMerge = (window as unknown as Record<string, unknown>).__prdockQueueMerge as QueueMergeFn | undefined;
          if (queueMerge) {
            queueMerge(p.repoOwner, p.repoName, p.number);
          }
          break;
        }
        case 'o': {
          // Open PR in browser
          const pr = filteredPrs[focusedIndexRef.current];
          if (pr) {
            e.preventDefault();
            import('@tauri-apps/plugin-opener')
              .then(({ openUrl }) => openUrl(pr.pullRequest.htmlUrl))
              .catch(() => window.open(pr.pullRequest.htmlUrl, '_blank'));
          }
          break;
        }
      }
    },
    [selectPr, selectedPrNumber],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset focused index when PR list changes
  useEffect(() => {
    const filteredPrs = usePrStore.getState().filteredPrs();
    if (focusedIndexRef.current >= filteredPrs.length) {
      focusedIndexRef.current = Math.max(0, filteredPrs.length - 1);
    }
  }, [pullRequests, filter]);

  return { focusedIndex: focusedIndexRef };
}

function scrollFocusedIntoView(index: number): void {
  // Find the PR card by data attribute
  const cards = document.querySelectorAll('[data-pr-card]');
  const card = cards[index];
  if (card) {
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
