import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useNotificationStore } from '@/stores/notification-store';
import { useUpdateStore } from '@/stores/update-store';
import type { AppSettings } from '@/types';

const INITIAL_CHECK_DELAY_MS = 10_000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface UpdateInfo {
  version: string;
  body: string | null;
}

interface DownloadProgressPayload {
  event: 'Progress' | 'Finished';
  data?: { contentLength?: number | null; chunkLength?: number };
}

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

      let downloaded = 0;

      const unlisten = await listen<DownloadProgressPayload>(
        'update-download-progress',
        (event) => {
          const payload = event.payload;
          if (payload.event === 'Progress') {
            downloaded += payload.data?.chunkLength ?? 0;
            const contentLength = payload.data?.contentLength ?? 0;
            if (contentLength && contentLength > 0) {
              const pct = Math.round((downloaded / contentLength) * 100);
              useUpdateStore.getState().setProgress(pct);
              useUpdateStore.getState().setStatusText(`Downloading... ${pct}%`);
            }
          } else if (payload.event === 'Finished') {
            useUpdateStore.getState().setProgress(100);
            useUpdateStore.getState().setDownloading(false);
            useUpdateStore.getState().setStatusText('Update ready — restart to apply');
          }
        },
      );

      await invoke('download_and_install_update');
      unlisten();

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
      const updateInfo = await invoke<UpdateInfo | null>('check_for_update');

      if (updateInfo) {
        useUpdateStore.getState().setAvailable(updateInfo.version);
        useUpdateStore.getState().setStatusText(`Update available: v${updateInfo.version}`);

        useNotificationStore.getState().show({
          title: `Update available: v${updateInfo.version}`,
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
