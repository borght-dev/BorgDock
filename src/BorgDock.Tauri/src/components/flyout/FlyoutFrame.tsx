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
 * and loaded states occupy exactly the same frame. The panel's surface,
 * shadow (`--elevation-2`) and entrance (`--motion-base`) live in
 * styles/tool-windows.css (`.bd-flyout-panel`).
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
        className="bd-flyout-panel flex max-h-full w-[428px] flex-col overflow-hidden rounded-[14px] border"
      >
        {children}
      </div>

      {overlay}
    </div>
  );
}
