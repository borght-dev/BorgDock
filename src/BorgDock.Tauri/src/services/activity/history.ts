import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import { ACT_ACTIVITY_EVENT } from './api';

/** Sent to the history window when it is already open and an entry should be shown. */
export const REVEAL_HISTORY_EVENT = 'activity-history:reveal';

/** What Rust hands the history window when it builds it. */
interface HistoryWindow {
  __BORGDOCK_ACTIVITY_HISTORY__?: { entryId: string | null };
}

/**
 * All history: the activity journal's full list, with search, filters and
 * export, in a window of its own. Opens it, or focuses the one that is open,
 * and shows `entryId` there, selected and expanded.
 */
export async function openActivityHistory(entryId?: string): Promise<void> {
  await commandData(commands.openActivityHistoryWindow(entryId || null));
}

/** The entry the history window was opened for, read once. */
export function takeInitialHistoryEntry(): string | null {
  const injected = (window as unknown as HistoryWindow).__BORGDOCK_ACTIVITY_HISTORY__;
  const entryId = injected?.entryId ?? null;
  if (injected) injected.entryId = null;
  return entryId;
}

/**
 * From a window without the live stores: the main window checks the entry
 * against them and takes its action, or says why it no longer applies.
 */
export async function actInMainWindow(entryId: string): Promise<void> {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', ACT_ACTIVITY_EVENT, { id: entryId });
}
