import clsx from 'clsx';
import type { BadgeStyleProps } from '../BadgeStyles';
import {
  BADGE_KEYFRAMES,
  CheckIcon,
  DragGrip,
  ExpandChevron,
  STATUS_DOT_MAP,
  XIcon,
  generateCheckPips,
} from './shared';

export function MinimalNotch({
  totalPrCount,
  failingCount,
  pendingCount,
  statusColor,
  statusText,
  onClick,
  onToggleExpand,
  isExpanded,
}: BadgeStyleProps) {
  const isFailing = statusColor === 'red';
  const dotColor = STATUS_DOT_MAP[statusColor];
  const pips = generateCheckPips(totalPrCount, failingCount, pendingCount);

  return (
    <>
      <style>{BADGE_KEYFRAMES}</style>
      <div
        className={clsx(
          'flex items-center relative overflow-hidden w-full',
          isExpanded ? 'rounded-xl' : 'rounded-[18px]',
          'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
          'transition-all duration-300',
          !isExpanded && 'hover:-translate-y-0.5',
        )}
        style={{
          boxShadow: `0 2px 12px rgba(0,0,0,0.12), 0 0 1px ${dotColor}`,
        }}
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-[18px]"
          style={{ backgroundColor: dotColor }}
        />

        <DragGrip />

        <button
          data-testid="badge-open-sidebar"
          className="flex items-center gap-2 pl-1.5 pr-1 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors rounded-none relative z-[1]"
          onClick={onClick}
        >
          {/* PR count */}
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-bold leading-none tracking-tight text-[var(--color-text-primary)]">
              {totalPrCount}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              prs
            </span>
          </div>

          {/* Dot separator */}
          <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-separator)]" />

          {/* Status icon in circle */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: isFailing ? 'rgba(229,64,101,0.15)' : 'rgba(125,211,192,0.15)',
              }}
            >
              {isFailing ? (
                <XIcon size={8} color={dotColor} />
              ) : (
                <CheckIcon size={8} color={dotColor} />
              )}
            </div>
            <span
              className="text-[11px] font-medium whitespace-nowrap"
              style={{ color: dotColor }}
            >
              {statusText}
            </span>
          </div>

          {/* Check pips */}
          <div className="flex gap-[2px] ml-0.5">
            {pips.map((status, i) => (
              <div
                key={i}
                className="w-[3px] rounded-sm"
                style={{
                  height: 12,
                  backgroundColor:
                    status === 'pass'
                      ? 'var(--color-status-green)'
                      : status === 'fail'
                        ? 'var(--color-status-red)'
                        : 'var(--color-status-yellow)',
                  opacity: status === 'pass' ? 0.5 : 0.8,
                }}
              />
            ))}
          </div>
        </button>

        <ExpandChevron isExpanded={isExpanded} onToggleExpand={onToggleExpand} />
      </div>
    </>
  );
}
