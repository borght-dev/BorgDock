import type { AppSettings, CiFailureSettings } from '@/types';

export const DEFAULT_CI_FAILURE_SETTINGS: CiFailureSettings = {
  enabled: true,
  includeDefaultBranch: true,
  crossRepoSuggestions: false,
  retentionDays: 30,
  maxLogMib: 2,
  logTimeoutSeconds: 15,
  dailyEvidenceLimit: 300,
  leaseHours: 24,
  notifyThreshold: 3,
};

/** The related CI failure settings, defaults filled in for settings saved before they existed. */
export function ciFailureSettings(settings: Pick<AppSettings, 'ciFailures'>): CiFailureSettings {
  return { ...DEFAULT_CI_FAILURE_SETTINGS, ...settings.ciFailures };
}
