import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { Avatar, Card, Pill, type PillTone } from '@/components/shared/primitives';
import type { ReviewVerdict } from '@/types';

interface ReviewItemProps {
  author: string;
  authorIsBot: boolean;
  verdict: ReviewVerdict;
  body: string | null;
  createdAt: string;
}

function relative(createdAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initials(login: string): string {
  return login
    .replace(/\[bot\]$/, '')
    .slice(0, 2)
    .toUpperCase();
}

const Check = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m4 8 3 3 5-6" />
  </svg>
);
const Alert = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 5v3.5" />
    <circle cx="8" cy="11" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);
const Speech = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 4h10v6H7l-3 3v-3H3z" />
  </svg>
);

function VerdictPill({ v }: { v: ReviewVerdict }) {
  const map: Record<ReviewVerdict, { tone: PillTone; icon: ReactNode; label: string }> = {
    approved: { tone: 'success', icon: <Check />, label: 'approved' },
    'changes-requested': { tone: 'error', icon: <Alert />, label: 'changes requested' },
    commented: { tone: 'neutral', icon: <Speech />, label: 'commented' },
  };
  const m = map[v];
  return (
    <Pill tone={m.tone} icon={m.icon}>
      {m.label}
    </Pill>
  );
}

/**
 * ReviewItem — verdict event from a PR review.
 *  - body == null  → compact one-line row (typical "approval with no message" case)
 *  - body != null  → full card with markdown body and a coloured left border by verdict
 */
export function ReviewItem({ author, authorIsBot, verdict, body, createdAt }: ReviewItemProps) {
  if (!body) {
    return (
      <Card
        padding="sm"
        data-discussion-item="review"
        className={clsx(
          'flex items-center gap-2.5',
          verdict === 'approved' &&
            'bg-[var(--color-success-badge-bg)] border-[var(--color-success-badge-border)]',
          verdict === 'changes-requested' &&
            'bg-[var(--color-error-badge-bg)] border-[var(--color-error-badge-border)]',
        )}
      >
        <Avatar initials={initials(author)} tone="them" size="sm" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{author}</span>
        {authorIsBot && <Pill tone="neutral">bot</Pill>}
        <VerdictPill v={verdict} />
        <span className="flex-1" />
        <span className="text-[11px] text-[var(--color-text-muted)]">{relative(createdAt)}</span>
      </Card>
    );
  }

  const leftStripe =
    verdict === 'changes-requested'
      ? 'border-l-[3px] border-l-[var(--color-status-red)]'
      : verdict === 'approved'
        ? 'border-l-[3px] border-l-[var(--color-status-green)]'
        : '';

  return (
    <Card padding="sm" data-discussion-item="review" className={leftStripe}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Avatar initials={initials(author)} tone="them" size="sm" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{author}</span>
        {authorIsBot && <Pill tone="neutral">bot</Pill>}
        <VerdictPill v={verdict} />
        <span className="flex-1" />
        <span className="text-[11px] text-[var(--color-text-muted)]">{relative(createdAt)}</span>
      </div>
      <div className="markdown-body text-[12.5px] leading-[1.55] text-[var(--color-text-secondary)]">
        <Markdown>{body}</Markdown>
      </div>
    </Card>
  );
}
