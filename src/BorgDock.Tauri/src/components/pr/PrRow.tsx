import clsx from 'clsx';
import { GitBranch } from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Avatar, Pill, Ring } from '@/components/shared/primitives';
import type { OverallStatus, PrDensity } from '@/types';
import { avatarInitials, type PrCardData, REVIEW_PILL } from './pr-card-data';

const STATUS_COLOR: Record<OverallStatus, string> = {
  red: 'text-[var(--color-status-red)]',
  yellow: 'text-[var(--color-status-yellow)]',
  green: 'text-[var(--color-status-green)]',
  gray: 'text-[var(--color-status-gray)]',
};

const DEFAULT_BASES = new Set(['main', 'master']);

export interface PrRowProps {
  pr: PrCardData;
  density: PrDensity;
  /** Merge-readiness score 0..100, drawn as a ring on the trailing edge. */
  score?: number;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
  /** Keyboard-nav cursor (data-active). */
  active?: boolean;
  /** Selected PR (accent ring). */
  isFocused?: boolean;
  /** Extra inline chips after labels — linked work items, review wait time. */
  extras?: ReactNode;
  /** Show the repo name after the author (useful when several repos are monitored). */
  showRepo?: boolean;
}

function Delta({ additions, deletions }: { additions?: number; deletions?: number }) {
  if (additions === undefined && deletions === undefined) return null;
  return (
    <span className="bd-pr-item__delta">
      <span className="text-[var(--color-status-green)]">+{(additions ?? 0).toLocaleString()}</span>
      <span className="text-[var(--color-status-red)]">
        {'−'}
        {(deletions ?? 0).toLocaleString()}
      </span>
    </span>
  );
}

function Status({ pr, placeholder }: { pr: PrCardData; placeholder?: boolean }) {
  if (!pr.statusLabel) {
    return placeholder ? <span className="text-[var(--color-text-faint)]">—</span> : null;
  }
  return (
    <span className={clsx('bd-pr-item__status', STATUS_COLOR[pr.status])}>{pr.statusLabel}</span>
  );
}

function StatePills({ pr }: { pr: PrCardData }) {
  return (
    <>
      {pr.isDraft && <Pill tone="draft">draft</Pill>}
      {pr.hasConflict && <Pill tone="error">conflicts</Pill>}
      {pr.isMerged && <Pill tone="success">merged</Pill>}
      {pr.isClosed && !pr.isMerged && <Pill tone="neutral">closed</Pill>}
    </>
  );
}

function Labels({ pr }: { pr: PrCardData }) {
  return (
    <>
      {pr.labels?.map((l) => (
        <Pill key={l} tone="neutral">
          {l}
        </Pill>
      ))}
      {pr.worktreeSlot && <Pill tone="ghost">{pr.worktreeSlot}</Pill>}
    </>
  );
}

/**
 * Main-window PR row. Rendered inside a `.bd-pr-panel`, one hairline per row.
 * comfortable: title + chips line, plain-text meta line, number and ring on the right.
 * All chips (review, state, labels, extras) share one line; chips that don't fit
 * wrap onto a hidden second line so nothing renders half-clipped.
 * compact: single 32px table row aligned to `PrTableHeader`'s columns.
 * Repo, branch, commit/file/comment counts are intentionally omitted; the base
 * branch appears only when it isn't main/master.
 */
export function PrRow({
  pr,
  density,
  score,
  onClick,
  onContextMenu,
  active,
  isFocused,
  extras,
  showRepo = false,
}: PrRowProps) {
  const review = REVIEW_PILL[pr.reviewState];
  const reviewPill = review && (
    <Pill tone={review.tone} data-pill-tone={review.toneAttr}>
      {review.label}
    </Pill>
  );
  const base =
    pr.baseBranch && !DEFAULT_BASES.has(pr.baseBranch.toLowerCase()) ? pr.baseBranch : undefined;

  const handleKeyDown = onClick
    ? (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as MouseEvent<HTMLDivElement>);
        }
      }
    : undefined;

  const rowProps = {
    'data-pr-row': '',
    'data-pr-number': String(pr.number),
    'data-density': density,
    'data-active': active === undefined ? undefined : String(active),
    'data-selected': isFocused ? 'true' : undefined,
    role: onClick ? 'button' : undefined,
    tabIndex: onClick ? 0 : undefined,
    onClick,
    onContextMenu,
    onKeyDown: handleKeyDown,
  };

  const avatar = (
    <Avatar initials={avatarInitials(pr.authorLogin)} tone={pr.isMine ? 'own' : 'them'} size="sm" />
  );

  if (density === 'compact') {
    return (
      <div {...rowProps} className="bd-pr-item bd-pr-item--compact">
        {avatar}
        <span className="bd-pr-col--wide truncate text-[11px] text-[var(--color-text-secondary)]">
          {pr.authorLogin}
          {showRepo && (
            <span className="ml-1.5 font-mono text-[var(--color-text-muted)]">{pr.repoName}</span>
          )}
        </span>
        <div className="bd-pr-item__headline">
          <span className="bd-pr-item__title text-[12.5px] font-medium" title={pr.title}>
            {pr.title}
          </span>
          <span className="bd-pr-item__chips">
            <StatePills pr={pr} />
            <Labels pr={pr} />
            {extras}
            {base && (
              <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                → {base}
              </span>
            )}
          </span>
        </div>
        <span className="flex" data-pr-review="">
          {reviewPill ?? <span className="text-[11px] text-[var(--color-text-faint)]">—</span>}
        </span>
        <span className="text-[11px]">
          <Status pr={pr} placeholder />
        </span>
        <span className="bd-pr-col--wide flex justify-end text-[11px]">
          <Delta additions={pr.additions} deletions={pr.deletions} />
        </span>
        <span className="bd-pr-item__number text-right">{pr.number}</span>
        {score !== undefined ? (
          <Ring value={score} size={22} stroke={2} className="bd-ring--xs justify-self-center" />
        ) : (
          <span />
        )}
      </div>
    );
  }

  return (
    <div {...rowProps} className="bd-pr-item bd-pr-item--comfortable">
      <span className="mt-px">{avatar}</span>
      <div className="flex min-w-0 flex-col gap-[5px]">
        <div className="bd-pr-item__headline">
          <span className="bd-pr-item__title text-[13px] font-semibold" title={pr.title}>
            {pr.title}
          </span>
          <span className="bd-pr-item__chips">
            {reviewPill}
            <StatePills pr={pr} />
            <Labels pr={pr} />
            {extras}
          </span>
        </div>
        <div className="bd-pr-item__meta">
          <span className="text-[var(--color-text-secondary)]">{pr.authorLogin}</span>
          {showRepo && (
            <span className="font-mono text-[var(--color-text-muted)]">{pr.repoName}</span>
          )}
          <Status pr={pr} />
          <Delta additions={pr.additions} deletions={pr.deletions} />
          {base && (
            <span className="inline-flex items-center gap-1 font-mono">
              <GitBranch size={11} strokeWidth={2.25} aria-hidden />→ {base}
            </span>
          )}
        </div>
      </div>
      <div className="mt-[11px] flex h-5 items-center gap-2.5">
        <span className="bd-pr-item__number">#{pr.number}</span>
        {score !== undefined && (
          <Ring value={score} size={26} stroke={2.5} className="bd-pr-item__ring" />
        )}
      </div>
    </div>
  );
}

/**
 * Bordered panel that holds a section's rows, separated by hairlines. In
 * compact density it leads with the table header.
 */
export function PrPanel({
  density,
  children,
  className,
}: {
  density: PrDensity;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('bd-pr-panel', className)}>
      {density === 'compact' && <PrTableHeader />}
      {children}
    </div>
  );
}

/** Column header for a compact-density panel. Mirrors `.bd-pr-item--compact`'s grid. */
export function PrTableHeader() {
  return (
    <div className="bd-pr-table-head" aria-hidden>
      <span />
      <span className="bd-pr-col--wide">Author</span>
      <span>Pull request</span>
      <span>Review</span>
      <span>Checks</span>
      <span className="bd-pr-col--wide text-right">Δ lines</span>
      <span className="text-right">#</span>
      <span className="text-center">Ready</span>
    </div>
  );
}
