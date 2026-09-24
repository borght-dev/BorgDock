import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { BorgDockLogo } from '@/components/shared/icons';
import { SlidingHighlight } from '@/components/shared/primitives';
import { showSection } from '@/services/navigation';
import { usePrStore } from '@/stores/pr-store';
import { type ActiveSection, SECTION_ORDER, useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';

/** Sentence-case section names, shared by the rail and the title bar. */
export const SECTION_LABELS: Record<ActiveSection, string> = {
  focus: 'Focus',
  prs: 'Pull requests',
  workitems: 'Work items',
  worktrees: 'Worktrees',
};

/** How often the "Synced … ago" line re-renders. */
const SYNC_TICK_MS = 10_000;

const numberFormat = new Intl.NumberFormat('en-US');

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
  const workItemCount = useWorkItemsStore((s) => s.workItems.length);

  const counts: Partial<Record<ActiveSection, RailCount>> = {
    prs: { value: openCount, hot: failing > 0 },
  };
  if (focusCount > 0) counts.focus = { value: focusCount };
  if (workItemCount > 0) counts.workitems = { value: workItemCount };
  return counts;
}

function SyncBlock() {
  const lastPollTime = usePrStore((s) => s.lastPollTime);
  const isPolling = usePrStore((s) => s.isPolling);
  const rate = usePrStore((s) => s.rateLimit);
  const [now, setNow] = useState(() => Date.now());

  // A poll that lands between ticks reads as "just now" until the next tick
  // (formatSyncedAgo clamps a poll newer than `now` to zero).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), SYNC_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const fraction =
    rate && rate.limit > 0 ? Math.min(1, Math.max(0, rate.remaining / rate.limit)) : 0;

  return (
    <div className="bd-rail__sync">
      <span className="bd-rail__sync-line">
        {isPolling ? 'Syncing…' : formatSyncedAgo(lastPollTime, now)}
      </span>
      {/* Announce the sync state changing, not the ticking relative time. */}
      <span className="sr-only" aria-live="polite">
        {isPolling ? 'Syncing' : lastPollTime ? 'Synced' : ''}
      </span>
      {rate && (
        <>
          <div
            className={clsx('bd-rail__meter', fraction < 0.1 && 'bd-rail__meter--low')}
            role="meter"
            aria-label="GitHub requests left"
            aria-valuemin={0}
            aria-valuemax={rate.limit}
            aria-valuenow={rate.remaining}
          >
            {/* style: fill width is the live remaining/limit ratio */}
            <span
              className="bd-rail__meter-fill"
              style={{ width: `${(fraction * 100).toFixed(2)}%` }}
            />
          </div>
          <span className="bd-rail__sync-line">
            {numberFormat.format(rate.remaining)} of {numberFormat.format(rate.limit)} requests left
            {rate.pool ? ` (${rate.pool === 'graphql' ? 'GraphQL' : 'REST'})` : ''}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Rail — the main window's left navigation (plans/ui-overhaul-workbench.md,
 * phase 1): workspace name, the four sections with their counts and a
 * sliding highlight behind the active one, and the sync state with the
 * GitHub rate meter at the bottom. Keys `1`–`4` pick the same sections
 * (wired in useKeyboardNav).
 */
export function Rail() {
  const activeSection = useUiStore((s) => s.activeSection);
  const counts = useRailCounts();

  return (
    <aside className="bd-rail" aria-label="Navigation">
      <div className="bd-rail__ws" data-tauri-drag-region>
        <BorgDockLogo size={18} id="bd-rail-logo" />
        <span className="bd-rail__ws-name" data-tauri-drag-region>
          BorgDock
        </span>
      </div>
      <nav aria-label="Sections">
        <SlidingHighlight activeKey={activeSection} className="bd-rail__nav">
          {SECTION_ORDER.map((section, index) => {
            const active = section === activeSection;
            const count = counts[section];
            return (
              <button
                key={section}
                type="button"
                className={clsx('bd-rail__item', active && 'bd-rail__item--active')}
                data-highlight-key={section}
                data-section={section}
                aria-current={active ? 'page' : undefined}
                aria-keyshortcuts={String(index + 1)}
                title={`${SECTION_LABELS[section]} (${index + 1})`}
                onClick={() => void showSection(section)}
              >
                <span className="bd-rail__label">{SECTION_LABELS[section]}</span>
                {count && (
                  <span className={clsx('bd-rail__count', count.hot && 'bd-rail__count--hot')}>
                    {count.value}
                  </span>
                )}
              </button>
            );
          })}
        </SlidingHighlight>
      </nav>
      <SyncBlock />
    </aside>
  );
}
