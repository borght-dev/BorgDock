import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { createLogger } from '@/services/logger';

const log = createLogger('useBadgeVisibility');

/**
 * Watch `settings.ui.badgeEnabled` and call the Rust `set_badge_visible`
 * command whenever it flips. The badge window is created lazily on first
 * show and simply hidden when disabled; its position and state persist for
 * the lifetime of the app session.
 */
export function useBadgeVisibility(): void {
  const badgeEnabled = useSettingsStore((s) => s.settings.ui.badgeEnabled);
  const settingsLoaded = useSettingsStore((s) => !s.isLoading);

  useEffect(() => {
    if (!settingsLoaded) return;
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_badge_visible', { show: badgeEnabled });
        log.info('set_badge_visible', { show: badgeEnabled });
      } catch (err) {
        log.error('set_badge_visible failed', err);
      }
    })();
  }, [badgeEnabled, settingsLoaded]);
}
