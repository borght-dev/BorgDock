import { ChevronRight } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import type { ItemOverview } from '@/services/dispatch/types';
import {
  type BriefFilter,
  type Lane,
  laneSummary,
  laneTone,
  walkLanes,
} from '@/services/dispatch/walk';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useUiStore } from '@/stores/ui-store';
import { BriefStat, briefCounts, FilterBar, useAgentsWorking, useBriefMatch } from './BriefFilters';
import { DispatchDrawer } from './DispatchDrawer';
import type { DispatchActions } from './unit-actions';
import { WalkRow } from './WalkRow';
import { useRunningItems } from './WalkRuns';

/** Group key of a lane, for the collapsed-groups store the other lists use. */
export function laneKey(state: string): string {
  return `dp-walk:${state}`;
}

const EMPTY_LANE: Record<string, string> = {
  'Testing Failed': 'Nothing bounced back from QA.',
  'Needs Human': 'Nobody waits on a decision from you.',
  'Code Review': 'Nothing in review.',
  'Development In Progress': 'Nothing in development.',
  New: 'Nothing new.',
};

function scrollToRow(id: number): void {
  document
    .querySelector(`.bd-dp-walk [data-dp-id="${id}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function scrollToLane(state: string): void {
  const key = laneKey(state);
  const ui = useUiStore.getState();
  if (ui.collapsedGroups.has(key)) ui.toggleRepoGroup(key);
  document
    .querySelector(`.bd-dp-walk [data-group-key="${CSS.escape(key)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** How the line naming the lanes a filter left empty begins. */
const FOLDED_LEAD: Record<BriefFilter, string> = {
  needsYou: 'Nothing needs you in',
  outOfSync: 'Nothing out of sync in',
  worthALook: 'Nothing worth a look in',
  working: 'No agent works in',
  fine: 'Nothing fine in',
};

/**
 * WalkBriefing — the morning at a glance: how many items wait on you, are out
 * of sync, are worth a look or are fine, how many agents work, and where every
 * item sits, one square per item in the color of its verdict. A count narrows
 * the lanes to its items; a state's name scrolls to its lane; a square selects
 * its item.
 */
function WalkBriefing({
  items,
  lanes,
  selectedId,
  match,
  fix,
  onPick,
}: {
  items: readonly ItemOverview[];
  lanes: readonly Lane[];
  selectedId: number | null;
  match: ((overview: ItemOverview) => boolean) | null;
  fix?: ReactNode;
  onPick: (id: number) => void;
}) {
  const shown = lanes.filter((lane) => lane.inWalk || lane.rows.length > 0);
  const working = useAgentsWorking(items);
  return (
    <section className="bd-dp-brief" aria-label="Overview">
      <div className="bd-dp-brief__numbers">
        <div className="bd-dp-brief__stats">
          {briefCounts(items, working).map((count) => (
            <BriefStat key={count.filter} count={count}>
              {count.filter === 'outOfSync' && fix}
            </BriefStat>
          ))}
        </div>
      </div>
      <div className="bd-dp-brief__pipe">
        <span className="bd-dp-brief__caption">
          Where your {items.length} {items.length === 1 ? 'item is' : 'items are'}
        </span>
        <div className="bd-dp-brief__flow">
          {shown.map((lane) => (
            <div
              key={lane.state}
              className="bd-dp-stage"
              data-tone={laneTone(lane.rows) ?? undefined}
              style={{ flexGrow: Math.max(lane.rows.length, 1) }}
            >
              <button
                type="button"
                className="bd-dp-stage__name"
                title={`Go to ${lane.state}`}
                onClick={() => scrollToLane(lane.state)}
              >
                <span>{lane.state}</span>
                <em>{lane.rows.length}</em>
              </button>
              <span className="bd-dp-stage__cells">
                {lane.rows.map((o) => (
                  <button
                    key={o.item.id}
                    type="button"
                    className="bd-dp-stage__cell"
                    data-tone={o.verdict.tone}
                    data-selected={o.item.id === selectedId ? 'true' : undefined}
                    data-dim={match && !match(o) ? 'true' : undefined}
                    aria-label={`${o.item.id} ${o.item.title} · ${o.verdict.label}`}
                    title={`${o.item.id} · ${o.item.title} · ${o.verdict.label}`}
                    onClick={() => onPick(o.item.id)}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WalkLane({
  lane,
  rows,
  aside,
  children,
}: {
  lane: Lane;
  /** The lane's rows the filter shows; all of them without one. */
  rows: readonly ItemOverview[];
  aside: ReactNode;
  children: ReactNode;
}) {
  const key = laneKey(lane.state);
  const collapsed = useUiStore((s) => s.collapsedGroups.has(key));
  const toggle = useUiStore((s) => s.toggleRepoGroup);
  const summary = laneSummary(rows);
  const filtered = rows.length !== lane.rows.length;
  return (
    <section className="bd-wb-group bd-dp-wlane" data-group-key={key} aria-label={lane.state}>
      <div className="bd-dp-wlane__head">
        <button
          type="button"
          className="bd-wb-group__head"
          aria-expanded={!collapsed}
          onClick={() => toggle(key)}
        >
          <ChevronRight
            size={12}
            strokeWidth={2.25}
            aria-hidden="true"
            className="bd-wb-group__chevron"
          />
          <span className="bd-wb-group__label">{lane.state}</span>
          <span className="bd-wb-group__count">
            {filtered ? `${rows.length} of ${lane.rows.length}` : lane.rows.length}
          </span>
          {summary && <span className="bd-dp-wlane__summary">{summary}</span>}
          <span className="bd-wb-group__rule" aria-hidden="true" />
        </button>
        {aside}
      </div>
      <div className="bd-wb-group__body" data-collapsed={collapsed ? 'true' : undefined}>
        <div className="bd-wb-group__rows" inert={collapsed}>
          {children}
        </div>
      </div>
    </section>
  );
}

export interface DispatchWalkProps {
  items: readonly ItemOverview[];
  /** The item whose detail is open in the drawer. */
  openId: number | null;
  now: number;
  busy: boolean;
  actions: DispatchActions;
  onSelect: (id: number | null) => void;
  onOpen: (id: number) => void;
  /** Drawn under the overview: what the last run over many lanes said. */
  notice?: ReactNode;
  /** Drawn at the end of a lane's heading: its agent run. */
  laneAside?: (lane: Lane) => ReactNode;
  /** Drawn above a lane's rows: what its last run said. */
  laneNotice?: (lane: Lane) => ReactNode;
  /** Under the lanes: the next pickup. */
  footer?: ReactNode;
  /** In the overview, under the out-of-sync count: the button that fixes them. */
  fix?: ReactNode;
}

/**
 * DispatchWalk — the work in the order it is checked every morning: Code
 * Review, Development In Progress, Testing Failed, Needs Human, New, then any
 * other state. Above it the briefing: the counts that matter and every item
 * as a square in the color of its verdict. A count narrows the lanes to its
 * items (`briefFilter`); lanes left empty fold into one line. A row opens its
 * detail in a drawer.
 */
export function DispatchWalk({
  items,
  openId,
  now,
  busy,
  actions,
  onSelect,
  onOpen,
  notice,
  laneAside,
  laneNotice,
  footer,
  fix,
}: DispatchWalkProps) {
  const lanes = useMemo(() => walkLanes(items), [items]);
  const running = useRunningItems();
  const filter = useDispatchStore((s) => s.briefFilter);
  const match = useBriefMatch();
  const open = items.find((o) => o.item.id === openId) ?? null;
  const shown = lanes.map((lane) => ({ lane, rows: match ? lane.rows.filter(match) : lane.rows }));
  const visible = match ? shown.filter(({ rows }) => rows.length > 0) : shown;
  const folded = match
    ? shown.filter(({ lane, rows }) => rows.length === 0 && (lane.inWalk || lane.rows.length > 0))
    : [];
  const matched = shown.reduce((sum, { rows }) => sum + rows.length, 0);
  return (
    <div className="bd-dp-walkwrap">
      <div className="bd-dp-walk">
        <WalkBriefing
          items={items}
          lanes={lanes}
          selectedId={openId}
          match={match}
          fix={fix}
          onPick={(id) => {
            onSelect(id);
            scrollToRow(id);
          }}
        />
        {match && <FilterBar shown={matched} total={items.length} />}
        {notice}
        {visible.map(({ lane, rows }) => (
          <WalkLane key={lane.state} lane={lane} rows={rows} aside={laneAside?.(lane)}>
            {laneNotice?.(lane)}
            {lane.rows.length === 0 && (
              <p className="bd-dp-wlane__empty">{EMPTY_LANE[lane.state] ?? 'Nothing here.'}</p>
            )}
            {rows.map((overview) => (
              <WalkRow
                key={overview.item.id}
                overview={overview}
                selected={overview.item.id === openId}
                inRun={running.get(overview.item.id)}
                now={now}
                busy={busy}
                actions={actions}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            ))}
          </WalkLane>
        ))}
        {filter && folded.length > 0 && (
          <p className="bd-dp-walk__folded">
            {FOLDED_LEAD[filter]} {folded.map(({ lane }) => lane.state).join(' · ')}
          </p>
        )}
        {footer}
      </div>
      {open && (
        <DispatchDrawer
          overview={open}
          actions={actions}
          now={now}
          busy={busy}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}
