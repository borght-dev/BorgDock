import { useEffect, useState } from 'react';
import { RailCard } from '@/components/layout/rail-blocks';
import { commands } from '@/generated/commands';
import * as api from '@/services/activity/api';
import { openActivityHistory } from '@/services/activity/history';
import {
  type EarlierRow,
  earlierToday,
  NEEDS_YOU_SHOWN,
  sinceLabel,
  TODAY_PAGE,
  toneOf,
  whereAndWhen,
} from '@/services/activity/recent';
import type { ActivityEntry } from '@/services/activity/types';
import { selectNeedsYou, useActivityStore } from '@/stores/activity-store';
import { useUiStore } from '@/stores/ui-store';
import { EntryAction } from './EntryAction';

/** The Settings section that holds the popup and phone switches. */
const NOTIFICATION_SETTINGS = 'notif';

interface Recent {
  needing: ActivityEntry[];
  earlier: EarlierRow[];
  /** Source id → what the journal calls it ("Mac mini"). */
  labels: ReadonlyMap<string, string>;
  loaded: boolean;
}

const EMPTY: Recent = { needing: [], earlier: [], labels: new Map(), loaded: false };

const QUERY = {
  categories: [],
  sourceIds: [],
  entityKeys: [],
  search: null,
  includeDismissed: false,
  before: null,
};

/** The card's own read of the journal, again with every change to it. */
function useRecent(revision: number, now: Date): Recent {
  const [recent, setRecent] = useState<Recent>(EMPTY);
  useEffect(() => {
    let current = true;
    void revision;
    Promise.all([
      api.listEntries({ ...QUERY, filter: 'needs-you', limit: NEEDS_YOU_SHOWN }),
      api.listEntries({ ...QUERY, filter: 'all', limit: TODAY_PAGE }),
      api.listSources().catch(() => []),
    ])
      .then(([needing, newest, sources]) => {
        if (!current) return;
        setRecent({
          needing: needing.entries,
          earlier: earlierToday(newest.entries, now),
          labels: new Map(sources.map((source) => [source.sourceId, source.label])),
          loaded: true,
        });
      })
      .catch(() => {
        if (current) setRecent((previous) => ({ ...previous, loaded: true }));
      });
    return () => {
      current = false;
    };
  }, [revision, now]);
  return recent;
}

export interface RecentCardProps {
  /** Closes the flyout, for what opens another window or view. */
  close: () => void;
  /** The time the card counts from; stories and tests fix it. */
  now?: Date;
}

/**
 * RecentCard — behind the rail's bell: what needs you now, each with the
 * action that fits, and what else happened today. Opening it counts as
 * looking: "since 09:12" is when you last did.
 */
export function RecentCard({ close, now: fixedNow }: RecentCardProps) {
  const revision = useActivityStore((s) => s.counts?.revision ?? 0);
  const needsYou = useActivityStore(selectNeedsYou);
  // Opened now, and the time I looked before this: both fixed while the card is open.
  const [now] = useState(() => fixedNow ?? new Date());
  const [lookedAt] = useState(() => useUiStore.getState().activityVisitedAt);
  const { needing, earlier, labels, loaded } = useRecent(revision, now);
  useEffect(() => () => useUiStore.getState().markActivityVisited(), []);

  const showInHistory = (entryId?: string) => {
    close();
    void openActivityHistory(entryId);
  };

  return (
    <RailCard
      title="Recent"
      meta={sinceLabel(lookedAt, now)}
      footer={
        <>
          <button type="button" className="bd-railcard__link" onClick={() => showInHistory()}>
            All history
          </button>
          <button
            type="button"
            className="bd-railcard__link bd-railcard__link--end bd-recent__settings"
            onClick={() => {
              close();
              void commands.openSettingsWindow(NOTIFICATION_SETTINGS);
            }}
          >
            Notification settings
          </button>
        </>
      }
    >
      {needsYou > 0 ? (
        <>
          <span className="bd-railcard__grouphead">
            Needs you now <span>{needsYou}</span>
          </span>
          {needing.map((entry) => (
            <div key={entry.id} className="bd-railcard__row" data-recent-entry={entry.id}>
              <span className="bd-recent__dot" data-tone={toneOf(entry)} aria-hidden="true" />
              <button
                type="button"
                className="bd-railcard__text bd-recent__open"
                onClick={() => showInHistory(entry.id)}
              >
                <span className="bd-recent__summary">{entry.summary}</span>
                <span className="bd-railcard__sub">
                  {whereAndWhen(entry, labels.get(entry.sourceId) ?? null, now.getTime())}
                </span>
              </button>
              <EntryAction entry={entry} onAct={close} />
            </div>
          ))}
          {needsYou > needing.length && needing.length > 0 && (
            <button
              type="button"
              className="bd-railcard__link bd-recent__more"
              onClick={() => showInHistory()}
            >
              {needsYou - needing.length} more in history
            </button>
          )}
        </>
      ) : (
        loaded && <p className="bd-recent__calm">Nothing needs you.</p>
      )}
      {earlier.length > 0 && (
        <>
          <span className="bd-railcard__grouphead bd-recent__earlier">Earlier today</span>
          {earlier.map((row) => (
            <button
              key={row.key}
              type="button"
              className="bd-railcard__row bd-recent__quiet"
              onClick={() => showInHistory(row.entryId ?? undefined)}
            >
              <span className="bd-recent__dot" data-tone={row.tone} aria-hidden="true" />
              <span className="bd-railcard__text bd-railcard__dim">
                <span className="bd-recent__summary">{row.summary}</span>
              </span>
              <span className="bd-recent__time">{row.time}</span>
            </button>
          ))}
        </>
      )}
      {loaded && needsYou === 0 && earlier.length === 0 && (
        <p className="bd-recent__calm bd-recent__calm--faint">Nothing else happened today.</p>
      )}
    </RailCard>
  );
}
