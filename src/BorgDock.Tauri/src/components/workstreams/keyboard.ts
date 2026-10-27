import { showWorkstream } from '@/services/navigation';
import { useUiStore } from '@/stores/ui-store';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';

const CARD_SELECTOR = '.bd-ws-card[data-workstream-id]';

function liveCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(CARD_SELECTOR)].filter(
    (card) => !card.closest('[inert]'),
  );
}

/**
 * The Workstreams list's keys: J/K (and the arrows) move, Enter opens, N
 * starts a new workstream, E edits the selected one's next action. Returns
 * true when the key was the list's.
 */
export function handleWorkstreamsKey(e: KeyboardEvent): boolean {
  if (useUiStore.getState().activeSection !== 'workstreams') return false;
  const ui = useWorkstreamsUiStore.getState();
  const key = e.key;
  if (key === 'n' || key === 'N') {
    e.preventDefault();
    ui.openCreate();
    return true;
  }
  const cards = liveCards();
  if (cards.length === 0) return false;
  const index = cards.findIndex((card) => card.dataset.workstreamId === ui.selectedId);
  const selectAt = (at: number) => {
    const card = cards[Math.max(0, Math.min(cards.length - 1, at))];
    if (!card) return;
    ui.select(card.dataset.workstreamId ?? null);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  switch (key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      selectAt(index + 1);
      return true;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      selectAt(index < 0 ? 0 : index - 1);
      return true;
    case 'Enter':
      if (!ui.selectedId) return false;
      e.preventDefault();
      void showWorkstream(ui.selectedId);
      return true;
    case 'e':
    case 'E':
      if (!ui.selectedId) return false;
      e.preventDefault();
      ui.editNextAction(ui.selectedId);
      return true;
  }
  return false;
}
