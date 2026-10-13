import { useEffect, useRef } from 'react';
import { SETTINGS_CHANGED_EVENT, SETTINGS_SOURCE_ID } from '@/stores/settings-events';
import { useSettingsStore } from '@/stores/settings-store';

function reloadSettings(): Promise<void> {
  return useSettingsStore.getState().loadSettings();
}

export function useSettingsSync(refresh: () => void | Promise<void> = reloadSettings): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let stopped = false;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<{ source: string }>(SETTINGS_CHANGED_EVENT, (event) => {
          if (stopped || event.payload?.source === SETTINGS_SOURCE_ID) return;
          void Promise.resolve()
            .then(() => {
              if (!stopped) return refreshRef.current();
            })
            .catch((error) => console.error('Failed to refresh settings:', error));
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
}
