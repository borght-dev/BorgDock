import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { Avatar, CheckBar, checkBarSummary } from '@/components/shared/primitives';
import type { PrDensity } from '@/types';
import { formatAgo, isOlderThanDays, STALE_AFTER_DAYS } from '@/utils/relative-time';
import {
  avatarInitials,
  type PrCardData,
  prRowKey,
  ROW_CHIP_LABEL,
  rowChipFor,
} from './pr-card-data';

const NO_CHECKS = { ok: 0, fail: 0, run: 0, total: 0 };

export interface PrRowCoreProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  pr: PrCardData;
  /** `comfortable` (42 px, title and meta line) or `compact` (32 px, title only). */
  density?: PrDensity;
  /** The selected row: accent bar and wash, and the view-transition names. */
  selected?: boolean;
  /** Clock for the meta line's age and the stale rule. Defaults to now. */
  now?: number;
  /**
   * Put `data-key` on the row (or on its wrapper, with an action slot) so
   * `flip()` follows it (default). Rows a virtualizer recycles pass `false`:
   * animating them would move the wrong PR.
   */
  animateKey?: boolean;
  /**
   * The row's one trailing action (Review or Merge). Passing the prop, even
   * as `null`, wraps the row in `.bd-wb-rowwrap` with an action slot beside
   * the row (never inside its `role="button"`), drawn over the right end on
   * hover, keyboard focus and selection so the columns never move. The DOM
   * shape then stays the same whether or not there is an action right now.
   */
  action?: ReactNode;
}

/** What the meta line dates: the merge or close of a closed PR, else the last update. */
function metaEvent(pr: PrCardData): { verb: string; at: string } | null {
  if (pr.isMerged && pr.mergedAt) return { verb: 'merged', at: pr.mergedAt };
  if (pr.isClosed && pr.closedAt) return { verb: 'closed', at: pr.closedAt };
  return pr.updatedAt ? { verb: 'updated', at: pr.updatedAt } : null;
}

/**
 * "koen in BorgDock, updated 2 h ago, stale" — the author is emphasised. A
 * merged or closed PR says when it was merged or closed instead.
 */
function MetaLine({ pr, now }: { pr: PrCardData; now: number }) {
  const event = metaEvent(pr);
  const ago = event ? formatAgo(event.at, now) : '';
  const open = !pr.isMerged && !pr.isClosed;
  const stale =
    open && pr.updatedAt !== undefined && isOlderThanDays(pr.updatedAt, STALE_AFTER_DAYS, now);
  return (
    <span className="bd-wb-row__meta" data-stale={stale ? 'true' : undefined}>
      <em>{pr.authorLogin}</em> in {pr.repoName}
      {event && ago && `, ${event.verb} ${ago}`}
      {stale && ', stale'}
    </span>
  );
}

/**
 * PrRowCore — the shared Workbench row (plans/ui-overhaul-workbench.md,
 * section 2.2 and phase 2): avatar, title, one meta line, the check count
 * with its proportional bar, one chip, the number. Nothing else: labels live
 * in the detail view, and there is no ring, per-check glyph or hover bar.
 *
 * - `data-key` is the row's `owner/repo#number`, so `flip()` can follow it
 *   through a reorder (numbers alone collide across repositories). With an
 *   action slot it sits on the wrapper, so the slot moves with the row.
 * - `data-pr-key` (always set, also on virtualized rows) is what selection
 *   and keyboard navigation use; `data-pr-card` and `data-pr-row` /
 *   `data-pr-number` are the hooks the e2e specs look for.
 * - The selected row carries the view-transition names `pr-title-<n>` and
 *   `pr-avatar-<n>` (as CSS variables that `.bd-wb-row[data-selected]`
 *   applies), so only the row being opened morphs into the detail header and
 *   a covered list never duplicates the names.
 */
export function PrRowCore({
  pr,
  density = 'comfortable',
  selected = false,
  now = Date.now(),
  animateKey = true,
  action,
  className,
  style,
  onClick,
  onKeyDown,
  ...rest
}: PrRowCoreProps) {
  const chip = rowChipFor(pr);
  const checks = pr.checks ?? NO_CHECKS;
  const checkLabel = checkBarSummary(checks).label;
  const interactive = onClick !== undefined;

  const vtStyle = {
    '--bd-vt-title': `pr-title-${pr.number}`,
    '--bd-vt-avatar': `pr-avatar-${pr.number}`,
    ...style,
  } as CSSProperties;

  const withSlot = action !== undefined;
  const key = prRowKey(pr);

  const row = (
    <div
      data-pr-card=""
      data-pr-row=""
      data-pr-number={String(pr.number)}
      data-pr-owner={pr.repoOwner}
      data-pr-repo={pr.repoName}
      data-key={animateKey && !withSlot ? key : undefined}
      data-pr-key={key}
      data-density={density}
      data-selected={selected ? 'true' : undefined}
      data-mine={pr.isMine ? 'true' : undefined}
      className={clsx('bd-wb-row', `bd-wb-row--${density}`, className)}
      style={vtStyle}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${pr.title}, #${pr.number}` : undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || !onClick || e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // A keyboard activation is a click; the key event carries the
          // modifiers, so Ctrl+Enter reads like Ctrl+click.
          onClick(e as unknown as MouseEvent<HTMLDivElement>);
        }
      }}
      {...rest}
    >
      <Avatar
        className="bd-wb-row__avatar"
        initials={avatarInitials(pr.authorLogin)}
        tone={pr.isMine ? 'own' : 'them'}
        size="sm"
        aria-hidden="true"
      />
      <span className="bd-wb-row__text">
        <span className="bd-wb-row__title" title={pr.title}>
          {pr.title}
        </span>
        {density === 'comfortable' && <MetaLine pr={pr} now={now} />}
      </span>
      <CheckBar
        className="bd-wb-row__checks"
        ok={checks.ok}
        fail={checks.fail}
        run={checks.run}
        total={checks.total}
        title={checkLabel}
      />
      <span className={clsx('bd-wb-chip', `bd-wb-chip--${chip}`)} data-chip={chip}>
        {ROW_CHIP_LABEL[chip]}
      </span>
      <span className="bd-wb-row__num">#{pr.number}</span>
    </div>
  );

  if (!withSlot) return row;
  return (
    <div
      className="bd-wb-rowwrap"
      data-key={animateKey ? key : undefined}
      data-selected={selected ? 'true' : undefined}
    >
      {row}
      {action !== null && action !== false && (
        <span className="bd-row-action" data-pr-card-action="">
          {action}
        </span>
      )}
    </div>
  );
}
