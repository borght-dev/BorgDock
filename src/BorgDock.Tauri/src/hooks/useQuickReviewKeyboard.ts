import { useEffect } from 'react';
import { useQuickReviewStore } from '@/stores/quick-review-store';

export interface QuickReviewKeyboardActions {
  next: () => void;
  previous: () => void;
  markReviewed: () => void;
}

export function useQuickReviewKeyboard(actions?: QuickReviewKeyboardActions) {
  useEffect(() => {
    if (!actions) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const store = useQuickReviewStore.getState();
      if (store.state !== 'reviewing' && store.state !== 'error') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault();
          actions.next();
          break;
        case 'p':
          event.preventDefault();
          actions.previous();
          break;
        case 'v':
          event.preventDefault();
          actions.markReviewed();
          break;
        case 'escape':
          event.preventDefault();
          store.endSession();
          break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}
