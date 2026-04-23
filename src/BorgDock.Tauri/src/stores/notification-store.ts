import { create } from 'zustand';
import type { InAppNotification } from '@/types';

let _nextId = 0;

export interface ActiveNotification {
  id: number;
  notification: InAppNotification;
}

const MAX_VISIBLE = 3;

interface NotificationState {
  /** Visible notifications (up to MAX_VISIBLE, newest last) */
  active: ActiveNotification[];
  /** Overflow queue — shown once an active slot opens */
  queue: InAppNotification[];

  show: (notification: InAppNotification) => void;
  dismiss: (id: number) => void;
  clearAll: () => void;

  // Keep legacy selectors working (NotificationOverlay reads these)
  activeNotification: InAppNotification | null;
  notifications: InAppNotification[];
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  active: [],
  queue: [],

  // Legacy compat — derived from active[]
  activeNotification: null,
  notifications: [],

  show: (notification) => {
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
