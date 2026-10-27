import { useEffect, useState } from 'react';
import { Button, Dot } from '@/components/shared/primitives';
import { act, actionLabel, revalidate } from '@/services/activity/actions';
import * as api from '@/services/activity/api';
import { summaryLine } from '@/services/activity/copy';
import type { ActivityCategory, ActivityEntry } from '@/services/activity/types';
import { showSection } from '@/services/navigation';
import { useActivityStore } from '@/stores/activity-store';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { showToast } from '@/stores/toast-store';
import { useUiStore } from '@/stores/ui-store';

/** At most this many entries that need you are named. */
const SHOWN = 5;

const TONE = { error: 'red', warning: 'yellow', success: 'green', info: 'gray' } as const;

function since(visitedAt: string | null): string {
  if (!visitedAt) return 'Since you last checked';
  const time = new Date(visitedAt);
  const sameDay = time.toDateString() === new Date().toDateString();
  const label = sameDay
    ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : time.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return `Since you last checked (${label})`;
}

/** The five newest unread entries that need me, read again with every change. */
function useNeedingYou(revision: number): ActivityEntry[] {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    let current = true;
    void revision;
    api
      .listEntries({
        filter: 'needs-you',
        categories: [],
        sourceIds: [],
        entityKeys: [],
        search: null,
        includeDismissed: false,
        limit: SHOWN,
        before: null,
      })
      .then((page) => {
        if (current) setEntries(page.entries);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [revision]);
  return entries;
}

/**
 * SinceLastCheckedCard — first on Focus: the unread counts per category
 * since Activity was last open, and the five newest entries that need you,
 * each with its action. Renders nothing when nothing is unread.
 */
export function SinceLastCheckedCard() {
  const counts = useActivityStore((s) => s.counts);
  const revision = counts?.revision ?? 0;
  const visitedAt = useUiStore((s) => s.activityVisitedAt);
  const needing = useNeedingYou(revision);
  const threads = useDispatchStore((s) => s.threads);
  const hosts = useDispatchStore((s) => s.hosts);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const groups = useCiFailuresStore((s) => s.groups);
  if (!counts || counts.unread === 0) return null;
  const byCategory = Object.fromEntries(
    Object.entries(counts.byCategory).map(([category, count]) => [category, count?.unread ?? 0]),
  ) as Partial<Record<ActivityCategory, number>>;
  const line = summaryLine(byCategory, 5, since(visitedAt));

  return (
    <section className="bd-dp-fcard bd-act-fcard" aria-label="Since you last checked">
      <header className="bd-dp-fcard__head">
        <span className="bd-dp-fcard__summary" data-waiting={counts.needsYou > 0 || undefined}>
          {counts.needsYou > 0
            ? `${counts.needsYou} need${counts.needsYou === 1 ? 's' : ''} you`
            : `${counts.unread} new`}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void showSection('activity')}>
          Open Activity
        </Button>
      </header>
      {line && <p className="bd-act-fcard__counts">{line}</p>}
      {needing.length > 0 && (
        <ul className="bd-dp-fcard__items">
          {needing.map((entry) => {
            const check = revalidate(entry, false, { threads, hosts, pullRequests, groups });
            const target = check.ok ? check.action : check.fallback;
            return (
              <li key={entry.id} className="bd-act-fcard__row">
                <button
                  type="button"
                  className="bd-dp-fcard__item"
                  onClick={() => {
                    void showSection('activity').then(() =>
                      useActivityViewStore.getState().reveal(entry.id),
                    );
                  }}
                >
                  <span className="bd-dp-fcard__line">
                    <Dot tone={TONE[entry.severity]} size={7} />
                    <span className="bd-dp-fcard__title">{entry.summary}</span>
                  </span>
                </button>
                {target && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      void act(entry).then(({ reason }) => {
                        if (reason) showToast({ message: `${reason}. Opened it instead.` });
                      })
                    }
                  >
                    {check.ok ? actionLabel(target) : 'Open'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
