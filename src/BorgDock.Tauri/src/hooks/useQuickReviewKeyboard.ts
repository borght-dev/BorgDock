import { useEffect, useRef } from 'react';
import { useQuickReviewStore } from '@/stores/quick-review-store';

/**
 * Keys Quick Review listens for (plans/ui-overhaul-workbench.md, section 7
 * and phase 4). Letters are matched case-insensitively.
 *
 * - On the card: `ArrowRight` approve (when enabled), `ArrowLeft` review
 *   later, `Enter` review files, `Escape` close.
 * - In the file walk: `v` mark reviewed and next, `n` / `p` change files,
 *   `j` / `k` scroll the diff, `f` finish, `Escape` back to the card.
 * - On the card: `a` approve and `w` write a review.
 */
export type QuickReviewKey =
  | 'ArrowRight'
  | 'ArrowLeft'
  | 'Enter'
  | 'Escape'
  | 'v'
  | 'n'
  | 'p'
  | 'j'
  | 'k'
  | 'f'
  | 'a'
  | 'w';

export type QuickReviewKeymap = Partial<Record<QuickReviewKey, () => void>>;

/** Enter on these is theirs (a button press), not a Quick Review shortcut. */
const ACTIVATABLE = 'button,a[href],summary,[role="button"],[role="link"],[role="tab"]';
const TYPING = 'input,textarea,select,[contenteditable="true"]';

/**
 * The one keyboard listener of the Quick Review overlay. The caller passes the
 * keymap of the state it is in (card, walk, composer, summary); `undefined`
 * turns the listener off. Nothing fires while typing, with Ctrl / Cmd / Alt
 * held, while a review is being submitted, or when another handler already
 * took the key.
 */
export function useQuickReviewKeyboard(keymap?: QuickReviewKeymap) {
  const keymapRef = useRef(keymap);
  keymapRef.current = keymap;
  const enabled = keymap !== undefined;

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const map = keymapRef.current;
      if (!map) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const state = useQuickReviewStore.getState().state;
      if (state === 'idle' || state === 'submitting') return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[data-detail-dialog]')) return;
      if (target instanceof HTMLElement && target.closest(TYPING)) return;
      const key = (event.key.length === 1 ? event.key.toLowerCase() : event.key) as QuickReviewKey;
      if (key === 'Enter' && target instanceof HTMLElement && target.closest(ACTIVATABLE)) return;
      const action = map[key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
