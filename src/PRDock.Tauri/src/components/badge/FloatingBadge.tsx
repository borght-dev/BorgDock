import { useState } from 'react';
import clsx from 'clsx';

export type StatusColor = 'green' | 'red' | 'yellow';

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

  const glowColor = GLOW_MAP[statusColor];

  return (
    <div className="flex flex-col items-center">
      {/* Main badge pill */}
      <button
        className={clsx(
          'flex items-center gap-2 rounded-full px-3.5 py-1.5',
          'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
          'backdrop-blur-md transition-all hover:scale-[1.02]',
          'animate-[breathe_3s_ease-in-out_infinite]'
        )}
        style={{
          boxShadow: `0 0 20px ${glowColor}, 0 2px 8px rgba(0,0,0,0.08)`,
        }}
        onClick={onExpandSidebar}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsExpanded((prev) => !prev);
        }}
      >
        {/* Status icon */}
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: STATUS_DOT_MAP[statusColor] }}
        />

        {/* PR count */}
        <span className="text-sm font-bold text-[var(--color-text-primary)]">{totalPrCount}</span>

        {/* Separator */}
        <div className="h-3 w-px bg-[var(--color-separator)]" />

        {/* Status text */}
        <span className="text-[11px] text-[var(--color-text-tertiary)] whitespace-nowrap">
          {statusText}
        </span>
      </button>

      {/* Handle to toggle expanded */}
      <button
        className="mt-0.5 h-1 w-8 rounded-full bg-[var(--color-text-ghost)] opacity-0 hover:opacity-50 transition-opacity"
        onClick={() => setIsExpanded((prev) => !prev)}
      />

      {/* Expanded panel */}
      {isExpanded && (
        <div
          className={clsx(
            'mt-1 w-[320px] rounded-xl bg-[var(--color-badge-surface)] border border-[var(--color-badge-border)]',
            'backdrop-blur-md shadow-lg overflow-hidden'
          )}
        >
          <div className="grid grid-cols-2 divide-x divide-[var(--color-separator)]">
            {/* My PRs */}
            <PrColumn title="MY PRS" items={myPrs} onOpenPr={onOpenPr} />
            {/* Team PRs */}
            <PrColumn title="TEAM" items={teamPrs} onOpenPr={onOpenPr} />
          </div>

          {/* Footer summary */}
          <div className="flex items-center justify-center gap-3 border-t border-[var(--color-separator)] px-3 py-1.5">
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {totalPrCount} total
            </span>
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
              <div className="truncate text-[10px] text-[var(--color-text-primary)]" style={{ maxWidth: 120 }}>
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
