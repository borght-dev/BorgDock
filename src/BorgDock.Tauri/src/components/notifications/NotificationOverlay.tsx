import { useNotificationStore } from '@/stores/notification-store';
import { NotificationBubble } from './NotificationBubble';

export function NotificationOverlay() {
  const active = useNotificationStore((s) => s.active);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (active.length === 0) return null;

  return (
    <div data-notification-overlay className="fixed right-3 top-3 z-50 flex flex-col gap-2.5">
      {active.map((item) => (
        <NotificationBubble
          key={item.id}
          notification={item.notification}
          onDismiss={() => dismiss(item.id)}
        />
      ))}
    </div>
  );
}
