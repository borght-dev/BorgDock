import { useEffect } from 'react';
import type { AppSettings } from '@/types';

export function useRunAtStartup(settings: AppSettings) {
  useEffect(() => {
    (async () => {
      try {
        const { enable, disable, isEnabled } = await import('@tauri-apps/plugin-autostart');

        const currentlyEnabled = await isEnabled();

        if (settings.ui.runAtStartup && !currentlyEnabled) {
          await enable();
        } else if (!settings.ui.runAtStartup && currentlyEnabled) {
          await disable();
        }
      } catch (err) {
        console.error('Failed to sync autostart:', err);
      }
    })();
  }, [settings.ui.runAtStartup]);
}
