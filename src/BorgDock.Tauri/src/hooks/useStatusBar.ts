import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { ActiveSection } from '@/stores/ui-store';

export interface StatusBarCopy {
  left: string;
  right: string;
}

function ago(date: Date | null | undefined): string {
  if (!date) return 'never';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/**
 * useStatusBar — returns the per-section status bar copy. The MainWindow
 * pipes this into <StatusBar left={...} right={...} />. Each section gets
 * one bit of dynamic state (last sync, ADO org/project) and one bit of
 * keyboard hint copy.
 */
export function useStatusBar(section: ActiveSection): StatusBarCopy {
  const lastPollTime = usePrStore((s) => s.lastPollTime);
  const rate = usePrStore((s) => s.rateLimit);
  const adoOrg = useSettingsStore((s) => s.settings.azureDevOps.organization);
  const adoProject = useSettingsStore((s) => s.settings.azureDevOps.project);

  switch (section) {
    case 'focus':
      return {
        left: 'focus computed just now · weights from settings',
        right: 'Press R for Quick Review',
      };
    case 'prs': {
      const ratePart = rate ? ` · rate ${rate.remaining}/${rate.limit}` : '';
      return {
        left: `synced ${ago(lastPollTime)}${ratePart}`,
        right: 'Ctrl+F7 worktrees · Ctrl+F8 files · Ctrl+F9 ADO',
      };
    }
    case 'workitems':
      return {
        left: `ado: ${adoOrg || '—'}/${adoProject || '—'}`,
        right: 'Ctrl+F9 command palette',
      };
  }
}
