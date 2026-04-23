import type { Window } from '@tauri-apps/api/window';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useRef } from 'react';

interface WindowTitleBarProps {
  title: string;
}

/** Lazily resolve the Tauri window handle — avoids crashing during render
 *  when `__TAURI_INTERNALS__` isn't injected yet (race on window creation). */
function useTauriWindow(): Window | null {
  const ref = useRef<Window | null | undefined>(undefined);
  if (ref.current === undefined) {
    try {
      ref.current = getCurrentWindow();
    } catch {
      ref.current = null;
    }
  }
  return ref.current;
}

export function WindowTitleBar({ title }: WindowTitleBarProps) {
  const win = useTauriWindow();

  const handleMinimize = useCallback(() => {
    win?.minimize().catch(console.debug); /* fire-and-forget */
  }, [win]);

  const handleMaximize = useCallback(async () => {
    if (!win) return;
    const isMax = await win.isMaximized();
    if (isMax) {
      win.unmaximize().catch(console.debug); /* fire-and-forget */
    } else {
      win.maximize().catch(console.debug); /* fire-and-forget */
    }
  }, [win]);

  const handleClose = useCallback(() => {
    win?.close().catch(console.debug); /* fire-and-forget */
  }, [win]);

  return (
    <div className="window-titlebar" data-tauri-drag-region onDoubleClick={handleMaximize}>
      <span className="window-titlebar-title" data-tauri-drag-region>
        {title}
      </span>
      <div className="window-titlebar-controls">
        <button className="window-titlebar-btn" onClick={handleMinimize} aria-label="Minimize">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button className="window-titlebar-btn" onClick={handleMaximize} aria-label="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect
              x="1.5"
              y="1.5"
              width="7"
              height="7"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
        </button>
        <button
          className="window-titlebar-btn window-titlebar-btn--close"
          onClick={handleClose}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M2 2l6 6M8 2l-6 6"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
