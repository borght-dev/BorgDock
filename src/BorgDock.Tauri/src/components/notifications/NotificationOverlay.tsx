import { useEffect } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { NotificationBubble } from './NotificationBubble';

export function NotificationOverlay() {
  const active = useNotificationStore((s) => s.active);
  const dismiss = useNotificationStore((s) => s.dismiss);

  // Dev/test-only deep-link: ?toast=test pushes a synthetic toast
  // through the real notification-store action so visual.spec.ts can
  // screenshot the toast stack without waiting for a runtime trigger.
  useEffect(() => {
    const isTest =
      import.meta.env.DEV ||
      (typeof window !== 'undefined' && window.__PLAYWRIGHT__ === true);
    if (!isTest) return;
    if (new URLSearchParams(window.location.search).get('toast') === 'test') {
      useNotificationStore.getState().show({
        title: 'Test toast',
        message: 'Synthetic notification for visual.spec.ts capture.',
        severity: 'info',
        actions: [],
      });
    }
  }, []);

  const queueLength = useNotificationStore((s) => s.queue.length);

  if (active.length === 0) return null;

  return (
    <div
      data-notification-overlay
      className="fixed right-3 top-3 bottom-3 z-50 flex flex-col gap-2.5 overflow-y-auto pr-1 max-h-[calc(100vh-1.5rem)]"
    >
      {active.map((item) => (
        <NotificationBubble
          key={item.id}
          notification={item.notification}
          onDismiss={() => dismiss(item.id)}
        />
      ))}
      {queueLength > 0 && (
        <div
          data-notification-queue-indicator
          className="self-end rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)]"
          style={{
            background: 'var(--color-toast-bg)',
            border: '1px solid color-mix(in srgb, var(--color-text-tertiary) 20%, transparent)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          }}
        >
          +{queueLength} queued
        </div>
      )}
    </div>
  );
}
