import type { Window } from '@tauri-apps/api/window';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useRef } from 'react';
import { WindowControls } from './chrome/WindowControls';
import { TitleBar } from './primitives/Titlebar';

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
    <TitleBar
      data-tauri-drag-region
      onDoubleClick={handleMaximize}
      left={<span className="bd-title-bar__title">{title}</span>}
      right={
        <WindowControls
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />
      }
    />
  );
}
