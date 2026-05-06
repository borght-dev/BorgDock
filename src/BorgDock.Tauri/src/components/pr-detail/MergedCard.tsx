import type { PullRequest } from '@/types';

interface MergedCardProps {
  pr: PullRequest;
}

function formatAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const CheckGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 10 4 4 8-8" />
  </svg>
);

const XGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>
);

export function MergedCard({ pr }: MergedCardProps) {
  const isMerged = Boolean(pr.mergedAt);
  const variant = isMerged ? 'merged' : 'closed';
  const title = isMerged ? 'Merged' : 'Closed';
  const railColor = isMerged ? 'var(--color-purple)' : 'var(--color-text-ghost)';
  const tintColor = isMerged ? 'var(--color-purple-soft)' : 'var(--color-surface-raised)';
  const fgColor = isMerged ? 'var(--color-purple)' : 'var(--color-text-secondary)';
  const timestampIso = isMerged ? pr.mergedAt : pr.closedAt;
  const age = timestampIso ? formatAge(timestampIso) : '';
  const timestampLabel = isMerged
    ? age === 'just now' ? 'Merged just now' : `Merged ${age} ago`
    : age === 'just now' ? 'Closed just now' : `Closed ${age} ago`;

  return (
    <div
      data-merged-card
      data-variant={variant}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 8,
        background: tintColor,
        border: '1px solid var(--color-subtle-border)',
        borderLeftWidth: 3,
        borderLeftColor: railColor,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: railColor,
          color: 'white',
          flexShrink: 0,
        }}
      >
        {isMerged ? <CheckGlyph /> : <XGlyph />}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: fgColor, lineHeight: 1.2 }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontFamily: 'var(--font-code)' }}>{pr.headRef}</span>
          {isMerged && (
            <>
              <span aria-hidden>→</span>
              <span style={{ fontFamily: 'var(--font-code)' }}>{pr.baseRef}</span>
            </>
          )}
          <span aria-hidden style={{ color: 'var(--color-text-faint)' }}>·</span>
          <span>{timestampLabel}</span>
        </div>
      </div>
    </div>
  );
}
