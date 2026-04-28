import { useCallback, useEffect, useRef, useState } from 'react';
import type { InAppNotification } from '@/types';
import { NotificationBubble } from './NotificationBubble';

const MAX_VISIBLE = 3;
const QUEUE_DELAY_MS = 300;

interface ActiveNotification {
  id: number;
  notification: InAppNotification;
}

interface NotificationManagerProps {
  notifications: InAppNotification[];
  onClearNotification: (index: number) => void;
}

export function NotificationManager({
  notifications,
  onClearNotification,
}: NotificationManagerProps) {
  const [active, setActive] = useState<ActiveNotification[]>([]);
  const nextIdRef = useRef(0);
  const processedRef = useRef(0);

  // Process incoming notifications
  useEffect(() => {
    if (notifications.length <= processedRef.current) return;

    const newNotifications = notifications.slice(processedRef.current);
    processedRef.current = notifications.length;

    newNotifications.forEach((notification, i) => {
      setTimeout(() => {
        setActive((prev) => {
          const updated = [...prev, { id: nextIdRef.current++, notification }];
          // Keep only MAX_VISIBLE
          if (updated.length > MAX_VISIBLE) {
            return updated.slice(-MAX_VISIBLE);
          }
          return updated;
        });
      }, i * QUEUE_DELAY_MS);
    });
  }, [notifications]);

  const handleDismiss = useCallback(
    (id: number) => {
      setActive((prev) => prev.filter((n) => n.id !== id));
      const index = notifications.findIndex((_, i) => i === active.findIndex((a) => a.id === id));
      if (index >= 0) onClearNotification(index);
    },
    [notifications, active, onClearNotification],
  );

  if (active.length === 0) return null;

  return (
    <div data-notification-overlay className="fixed right-3 top-3 z-50 flex flex-col gap-2">
      {active.map((item) => (
        <NotificationBubble
          key={item.id}
          notification={item.notification}
          onDismiss={() => handleDismiss(item.id)}
        />
      ))}
    </div>
  );
}
