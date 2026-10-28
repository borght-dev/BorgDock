import { X } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import type { ItemOverview, Tone } from '@/services/dispatch/types';
import { type BriefFilter, briefing, matchesBrief } from '@/services/dispatch/walk';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useRunningItems } from './WalkRuns';

/** One number of the briefing and the filter it narrows the work to. */
export interface BriefCount {
  filter: BriefFilter;
  tone: Tone;
  count: number;
  label: string;
}

/** Agents at work on the items, and Dispatch's own runs still going: what "agents working" counts. */
export function agentsWorking(
  items: readonly ItemOverview[],
  runningRunThreadIds: readonly string[],
): number {
  const ids = new Set(runningRunThreadIds);
  for (const overview of items) {
    for (const thread of overview.threads) {
      if (thread.open && thread.status === 'running') ids.add(thread.id);
    }
  }
  return ids.size;
}

export function useAgentsWorking(items: readonly ItemOverview[]): number {
  const runs = useDispatchStore((s) => s.runs);
  const threads = useDispatchStore((s) => s.threads);
  const running = runs
    .filter((run) => threads.some((t) => t.id === run.threadId && t.status === 'running'))
    .map((run) => run.threadId);
  return agentsWorking(items, running);
}

/** The counts the briefing leads with, in its order; worth a look only when there is one. */
export function briefCounts(items: readonly ItemOverview[], working: number): BriefCount[] {
  const counts = briefing(items);
  return [
    { filter: 'needsYou', tone: 'bad', count: counts.needsYou, label: 'need you' },
    { filter: 'outOfSync', tone: 'warn', count: counts.outOfSync, label: 'out of sync' },
    ...(counts.worthALook > 0
      ? [
          {
            filter: 'worthALook',
            tone: 'warn',
            count: counts.worthALook,
            label: 'worth a look',
          } satisfies BriefCount,
        ]
      : []),
    {
      filter: 'working',
      tone: 'run',
      count: working,
      label: working === 1 ? 'agent working' : 'agents working',
    },
    { filter: 'fine', tone: 'ok', count: counts.fine, label: 'fine' },
  ];
}

/** `8 out of sync`: what the filter shows, counted in items. */
export function filterCaption(filter: BriefFilter, shown: number): string {
  switch (filter) {
    case 'needsYou':
      return `${shown} ${shown === 1 ? 'needs' : 'need'} you`;
    case 'outOfSync':
      return `${shown} out of sync`;
    case 'worthALook':
      return `${shown} worth a look`;
    case 'working':
      return `${shown} with an agent working`;
    case 'fine':
      return `${shown} fine`;
  }
}

/** The briefing filter as a predicate, or null while every item shows. */
export function useBriefMatch(): ((overview: ItemOverview) => boolean) | null {
  const filter = useDispatchStore((s) => s.briefFilter);
  const running = useRunningItems();
  return useMemo(
    () => (filter ? (overview: ItemOverview) => matchesBrief(overview, filter, running) : null),
    [filter, running],
  );
}

function useToggle(filter: BriefFilter): { on: boolean; toggle: () => void } {
  const current = useDispatchStore((s) => s.briefFilter);
  const setFilter = useDispatchStore((s) => s.setBriefFilter);
  const on = current === filter;
  return { on, toggle: () => setFilter(on ? null : filter) };
}

/**
 * BriefStat — one big number of the briefing. A click narrows the work to the
 * items it counts, a second click shows all again. `children` sit under it,
 * outside the button (the Fix button under out of sync).
 */
export function BriefStat({ count, children }: { count: BriefCount; children?: ReactNode }) {
  const { on, toggle } = useToggle(count.filter);
  return (
    <div
      className="bd-dp-stat"
      data-tone={count.count > 0 ? count.tone : 'mute'}
      data-on={on ? 'true' : undefined}
    >
      <button
        type="button"
        className="bd-dp-stat__toggle"
        aria-pressed={on}
        disabled={count.count === 0 && !on}
        title={on ? 'Show every item' : `Show only these ${count.count}`}
        onClick={toggle}
      >
        <span className="bd-dp-stat__count">{count.count}</span>
        <span className="bd-dp-stat__label">{count.label}</span>
      </button>
      {children}
    </div>
  );
}

/** FilterBar — under the briefing while a count narrows the work: what shows, and Clear. */
export function FilterBar({ shown, total }: { shown: number; total: number }) {
  const filter = useDispatchStore((s) => s.briefFilter);
  const setFilter = useDispatchStore((s) => s.setBriefFilter);
  if (!filter) return null;
  return (
    <div className="bd-dp-filterbar" role="status">
      <span>Showing</span>
      <span className="bd-dp-filterbar__pill">
        {filterCaption(filter, shown)}
        <button
          type="button"
          className="bd-dp-filterbar__x"
          aria-label="Show every item"
          onClick={() => setFilter(null)}
        >
          <X size={11} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </span>
      <span>
        of {total} {total === 1 ? 'item' : 'items'}
      </span>
      <span className="bd-dp-filterbar__spacer" />
      <button type="button" className="bd-dp-filterbar__clear" onClick={() => setFilter(null)}>
        Clear
      </button>
    </div>
  );
}

function BriefChip({ count }: { count: BriefCount }) {
  const { on, toggle } = useToggle(count.filter);
  return (
    <button
      type="button"
      className="bd-dp-briefchip"
      data-tone={count.count > 0 ? count.tone : 'mute'}
      aria-pressed={on}
      disabled={count.count === 0 && !on}
      onClick={toggle}
    >
      <b>{count.count}</b> {count.label}
    </button>
  );
}

/**
 * BriefChips — the briefing's counts as a row of toggles, for the list and the
 * board, which have no briefing. While one is on, what shows and Clear follow.
 */
export function BriefChips({ items, shown }: { items: readonly ItemOverview[]; shown: number }) {
  const filter = useDispatchStore((s) => s.briefFilter);
  const setFilter = useDispatchStore((s) => s.setBriefFilter);
  const working = useAgentsWorking(items);
  return (
    <div className="bd-dp-briefchips" role="group" aria-label="Filter by count">
      {briefCounts(items, working).map((count) => (
        <BriefChip key={count.filter} count={count} />
      ))}
      {filter && (
        <span className="bd-dp-briefchips__showing">
          Showing {shown} of {items.length}
          <button type="button" className="bd-dp-filterbar__clear" onClick={() => setFilter(null)}>
            Clear
          </button>
        </span>
      )}
    </div>
  );
}
