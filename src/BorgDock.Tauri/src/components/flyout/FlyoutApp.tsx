import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createLogger } from '@/services/logger';
import type { ThemeMode } from '@/types/settings';
import { updateTheme } from '@/utils/theme';
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

/** The flyout's theme comes with each payload from the main window. */
function applyPayloadTheme(data: Partial<Pick<FlyoutData, 'theme' | 'reduceMotion'>>) {
  // updateTheme: a payload without `reduceMotion` keeps the current value.
  updateTheme({ theme: data.theme as ThemeMode, reduceMotion: data.reduceMotion });
}

async function isFlyoutVisible(): Promise<boolean> {
  try {
    return await getCurrentWindow().isVisible();
  } catch {
    return false;
  }
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

  // Register events before reading the cache. Native toast delivery waits for
  // this boot to finish, so its first payload cannot race the initial glance.
  useEffect(() => {
    let cancelled = false;
    const stops: (() => void)[] = [];
    const register = async <T,>(name: string, handler: (event: { payload: T }) => void) => {
      const stop = await listen<T>(name, (event) => {
        if (!cancelled) handler(event);
      });
      if (cancelled) stop();
      else stops.push(stop);
    };
    void (async () => {
      try {
        await register('init-complete', () => {
          void isFlyoutVisible().then((visible) => {
            if (!cancelled) dispatch({ type: 'init-complete', visible });
          });
        });
        await register<ToastPayload>('flyout-toast', (event) => {
          dispatch({ type: 'toast', payload: event.payload });
        });
        await register('flyout-request-data', () => dispatch({ type: 'user-open' }));
        await register<FlyoutData>('flyout-update', (event) => {
          hasReceivedData.current = true;
          setData(event.payload);
          if (event.payload.theme) applyPayloadTheme(event.payload);
        });
        if (cancelled) return;
        const cached = await invoke<string | null>('get_flyout_data').catch((err) => {
          log.warn('Failed to read cached flyout data', err);
          return null;
        });
        if (cancelled) return;
        if (cached && !hasReceivedData.current) {
          try {
            const parsed = JSON.parse(cached) as FlyoutData;
            hasReceivedData.current = true;
            setData(parsed);
            if (parsed.theme) applyPayloadTheme(parsed);
          } catch {
            // A malformed cache must not prevent toast delivery.
          }
        }
        if (hasReceivedData.current) {
          const visible = await isFlyoutVisible();
          if (!cancelled) dispatch({ type: 'init-complete', visible });
        }
        if (!cancelled) await emit('flyout-toast-ready');
      } catch (err) {
        if (!cancelled) log.error('Failed to initialize', err);
      }
    })();
    return () => {
      cancelled = true;
      for (const stop of stops) stop();
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
        if (payload.data.theme) applyPayloadTheme(payload.data);
      }
      // Always finish init so the splash isn't stuck.
      dispatch({ type: 'init-complete' });
      if (payload.mode === 'glance' || payload.mode === undefined) {
        dispatch({ type: 'user-open' });
      } else if (payload.mode === 'idle') {
        dispatch({ type: 'close' });
      }
    };
    (
      window as unknown as { __borgdock_test_flyout_seed?: typeof seed }
    ).__borgdock_test_flyout_seed = seed;
    return () => {
      delete (window as unknown as { __borgdock_test_flyout_seed?: typeof seed })
        .__borgdock_test_flyout_seed;
    };
  }, []);

  // Reset reducer whenever the OS reports the flyout window lost focus. We
  // listen on Tauri's window-focus event rather than a DOM `blur` listener
  // so the close dispatch also fires when Rust hides the window externally
  // (the click-outside mouse hook and the tray-toggle hide path both call
  // `win.hide()` directly). Without this, the reducer would stay in
  // `glance`/`toast` while the window is hidden, and the next
  // `show_flyout_toast` would render the new payload as a banner on top of
  // the stale glance instead of as a fresh toast bubble.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const fn = await getCurrentWindow().onFocusChanged(async ({ payload: focused }) => {
          if (cancelled || focused) return;
          try {
            if (cancelled) return;
            await invoke('hide_flyout');
          } catch {
            // ignore — window may already be hidden
          }
          if (cancelled) return;
          dispatch({ type: 'close' });
        });
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch (err) {
        console.error('[Flyout] focus listener failed:', err);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Shared close handler used by FlyoutGlance so every hide path also resets
  // the reducer back to idle.
  const handleClose = useCallback(async () => {
    try {
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
        const { emitTo } = await import('@tauri-apps/api/event');
        switch (action) {
          case 'clean-host-disk':
            if (url) await emitTo('main', 'disk-cleanup', { hostId: url });
            break;
          case 'open-pr':
            if (toast.prOwner && toast.prRepo && toast.prNumber) {
              const { showPr } = await import('@/services/navigation');
              await showPr({
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
          case 'dispatch-show':
            if (url) {
              await emitTo('main', 'dispatch-show-item', { itemId: Number(url) });
            }
            break;
          case 'activity-open':
            await emitTo('main', 'activity-show', { id: url ?? '' });
            break;
          case 'activity-act':
            if (url) await emitTo('main', 'activity-act', { id: url });
            break;
          case 'workstream-show':
            if (url) {
              await emitTo('main', 'workstreams-show', { id: url });
            }
            break;
          case 'dispatch-act': {
            const [itemId, actionId] = (url ?? '').split(':');
            if (itemId && actionId) {
              await emitTo('main', 'dispatch-item-action', { itemId: Number(itemId), actionId });
            }
            break;
          }
          case 'merge-pr':
          case 'start-review':
          case 'open-url':
            if (url) {
              const { openUrl } = await import('@tauri-apps/plugin-opener');
              await openUrl(url);
            }
            break;
          case 'focus-pane':
            if (toast.sessionId) {
              const ok = await invoke<boolean>('focus_session_pane', {
                sessionId: toast.sessionId,
              });
              if (!ok) {
                const { sendOsNotification } = await import('@/services/notification');
                void sendOsNotification({
                  title: 'No terminal window',
                  body: "Couldn't find a terminal window for this session.",
                  severity: 'info',
                }).catch(() => {});
              }
            }
            break;
        }
      } catch (err) {
        log.error('toast action failed', err);
      } finally {
        try {
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
        if (mode.kind === 'toast') {
          // Per-card budget covers: severity stripe (3-4px) + icon disc (36-44px)
          // + title (line-clamp-2) + body (line-clamp-2) + optional action pill row
          // + progress bar + 24px vertical padding. The merged variant is taller,
          // so 170 is the conservative per-card budget. Outer padding 48 covers
          // container px-4/py-4 (32px) plus the glow halo (-inset-1/-inset-2).
          // Width covers the merged card (400px) + glow (~8px) + padding (32px).
          const width = 440;
          const gap = 10; // matches gap-2.5 between cards
          const height = toastQueueLen * 170 + Math.max(0, toastQueueLen - 1) * gap + 48;
          if (!cancelled) await invoke('resize_flyout', { width, height });
        } else if (mode.kind === 'glance' || mode.kind === 'initializing') {
          // Match the glance-mode constants from Rust (FLYOUT_GLANCE_W/H in
          // src-tauri/src/platform/window.rs). Keep these in sync — drifting
          // narrower than the inner panel (currently w-[428px] + 16px
          // wrapper padding on each side) clips the panel left edge.
          if (!cancelled) await invoke('resize_flyout', { width: 460, height: 512 });
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

  // `data-app-ready` is the Playwright wait-target. The flyout reaches its
  // first paintable state when the reducer leaves `initializing` (the seed
  // and the real `init-complete` event both trigger this). Each render
  // branch wraps in a `display: contents` div so layout is unchanged.
  const appReady = mode.kind !== 'initializing' ? 'true' : undefined;

  switch (mode.kind) {
    case 'initializing':
      return (
        <div style={{ display: 'contents' }}>
          <FlyoutInitializing />
        </div>
      );
    case 'idle':
      return <div hidden data-app-ready={appReady} />;
    case 'glance':
      return (
        <div data-app-ready={appReady} style={{ display: 'contents' }}>
          <FlyoutGlance data={data} banner={mode.banner} onClose={handleClose} />
        </div>
      );
    case 'toast':
      return (
        <div data-app-ready={appReady} style={{ display: 'contents' }}>
          <FlyoutToast
            queue={mode.queue}
            onHoverEnter={() => dispatch({ type: 'hover-enter' })}
            onHoverLeave={() => dispatch({ type: 'hover-leave' })}
            onDismiss={(id) => dispatch({ type: 'dismiss-toast', id })}
            onActionClick={handleToastAction}
          />
        </div>
      );
  }
}
