import { sendOsNotification } from '@/services/notification';
import { useSettingsStore } from '@/stores/settings-store';
import { type Notice, noticesFor } from './notices';
import type { Overview } from './types';

/** Toast action that shows an item in Dispatch. Its `url` carries the item id. */
export const SHOW_ITEM_ACTION = 'dispatch-show';
/** Toast action that takes an item's action. Its `url` carries `<item id>:<action id>`. */
export const ITEM_ACTION = 'dispatch-act';

/** Keys of the notices sent, or seen before the first full sync, this session. */
const sent = new Set<string>();

/** Forget what was sent (tests). */
export function resetNotifier(): void {
  sent.clear();
}

function send(notice: Notice): void {
  const actions = [
    ...(notice.action
      ? [
          {
            label: notice.action.label,
            action: ITEM_ACTION,
            url: `${notice.itemId}:${notice.action.id}`,
          },
        ]
      : []),
    { label: 'Open', action: SHOW_ITEM_ACTION, url: String(notice.itemId) },
  ];
  void sendOsNotification({
    id: `dispatch:${notice.key}`,
    severity: notice.severity,
    title: notice.title,
    body: notice.body,
    actions,
  }).catch(() => {});
}

/**
 * Notify about what is new in `overview`. While `quiet` (until every source
 * has been read once) it only records what is already true, so starting
 * BorgDock does not set off a burst of notifications about things you have
 * seen.
 */
export function notifyNew(overview: Overview, quiet: boolean): void {
  const enabled = useSettingsStore.getState().settings.agents?.dispatchNotifications ?? true;
  for (const notice of noticesFor(overview)) {
    if (sent.has(notice.key)) continue;
    sent.add(notice.key);
    if (!quiet && enabled) send(notice);
  }
}
