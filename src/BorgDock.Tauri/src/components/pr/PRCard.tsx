import clsx from 'clsx';
import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';
import {
  Avatar,
  Card,
  Dot,
  Pill,
  Ring,
  type PillTone,
} from '@/components/shared/primitives';
import type { OverallStatus } from '@/types';

export type PRCardDensity = 'compact' | 'normal';

export interface PRCardData {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  authorLogin: string;
  isMine: boolean;
  status: OverallStatus;
  statusLabel: string;
  reviewState: 'approved' | 'changes' | 'commented' | 'pending' | 'none';
  isDraft: boolean;
  isMerged: boolean;
  isClosed: boolean;
  hasConflict: boolean;
  branch?: string;
  baseBranch?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commitCount?: number;
  labels?: string[];
  worktreeSlot?: string;
}

export interface PRCardProps {
  pr: PRCardData;
  /** Visual density. compact = single-line grid (flyout). normal = column with score Ring. */
  density: PRCardDensity;
  /** Readiness score 0..100. Only rendered in density="normal". */
  score?: number;
  /** Click handler — wires to selectPr / openPrDetail / etc. at call site. */
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  /** Right-click handler. */
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
  /** Keyboard-nav focus marker (sets data-active="true"). */
  active?: boolean;
  /** Keyboard-selected marker (visual ring) — different from active. */
  isFocused?: boolean;
  /** Optional trailing slot for action buttons / score / etc. (normal density only). */
  trailing?: ReactNode;
}

const REVIEW_PILL: Record<
  PRCardData['reviewState'],
  { tone: PillTone; label: string; toneAttr: string } | null
> = {
  approved: { tone: 'success', label: 'approved', toneAttr: 'approved' },
  changes: { tone: 'error', label: 'changes', toneAttr: 'changes' },
  commented: { tone: 'draft', label: 'commented', toneAttr: 'commented' },
  pending: { tone: 'warning', label: 'review needed', toneAttr: 'pending' },
  none: null,
};

function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

function statusDotTone(status: OverallStatus): 'red' | 'yellow' | 'green' | 'gray' {
  return status;
}

export function PRCard({
  pr,
  density,
  score,
  onClick,
  onContextMenu,
  active,
  isFocused,
  trailing,
}: PRCardProps) {
  const review = REVIEW_PILL[pr.reviewState];
  const isCompact = density === 'compact';

  // Data attributes shared by both densities. Only emit data-active when active prop is provided.
  const dataAttrs: Record<string, string> = {
    'data-pr-row': '',
    'data-pr-number': String(pr.number),
  };
  if (active !== undefined) {
    dataAttrs['data-active'] = active ? 'true' : 'false';
  }

  if (isCompact) {
    const compactProps: HTMLAttributes<HTMLDivElement> = {
      onClick,
      onContextMenu,
      role: onClick ? 'button' : undefined,
      tabIndex: onClick ? 0 : undefined,
    };
    return (
      <div
        {...compactProps}
        {...dataAttrs}
        className={clsx(
          'bd-pr-row',
          'grid items-center gap-2.5 px-3 py-2',
          'cursor-pointer transition-colors hover:bg-[var(--color-surface-hover)]',
          active && 'bg-[var(--color-surface-hover)]',
        )}
        style={{ gridTemplateColumns: '24px 1fr auto' }}
      >
        <Avatar
          initials={avatarInitials(pr.authorLogin)}
          tone={pr.isMine ? 'own' : 'them'}
          size="sm"
        />
        <div className="min-w-0">
          <div
            className="truncate text-[12px] font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {pr.title}
          </div>
          <div
            className="mt-0.5 flex items-center gap-1.5 text-[11px]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span className="font-mono">
              {pr.repoOwner}/{pr.repoName}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{pr.number}</span>
            <span aria-hidden>·</span>
            <Dot tone={statusDotTone(pr.status)} pulse={pr.status === 'yellow'} />
            <span>{pr.statusLabel}</span>
          </div>
        </div>
        {review && (
          <Pill tone={review.tone} data-pill-tone={review.toneAttr}>
            {review.label}
          </Pill>
        )}
      </div>
    );
  }

  return (
    <Card
      variant={pr.isMine ? 'own' : 'default'}
      padding="md"
      interactive
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...dataAttrs}
      className={clsx(
        'bd-pr-card',
        isFocused && 'ring-2 ring-[var(--color-accent)] ring-offset-1',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar
          initials={avatarInitials(pr.authorLogin)}
          tone={pr.isMine ? 'own' : 'them'}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-[13px] font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {pr.title}
            </span>
            {review && (
              <Pill tone={review.tone} data-pill-tone={review.toneAttr}>
                {review.label}
              </Pill>
            )}
          </div>
          <div
            className="mt-1 flex flex-wrap items-center gap-2 text-[11px]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span className="font-mono">
              {pr.repoOwner}/{pr.repoName}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{pr.number}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Dot tone={statusDotTone(pr.status)} pulse={pr.status === 'yellow'} />
              <span>{pr.statusLabel}</span>
            </span>
            {pr.isDraft && <Pill tone="draft">draft</Pill>}
            {pr.hasConflict && <Pill tone="error">conflicts</Pill>}
            {pr.isMerged && <Pill tone="success">merged</Pill>}
            {pr.isClosed && !pr.isMerged && <Pill tone="neutral">closed</Pill>}
          </div>
          {(pr.branch || pr.additions !== undefined) && (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-[11px]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {pr.branch && <span className="font-mono">{pr.branch}</span>}
              {pr.baseBranch && (
                <>
                  <span aria-hidden>→</span>
                  <span className="font-mono">{pr.baseBranch}</span>
                </>
              )}
              {pr.additions !== undefined && pr.additions > 0 && (
                <span style={{ color: 'var(--color-status-green)' }}>
                  +{pr.additions.toLocaleString()}
                </span>
              )}
              {pr.deletions !== undefined && pr.deletions > 0 && (
                <span style={{ color: 'var(--color-status-red)' }}>
                  {'\u2212'}
                  {pr.deletions.toLocaleString()}
                </span>
              )}
              {pr.commitCount !== undefined && pr.commitCount > 0 && (
                <span>{pr.commitCount}c</span>
              )}
              {pr.changedFiles !== undefined && pr.changedFiles > 0 && (
                <span>{pr.changedFiles} files</span>
              )}
            </div>
          )}
          {pr.labels && pr.labels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {pr.labels.map((l) => (
                <Pill key={l} tone="neutral">
                  {l}
                </Pill>
              ))}
            </div>
          )}
          {pr.worktreeSlot && (
            <div className="mt-1.5">
              <Pill tone="ghost">{pr.worktreeSlot}</Pill>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="font-mono text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            #{pr.number}
          </span>
          {score !== undefined && <Ring value={score} size={32} label />}
          {trailing}
        </div>
      </div>
    </Card>
  );
}
