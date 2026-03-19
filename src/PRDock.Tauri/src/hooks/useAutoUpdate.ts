import { useCallback, useEffect, useRef } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { useUpdateStore } from '@/stores/update-store';
import type { AppSettings } from '@/types';

const INITIAL_CHECK_DELAY_MS = 10_000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function useAutoUpdate(settings: AppSettings) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load current version on mount
  useEffect(() => {
    (async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        useUpdateStore.getState().setCurrentVersion(version);
      } catch {
        // Fallback for dev mode
        useUpdateStore.getState().setCurrentVersion('0.1.0');
      }
    })();
  }, []);

  const downloadAndInstall = useCallback(async () => {
    try {
      useUpdateStore.getState().setDownloading(true);
      useUpdateStore.getState().setProgress(0);
      useUpdateStore.getState().setStatusText('Downloading update...');

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
              const pct = Math.round((downloaded / contentLength) * 100);
              useUpdateStore.getState().setProgress(pct);
              useUpdateStore.getState().setStatusText(`Downloading... ${pct}%`);
            }
            break;
          case 'Finished':
            useUpdateStore.getState().setProgress(100);
            useUpdateStore.getState().setDownloading(false);
            useUpdateStore.getState().setStatusText('Update ready — restart to apply');
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
      useUpdateStore.getState().setDownloading(false);
      useUpdateStore.getState().setStatusText('Download failed');
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    const s = useUpdateStore.getState();
    if (s.checking || s.downloading) return;

    useUpdateStore.getState().setChecking(true);
    useUpdateStore.getState().setStatusText('Checking for updates...');

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        useUpdateStore.getState().setAvailable(update.version);
        useUpdateStore.getState().setStatusText(`Update available: v${update.version}`);

        useNotificationStore.getState().show({
          title: `Update available: v${update.version}`,
          message: 'A new version of PRDock is available.',
          severity: 'info',
          actions: [],
        });

        if (settings.updates.autoDownload) {
          await downloadAndInstall();
        }
      } else {
        useUpdateStore.getState().setStatusText("You're on the latest version");
      }
    } catch (err) {
      console.error('Update check failed:', err);
      useUpdateStore.getState().setStatusText('Update check failed');
    } finally {
      useUpdateStore.getState().setChecking(false);
    }
  }, [settings.updates.autoDownload, downloadAndInstall]);

  // Initial delayed check + periodic checks
  useEffect(() => {
    if (!settings.updates.autoCheckEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Delayed initial check
    const timer = setTimeout(() => {
      checkForUpdate();

      // Start periodic checks after initial
      intervalRef.current = setInterval(checkForUpdate, PERIODIC_CHECK_INTERVAL_MS);
    }, INITIAL_CHECK_DELAY_MS);

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [settings.updates.autoCheckEnabled, checkForUpdate]);

  return { checkForUpdate, downloadAndInstall };
}
