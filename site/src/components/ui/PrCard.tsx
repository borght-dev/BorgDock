import { Fragment } from 'react';
import { Avatar, BranchChip, Pill, StatusDot, WorktreeBadge } from './atoms';
import type { PillSpec, ReasonFragment, ReviewState, StatusKind } from './types';

export interface PrCardProps {
  status?: StatusKind;
  title: string;
  repo?: string;
  author?: string;
  mine?: boolean;
  branch?: string;
  number?: number;
  reason?: ReasonFragment[];
  pills?: PillSpec[];
  worktree?: string | null;
  selected?: boolean;
  reviewState?: ReviewState;
}

const REASON_COLOR: Record<Exclude<StatusKind, 'gray'>, string> = {
  green: 'var(--color-status-green)',
  red: 'var(--color-status-red)',
  yellow: 'var(--color-status-yellow)',
};

export function PrCard({
  status = 'green',
  title,
  repo,
  author = 'JS',
  mine = false,
  branch,
  number,
  reason,
  pills = [],
  worktree = null,
  selected = false,
  reviewState = null,
}: PrCardProps) {
  const borderColor = selected
    ? 'var(--color-accent)'
    : mine
      ? 'var(--color-card-border-my-pr)'
      : 'var(--color-card-border)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: selected
          ? 'var(--color-selected-row-bg, var(--color-accent-subtle))'
          : 'var(--color-card-background)',
        transition: 'border-color 150ms ease',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div style={{ marginTop: 5 }}>
        <StatusDot status={status} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        {(repo || reason) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {repo && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-code)',
                  padding: '1px 6px',
                  borderRadius: 3,
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {repo}
              </span>
            )}
            {reason && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                {reason.map((r, i) => (
                  <Fragment key={i}>
                    {i > 0 && (
                      <span style={{ margin: '0 4px', color: 'var(--color-text-ghost)' }}>·</span>
                    )}
                    <span
                      style={{
                        color: r.kind && r.kind !== 'gray' ? REASON_COLOR[r.kind] : 'inherit',
                        fontWeight: r.kind === 'green' ? 500 : 400,
                      }}
                    >
                      {r.text}
                    </span>
                  </Fragment>
                ))}
              </span>
            )}
          </div>
        )}
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.35,
            color: 'var(--color-text-primary)',
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Avatar initials={author} mine={mine} />
          {branch && <BranchChip>{branch}</BranchChip>}
          {worktree && <WorktreeBadge slot={worktree} />}
          {pills.map((p, i) => (
            <Pill key={i} variant={p.variant} icon={p.icon}>
              {p.text}
            </Pill>
          ))}
          {reviewState === 'approved' && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--color-status-green)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              approved
            </span>
          )}
          {reviewState === 'changes' && (
            <span style={{ fontSize: 10, color: 'var(--color-status-red)' }}>changes requested</span>
          )}
        </div>
      </div>
      {number != null && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-code)',
          }}
        >
          #{number}
        </span>
      )}
    </div>
  );
}
