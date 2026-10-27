import { act } from '@/services/activity/actions';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { showToast } from '@/stores/toast-store';
import { useUiStore } from '@/stores/ui-store';

const ROW_SELECTOR = '.bd-act-row[data-activity-id]';

function liveRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)].filter(
    (row) => !row.closest('[inert]'),
  );
}

/**
 * The Activity list's keys: J/K (and the arrows) move, Enter takes the
 * selected entry's action, E marks it read, U unread, # dismisses, Z undoes,
 * Shift+E marks everything shown read. Returns true when the key was the
 * list's.
 */
export function handleActivityKey(e: KeyboardEvent): boolean {
  if (useUiStore.getState().activeSection !== 'activity') return false;
  const view = useActivityViewStore.getState();
  const selected = view.entries.find((entry) => entry.id === view.selectedId) ?? null;
  const key = e.key;

  if (key === 'E' && e.shiftKey) {
    e.preventDefault();
    void view.markShownRead().then(() => {
      const step = useActivityViewStore.getState().undo.at(-1);
      if (step) {
        showToast({
          message: step.label,
          actionLabel: 'Undo',
          onAction: () => void useActivityViewStore.getState().undoLast(),
        });
      }
    });
    return true;
  }
  if (key === 'z' || key === 'Z') {
    if (view.undo.length === 0) return false;
    e.preventDefault();
    void view.undoLast();
    return true;
  }

  const rows = liveRows();
  if (rows.length === 0) return false;
  const index = rows.findIndex((row) => row.dataset.activityId === view.selectedId);
  const selectAt = (at: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, at))];
    if (!row) return;
    view.select(row.dataset.activityId ?? null);
    row.scrollIntoView({ block: 'nearest' });
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
  }
  if (!selected) return false;
  switch (key) {
    case 'Enter':
      e.preventDefault();
      void act(selected).then(({ reason }) => {
        if (reason) showToast({ message: `${reason}. Opened it instead.` });
        void useActivityViewStore.getState().refresh();
      });
      return true;
    case 'e':
      e.preventDefault();
      void view.mark([selected.id], 'read', 'Marked read');
      return true;
    case 'u':
    case 'U':
      e.preventDefault();
      void view.mark([selected.id], 'unread', 'Marked unread');
      return true;
    case '#':
      e.preventDefault();
      void view.mark([selected.id], 'dismissed', 'Dismissed');
      return true;
    case ' ':
      e.preventDefault();
      view.toggleExpanded(selected.id);
      return true;
  }
  return false;
}
