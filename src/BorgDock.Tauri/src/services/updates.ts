import { commands } from '@/generated/commands';
import { createLogger } from '@/services/logger';
import { commandData } from '@/services/native-command';
import type { OsNotificationOptions } from '@/services/notification';
import { type UpdateStatus, useUpdateStore } from '@/stores/update-store';
import { formatAgo } from '@/utils/relative-time';

const log = createLogger('updater');

export const RELEASES_URL = 'https://github.com/borght-dev/BorgDock/releases';

/** Check now; with auto-download on, Rust downloads what it finds. */
export async function checkForUpdate(): Promise<void> {
  try {
    useUpdateStore.getState().setStatus(await commands.checkForUpdate());
  } catch (error) {
    log.error('update check failed', error);
  }
}

export async function downloadUpdate(): Promise<void> {
  try {
    useUpdateStore.getState().setStatus(await commands.downloadUpdate());
  } catch (error) {
    log.error('update download failed', error);
  }
}

/** The installer takes seconds to start: a second click must not ask again. */
export async function restartToApplyUpdate(): Promise<void> {
  const store = useUpdateStore.getState();
  if (store.restarting) return;
  store.setRestarting(true);
  try {
    await commandData(commands.restartToApplyUpdate());
  } catch (error) {
    log.error('restart to apply failed', error);
    useUpdateStore.getState().setRestarting(false);
  }
}

export interface UpdateNotice extends OsNotificationOptions {
  /** One notice per key: a version is announced once per kind. */
  key: string;
}

/** What to tell the OS when the status moves from `previous` to `next`. */
export function updateNotice(
  previous: Pick<UpdateStatus, 'phase' | 'version'>,
  next: UpdateStatus,
  autoDownload: boolean,
): UpdateNotice | null {
  if (!next.version) return null;
  if (previous.phase === next.phase && previous.version === next.version) return null;
  if (next.phase === 'ready') {
    return {
      key: `ready:${next.version}`,
      title: 'Update ready',
      body: `Restart BorgDock to apply v${next.version}.`,
      severity: 'success',
    };
  }
  if (next.phase === 'available' && !autoDownload) {
    return {
      key: `available:${next.version}`,
      title: `Update available: v${next.version}`,
      body: 'A new version of BorgDock is available.',
      severity: 'info',
    };
  }
  return null;
}

/** "Last checked 12 min ago", or that no check has finished yet. */
export function lastCheckedLabel(lastCheckedAt: string | null, now: number = Date.now()): string {
  const ago = lastCheckedAt ? formatAgo(lastCheckedAt, now) : '';
  return ago ? `Last checked ${ago}` : 'Not checked yet';
}

/** One line for what the updater is doing or found; empty before the first check. */
export function updateStatusLine(status: UpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `Update available: v${status.version}`;
    case 'downloading':
      return `Downloading v${status.version}… ${status.progress}%`;
    case 'ready':
    case 'installing':
      return 'Update ready — restart to apply';
    case 'idle':
      return status.lastCheckedAt && !status.lastError ? "You're on the latest version" : '';
  }
}
