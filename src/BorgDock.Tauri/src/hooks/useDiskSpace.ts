import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  CLEAN_DISK_ACTION,
  DISK_POLL_MS,
  DiskAlertGate,
  diskSeverity,
  freeSpaceLabel,
} from '@/services/disk-space';
import { sendOsNotification } from '@/services/notification';
import { useDiskSpaceStore } from '@/stores/disk-space-store';

const gate = new DiskAlertGate();

export function useDiskSpace(enabled = true, notify = false): void {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => void useDiskSpaceStore.getState().refresh();
    refresh();
    const timer = window.setInterval(refresh, DISK_POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !notify) return;
    return useDiskSpaceStore.subscribe((state, previous) => {
      if (state.hosts === previous.hosts) return;
      for (const host of gate.notices(state.hosts)) {
        const low = host.disks.filter((disk) => diskSeverity(disk) > 0);
        void sendOsNotification({
          id: `disk-space:${host.id}`,
          severity: low.some((disk) => diskSeverity(disk) === 2) ? 'error' : 'warning',
          title: `Disk nearly full on ${host.label}`,
          body: low.map((disk) => `${disk.drive} ${freeSpaceLabel(disk)}`).join(' · '),
          actions: [{ label: 'Clean up in T3', action: CLEAN_DISK_ACTION, url: host.id }],
        }).catch(() => {});
      }
    });
  }, [enabled, notify]);

  useEffect(() => {
    if (!enabled || !notify) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<{ hostId: string }>('disk-cleanup', (event) => {
      const store = useDiskSpaceStore.getState();
      void store.clean(event.payload.hostId).then(() => {
        const error = useDiskSpaceStore.getState().cleanup[event.payload.hostId]?.error;
        if (error)
          void sendOsNotification({
            title: 'Disk cleanup could not open',
            body: error,
            severity: 'error',
          }).catch(() => {});
      });
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled, notify]);
}
