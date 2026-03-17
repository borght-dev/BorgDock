import { useNotificationStore } from '@/stores/notification-store';
import { NotificationBubble } from './NotificationBubble';

export function NotificationOverlay() {
  const activeNotification = useNotificationStore((s) => s.activeNotification);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (!activeNotification) return null;

  return (
    <div className="fixed right-3 top-3 z-50">
      <NotificationBubble
        notification={activeNotification}
        onDismiss={dismiss}
      />
    </div>
  );
}
