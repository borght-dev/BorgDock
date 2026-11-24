import { commands, events } from '@/generated/commands';
import { createLogger } from '@/services/logger';
import { sendOsNotification } from '@/services/notification';
import { updateNotice } from '@/services/updates';
import { useSettingsStore } from '@/stores/settings-store';
import { type UpdateStatus, useUpdateStore } from '@/stores/update-store';

const log = createLogger('updater');

interface Options {
  /** Send the OS notifications. The main window only, or each window sends its own. */
  notify?: boolean;
}

/**
 * Keeps this window's update store equal to Rust's status: listens for every
 * change, then reads the status once. Rust owns the schedule (`updater/`);
 * no window checks on a timer.
 */
export function followUpdateStatus({ notify = false }: Options = {}): () => void {
  let stopped = false;
  let heard = false;
  let unlisten: (() => void) | undefined;
  const notified = new Set<string>();

  const announce = (previous: Pick<UpdateStatus, 'phase' | 'version'>, next: UpdateStatus) => {
    const autoDownload = useSettingsStore.getState().settings.updates.autoDownload;
    const notice = updateNotice(previous, next, autoDownload);
    if (!notice || notified.has(notice.key)) return;
    notified.add(notice.key);
    const { key: _key, ...options } = notice;
    void sendOsNotification(options).catch(() => {});
  };

  const follow = async () => {
    const stop = await events.updateStatusChanged.listen((event) => {
      heard = true;
      const { phase, version } = useUpdateStore.getState();
      useUpdateStore.getState().setStatus(event.payload);
      if (notify) announce({ phase, version }, event.payload);
    });
    if (stopped) {
      stop();
      return;
    }
    unlisten = stop;
    const status = await commands.updateStatus();
    // A change heard meanwhile is newer than this answer.
    if (!stopped && !heard) useUpdateStore.getState().setStatus(status);
  };
  void follow().catch((error) =>
    log.warn('could not follow the update status', { error: String(error) }),
  );

  return () => {
    stopped = true;
    unlisten?.();
  };
}
