import { useCallback, useEffect, useRef, useState } from 'react';
import { startAdoSync } from '@/runtime/ado-sync';
import type { AppSettings } from '@/types';

export function useAdoPolling(settings: AppSettings) {
  const latest = useRef(settings);
  const integration = useRef<ReturnType<typeof startAdoSync> | null>(null);
  useEffect(() => {
    latest.current = settings;
  }, [settings]);
  const config = settings.azureDevOps;
  const signature = JSON.stringify([
    config.organization,
    config.project,
    config.authMethod,
    config.personalAccessToken,
    config.pollIntervalSeconds,
  ]);
  const [settled, setSettled] = useState(signature);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(signature), 500);
    return () => clearTimeout(timer);
  }, [signature]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: settled connection changes restart the runtime; other values come from the ref.
  useEffect(() => {
    const sync = startAdoSync(() => latest.current);
    integration.current = sync;
    return () => {
      sync.stop();
      integration.current = null;
    };
  }, [settled]);
  const refreshNow = useCallback(() => integration.current?.refresh() ?? Promise.resolve(), []);
  return { refreshNow };
}
