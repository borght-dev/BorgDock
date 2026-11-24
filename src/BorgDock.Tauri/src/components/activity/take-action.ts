import { act } from '@/services/activity/actions';
import type { ActivityEntry } from '@/services/activity/types';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { showToast } from '@/stores/toast-store';

/**
 * Take the entry's action in this window, where the stores are live, and
 * say why when it no longer applied and the thing was opened instead.
 */
export async function actHere(entry: ActivityEntry, retired?: boolean): Promise<void> {
  const { reason } = await act(entry, retired);
  if (reason) showToast({ message: `${reason}. Opened it instead.` });
  void useActivityViewStore.getState().refresh();
}
