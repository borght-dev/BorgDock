import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import { RELEASES } from '@/generated/changelog';
import { createLogger } from '@/services/logger';
import { useWhatsNewStore } from '@/stores/whats-new-store';
import { semverGt, semverLte } from '@/utils/semver';

const log = createLogger('useWhatsNew');

export async function openWhatsNew(version: string | null = null): Promise<void> {
  try {
    await invoke('open_whats_new_window', { version });
  } catch (err) {
    log.error('open_whats_new_window failed', err);
  }
}

export function useWhatsNew(): void {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      let currentVersion: string;
      try {
        currentVersion = await getVersion();
      } catch {
        currentVersion = '0.0.0';
      }

      await useWhatsNewStore.getState().hydrate();
      const { lastSeenVersion, autoOpenDisabled } = useWhatsNewStore.getState();

      if (lastSeenVersion === null) {
        // First run of this feature on this machine — silently seed.
        await useWhatsNewStore.getState().setLastSeenVersion(currentVersion);
        log.info('first run, seeded lastSeenVersion', { currentVersion });
        return;
      }

      if (autoOpenDisabled) {
        log.info('autoOpenDisabled — skipping auto-open');
        return;
      }

      const missed = RELEASES.filter(
        (r) => semverGt(r.version, lastSeenVersion) && semverLte(r.version, currentVersion),
      );
      if (missed.some((r) => r.autoOpenEligible)) {
        log.info('auto-opening whats-new', { missed: missed.map((r) => r.version) });
        await openWhatsNew(null);
      } else {
        log.info('no eligible missed release — not opening', {
          lastSeenVersion,
          currentVersion,
          missedCount: missed.length,
        });
      }
    })();
  }, []);
}
