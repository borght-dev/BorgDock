import { beforeEach, describe, expect, it } from 'vitest';
import type { InAppNotification } from '@/types';
import { useNotificationStore } from '../notification-store';

function makeNotification(overrides: Partial<InAppNotification> = {}): InAppNotification {
  return {
    title: overrides.title ?? 'Test Notification',
    message: overrides.message ?? 'This is a test',
    severity: overrides.severity ?? 'info',
    actions: overrides.actions ?? [],
    ...overrides,
  };
}

describe('notification-store', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      active: [],
      queue: [],
      activeNotification: null,
      notifications: [],
    });
  });

  describe('initial state', () => {
    it('starts with empty active and queue', () => {
      const s = useNotificationStore.getState();
      expect(s.active).toHaveLength(0);
      expect(s.queue).toHaveLength(0);
      expect(s.activeNotification).toBeNull();
      expect(s.notifications).toHaveLength(0);
    });
  });

  describe('show', () => {
    it('adds notification to active when under max', () => {
      const n = makeNotification({ title: 'First' });
      useNotificationStore.getState().show(n);

      const s = useNotificationStore.getState();
      expect(s.active).toHaveLength(1);
      expect(s.active[0]!.notification.title).toBe('First');
    });

    it('assigns unique incrementing IDs', () => {
      useNotificationStore.getState().show(makeNotification({ title: 'A' }));
      useNotificationStore.getState().show(makeNotification({ title: 'B' }));

      const s = useNotificationStore.getState();
      expect(s.active[0]!.id).not.toBe(s.active[1]!.id);
    });

    it('holds up to 3 active notifications', () => {
      useNotificationStore.getState().show(makeNotification({ title: '1' }));
      useNotificationStore.getState().show(makeNotification({ title: '2' }));
      useNotificationStore.getState().show(makeNotification({ title: '3' }));

      expect(useNotificationStore.getState().active).toHaveLength(3);
      expect(useNotificationStore.getState().queue).toHaveLength(0);
    });

    it('overflows to queue when max active reached', () => {
      useNotificationStore.getState().show(makeNotification({ title: '1' }));
      useNotificationStore.getState().show(makeNotification({ title: '2' }));
      useNotificationStore.getState().show(makeNotification({ title: '3' }));
      useNotificationStore.getState().show(makeNotification({ title: '4' }));

      const s = useNotificationStore.getState();
      expect(s.active).toHaveLength(3);
      expect(s.queue).toHaveLength(1);
      expect(s.queue[0]!.title).toBe('4');
    });

    it('sets activeNotification to first active notification', () => {
      useNotificationStore.getState().show(makeNotification({ title: 'First' }));
      expect(useNotificationStore.getState().activeNotification?.title).toBe('First');

      useNotificationStore.getState().show(makeNotification({ title: 'Second' }));
      // Still the first one
      expect(useNotificationStore.getState().activeNotification?.title).toBe('First');
    });

    it('sets notifications (legacy) to queue contents', () => {
      useNotificationStore.getState().show(makeNotification());
      useNotificationStore.getState().show(makeNotification());
      useNotificationStore.getState().show(makeNotification());
      useNotificationStore.getState().show(makeNotification({ title: 'Queued' }));

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
      expect(useNotificationStore.getState().notifications[0]!.title).toBe('Queued');
    });
  });

  describe('dismiss', () => {
    it('removes notification by id', () => {
      useNotificationStore.getState().show(makeNotification({ title: 'A' }));
      useNotificationStore.getState().show(makeNotification({ title: 'B' }));

      const idToRemove = useNotificationStore.getState().active[0]!.id;
      useNotificationStore.getState().dismiss(idToRemove);

      const s = useNotificationStore.getState();
      expect(s.active).toHaveLength(1);
      expect(s.active[0]!.notification.title).toBe('B');
    });

    it('promotes from queue when active slot opens', () => {
      useNotificationStore.getState().show(makeNotification({ title: '1' }));
      useNotificationStore.getState().show(makeNotification({ title: '2' }));
      useNotificationStore.getState().show(makeNotification({ title: '3' }));
      useNotificationStore.getState().show(makeNotification({ title: 'Queued' }));

      expect(useNotificationStore.getState().queue).toHaveLength(1);

      const idToRemove = useNotificationStore.getState().active[0]!.id;
      useNotificationStore.getState().dismiss(idToRemove);

      const s = useNotificationStore.getState();
      expect(s.active).toHaveLength(3);
      expect(s.queue).toHaveLength(0);
      // Last active should be the promoted one
      expect(s.active[2]!.notification.title).toBe('Queued');
    });

    it('updates activeNotification after dismiss', () => {
      useNotificationStore.getState().show(makeNotification({ title: 'A' }));
      useNotificationStore.getState().show(makeNotification({ title: 'B' }));

      const firstId = useNotificationStore.getState().active[0]!.id;
      useNotificationStore.getState().dismiss(firstId);

      expect(useNotificationStore.getState().activeNotification?.title).toBe('B');
    });

    it('sets activeNotification to null when all dismissed', () => {
      useNotificationStore.getState().show(makeNotification());
      const id = useNotificationStore.getState().active[0]!.id;
      useNotificationStore.getState().dismiss(id);

      expect(useNotificationStore.getState().activeNotification).toBeNull();
    });

    it('does nothing when dismissing non-existent id', () => {
      useNotificationStore.getState().show(makeNotification());
      useNotificationStore.getState().dismiss(99999);
      expect(useNotificationStore.getState().active).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('removes all active and queued notifications', () => {
      useNotificationStore.getState().show(makeNotification());
      useNotificationStore.getState().show(makeNotification());
      useNotificationStore.getState().show(makeNotification());
      useNotificationStore.getState().show(makeNotification()); // queued

      useNotificationStore.getState().clearAll();

      const s = useNotificationStore.getState();
      expect(s.active).toHaveLength(0);
      expect(s.queue).toHaveLength(0);
      expect(s.activeNotification).toBeNull();
      expect(s.notifications).toHaveLength(0);
    });
  });
});
