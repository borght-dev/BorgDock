import { create } from 'zustand';
import type { InAppNotification } from '@/types';

interface NotificationState {
  notifications: InAppNotification[];
  activeNotification: InAppNotification | null;
  _dismissTimer: ReturnType<typeof setTimeout> | null;

  show: (notification: InAppNotification) => void;
  dismiss: () => void;
  clearAll: () => void;
}

function scheduleAutoDismiss(
  set: (fn: (state: NotificationState) => Partial<NotificationState>) => void,
  get: () => NotificationState,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    const { notifications } = get();
    if (notifications.length > 0) {
      const [next, ...rest] = notifications;
      const timer = scheduleAutoDismiss(set, get);
      set(() => ({
        activeNotification: next,
        notifications: rest,
        _dismissTimer: timer,
      }));
    } else {
      set(() => ({
        activeNotification: null,
        _dismissTimer: null,
      }));
    }
  }, 5000);
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  activeNotification: null,
  _dismissTimer: null,

  show: (notification) => {
    const { activeNotification, _dismissTimer: existingTimer } = get();
    if (existingTimer) clearTimeout(existingTimer);
    if (activeNotification === null) {
      const timer = scheduleAutoDismiss(set, get);
      set({ activeNotification: notification, _dismissTimer: timer });
    } else {
      set((state) => ({
        notifications: [...state.notifications, notification],
      }));
    }
  },

  dismiss: () => {
    const { _dismissTimer, notifications } = get();
    if (_dismissTimer) clearTimeout(_dismissTimer);

    if (notifications.length > 0) {
      const [next, ...rest] = notifications;
      const timer = scheduleAutoDismiss(set, get);
      set({
        activeNotification: next,
        notifications: rest,
        _dismissTimer: timer,
      });
    } else {
      set({
        activeNotification: null,
        notifications: [],
        _dismissTimer: null,
      });
    }
  },

  clearAll: () => {
    const { _dismissTimer } = get();
    if (_dismissTimer) clearTimeout(_dismissTimer);
    set({
      notifications: [],
      activeNotification: null,
      _dismissTimer: null,
    });
  },
}));
