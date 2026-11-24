import { useMemo } from 'react';
import { useNow } from '@/hooks/useNow';
import { type AccountView, accountViews } from '@/services/ai-usage/model';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiUsageSettings } from '@/types/settings';

const MINUTE_MS = 60_000;

export interface AccountViews {
  /** Every account found, in the saved order. */
  views: AccountView[];
  settings: AiUsageSettings | undefined;
  now: number;
}

/** The AI accounts as they are shown, kept current as readings, settings and the minute change. */
export function useAccountViews(): AccountViews {
  const accounts = useAiUsageStore((s) => s.accounts);
  const readings = useAiUsageStore((s) => s.readings);
  const settings = useSettingsStore((s) => s.settings.aiUsage);
  const now = useNow(MINUTE_MS);
  const views = useMemo(
    () => accountViews({ accounts, readings, settings, nowMs: now }),
    [accounts, readings, settings, now],
  );
  return { views, settings, now };
}
