import { useEffect } from 'react';
import { notesFolderSetting, refContextOf } from '@/services/notes/settings';
import { useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';

/** A window that shows notes but doesn't run the main window's poller reads the vault this often. */
const WINDOW_POLL_MS = 15_000;

/**
 * The notes vault for a component that shows notes: loads it once settings
 * are read when nothing loaded it yet (a pop-out has its own stores), and
 * keeps it current while the component is mounted.
 */
export function useNotesVault() {
  const hasLoaded = useSettingsStore((s) => s.hasLoaded);
  useEffect(() => {
    if (!hasLoaded) return;
    const store = useNotesStore.getState();
    const settings = useSettingsStore.getState().settings;
    if (store.folder === undefined) {
      store.setContext(refContextOf(settings));
      void store.load(notesFolderSetting(settings));
    }
    const timer = window.setInterval(() => void useNotesStore.getState().refresh(), WINDOW_POLL_MS);
    const onFocus = () => void useNotesStore.getState().refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [hasLoaded]);
}
