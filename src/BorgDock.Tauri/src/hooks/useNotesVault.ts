import { useEffect } from 'react';
import { notesFolderSetting, refContextOf } from '@/services/notes/settings';
import { useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';

/** A window that shows notes but doesn't run the main window's poller reads the vault this often. */
const WINDOW_POLL_MS = 15_000;

/**
 * The notes vault for a component that shows notes: loads it once settings
 * are read when nothing loaded it yet (a pop-out has its own stores), loads
 * it again when the sync folder moves, and keeps it current while the
 * component is mounted. In the main window the runtime got there first, so
 * this only polls.
 */
export function useNotesVault() {
  const hasLoaded = useSettingsStore((s) => s.hasLoaded);
  const folder = useSettingsStore((s) => notesFolderSetting(s.settings));
  const context = useSettingsStore((s) => JSON.stringify(refContextOf(s.settings)));

  useEffect(() => {
    if (!hasLoaded) return;
    const store = useNotesStore.getState();
    if (JSON.stringify(store.context) !== context) store.setContext(JSON.parse(context));
    if (store.folder !== folder) {
      void store.flush().then(() => useNotesStore.getState().load(folder));
    }
  }, [hasLoaded, folder, context]);

  useEffect(() => {
    if (!hasLoaded) return;
    const timer = window.setInterval(() => void useNotesStore.getState().refresh(), WINDOW_POLL_MS);
    const onFocus = () => void useNotesStore.getState().refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [hasLoaded]);
}
