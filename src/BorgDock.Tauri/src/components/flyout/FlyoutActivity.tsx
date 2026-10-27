import { useEffect, useState } from 'react';
import { events } from '@/generated/commands';
import * as api from '@/services/activity/api';
import { ACT_ACTIVITY_EVENT, SHOW_ACTIVITY_EVENT } from '@/services/activity/api';
import { actionLabel } from '@/services/activity/labels';
import type { ActivityEntry } from '@/services/activity/types';

const SHOWN = 3;

async function toMain(event: string, id: string): Promise<void> {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', event, { id });
}

/** The flyout's own read of the journal: the main window stays its only writer. */
function useNeedingYou(): { entries: ActivityEntry[]; needsYou: number } {
  const [state, setState] = useState<{ entries: ActivityEntry[]; needsYou: number }>({
    entries: [],
    needsYou: 0,
  });
  useEffect(() => {
    let stopped = false;
    let unlisten: (() => void) | undefined;
    const read = () =>
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
          if (!stopped) setState({ entries: page.entries, needsYou: page.total });
        })
        .catch(() => {});
    void read();
    void Promise.resolve()
      .then(() => events.activityChanged.listen(() => void read()))
      .then((stop) => {
        if (stopped) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, []);
  return state;
}

/**
 * FlyoutActivity — the tray glance's three newest entries that need you,
 * each with its action. The action runs in the main window, which checks
 * it against the live stores first.
 */
export function FlyoutActivity() {
  const { entries, needsYou } = useNeedingYou();
  if (needsYou === 0) return null;
  return (
    <section
      className="shrink-0 border-b border-[var(--color-subtle-border)] px-2 py-1.5"
      aria-label="Activity that needs you"
      data-testid="flyout-glance-activity"
    >
      <div className="px-2 py-1 text-[11px] font-semibold text-[var(--color-warning-badge-fg)]">
        {needsYou === 1 ? '1 update needs you' : `${needsYou} updates need you`}
      </div>
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toMain(SHOW_ACTIVITY_EVENT, entry.id)}
            className="block min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-[12px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
          >
            {entry.summary}
          </button>
          {entry.action && (
            <button
              type="button"
              onClick={() => void toMain(ACT_ACTIVITY_EVENT, entry.id)}
              className="max-w-[150px] shrink-0 truncate rounded-md border border-[var(--color-subtle-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            >
              {actionLabel(entry.action)}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
