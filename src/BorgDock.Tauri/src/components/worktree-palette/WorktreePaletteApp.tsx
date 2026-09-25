import { invoke } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef } from 'react';
import { WindowStatusBar } from '@/components/shared/chrome';
import { Kbd } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import {
  WorktreeList,
  type WorktreeListHandle,
  type WorktreeListStatus,
} from '@/components/worktree/WorktreeList';

// The list helpers moved to the shared model; re-exported for existing callers.
export {
  compareFlatEntries,
  compareFolderNames,
  flattenSnapshot,
} from '@/components/worktree/worktree-list-model';

// Minimum window height so a small worktree list doesn't leave a cramped window.
const MIN_PALETTE_HEIGHT = 420;
const DEFAULT_PALETTE_WIDTH = 520;
const DEFAULT_PALETTE_HEIGHT = 420;
// Margin below the window so it doesn't overlap the OS taskbar / dock.
const MONITOR_BOTTOM_MARGIN = 60;

// Grow the untouched default window to fit the list, capped by the monitor.
// A restored user size is left alone so manual resizing survives restarts.
async function fitWindowToContent(): Promise<void> {
  try {
    const contentEl = document.querySelector('.bd-wt-content') as HTMLElement | null;
    if (!contentEl) return;

    const win = getCurrentWindow();
    const [physSize, scale, monitor] = await Promise.all([
      win.innerSize(),
      win.scaleFactor(),
      currentMonitor(),
    ]);

    const currentLogicalW = physSize.width / scale;
    const currentLogicalH = physSize.height / scale;
    const isDefaultSize =
      Math.abs(currentLogicalW - DEFAULT_PALETTE_WIDTH) < 1 &&
      Math.abs(currentLogicalH - DEFAULT_PALETTE_HEIGHT) < 1;
    if (!isDefaultSize) return;

    const overflow = contentEl.scrollHeight - contentEl.clientHeight;
    const maxLogicalH = (monitor ? monitor.size.height / scale : 900) - MONITOR_BOTTOM_MARGIN;

    let targetH: number;
    if (overflow > 0) {
      targetH = Math.min(currentLogicalH + overflow, maxLogicalH);
    } else if (overflow < -24) {
      targetH = Math.max(currentLogicalH + overflow, MIN_PALETTE_HEIGHT);
    } else {
      return;
    }
    if (Math.abs(targetH - currentLogicalH) < 4) return;

    await win.setSize(new LogicalSize(currentLogicalW, targetH));
  } catch (err) {
    // Tests don't mock these APIs; on failure the default size still
    // works (the list scrolls).
    console.debug('Palette fit-to-content failed:', err);
  }
}

function PaletteStatus({ shown, total, favoritesOnly }: WorktreeListStatus) {
  return (
    <WindowStatusBar
      left={
        <span className="bd-mono">
          {shown} of {total} worktree{total === 1 ? '' : 's'}
          {favoritesOnly && ' · favorites only'}
        </span>
      }
      right={
        <span className="bd-mono">
          <Kbd>{'↑↓'}</Kbd> nav {'·'} <Kbd>{'⏎'}</Kbd> open {'·'} <Kbd>esc</Kbd>
        </span>
      }
    />
  );
}

/**
 * The worktrees tool window (Ctrl+F7, `open_tool_window("worktrees")`): window
 * chrome around the shared `WorktreeList`. The chrome is the title bar and
 * status bar, the one-time fit to the list's height and the reveal
 * (`window_ready`), hiding on Esc, and the `palette-shown` reset when the
 * hidden window is shown again.
 */
export function WorktreePaletteApp() {
  const listRef = useRef<WorktreeListHandle>(null);

  const reveal = useCallback(async ({ focusSearch }: { focusSearch: () => void }) => {
    await fitWindowToContent();
    focusSearch();
    invoke('window_ready').catch(() => {});
  }, []);

  // Hide rather than close: the WebView2 stays alive across opens so
  // in-flight IPC responses don't PostMessage a dead HWND.
  const hide = useCallback(() => {
    void getCurrentWindow().hide();
  }, []);

  // The window is hidden (not destroyed) on Escape / close button, so on
  // each re-show the Rust toggle emits `palette-shown`. Reset query +
  // selection, revalidate in the background (list stays), refocus the input.
  useEffect(() => {
    const unlisten = listen('palette-shown', () => listRef.current?.reset());
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return (
    <WorktreeList
      ref={listRef}
      host="window"
      onClose={hide}
      onReveal={reveal}
      header={<WindowTitleBar title="Worktrees" meta={<Kbd>Ctrl+F7</Kbd>} />}
      renderStatus={(status) => <PaletteStatus {...status} />}
    />
  );
}
