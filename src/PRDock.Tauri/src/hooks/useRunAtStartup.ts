import { useEffect } from 'react';
import { info, error } from '@tauri-apps/plugin-log';
import type { AppSettings } from '@/types';

export function useRunAtStartup(settings: AppSettings) {
  useEffect(() => {
    (async () => {
      try {
        const { enable, disable, isEnabled } = await import('@tauri-apps/plugin-autostart');

        const currentlyEnabled = await isEnabled();
        info(`[autostart] setting=${settings.ui.runAtStartup}, registry=${currentlyEnabled}`);

        if (settings.ui.runAtStartup && !currentlyEnabled) {
          await enable();
          info('[autostart] enabled successfully');
        } else if (!settings.ui.runAtStartup && currentlyEnabled) {
          await disable();
          info('[autostart] disabled successfully');
        }
      } catch (err) {
        error(`[autostart] failed to sync: ${err}`);
      }
    })();
  }, [settings.ui.runAtStartup]);
}
