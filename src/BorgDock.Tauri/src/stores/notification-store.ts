import { create } from 'zustand';
import type { InAppNotification } from '@/types';

let _nextId = 0;

export interface ActiveNotification {
  id: number;
  notification: InAppNotification;
}

const MAX_VISIBLE = 3;

/** Tauri event used by the cross-window notification bus. */
export const NOTIFICATION_BUS_EVENT = 'borgdock-notification-bus';

export interface NotificationBusPayload {
  /** Tauri label of the window that originated the toast. */
  sourceWindow: string;
  notification: InAppNotification;
}

interface NotificationState {
  /** Visible notifications (up to MAX_VISIBLE, newest last) */
  active: ActiveNotification[];
  /** Overflow queue — shown once an active slot opens */
  queue: InAppNotification[];

  /** Add a toast locally + broadcast to other windows via the bus. */
  show: (notification: InAppNotification) => void;
  /** Add a toast locally without broadcasting — used by the bus listener
   *  so received notifications don't ping-pong back out. */
  mirror: (notification: InAppNotification) => void;
  dismiss: (id: number) => void;
  clearAll: () => void;

  // Keep legacy selectors working (NotificationOverlay reads these)
  activeNotification: InAppNotification | null;
  notifications: InAppNotification[];
}

async function emitToBus(notification: InAppNotification): Promise<void> {
  try {
    const [{ emit }, { getCurrentWindow }] = await Promise.all([
      import('@tauri-apps/api/event'),
      import('@tauri-apps/api/window'),
    ]);
    const payload: NotificationBusPayload = {
      sourceWindow: getCurrentWindow().label,
      notification,
    };
    await emit(NOTIFICATION_BUS_EVENT, payload);
  } catch {
    // Not running in Tauri (tests, SSR) or the event plugin is unavailable.
    // Local state has already been updated; the bus broadcast is best-effort.
  }
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  active: [],
  queue: [],

  // Legacy compat — derived from active[]
  activeNotification: null,
  notifications: [],

  mirror: (notification) => {
    const { active, queue } = get();
    if (active.length < MAX_VISIBLE) {
      const entry: ActiveNotification = { id: _nextId++, notification };
      const newActive = [...active, entry];
      set({
        active: newActive,
        activeNotification: newActive[0]?.notification ?? null,
        notifications: queue,
      });
    } else {
      const newQueue = [...queue, notification];
      set({ queue: newQueue, notifications: newQueue });
    }
  },

  show: (notification) => {
    get().mirror(notification);
    void emitToBus(notification);
  },

  dismiss: (id) => {
    const { active, queue } = get();
    const filtered = active.filter((n) => n.id !== id);

    // Promote from queue if there's room
    if (queue.length > 0 && filtered.length < MAX_VISIBLE) {
      const [next, ...restQueue] = queue;
      const entry: ActiveNotification = { id: _nextId++, notification: next! };
      const newActive = [...filtered, entry];
      set({
        active: newActive,
        queue: restQueue,
        activeNotification: newActive[0]?.notification ?? null,
        notifications: restQueue,
      });
    } else {
      set({
        active: filtered,
        activeNotification: filtered[0]?.notification ?? null,
        notifications: queue,
      });
    }
  },

  clearAll: () => {
    set({
      active: [],
      queue: [],
      activeNotification: null,
      notifications: [],
    });
  },
}));
