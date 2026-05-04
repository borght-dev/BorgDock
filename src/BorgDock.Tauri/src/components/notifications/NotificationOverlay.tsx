import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { NotificationBubble } from './NotificationBubble';

const STACK_GAP_PX = 10; // matches gap-2.5

export function NotificationOverlay() {
  const active = useNotificationStore((s) => s.active);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const queueLength = useNotificationStore((s) => s.queue.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);

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

  // Measure-and-trim: render every active toast, then hide the oldest
  // ones that don't fit the container's actual height. This is the only
  // way to avoid clipping when bubble heights vary (action buttons,
  // long messages, the taller "merged" variant) — a fixed per-bubble
  // estimate inevitably gets it wrong at the edges.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const wrappers = Array.from(
        container.querySelectorAll<HTMLElement>('[data-toast-wrap]'),
      );
      if (wrappers.length === 0) {
        setHiddenCount(0);
        return;
      }

      // Reset visibility before measuring so offsetHeight is real.
      for (const w of wrappers) w.style.display = '';

      const containerHeight = container.clientHeight;
      let total = 0;
      let firstVisibleIdx = 0;
      // Walk from newest (last) backward, accumulate until exceeding container.
      for (let i = wrappers.length - 1; i >= 0; i--) {
        const w = wrappers[i];
        if (!w) continue;
        const h = w.offsetHeight;
        const next = total + h + (total > 0 ? STACK_GAP_PX : 0);
        if (next > containerHeight && i < wrappers.length - 1) {
          // i and everything before it overflows; keep at least the newest one.
          firstVisibleIdx = i + 1;
          break;
        }
        total = next;
        firstVisibleIdx = i;
      }

      let hidden = 0;
      for (let i = 0; i < wrappers.length; i++) {
        const w = wrappers[i];
        if (!w) continue;
        if (i < firstVisibleIdx) {
          w.style.display = 'none';
          hidden++;
        }
      }
      setHiddenCount(hidden);
    };

    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    for (const w of container.querySelectorAll('[data-toast-wrap]')) {
      ro.observe(w);
    }
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [active]);

  if (active.length === 0) return null;

  const overflow = hiddenCount + queueLength;

  return (
    <div
      ref={containerRef}
      data-notification-overlay
      className="fixed right-3 top-3 bottom-3 z-50 flex flex-col gap-2.5 max-h-[calc(100vh-1.5rem)] pointer-events-none"
    >
      {active.map((item) => (
        <div key={item.id} data-toast-wrap className="pointer-events-auto">
          <NotificationBubble
            notification={item.notification}
            onDismiss={() => dismiss(item.id)}
          />
        </div>
      ))}
      {overflow > 0 && (
        <div
          data-notification-queue-indicator
          className="self-end rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)] pointer-events-auto"
          style={{
            background: 'var(--color-toast-bg)',
            border: '1px solid color-mix(in srgb, var(--color-text-tertiary) 20%, transparent)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          }}
        >
          +{overflow} queued
        </div>
      )}
    </div>
  );
}
