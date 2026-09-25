import type { Window } from '@tauri-apps/api/window';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import { WindowControls } from './chrome/WindowControls';
import { BorgDockLogo } from './icons';
import { TitleBar } from './primitives/Titlebar';

interface WindowTitleBarProps {
  /** Window title. A string renders in the title style; a node renders as given. */
  title: ReactNode;
  /** Optional content rendered right after the title (a shortcut, a breadcrumb). */
  meta?: ReactNode;
  /** Optional controls rendered on the right, before the window controls. */
  actions?: ReactNode;
  /**
   * Replaces the default close (closing the window), e.g. when closing has to
   * record something first. Minimize and maximize keep their defaults.
   */
  onClose?: () => void;
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

/**
 * WindowTitleBar — the title bar every tool window shares: logo, title, meta,
 * optional actions and the window controls, on the same 36 px bar with the
 * same hairline and Inter 13 px title as the main window's (`.bd-title-bar`).
 * The whole bar is a drag region; double-click toggles maximize.
 */
export function WindowTitleBar({ title, meta, actions, onClose }: WindowTitleBarProps) {
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
    if (onClose) {
      onClose();
      return;
    }
    win?.close().catch(console.debug); /* fire-and-forget */
  }, [win, onClose]);

  return (
    <TitleBar
      data-tauri-drag-region
      onDoubleClick={handleMaximize}
      left={
        <>
          <span className="bd-title-bar__logo" aria-hidden="true">
            <BorgDockLogo size={20} />
          </span>
          {typeof title === 'string' ? (
            <span className="bd-title-bar__title" data-tauri-drag-region>
              {title}
            </span>
          ) : (
            title
          )}
          {meta}
        </>
      }
      right={
        <>
          {actions && <span className="bd-title-bar__actions">{actions}</span>}
          <WindowControls
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            onClose={handleClose}
          />
        </>
      }
    />
  );
}
