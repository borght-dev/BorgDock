import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Card,
  Dot,
  Pill,
  Ring,
  type PillTone,
} from '@/components/shared/primitives';
import type { OverallStatus } from '@/types';

function StatusGlyph({ status }: { status: OverallStatus }) {
  // 13px circle icon coloured via currentColor — matches the surrounding
  // status text so the glyph + label read as a single tone.
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (status) {
    case 'red':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'yellow':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'green':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

const STATUS_TEXT_CLASS: Record<OverallStatus, string> = {
  red: 'text-[var(--color-status-red)]',
  yellow: 'text-[var(--color-status-yellow)]',
  green: 'text-[var(--color-status-green)]',
  gray: 'text-[var(--color-status-gray)]',
};

export type PrCardDensity = 'compact' | 'normal';

export interface PrCardData {
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
  commentCount?: number;
  labels?: string[];
  worktreeSlot?: string;
}

/**
 * Title row that scrolls horizontally on hover when the text is too long to
 * fit. No-op when the text fits — the wrapper still clips overflow so the
 * column stays its expected width. Animation distance and duration are derived
 * from the measured overflow so the speed feels consistent regardless of how
 * much extra text there is.
 */
function MarqueeTitle({ text, className }: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [hovered, setHovered] = useState(false);

  // text drives the rendered span content — re-measure when it changes even
  // though the effect body only reads refs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional remeasure trigger on text change
  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const measure = () => {
      const o = inner.scrollWidth - wrap.clientWidth;
      setOverflow(o > 1 ? o : 0);
    };
    measure();
    // ResizeObserver isn't part of jsdom; skip observation in test envs and
    // rely on the one-shot measurement above. Production browsers always have
    // it. Guarding here keeps the component testable without polyfilling.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);

  const shouldScroll = hovered && overflow > 0;
  // ~40 px/s — quick enough to feel responsive, slow enough to read.
  const duration = Math.max(2.5, overflow / 40);

  const innerStyle: CSSProperties = shouldScroll
    ? {
        display: 'inline-block',
        animation: `prcard-marquee ${duration}s ease-in-out infinite alternate`,
        // CSS var consumed by the keyframe defined in styles/index.css.
        ['--prcard-marquee-shift' as never]: `-${overflow + 8}px`,
      }
    : {
        display: 'inline-block',
        transform: 'translateX(0)',
        transition: 'transform 200ms ease-out',
      };

  return (
    <div
      ref={wrapRef}
      className={clsx('overflow-hidden whitespace-nowrap', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-marquee-overflow={overflow > 0 ? 'true' : undefined}
    >
      <span ref={innerRef} style={innerStyle}>
        {text}
      </span>
    </div>
  );
}

function CommentIcon() {
  return (
    <svg
      data-comment-icon=""
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 8a5 5 0 0 1-5 5H5l-3 2v-9a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5z" />
    </svg>
  );
}

export interface PrCardViewProps {
  pr: PrCardData;
  /** Visual density. compact = single-line grid (flyout). normal = column with score Ring. */
  density: PrCardDensity;
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
  /** Show "owner/repo" in the secondary line (compact density only). Default true. */
  showRepo?: boolean;
}

const REVIEW_PILL: Record<
  PrCardData['reviewState'],
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

export function PrCardView({
  pr,
  density,
  score,
  onClick,
  onContextMenu,
  active,
  isFocused,
  trailing,
  showRepo = true,
}: PrCardViewProps) {
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
    const handleKeyDown = onClick
      ? (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as unknown as MouseEvent<HTMLDivElement>);
          }
        }
      : undefined;
    const compactProps: HTMLAttributes<HTMLDivElement> = {
      onClick,
      onContextMenu,
      onKeyDown: handleKeyDown,
      role: onClick ? 'button' : undefined,
      tabIndex: onClick ? 0 : undefined,
    };
    return (
      <div
        {...compactProps}
        {...dataAttrs}
        className={clsx(
          'bd-pr-row',
          // pb-9 reserves a 36px footer band on each row so the absolute hover
          // action cluster (anchored bottom-right by FlyoutPrRow) can sit cleanly
          // below the title/meta instead of overlapping them. Slight cost: rows
          // are ~24px taller at rest.
          'relative grid items-start gap-3 px-4 pt-3 pb-9',
          'border-b border-[var(--color-subtle-border)] last:border-b-0',
          'cursor-pointer transition-colors hover:bg-[var(--color-surface-hover)]',
          active && 'bg-[var(--color-surface-hover)]',
        )}
        // style: grid layout requires exact 24px avatar column — no Tailwind grid-cols preset covers this
        style={{ gridTemplateColumns: '24px 1fr auto' }}
      >
        <Avatar
          initials={avatarInitials(pr.authorLogin)}
          tone={pr.isMine ? 'own' : 'them'}
          size="sm"
        />
        <div className="min-w-0">
          <MarqueeTitle
            text={pr.title}
            className="text-[12px] font-medium text-[var(--color-text-primary)]"
          />
          <div
            className="mt-1 flex items-center gap-2 text-[10.5px] text-[var(--color-text-tertiary)]"
          >
            {showRepo && (
              <>
                <span className="font-normal">
                  {pr.repoOwner}/{pr.repoName}
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="font-normal">#{pr.number}</span>
            <span aria-hidden>·</span>
            <span className={clsx('inline-flex items-center gap-1', STATUS_TEXT_CLASS[pr.status])}>
              <StatusGlyph status={pr.status} />
              <span>{pr.statusLabel}</span>
            </span>
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
              className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]"
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
            className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]"
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
          {(pr.branch ||
            pr.additions !== undefined ||
            (pr.commentCount !== undefined && pr.commentCount > 0)) && (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]"
            >
              {pr.branch && <span className="font-mono">{pr.branch}</span>}
              {pr.baseBranch && (
                <>
                  <span aria-hidden>→</span>
                  <span className="font-mono">{pr.baseBranch}</span>
                </>
              )}
              {pr.additions !== undefined && pr.additions > 0 && (
                <span className="text-[var(--color-status-green)]">
                  +{pr.additions.toLocaleString()}
                </span>
              )}
              {pr.deletions !== undefined && pr.deletions > 0 && (
                <span className="text-[var(--color-status-red)]">
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
              {pr.commentCount !== undefined && pr.commentCount > 0 && (
                <span className="inline-flex items-center gap-0.5" title="Comments">
                  <CommentIcon />
                  {pr.commentCount}
                </span>
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
            className="font-mono text-[11px] text-[var(--color-text-muted)]"
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
