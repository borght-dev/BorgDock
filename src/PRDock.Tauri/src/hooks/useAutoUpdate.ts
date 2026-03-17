import { useEffect, useCallback, useState } from 'react';
import type { AppSettings } from '@/types';
import { useNotificationStore } from '@/stores/notification-store';

interface UpdateState {
  available: boolean;
  version: string | null;
  downloading: boolean;
  progress: number;
}

export function useAutoUpdate(settings: AppSettings) {
  const [updateState, setUpdateState] = useState<UpdateState>({
    available: false,
    version: null,
    downloading: false,
    progress: 0,
  });

  const checkForUpdate = useCallback(async () => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        setUpdateState((prev) => ({
          ...prev,
          available: true,
          version: update.version,
        }));

        useNotificationStore.getState().show({
          title: `Update available: v${update.version}`,
          message: 'A new version of PRDock is available.',
          severity: 'info',
          actions: [],
        });

        if (settings.updates.autoDownload) {
          await downloadAndInstall();
        }
      }
    } catch (err) {
      console.error('Update check failed:', err);
    }
  }, [settings.updates.autoDownload]);

  const downloadAndInstall = useCallback(async () => {
    try {
      setUpdateState((prev) => ({ ...prev, downloading: true, progress: 0 }));
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) return;

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setUpdateState((prev) => ({
                ...prev,
                progress: Math.round((downloaded / contentLength) * 100),
              }));
            }
            break;
          case 'Finished':
            setUpdateState((prev) => ({ ...prev, downloading: false, progress: 100 }));
            break;
        }
      });

      useNotificationStore.getState().show({
        title: 'Update ready',
        message: 'Restart PRDock to apply the update.',
        severity: 'success',
        actions: [],
      });
    } catch (err) {
      console.error('Update download failed:', err);
      setUpdateState((prev) => ({ ...prev, downloading: false }));
    }
  }, []);

  // Check on mount if enabled
  useEffect(() => {
    if (settings.updates.autoCheckEnabled) {
      // Delay check by 10 seconds to not interfere with startup
      const timer = setTimeout(checkForUpdate, 10_000);
      return () => clearTimeout(timer);
    }
  }, [settings.updates.autoCheckEnabled, checkForUpdate]);

  return { updateState, checkForUpdate, downloadAndInstall };
}
