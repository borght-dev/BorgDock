import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { type ActiveSection, selectTopView, useUiStore } from '@/stores/ui-store';

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

/** Key hint for leaving a detail view. */
const BACK_KEYS = 'Esc back · Alt+← back';

/**
 * useStatusBar — returns the status bar copy for the current view. The
 * MainWindow pipes this into <StatusBar left={...} right={...} />. On the
 * list, each section gets one bit of dynamic state (last sync, ADO
 * org/project) and one bit of keyboard hint copy; a detail view names what
 * is open and how to go back.
 */
export function useStatusBar(section: ActiveSection): StatusBarCopy {
  const lastPollTime = usePrStore((s) => s.lastPollTime);
  const rate = usePrStore((s) => s.rateLimit);
  const adoOrg = useSettingsStore((s) => s.settings.azureDevOps.organization);
  const adoProject = useSettingsStore((s) => s.settings.azureDevOps.project);
  const top = useUiStore(selectTopView);
  const layoutV3 = useSettingsStore((s) => s.settings.ui.layoutV3 ?? false);
  // The rail layout's list keys (plan section 7): `/` focuses the section's
  // search (Focus and Worktrees have none, so it jumps to the PR list's) and
  // plain R refreshes everywhere but Focus, where R starts Quick Review.
  const keys = (hint: string, { search = true } = {}) =>
    layoutV3 ? [search ? '/ search' : null, 'R refresh', hint].filter(Boolean).join(' · ') : hint;

  if (top.kind === 'pr-detail') {
    return { left: `${top.owner}/${top.repo} #${top.number}`, right: BACK_KEYS };
  }
  if (top.kind === 'work-item-detail') {
    return { left: `work item AB#${top.id}`, right: BACK_KEYS };
  }

  switch (section) {
    case 'focus':
      return {
        left: 'focus computed just now · weights from settings',
        right: layoutV3 ? 'R Quick Review · Ctrl+R refresh' : 'Press R for Quick Review',
      };
    case 'prs': {
      // REST and GraphQL are separate 5000/h pools — say which one this is.
      const poolPart = rate?.pool ? ` (${rate.pool})` : '';
      const loginPart = rate?.login ? ` ${rate.login}` : '';
      const ratePart = rate ? ` · rate${loginPart} ${rate.remaining}/${rate.limit}${poolPart}` : '';
      return {
        left: `synced ${ago(lastPollTime)}${ratePart}`,
        right: keys('Ctrl+F7 worktrees · Ctrl+F8 files · Ctrl+F9 ADO'),
      };
    }
    case 'workitems':
      return {
        left: `ado: ${adoOrg || '—'}/${adoProject || '—'}`,
        right: keys('Ctrl+F9 command palette'),
      };
    case 'worktrees':
      return {
        left: 'worktrees open in their own window for now',
        right: keys('Ctrl+F7 worktrees', { search: false }),
      };
  }
}
