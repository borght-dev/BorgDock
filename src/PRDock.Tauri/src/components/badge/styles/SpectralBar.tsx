import clsx from 'clsx';
import type { BadgeStyleProps } from '../BadgeStyles';
import {
  BADGE_KEYFRAMES,
  DragGrip,
  ExpandChevron,
  PRIcon,
  STATUS_DOT_MAP,
  generateCheckPips,
} from './shared';

export function SpectralBar({
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
  const passRatio = totalPrCount > 0 ? ((totalPrCount - failingCount - pendingCount) / totalPrCount) * 100 : 100;

  return (
    <>
      <style>{BADGE_KEYFRAMES}</style>
      <div
        className={clsx(
          'flex items-stretch rounded-xl relative overflow-hidden h-9 w-full',
          'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
          'transition-all duration-300',
          !isExpanded && 'hover:-translate-y-0.5',
        )}
        style={{
          boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
        }}
      >
        {/* Bottom progress bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            backgroundColor: isFailing ? 'rgba(229,64,101,0.08)' : 'rgba(125,211,192,0.08)',
          }}
        >
          <div
            className="h-full rounded-r-sm transition-all duration-500"
            style={{
              width: `${passRatio}%`,
              backgroundColor: dotColor,
            }}
          />
        </div>

        <div className="flex items-center">
          <DragGrip />
        </div>

        {/* Left: PR icon + count */}
        <button
          data-testid="badge-open-sidebar"
          className="flex items-center gap-1.5 px-2 relative z-[1] hover:bg-[var(--color-surface-hover)] transition-colors rounded-none"
          onClick={onClick}
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{
              backgroundColor: isFailing ? 'rgba(229,64,101,0.1)' : 'rgba(125,211,192,0.1)',
            }}
          >
            <PRIcon size={11} color={dotColor} />
          </div>
          <span className="text-xs font-semibold text-[var(--color-text-primary)] whitespace-nowrap">
            {totalPrCount} PRs
          </span>
        </button>

        {/* Divider */}
        <div
          className="w-px self-stretch my-2"
          style={{
            background: 'linear-gradient(to bottom, transparent, var(--color-separator), transparent)',
          }}
        />

        {/* Right: pips + status */}
        <button
          className="flex items-center gap-2 px-2.5 relative z-[1] hover:bg-[var(--color-surface-hover)] transition-colors rounded-none"
          onClick={onClick}
        >
          <div className="flex gap-[3px] items-center">
            {pips.map((status, i) => (
              <div
                key={i}
                className="w-[6px] h-[6px] rounded-full"
                style={{
                  backgroundColor:
                    status === 'pass'
                      ? 'var(--color-status-green)'
                      : status === 'fail'
                        ? 'var(--color-status-red)'
                        : 'var(--color-status-yellow)',
                  boxShadow: status === 'fail' ? `0 0 3px var(--color-status-red)` : 'none',
                  opacity: status === 'pass' ? 0.6 : 1,
                }}
              />
            ))}
          </div>
          <span
            className="text-[11px] font-medium whitespace-nowrap"
            style={{ color: dotColor }}
          >
            {statusText}
          </span>
        </button>

        <ExpandChevron isExpanded={isExpanded} onToggleExpand={onToggleExpand} />
      </div>
    </>
  );
}
