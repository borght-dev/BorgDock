import { bringMainWindowForward } from '@/hooks/useFlyoutSync';
import { OPEN_NOTE_EVENT, showNote } from '@/services/navigation';
import { refreshChips } from '@/services/notes/chips';
import { notesFolderSetting, refContextOf } from '@/services/notes/settings';
import { startThreadWriteback } from '@/services/notes/writeback';
import { PollingManager } from '@/services/polling';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useNotesStore } from '@/stores/notes-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { trackPolling } from './visibility';

/**
 * How often the vault is listed for changes made outside BorgDock (Obsidian,
 * a sync client, an agent). Listing is one directory walk; only changed
 * files are read.
 */
const VAULT_POLL_MS = 4_000;

/**
 * The notes vault for the main window: load it once settings are read, list
 * it for outside changes, reload it when the sync folder moves, keep the
 * reference context and the chips current, and write thread results back.
 */
export function startNotesSync(): () => void {
  const store = useNotesStore.getState;
  /** `undefined` until settings are loaded: the folder is a setting. */
  let folder: string | null | undefined;
  let context = '';

  const syncContext = () => {
    const next = refContextOf(useSettingsStore.getState().settings);
    const key = JSON.stringify(next);
    if (key === context) return;
    context = key;
    store().setContext(next);
  };
  const begin = () => {
    const next = notesFolderSetting(useSettingsStore.getState().settings);
    folder = next;
    syncContext();
    void store().load(next);
  };
  if (useSettingsStore.getState().hasLoaded) begin();

  const poll = new PollingManager(() => store().refresh(), VAULT_POLL_MS);
  const untrack = trackPolling(poll);
  poll.startDeferred();
  const onFocus = () => void store().refresh();
  const onLeave = () => void store().flush();
  window.addEventListener('focus', onFocus);
  window.addEventListener('beforeunload', onLeave);

  let chipFrame = 0;
  const redrawChips = () => {
    cancelAnimationFrame(chipFrame);
    chipFrame = requestAnimationFrame(() => refreshChips(store().context));
  };

  const unsubscribers = [
    useSettingsStore.subscribe((state) => {
      if (folder === undefined) {
        if (state.hasLoaded) begin();
        return;
      }
      syncContext();
      const next = notesFolderSetting(state.settings);
      if (next !== folder) {
        folder = next;
        void store()
          .flush()
          .then(() => store().load(next));
      }
    }),
    usePrStore.subscribe((s, p) => {
      if (s.pullRequests !== p.pullRequests || s.closedPullRequests !== p.closedPullRequests)
        redrawChips();
    }),
    useDispatchStore.subscribe((s, p) => {
      if (s.items !== p.items || s.threads !== p.threads || s.contextItems !== p.contextItems)
        redrawChips();
    }),
    useWorkItemsStore.subscribe((s, p) => {
      if (s.workItems !== p.workItems) redrawChips();
    }),
    useWorkstreamsStore.subscribe((s, p) => {
      if (s.entries !== p.entries) redrawChips();
    }),
  ];
  const stopWriteback = startThreadWriteback();

  let stopListening: (() => void) | undefined;
  let stopped = false;
  import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<{ path: string }>(OPEN_NOTE_EVENT, (event) => {
        void bringMainWindowForward();
        void store()
          .refresh()
          .then(() => showNote(event.payload.path));
      }),
    )
    .then((stop) => {
      if (stopped) stop();
      else stopListening = stop;
    })
    .catch(() => {});

  return () => {
    stopped = true;
    stopListening?.();
    poll.stop();
    untrack();
    stopWriteback();
    cancelAnimationFrame(chipFrame);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('beforeunload', onLeave);
    for (const unsubscribe of unsubscribers) unsubscribe();
    void store().flush();
  };
}
