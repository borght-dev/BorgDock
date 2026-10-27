import { useEffect, useState } from 'react';
import * as store from '@/services/ci-failures/store-api';
import type { CiPrFailures } from '@/services/ci-failures/types';
import {
  CI_FAILURES_CHANGED_EVENT,
  type CiFailuresChange,
  scopeOfRepo,
} from '@/stores/ci-failures-store';
import { useSettingsStore } from '@/stores/settings-store';

export interface PrCiFailures {
  scope: string;
  data: CiPrFailures | null;
  loading: boolean;
}

/**
 * A PR's recorded failure occurrences and the groups they belong to, read
 * from the CI failure store and again whenever its scope changes. Works in
 * the main window and the pop-out alike: both read the same store.
 */
export function usePrCiFailures(owner: string, repo: string, prNumber: number): PrCiFailures {
  const account = useSettingsStore(
    (s) =>
      s.settings.repos.find(
        (r) =>
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.name.toLowerCase() === repo.toLowerCase(),
      )?.githubAccount ?? '',
  );
  const scope = scopeOfRepo({ owner, name: repo, githubAccount: account });
  const [data, setData] = useState<CiPrFailures | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!owner || !repo || !prNumber) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const read = () => {
      void store
        .loadPr(scope, prNumber)
        .then((result) => {
          if (!cancelled) setData(result);
        })
        .catch(() => {
          if (!cancelled) setData(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    setLoading(true);
    read();
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<CiFailuresChange>(CI_FAILURES_CHANGED_EVENT, (event) => {
          if (event.payload.scopes.length === 0 || event.payload.scopes.includes(scope)) read();
        }),
      )
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [owner, repo, scope, prNumber]);

  return { scope, data, loading };
}
