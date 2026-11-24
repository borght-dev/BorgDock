import { useEffect, useRef } from 'react';
import { ToastViewport } from '@/components/shared/Toast';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import * as api from '@/services/activity/api';
import {
  actInMainWindow,
  REVEAL_HISTORY_EVENT,
  takeInitialHistoryEntry,
} from '@/services/activity/history';
import { isOverlayOpen } from '@/services/navigation';
import { followActivityCounts, useActivityStore } from '@/stores/activity-store';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { revealWindow } from '@/utils/window-reveal';
import { ActivitySection } from './ActivitySection';
import { handleActivityListKey } from './keyboard';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

function focusSearch(): void {
  const input = document.querySelector<HTMLInputElement>('input[data-section-search]');
  input?.focus();
  input?.select();
}

/** The list's keys, plus Ctrl+K and `/` for its search. Enter asks the main window to act. */
function onKeyDown(e: KeyboardEvent): void {
  const modified = e.ctrlKey || e.metaKey;
  if (modified && !e.altKey && !e.shiftKey && ['k', 'f'].includes(e.key.toLowerCase())) {
    e.preventDefault();
    focusSearch();
    return;
  }
  if (modified || e.altKey || e.repeat || isTyping(e.target) || isOverlayOpen()) return;
  if (e.key === '/') {
    e.preventDefault();
    focusSearch();
    return;
  }
  // Enter on a button (a row's action, a filter) is that button's.
  if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.closest('button, a')) return;
  handleActivityListKey(e, (entry) => actInMainWindow(entry.id));
}

/**
 * ActivityHistoryApp — All history: the journal's full list, with search,
 * filters and its keys, in a window of its own. It only reads: the main
 * window records what changes and takes an entry's action, because it has
 * the live threads, pull requests and CI failure groups to check it against.
 */
export function ActivityHistoryApp() {
  useEffect(() => followActivityCounts(), []);

  useEffect(() => {
    const store = useActivityStore.getState();
    void api
      .storeInfo()
      .then((info) => {
        store.setReadOnly(info.readOnly);
        store.setRecoveredFrom(info.recoveredFrom);
        store.setCapacity(info.capacity);
      })
      .catch(() => {});
  }, []);

  // History starts on everything; an entry it was opened for is selected and open.
  useEffect(() => {
    const view = useActivityViewStore.getState();
    const entryId = takeInitialHistoryEntry();
    if (entryId) void view.reveal(entryId);
    else view.setFilter('all');

    let stopped = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string>(REVEAL_HISTORY_EVENT, (event) => {
          if (event.payload) void useActivityViewStore.getState().reveal(event.payload);
        }),
      )
      .then((stop) => {
        if (stopped) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Built invisible: shown once the first frame is painted.
  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current) return;
    revealed.current = true;
    requestAnimationFrame(() => void revealWindow());
  }, []);

  return (
    <div className="bd-act-window" data-app-ready="true">
      <WindowTitleBar title="History" />
      <main className="bd-act-window__body">
        <ActivitySection remote />
      </main>
      <ToastViewport />
    </div>
  );
}
