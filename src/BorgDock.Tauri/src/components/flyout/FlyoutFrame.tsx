import type { MouseEvent, ReactNode, Ref } from 'react';

interface FlyoutFrameProps {
  children: ReactNode;
  panelRef?: Ref<HTMLDivElement>;
  onBackdropMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  /** Rendered beside the panel inside the backdrop (e.g. context menus). */
  overlay?: ReactNode;
}

/**
 * Transparent flyout window backdrop + the rounded glance panel. Shared by
 * every flyout view that renders inside the glance-sized window so loading
 * and loaded states occupy exactly the same frame.
 */
export function FlyoutFrame({
  children,
  panelRef,
  onBackdropMouseDown,
  overlay,
}: FlyoutFrameProps) {
  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      // style: transparent background required for Tauri transparent-window overlay; padding in px avoids Tailwind rounding
      style={{ background: 'transparent', padding: 16 }}
      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={panelRef}
        // max-h-full + flex-col so the panel never overflows the window — the
        // PR list shrinks instead of pushing the header off-screen when the
        // window's vertical budget is tight.
        className="flex max-h-full w-[428px] flex-col overflow-hidden rounded-[14px] border"
        // style: animation keyframe + flyout-shadow custom property cannot be expressed as Tailwind utilities
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-strong-border)',
          animation: 'flyoutIn 220ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: 'var(--flyout-shadow)',
        }}
      >
        {children}
      </div>

      {overlay}

      <style>{`
        :root {
          --flyout-shadow: 0 8px 24px rgba(90, 86, 112, 0.18), 0 2px 6px rgba(90, 86, 112, 0.06);
        }
        .dark {
          --flyout-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.25);
        }
        @keyframes flyoutIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
