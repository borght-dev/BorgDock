import { useEffect } from 'react';
import { createLogger } from '@/services/logger';
import {
  NOTIFICATION_BUS_EVENT,
  type NotificationBusPayload,
  useNotificationStore,
} from '@/stores/notification-store';

const MAIN_WINDOW_LABEL = 'main';

const log = createLogger('notification-bus');

/**
 * Cross-window notification bus listener.
 *
 * Routing rule: a toast fired from window X is shown in X (the originator,
 * via the local `show` call) and ALSO mirrored into the main sidebar window
 * so the user always has a stable place to see it. Other pop-outs ignore.
 *
 * Mount this once per window that should mirror events from elsewhere —
 * in practice that's just the main window. Pop-outs already display their
 * own originator toasts via `useNotificationStore.show()`'s local enqueue.
 */
export function useNotificationBus(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const [{ listen }, { getCurrentWindow }] = await Promise.all([
          import('@tauri-apps/api/event'),
          import('@tauri-apps/api/window'),
        ]);
        const me = getCurrentWindow().label;
        // Only the main window mirrors — pop-outs already have their own
        // originator toasts and we don't want sibling-pop-out spam.
        if (me !== MAIN_WINDOW_LABEL) return;

        const fn = await listen<NotificationBusPayload>(
          NOTIFICATION_BUS_EVENT,
          (event) => {
            const { sourceWindow, notification } = event.payload;
            // Skip events we emitted ourselves — main's local `show` already
            // enqueued them. Without this guard a main-originated toast
            // would be added twice.
            if (sourceWindow === me) return;
            useNotificationStore.getState().mirror(notification);
          },
        );

        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch (err) {
        log.warn('failed to attach notification bus listener', { error: String(err) });
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
