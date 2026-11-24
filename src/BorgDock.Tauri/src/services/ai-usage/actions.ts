import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/services/logger';
import { manageUsageUrl } from './model';

const log = createLogger('ai-usage');

/** Opens Settings on AI, Accounts. */
export function openAccountSettings(): void {
  void invoke('open_settings_window', { section: 'accounts' }).catch((error) =>
    log.warn('open settings failed', { error }),
  );
}

/** Opens the provider's own usage page in the browser. */
export function openManageUsage(provider: string): void {
  void import('@tauri-apps/plugin-opener')
    .then(({ openUrl }) => openUrl(manageUsageUrl(provider)))
    .catch((error) => log.warn('open usage page failed', { error }));
}
