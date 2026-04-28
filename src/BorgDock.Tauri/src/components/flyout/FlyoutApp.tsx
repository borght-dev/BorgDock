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
    focusCount: 0,
    username: '',
    theme: 'system',
    lastSyncAgo: '...',
    hotkey: 'Ctrl+Win+Shift+G',
  });
  const hasReceivedData = useRef(false);

  // Reducer for the flyout mode state machine. `now` is wall-clock here since
  // this is production code; the reducer itself is pure (tested independently
  // with an injected `now`).
  const [mode, dispatch] = useReducer(
    (state: ReturnType<typeof reduceFlyoutMode>, event: FlyoutEvent) =>
      reduceFlyoutMode(state, event, Date.now()),
    initialFlyoutMode,
  );

  // Data fetch + flyout-update event listener — same as the pre-refactor shell.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const cached = await invoke<string | null>('get_flyout_data');
        if (cancelled) return;
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
        if (cancelled) return;
        unlisten = await listen<FlyoutData>('flyout-update', (event) => {
          if (cancelled) return;
          hasReceivedData.current = true;
          setData(event.payload);
          if (event.payload.theme) applyTheme(event.payload.theme);
        });
        if (cancelled) {
          unlisten?.();
          unlisten = undefined;
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[Flyout] Failed to initialize:', err);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
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
  }, []);

  // Dev-only test seed — Playwright e2e drives FlyoutData + reducer state
  // here without going through Tauri events (the test runs in pure Vite,
  // not under Tauri, so the real listen() handlers never fire).
  // Tree-shaken in production: `import.meta.env.DEV` is replaced with `false`.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    type FlyoutTestSeed = {
      data?: Partial<FlyoutData> & { pullRequests?: FlyoutData['pullRequests'] };
      mode?: 'glance' | 'idle' | 'initializing';
    };
    const seed = (payload: FlyoutTestSeed) => {
      if (payload.data) {
        setData((prev) => ({ ...prev, ...payload.data }));
        hasReceivedData.current = true;
        if (payload.data.theme) applyTheme(payload.data.theme);
      }
      // Always finish init so the splash isn't stuck.
      dispatch({ type: 'init-complete' });
      if (payload.mode === 'glance' || payload.mode === undefined) {
        dispatch({ type: 'user-open' });
      } else if (payload.mode === 'idle') {
        dispatch({ type: 'close' });
      }
    };
    (window as unknown as { __borgdock_test_flyout_seed?: typeof seed }).__borgdock_test_flyout_seed =
      seed;
    return () => {
      delete (window as unknown as { __borgdock_test_flyout_seed?: typeof seed })
        .__borgdock_test_flyout_seed;
    };
  }, []);

  // Close on blur — same as before, but also dispatch close so the reducer
  // returns to idle.
  useEffect(() => {
    let cancelled = false;
    let hidden = false;
    const hide = async () => {
      if (hidden) return;
      hidden = true;
      if (cancelled) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (cancelled) return;
        await invoke('hide_flyout');
      } catch {
        // ignore
      }
      if (cancelled) return;
      dispatch({ type: 'close' });
    };
    window.addEventListener('blur', hide);
    return () => {
      cancelled = true;
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Shared close handler used by FlyoutGlance so every hide path also resets
  // the reducer back to idle.
  const handleClose = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('hide_flyout');
    } catch {
      // ignore
    }
    dispatch({ type: 'close' });
  }, []);

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
      } catch (err) {
        log.error('toast action failed', err);
      } finally {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('hide_flyout');
        } catch {
          // ignore
        }
        dispatch({ type: 'close' });
      }
    },
    [],
  );

  // Resize the flyout window to match current mode + content.
  // Toast height grows with queue size so cards don't clip at the window edge.
  const toastQueueLen = mode.kind === 'toast' ? mode.queue.length : 0;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (mode.kind === 'toast') {
          // Per-card budget + outer padding. Generous to fit title + body + optional action row.
          const width = 340;
          const height = toastQueueLen * 160 + 32;
          if (!cancelled) await invoke('resize_flyout', { width, height });
        } else if (mode.kind === 'glance' || mode.kind === 'initializing') {
          // Match the glance-mode constants from Rust (FLYOUT_GLANCE_W/H).
          if (!cancelled) await invoke('resize_flyout', { width: 412, height: 512 });
        }
        // idle: window is hidden, no-op
      } catch {
        // ignore — resize is cosmetic, not critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode.kind, toastQueueLen]);

  switch (mode.kind) {
    case 'initializing':
      return <FlyoutInitializing />;
    case 'idle':
      return null;
    case 'glance':
      return <FlyoutGlance data={data} banner={mode.banner} onClose={handleClose} />;
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
