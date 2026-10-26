import { useCallback, useEffect, useRef } from 'react';
import { createGitHubSync } from '@/runtime/github-sync';
import type { AppSettings } from '@/types';

export function useGitHubPolling(settings: AppSettings, enabled = true) {
  const settingsRef = useRef(settings);
  const sync = useRef<ReturnType<typeof createGitHubSync> | null>(null);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const accounts = settings.repos
    .map((r) => `${r.owner}/${r.name}:${r.githubAccount ?? ''}`)
    .sort()
    .join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: connection changes restart the runtime; other values come from the ref.
  useEffect(() => {
    if (!enabled) return;
    const current = createGitHubSync(() => settingsRef.current);
    sync.current = current;
    current.start();
    return () => {
      current.stop();
      sync.current = null;
    };
  }, [enabled, settings.gitHub.personalAccessToken, settings.gitHub.pollIntervalSeconds, accounts]);
  const pollNow = useCallback(() => sync.current?.refresh() ?? Promise.resolve(), []);
  return { pollNow };
}
