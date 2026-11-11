import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/shared/primitives';
import {
  COLUMN_OPTIONS,
  type PrColumn,
  type PrDisplay,
  type PrGroupBy,
  type PrSortBy,
} from '@/services/pr-list/display';
import type { PrFacts } from '@/services/pr-list/facts';
import { isGroupCollapsed, type PrGroupNode, type PrGroupStats } from '@/services/pr-list/groups';
import { togglePrGroup, usePrViewStore } from '@/stores/pr-view-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity } from '@/types';
import { PrListRow } from './PrListRow';
import { VIRTUALIZE_THRESHOLD, VirtualizedRows } from './VirtualizedRows';

/** `data-key` of a group heading, so `flip()` moves and fades it like a row. */
export function groupFlipKey(groupKey: string): string {
  return `group:${groupKey}`;
}

interface WorkbenchGroupProps {
  /** Collapse key; folded state comes from `collapsed`, else `ui-store.collapsedGroups`. */
  groupKey: string;
  label: ReactNode;
  count: number;
  /** After the label: the group's status bar and counts. */
  summary?: ReactNode;
  /** Shown at the end, e.g. the oldest review request's wait. */
  aside?: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  /** 2 for a sub-group: indented, smaller heading. */
  level?: 1 | 2;
  children: ReactNode;
}

/**
 * WorkbenchGroup — a group heading (label, count, summary, hairline) and the
 * rows under it. Clicking the heading folds the group; the rows fold away
 * with a grid-row transition (`--motion-expand`) and stay mounted but
 * `inert`, so keyboard navigation and focus skip them.
 */
export function WorkbenchGroup({
  groupKey,
  label,
  count,
  summary,
  aside,
  collapsed: collapsedProp,
  onToggle,
  level = 1,
  children,
}: WorkbenchGroupProps) {
  const storeCollapsed = useUiStore((s) => s.collapsedGroups.has(groupKey));
  const toggleRepoGroup = useUiStore((s) => s.toggleRepoGroup);
  const collapsed = collapsedProp ?? storeCollapsed;

  return (
    <section
      className={clsx('bd-wb-group', level === 2 && 'bd-wb-group--sub')}
      data-group-key={groupKey}
    >
      <div className="bd-wb-group__headrow" data-key={groupFlipKey(groupKey)}>
        <button
          type="button"
          className="bd-wb-group__head"
          aria-expanded={!collapsed}
          onClick={() => (onToggle ? onToggle() : toggleRepoGroup(groupKey))}
        >
          <ChevronRight
            size={12}
            strokeWidth={2.25}
            aria-hidden="true"
            className="bd-wb-group__chevron"
          />
          <span className="bd-wb-group__label">{label}</span>
          <span className="bd-wb-group__count">{count}</span>
        </button>
        {summary}
        <span className="bd-wb-group__rule" aria-hidden="true" />
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

const STAT_ORDER: ReadonlyArray<keyof PrGroupStats & PrFacts['bucket']> = [
  'yourTurn',
  'failing',
  'waiting',
  'ready',
  'draft',
];

const STAT_WORD: Record<PrFacts['bucket'], string> = {
  yourTurn: 'your turn',
  failing: 'failing',
  waiting: 'waiting',
  ready: 'ready',
  draft: 'draft',
};

/** The group's lines changed, right-aligned in its heading. */
function GroupSize({ group }: { group: PrGroupNode }) {
  if (group.facts.length === 0) return null;
  return (
    <span className="bd-prl-gsize" title="Lines added and removed in this group">
      +{group.stats.additions.toLocaleString('en-US')} −
      {group.stats.deletions.toLocaleString('en-US')}
    </span>
  );
}

/** The group's mix as a bar, and its counts in words ("3 your turn · 2 failing"). */
function GroupSummary({
  group,
  words,
  quietFold,
}: {
  group: PrGroupNode;
  words: boolean;
  /** Folded by "Collapse groups with nothing for you". */
  quietFold: boolean;
}) {
  const total = group.facts.length;
  const parts = STAT_ORDER.filter((b) => group.stats[b] > 0 && b !== 'waiting').map(
    (b) => `${group.stats[b]} ${STAT_WORD[b]}`,
  );
  return (
    <>
      {total > 0 && (
        <span className="bd-prl-gbar" aria-hidden="true">
          {STAT_ORDER.map((b) =>
            group.stats[b] > 0 ? (
              <span
                key={b}
                data-bucket={b}
                style={{ width: `${(group.stats[b] / total) * 100}%` }}
              />
            ) : null,
          )}
        </span>
      )}
      {words && parts.length > 0 && <span className="bd-prl-gstats">{parts.join(' · ')}</span>}
      {quietFold ? (
        <span className="bd-prl-ghint">nothing for you</span>
      ) : (
        group.hint && <span className="bd-prl-ghint">{group.hint}</span>
      )}
    </>
  );
}

function groupLabel(group: PrGroupNode): ReactNode {
  if (group.author)
    return (
      <>
        <Avatar
          initials={group.author.login.slice(0, 2).toUpperCase()}
          tone={group.author.isMe ? 'own' : 'them'}
          size="sm"
          className="bd-wb-group__avatar"
          aria-hidden="true"
        />
        {group.label}
        {group.author.isMe ? ' (you)' : ''}
      </>
    );
  if (group.bucket || group.pinned)
    return (
      <>
        <span
          className="bd-prl-mark"
          data-bucket={group.pinned ? 'yourTurn' : group.bucket}
          aria-hidden="true"
        />
        {group.label}
      </>
    );
  return group.label;
}

/** What every row of the list needs to know about the display. */
export interface RowSetup {
  columns: readonly PrColumn[];
  groupBy: PrGroupBy;
  density: PrDensity;
  now: number;
  me: string;
}

export function PrRows({ facts, setup }: { facts: readonly PrFacts[]; setup: RowSetup }) {
  const row = (f: PrFacts, animateKey: boolean) => (
    <PrListRow
      key={f.key}
      facts={f}
      columns={setup.columns}
      groupBy={setup.groupBy}
      density={setup.density}
      now={setup.now}
      me={setup.me}
      animateKey={animateKey}
    />
  );
  if (facts.length > VIRTUALIZE_THRESHOLD)
    return (
      <VirtualizedRows
        items={facts}
        keyOf={(f) => f.key}
        density={setup.density}
        render={(f) => row(f, false)}
      />
    );
  return <>{facts.map((f) => row(f, true))}</>;
}

/** Whether a group is folded, from the stores' collapse state. */
function useGroupCollapsed(group: PrGroupNode): { collapsed: boolean; quietFold: boolean } {
  const collapsed = useUiStore((s) => s.collapsedGroups);
  const expanded = usePrViewStore((s) => s.expandedGroups);
  const collapseQuiet = usePrViewStore((s) => s.display.collapseQuiet);
  const folded = isGroupCollapsed(group, collapsed, expanded, collapseQuiet);
  return { collapsed: folded, quietFold: folded && !collapsed.has(group.key) };
}

interface PrGroupSectionProps {
  group: PrGroupNode;
  setup: RowSetup;
  aside?: ReactNode;
  level?: 1 | 2;
}

/** A group of the list: heading with its summary, then its sub-groups or its rows. */
export function PrGroupSection({ group, setup, aside, level = 1 }: PrGroupSectionProps) {
  const { collapsed, quietFold } = useGroupCollapsed(group);
  if (group.kind === 'none' && !group.pinned) return <PrRows facts={group.facts} setup={setup} />;
  return (
    <WorkbenchGroup
      groupKey={group.key}
      label={groupLabel(group)}
      count={group.facts.length}
      summary={
        <GroupSummary
          group={group}
          words={group.kind !== 'status' && !group.pinned}
          quietFold={quietFold}
        />
      }
      aside={
        <>
          <GroupSize group={group} />
          {aside}
        </>
      }
      collapsed={collapsed}
      onToggle={() => togglePrGroup(group)}
      level={level}
    >
      {group.subgroups.length > 0 ? (
        group.subgroups.map((sub) => (
          <PrGroupSection key={sub.key} group={sub} setup={setup} level={2} />
        ))
      ) : group.facts.length > 0 ? (
        <PrRows facts={group.facts} setup={setup} />
      ) : (
        <p className="bd-prl-empty-group">Nothing here</p>
      )}
    </WorkbenchGroup>
  );
}

const SORTABLE: Partial<Record<PrColumn | 'title', PrSortBy>> = {
  title: 'title',
  size: 'size',
  updated: 'updated',
  created: 'created',
};

const HEAD_LABEL: Record<PrColumn, string> = Object.fromEntries(
  COLUMN_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PrColumn, string>;

function HeadCell({
  column,
  label,
  display,
  onSort,
  numeric,
}: {
  column: PrColumn | 'title';
  label: string;
  display: PrDisplay;
  onSort: (sortBy: PrSortBy) => void;
  numeric?: boolean;
}) {
  const sortBy = SORTABLE[column];
  if (!sortBy)
    return (
      <span className={clsx('bd-prl-hc', numeric && 'bd-prl-hc--num')} data-col={column}>
        {label}
      </span>
    );
  const on = display.sortBy === sortBy;
  return (
    <button
      type="button"
      className={clsx('bd-prl-hc', numeric && 'bd-prl-hc--num', on && 'bd-prl-hc--on')}
      data-col={column}
      aria-sort={on ? (display.sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      title={on ? 'Reverse the order' : `Sort by ${label.toLowerCase()}`}
      onClick={() => onSort(sortBy)}
    >
      {label}
      {on && <span aria-hidden="true">{display.sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}

/** The table's column headings; the sortable ones sort on click, again to reverse. */
export function PrTableHead({
  columns,
  display,
  onSort,
}: {
  columns: readonly PrColumn[];
  display: PrDisplay;
  onSort: (sortBy: PrSortBy) => void;
}) {
  const numeric = new Set<PrColumn>(['size', 'updated', 'created', 'number']);
  return (
    <div className="bd-prl-head" data-table-head="">
      <span />
      <HeadCell column="title" label="Pull request" display={display} onSort={onSort} />
      {columns.map((c) => (
        <HeadCell
          key={c}
          column={c}
          label={HEAD_LABEL[c]}
          display={display}
          onSort={onSort}
          numeric={numeric.has(c)}
        />
      ))}
    </div>
  );
}
