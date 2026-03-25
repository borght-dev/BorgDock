import clsx from 'clsx';
import { useCallback, useState } from 'react';

export type StatusColor = 'green' | 'red' | 'yellow';

const BADGE_COLLAPSED = { width: 340, height: 48 };
const BADGE_EXPANDED = { width: 340, height: 380 };

export interface BadgePrItem {
  title: string;
  number: number;
  timeAgo: string;
  statusColor: StatusColor;
  checksText?: string;
  isInProgress: boolean;
  repoOwner: string;
  repoName: string;
}

interface FloatingBadgeProps {
  totalPrCount: number;
  failingCount: number;
  pendingCount: number;
  statusColor: StatusColor;
  statusText: string;
  onExpandSidebar: () => void;
  myPrs: BadgePrItem[];
  teamPrs: BadgePrItem[];
  onOpenPr: (item: BadgePrItem) => void;
}

const GLOW_MAP: Record<StatusColor, string> = {
  green: 'var(--color-badge-glow-green)',
  red: 'var(--color-badge-glow-red)',
  yellow: 'var(--color-badge-glow-yellow)',
};

const STATUS_DOT_MAP: Record<StatusColor, string> = {
  green: 'var(--color-status-green)',
  red: 'var(--color-status-red)',
  yellow: 'var(--color-status-yellow)',
};

const BADGE_KEYFRAMES = `
@keyframes badge-ring-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(1.15); }
}
@keyframes badge-dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
`;

export function FloatingBadge({
  totalPrCount,
  failingCount,
  pendingCount,
  statusColor,
  statusText,
  onExpandSidebar,
  myPrs,
  teamPrs,
  onOpenPr,
}: FloatingBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(
    async (expand?: boolean) => {
      const next = expand ?? !isExpanded;
      setIsExpanded(next);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const size = next ? BADGE_EXPANDED : BADGE_COLLAPSED;
        await invoke('resize_badge', { width: size.width, height: size.height });
      } catch {
        // ignore
      }
    },
    [isExpanded],
  );

  const glowColor = GLOW_MAP[statusColor];
  const dotColor = STATUS_DOT_MAP[statusColor];
  const isFailing = statusColor === 'red';

  return (
    <div className="flex flex-col items-center">
      <style>{BADGE_KEYFRAMES}</style>

      {/* Main badge pill — Glass Capsule style */}
      <div
        data-tauri-drag-region
        className={clsx(
          'flex items-center rounded-full cursor-grab active:cursor-grabbing',
          'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
          'backdrop-blur-[20px]',
          'transition-all duration-300',
          'hover:-translate-y-0.5 hover:scale-[1.02]',
        )}
        style={{
          boxShadow: `0 4px 24px ${glowColor}, 0 0 0 1px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Left section: icon + count + label */}
        <button
          className="flex items-center gap-2 px-3.5 py-2 rounded-l-full hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={onExpandSidebar}
        >
          {/* Circular icon with animated ring */}
          <div
            className="relative flex items-center justify-center w-7 h-7 rounded-full shrink-0"
            style={{
              backgroundColor: isFailing ? 'rgba(229,64,101,0.12)' : 'rgba(125,211,192,0.12)',
            }}
          >
            <div
              className="absolute inset-[-2px] rounded-full"
              style={{
                border: `1.5px solid ${dotColor}`,
                opacity: 0.4,
                animation: 'badge-ring-pulse 2.5s ease-in-out infinite',
              }}
            />
            {isFailing ? (
              <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke={dotColor} strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
                <path d="M3 8L6.5 11.5L13 4.5" stroke={dotColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>

          {/* PR count */}
          <span className="text-lg font-bold leading-none tracking-tight text-[var(--color-text-primary)]">
            {totalPrCount}
          </span>

          {/* Label */}
          <span className="text-[11px] font-medium leading-none text-[var(--color-text-secondary)]">
            PRs
          </span>
        </button>

        {/* Glass divider */}
        <div
          className="w-px h-7 shrink-0"
          style={{
            background: 'linear-gradient(to bottom, transparent, var(--color-separator), transparent)',
          }}
        />

        {/* Right section: status dot + text */}
        <button
          className="flex items-center gap-1.5 px-3 py-2 hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={onExpandSidebar}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              backgroundColor: dotColor,
              boxShadow: `0 0 8px ${dotColor}`,
              animation: isFailing ? 'badge-dot-blink 2s ease-in-out infinite' : 'none',
            }}
          />
          <span
            className="text-[11px] font-medium whitespace-nowrap"
            style={{ color: dotColor, opacity: 0.85 }}
          >
            {statusText}
          </span>
        </button>

        {/* Expand/collapse chevron */}
        <button
          className={clsx(
            'flex items-center justify-center self-stretch px-2.5 rounded-r-full',
            'border-l border-[var(--color-separator)]',
            'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
            'hover:bg-[var(--color-surface-hover)] transition-colors',
          )}
          onClick={() => toggleExpanded()}
          title={isExpanded ? 'Collapse' : 'Expand PR list'}
        >
          <svg
            className={clsx('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-180')}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        </button>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div
          className={clsx(
            'mt-1 w-[320px] rounded-xl bg-[var(--color-badge-surface)] border border-[var(--color-badge-border)]',
            'shadow-lg overflow-hidden',
          )}
        >
          <div className="grid grid-cols-2 divide-x divide-[var(--color-separator)]">
            <PrColumn title="MY PRS" items={myPrs} onOpenPr={onOpenPr} />
            <PrColumn title="TEAM" items={teamPrs} onOpenPr={onOpenPr} />
          </div>

          {/* Footer summary */}
          <div className="flex items-center justify-center gap-3 border-t border-[var(--color-separator)] px-3 py-1.5">
            <span className="text-[10px] text-[var(--color-text-muted)]">{totalPrCount} total</span>
            {failingCount > 0 && (
              <span className="text-[10px] text-[var(--color-status-red)]">
                {failingCount} failing
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-[10px] text-[var(--color-status-yellow)]">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PrColumn({
  title,
  items,
  onOpenPr,
}: {
  title: string;
  items: BadgePrItem[];
  onOpenPr: (item: BadgePrItem) => void;
}) {
  return (
    <div className="px-2 py-2">
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-ghost)]">
        {title}
      </div>
      <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
        {items.map((item) => (
          <button
            key={`${item.repoOwner}/${item.repoName}#${item.number}`}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
            onClick={() => onOpenPr(item)}
          >
            <div
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: STATUS_DOT_MAP[item.statusColor] }}
            />
            <div className="flex-1 min-w-0">
              <div
                className="truncate text-[10px] text-[var(--color-text-primary)]"
                style={{ maxWidth: 120 }}
              >
                {item.title}
              </div>
              <div className="text-[9px] text-[var(--color-text-muted)]">
                #{item.number} {item.timeAgo}
              </div>
            </div>
            {item.checksText && (
              <span className="shrink-0 rounded px-1 py-0.5 text-[8px] bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)]">
                {item.checksText}
              </span>
            )}
          </button>
        ))}
        {items.length === 0 && (
          <div className="py-2 text-center text-[10px] text-[var(--color-text-ghost)]">None</div>
        )}
      </div>
    </div>
  );
}
