import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback } from 'react';

interface WindowTitleBarProps {
  title: string;
}

export function WindowTitleBar({ title }: WindowTitleBarProps) {
  const win = getCurrentWindow();

  const handleMinimize = useCallback(() => {
    win.minimize().catch(() => {});
  }, [win]);

  const handleMaximize = useCallback(async () => {
    const isMax = await win.isMaximized();
    if (isMax) {
      win.unmaximize().catch(() => {});
    } else {
      win.maximize().catch(() => {});
    }
  }, [win]);

  const handleClose = useCallback(() => {
    win.close().catch(() => {});
  }, [win]);

  return (
    <div
      className="window-titlebar"
      data-tauri-drag-region
      onDoubleClick={handleMaximize}
    >
      <span className="window-titlebar-title" data-tauri-drag-region>
        {title}
      </span>
      <div className="window-titlebar-controls">
        <button
          className="window-titlebar-btn"
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          className="window-titlebar-btn"
          onClick={handleMaximize}
          aria-label="Maximize"
        >
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
