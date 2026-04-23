import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createLogger } from '@/services/logger';
import { type FlyoutData, FlyoutGlance } from './FlyoutGlance';
import { FlyoutInitializing } from './FlyoutInitializing';
import { FlyoutToast } from './FlyoutToast';
import {
  type FlyoutEvent,
  initialFlyoutMode,
  reduceFlyoutMode,
  type ToastPayload,
} from './flyout-mode';

const log = createLogger('FlyoutApp');

function applyTheme(theme: string) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function FlyoutApp() {
  const [data, setData] = useState<FlyoutData>({
    pullRequests: [],
    failingCount: 0,
    pendingCount: 0,
    passingCount: 0,
    totalCount: 0,
    username: '',
    theme: 'system',
    lastSyncAgo: '...',
    hotkey: 'Ctrl+Win+Shift+G',
  });
  const hasReceivedData = useRef(false);

  // Reducer for the flyout mode state machine. `now` is wall-clock here since
  // this is production code; the reducer itself is pure (tested independently
  // with an injected `now`).
  const [mode, dispatchRaw] = useReducer(
    (state: ReturnType<typeof reduceFlyoutMode>, event: FlyoutEvent) =>
      reduceFlyoutMode(state, event, Date.now()),
    initialFlyoutMode,
  );
  const dispatch = useCallback((event: FlyoutEvent) => dispatchRaw(event), []);

  // Data fetch + flyout-update event listener — same as the pre-refactor shell.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const cached = await invoke<string | null>('get_flyout_data');
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as FlyoutData;
            hasReceivedData.current = true;
            setData(parsed);
            if (parsed.theme) applyTheme(parsed.theme);
          } catch {
            // ignore parse errors
          }
        }
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<FlyoutData>('flyout-update', (event) => {
          hasReceivedData.current = true;
          setData(event.payload);
          if (event.payload.theme) applyTheme(event.payload.theme);
        });
      } catch (err) {
        console.error('[Flyout] Failed to initialize:', err);
      }
    })();
    return () => unlisten?.();
  }, []);

  // Listen for new reducer-driving events from Rust.
  useEffect(() => {
    let unlistenInit: (() => void) | undefined;
    let unlistenToast: (() => void) | undefined;
    let unlistenRequest: (() => void) | undefined;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlistenInit = await listen('init-complete', () => {
        dispatch({ type: 'init-complete' });
      });
      unlistenToast = await listen<ToastPayload>('flyout-toast', (event) => {
        dispatch({ type: 'toast', payload: event.payload });
      });
      // Existing event: fires when the tray click / hotkey shows the flyout.
      // Treat it as a "user-open" signal for the reducer.
      unlistenRequest = await listen('flyout-request-data', () => {
        dispatch({ type: 'user-open' });
      });
    })();
    return () => {
      unlistenInit?.();
      unlistenToast?.();
      unlistenRequest?.();
    };
  }, [dispatch]);

  // Close on blur — same as before, but also dispatch close so the reducer
  // returns to idle.
  useEffect(() => {
    let hidden = false;
    const hide = async () => {
      if (hidden) return;
      hidden = true;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('hide_flyout');
      } catch {
        // ignore
      }
      dispatch({ type: 'close' });
    };
    window.addEventListener('blur', hide);
    return () => window.removeEventListener('blur', hide);
  }, [dispatch]);

  const handleToastAction = useCallback(
    async (toast: ToastPayload, action: string, url?: string) => {
      log.info('toast action', { id: toast.id, action });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { emitTo } = await import('@tauri-apps/api/event');
        switch (action) {
          case 'open-pr':
            if (toast.prOwner && toast.prRepo && toast.prNumber) {
              await invoke('open_pr_detail_window', {
                owner: toast.prOwner,
                repo: toast.prRepo,
                number: toast.prNumber,
              });
            }
            break;
          case 'fix-pr':
            await emitTo('main', 'flyout-fix-pr', {
              repoOwner: toast.prOwner,
              repoName: toast.prRepo,
              number: toast.prNumber,
              failedCheckNames: [],
            });
            break;
          case 'monitor-pr':
            await emitTo('main', 'flyout-monitor-pr', {
              repoOwner: toast.prOwner,
              repoName: toast.prRepo,
              number: toast.prNumber,
            });
            break;
          case 'merge-pr':
          case 'start-review':
          case 'open-url':
            if (url) {
              const { openUrl } = await import('@tauri-apps/plugin-opener');
              await openUrl(url);
            }
            break;
        }
        await invoke('hide_flyout');
        dispatch({ type: 'close' });
      } catch (err) {
        log.error('toast action failed', err);
      }
    },
    [dispatch],
  );

  switch (mode.kind) {
    case 'initializing':
      return <FlyoutInitializing />;
    case 'idle':
      return null;
    case 'glance':
      return <FlyoutGlance data={data} banner={mode.banner} />;
    case 'toast':
      return (
        <FlyoutToast
          queue={mode.queue}
          onHoverEnter={() => dispatch({ type: 'hover-enter' })}
          onHoverLeave={() => dispatch({ type: 'hover-leave' })}
          onExpire={() => dispatch({ type: 'timer-expired' })}
          onActionClick={handleToastAction}
        />
      );
  }
}
