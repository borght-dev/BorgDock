import { ChevronRight } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import type { ItemOverview, Slot } from '@/services/dispatch/types';
import { type Lane, laneSummary, walkLanes } from '@/services/dispatch/walk';
import { useUiStore } from '@/stores/ui-store';
import { DispatchDrawer } from './DispatchDrawer';
import { LanePips } from './LanePips';
import type { DispatchActions } from './unit-actions';
import { WalkRow } from './WalkRow';

const GLANCE_KEY = 'dp-walk:glance';

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

/** WalkGlance — every lane as a row of squares, one per item, colored by verdict. */
function WalkGlance({
  lanes,
  selectedId,
  onPick,
}: {
  lanes: readonly Lane[];
  selectedId: number | null;
  onPick: (id: number) => void;
}) {
  const collapsed = useUiStore((s) => s.collapsedGroups.has(GLANCE_KEY));
  const toggle = useUiStore((s) => s.toggleRepoGroup);
  const shown = lanes.filter((lane) => lane.inWalk || lane.rows.length > 0);
  return (
    <section className="bd-dp-glance" aria-label="Overview" data-collapsed={collapsed || undefined}>
      <button
        type="button"
        className="bd-dp-glance__head"
        aria-expanded={!collapsed}
        onClick={() => toggle(GLANCE_KEY)}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.25}
          aria-hidden="true"
          className="bd-dp-glance__chevron"
        />
        <span className="bd-dp-glance__title">Overview</span>
        {collapsed && (
          <span className="bd-dp-glance__line">
            <LanePips lanes={lanes} />
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="bd-dp-glance__grid">
          {shown.map((lane) => (
            <div key={lane.state} className="bd-dp-glance__lane">
              <span className="bd-dp-glance__label">
                {lane.state} <em>{lane.rows.length}</em>
              </span>
              <span className="bd-dp-glance__cells">
                {lane.rows.length === 0 && <span className="bd-dp-glance__none">—</span>}
                {lane.rows.map((o) => (
                  <button
                    key={o.item.id}
                    type="button"
                    className="bd-dp-glance__cell"
                    data-tone={o.verdict.tone}
                    data-selected={o.item.id === selectedId ? 'true' : undefined}
                    title={`${o.item.title} · ${o.verdict.label}`}
                    onClick={() => onPick(o.item.id)}
                  >
                    {o.item.id}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WalkLane({
  lane,
  aside,
  children,
}: {
  lane: Lane;
  aside: ReactNode;
  children: ReactNode;
}) {
  const key = laneKey(lane.state);
  const collapsed = useUiStore((s) => s.collapsedGroups.has(key));
  const toggle = useUiStore((s) => s.toggleRepoGroup);
  const summary = laneSummary(lane.rows);
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
          <span className="bd-wb-group__count">{lane.rows.length}</span>
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
  slots: readonly Slot[];
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
}

/**
 * DispatchWalk — the work in the order it is checked every morning: Code
 * Review, Development In Progress, Testing Failed, Needs Human, New, then any
 * other state. Above it the overview grid, every item as a square in the
 * color of its verdict. A row opens its detail in a drawer.
 */
export function DispatchWalk({
  items,
  slots,
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
}: DispatchWalkProps) {
  const lanes = useMemo(() => walkLanes(items), [items]);
  const open = items.find((o) => o.item.id === openId) ?? null;
  return (
    <div className="bd-dp-walkwrap">
      <div className="bd-dp-walk">
        <WalkGlance
          lanes={lanes}
          selectedId={openId}
          onPick={(id) => {
            onSelect(id);
            scrollToRow(id);
          }}
        />
        {notice}
        {lanes.map((lane) => (
          <WalkLane key={lane.state} lane={lane} aside={laneAside?.(lane)}>
            {laneNotice?.(lane)}
            {lane.rows.length === 0 && (
              <p className="bd-dp-wlane__empty">{EMPTY_LANE[lane.state] ?? 'Nothing here.'}</p>
            )}
            {lane.rows.map((overview) => (
              <WalkRow
                key={overview.item.id}
                overview={overview}
                selected={overview.item.id === openId}
                now={now}
                busy={busy}
                actions={actions}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            ))}
          </WalkLane>
        ))}
        {footer}
      </div>
      {open && (
        <DispatchDrawer
          overview={open}
          slots={slots}
          actions={actions}
          now={now}
          busy={busy}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}
