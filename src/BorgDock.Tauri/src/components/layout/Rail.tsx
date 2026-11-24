import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import {
  Activity,
  Crosshair,
  FolderGit2,
  GitPullRequest,
  ListChecks,
  type LucideIcon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { RailLimits } from '@/components/ai-usage/RailLimits';
import { BorgDockLogo } from '@/components/shared/icons';
import { IconButton, SlidingHighlight } from '@/components/shared/primitives';
import { WindowLauncher } from '@/components/shared/WindowLauncher';
import { useWorktreeCount } from '@/hooks/useWorktreeMap';
import { showSection } from '@/services/navigation';
import { selectNeedsYou, useActivityStore } from '@/stores/activity-store';
import { selectWaitingCount, useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { type ActiveSection, SECTION_ORDER, useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';

/** Sentence-case section names, shared by the rail and the title bar. */
export const SECTION_LABELS: Record<ActiveSection, string> = {
  focus: 'Focus',
  dispatch: 'Dispatch',
  prs: 'Pull requests',
  workitems: 'Work items',
  worktrees: 'Worktrees',
  activity: 'Activity',
  notes: 'Notes',
};

/** The icons the folded rail shows for each section. */
const SECTION_ICONS: Record<ActiveSection, LucideIcon> = {
  focus: Crosshair,
  dispatch: Send,
  prs: GitPullRequest,
  workitems: ListChecks,
  worktrees: FolderGit2,
  activity: Activity,
  notes: NotebookPen,
};

/** A count on a folded rail's icon: "99+" above 99. */
function badgeText(value: number): string {
  return value > 99 ? '99+' : String(value);
}

/** How often the "Synced … ago" line re-renders. */
const SYNC_TICK_MS = 10_000;

/** "Synced 12 s ago", "Synced 4 min ago", "Synced 2 h ago". */
export function formatSyncedAgo(lastPollTime: Date | null, now: number): string {
  if (!lastPollTime) return 'Not synced yet';
  const seconds = Math.max(0, Math.floor((now - lastPollTime.getTime()) / 1000));
  if (seconds < 5) return 'Synced just now';
  if (seconds < 60) return `Synced ${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Synced ${minutes} min ago`;
  return `Synced ${Math.floor(minutes / 60)} h ago`;
}

interface RailCount {
  value: number;
  /** Drawn red: some open pull request is failing its checks. */
  hot?: boolean;
}

function useRailCounts(): Partial<Record<ActiveSection, RailCount>> {
  // Primitive selectors: the rail re-renders only when a number changes. The
  // derived selectors are cached in the store, so calling them is cheap.
  const openCount = usePrStore((s) => s.pullRequests.length);
  const failing = usePrStore((s) => s.counts().failing);
  const focusCount = usePrStore((s) => s.focusCount());
  const waitingCount = useDispatchStore(selectWaitingCount);
  const workItemCount = useWorkItemsStore((s) => s.workItems.length);
  const worktreeCount = useWorktreeCount();
  const activityCount = useActivityStore(selectNeedsYou);

  const counts: Partial<Record<ActiveSection, RailCount>> = {
    prs: { value: openCount, hot: failing > 0 },
  };
  if (focusCount > 0) counts.focus = { value: focusCount };
  if (waitingCount > 0) counts.dispatch = { value: waitingCount };
  if (workItemCount > 0) counts.workitems = { value: workItemCount };
  if (worktreeCount > 0) counts.worktrees = { value: worktreeCount };
  if (activityCount > 0) counts.activity = { value: activityCount, hot: true };
  return counts;
}

/** "Synced 12 s ago": when the pull requests were last read. Folded, only screen readers hear it. */
function SyncLine({ collapsed }: { collapsed: boolean }) {
  const lastPollTime = usePrStore((s) => s.lastPollTime);
  const isPolling = usePrStore((s) => s.isPolling);
  const [now, setNow] = useState(() => Date.now());

  // A poll that lands between ticks reads as "just now" until the next tick
  // (formatSyncedAgo clamps a poll newer than `now` to zero).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), SYNC_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={clsx('bd-rail__sync', collapsed && 'sr-only')}>
      {!collapsed && (
        <span className="bd-rail__sync-line">
          {isPolling ? 'Syncing…' : formatSyncedAgo(lastPollTime, now)}
        </span>
      )}
      {/* Announce the sync state changing, not the ticking relative time. */}
      <span className="sr-only" aria-live="polite">
        {isPolling ? 'Syncing' : lastPollTime ? 'Synced' : ''}
      </span>
    </div>
  );
}

function openSettings() {
  void invoke('open_settings_window', {}).catch((e) =>
    console.error('open_settings_window failed', e),
  );
}

/**
 * The bar the rail ends in: Settings in the corner, Open window, and the
 * fold toggle at the far end. Folded, the same buttons stack with Settings
 * still at the bottom.
 */
function RailBar({ collapsed }: { collapsed: boolean }) {
  const toggleRail = useUiStore((s) => s.toggleRail);
  return (
    <div className="bd-rail__bar">
      <IconButton
        icon={<Settings size={15} strokeWidth={2} />}
        tooltip="Settings"
        aria-label="Settings"
        onClick={openSettings}
      />
      <WindowLauncher anchor="rail" settingsItem={false} />
      <button
        type="button"
        className="bd-rail__toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-keyshortcuts="["
        title={collapsed ? 'Expand navigation ([)' : 'Collapse navigation ([)'}
        onClick={toggleRail}
        data-rail-toggle=""
      >
        {collapsed ? (
          <PanelLeftOpen size={15} strokeWidth={2} aria-hidden="true" />
        ) : (
          <PanelLeftClose size={15} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * Rail — the main window's left navigation (plans/ui-overhaul-workbench.md,
 * phase 1): workspace name, the five sections with their counts and a
 * sliding highlight behind the active one, and the sync state with the
 * GitHub rate meter at the bottom. Keys `1`–`7` pick the same sections
 * (wired in useKeyboardNav). Dispatch counts the items waiting on you,
 * Activity the unread entries that need you.
 *
 * Folded (the button at the bottom, or `[`): icons with their counts as
 * badges, the name on hover, and the rate meter alone. The choice is
 * remembered (`ui-store.railCollapsed`).
 */
export function Rail() {
  const activeSection = useUiStore((s) => s.activeSection);
  const collapsed = useUiStore((s) => s.railCollapsed);
  const counts = useRailCounts();

  return (
    <aside
      className={clsx('bd-rail', collapsed && 'bd-rail--collapsed')}
      aria-label="Navigation"
      data-collapsed={collapsed ? 'true' : undefined}
    >
      <div className="bd-rail__ws" data-tauri-drag-region>
        <BorgDockLogo size={18} id="bd-rail-logo" />
        {!collapsed && (
          <span className="bd-rail__ws-name" data-tauri-drag-region>
            BorgDock
          </span>
        )}
      </div>
      <nav aria-label="Sections">
        <SlidingHighlight activeKey={activeSection} className="bd-rail__nav">
          {SECTION_ORDER.map((section, index) => {
            const active = section === activeSection;
            const count = counts[section];
            const Icon = SECTION_ICONS[section];
            return (
              <button
                key={section}
                type="button"
                className={clsx('bd-rail__item', active && 'bd-rail__item--active')}
                data-highlight-key={section}
                data-section={section}
                aria-current={active ? 'page' : undefined}
                aria-keyshortcuts={String(index + 1)}
                title={
                  collapsed && count
                    ? `${SECTION_LABELS[section]} · ${count.value} (${index + 1})`
                    : `${SECTION_LABELS[section]} (${index + 1})`
                }
                onClick={() => void showSection(section)}
              >
                <span className={clsx('bd-rail__label', collapsed && 'sr-only')}>
                  {SECTION_LABELS[section]}
                </span>
                {collapsed ? (
                  <span className="bd-rail__glyph">
                    <Icon size={16} strokeWidth={2} aria-hidden="true" className="bd-rail__icon" />
                    {count && (
                      <span
                        className={clsx(
                          'bd-rail__count bd-rail__count--badge',
                          count.hot && 'bd-rail__count--hot',
                        )}
                      >
                        {badgeText(count.value)}
                      </span>
                    )}
                  </span>
                ) : (
                  count && (
                    <span className={clsx('bd-rail__count', count.hot && 'bd-rail__count--hot')}>
                      {count.value}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </SlidingHighlight>
      </nav>
      <div className="bd-rail__foot">
        <RailLimits collapsed={collapsed} />
        <SyncLine collapsed={collapsed} />
        <RailBar collapsed={collapsed} />
      </div>
    </aside>
  );
}
