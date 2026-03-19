import { useCallback, useEffect, useRef } from 'react';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';

export function useKeyboardNav() {
  const focusedIndexRef = useRef(0);
  const selectPr = useUiStore((s) => s.selectPr);
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);

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
            // Will be handled by the polling hook
            document.dispatchEvent(new CustomEvent('prdock-refresh'));
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
  });

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
