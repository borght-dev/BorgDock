import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { createLogger } from '@/services/logger';

const log = createLogger('useBadgeVisibility');

/**
 * Watch `settings.ui.badgeEnabled` and call the Rust `set_badge_visible`
 * command whenever it flips. The badge window is created lazily on first
 * show and simply hidden when disabled; its position and state persist for
 * the lifetime of the app session.
 *
 * Gated on `hasLoaded` rather than `!isLoading` because the store starts
 * with `isLoading: false` + default settings on first render. If we only
 * checked `isLoading`, we'd fire an invoke with the DEFAULT badgeEnabled
 * value before loadSettings has read the user's actual preference from
 * disk, creating and then hiding the window in rapid succession if the
 * user has it disabled.
 */
export function useBadgeVisibility(): void {
  const badgeEnabled = useSettingsStore((s) => s.settings.ui.badgeEnabled);
  const hasLoaded = useSettingsStore((s) => s.hasLoaded);

  useEffect(() => {
    if (!hasLoaded) return;
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        log.info('invoking set_badge_visible', { show: badgeEnabled });
        await invoke('set_badge_visible', { show: badgeEnabled });
        log.info('set_badge_visible done', { show: badgeEnabled });
      } catch (err) {
        log.error('set_badge_visible failed', err);
      }
    })();
  }, [badgeEnabled, hasLoaded]);
}
