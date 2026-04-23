import { useEffect, useRef, useState } from 'react';
import { FlyoutGlance, type FlyoutData } from './FlyoutGlance';

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

  // On mount: fetch cached data from Rust (bypasses suspended main window JS)
  // Then listen for live updates when the main window pushes new data.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        // 1. Fetch cached data directly from Rust state
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

        // 2. Listen for live updates (when main window pushes new data)
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<FlyoutData>('flyout-update', (event) => {
          hasReceivedData.current = true;
          setData(event.payload);
          if (event.payload.theme) {
            applyTheme(event.payload.theme);
          }
        });
      } catch (err) {
        console.error('[Flyout] Failed to initialize:', err);
      }
    })();

    return () => unlisten?.();
  }, []);

  // Close on click outside / window blur.
  // The Rust side also hides on WindowEvent::Focused(false), but that fires
  // unreliably for transparent always-on-top windows on Windows. These two
  // JS-side handlers cover the cases it misses:
  //   - blur: user clicks fully outside the Tauri window
  //   - mousedown on backdrop: user clicks inside the window's transparent
  //     padding but outside the panel itself
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
    };
    window.addEventListener('blur', hide);
    return () => window.removeEventListener('blur', hide);
  }, []);

  return <FlyoutGlance data={data} />;
}
