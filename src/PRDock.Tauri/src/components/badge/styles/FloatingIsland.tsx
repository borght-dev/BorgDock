import clsx from 'clsx';
import type { BadgeStyleProps } from '../BadgeStyles';
import {
  BADGE_KEYFRAMES,
  DragGrip,
  ExpandChevron,
  GLOW_MAP,
  STATUS_DOT_MAP,
  generateCheckPips,
} from './shared';

export function FloatingIsland({
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
  const glowColor = GLOW_MAP[statusColor];

  // Generate mini chart bars from counts
  const bars = generateCheckPips(totalPrCount, failingCount, pendingCount);
  const barHeights = bars.map((_, i) => 6 + ((i * 7 + 3) % 8));

  // PR "avatar" circles (colored placeholders)
  const prColors = ['#7C6AF6', '#7DD3C0', '#E54065'];

  return (
    <>
      <style>{BADGE_KEYFRAMES}</style>
      <div
        className={clsx(
          'flex items-center relative overflow-hidden w-full',
          isExpanded ? 'rounded-xl' : 'rounded-2xl',
          'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
          'transition-all duration-[400ms]',
          !isExpanded && 'hover:-translate-y-0.5 hover:rounded-[18px]',
        )}
        style={{
          boxShadow: `0 2px 20px rgba(0,0,0,0.15), 0 0 0 0.5px ${glowColor}, 0 0 40px -10px ${glowColor}`,
        }}
      >
        {/* Ambient glow overlay */}
        <div className="absolute inset-0 rounded-inherit pointer-events-none overflow-hidden">
          <div
            className="absolute -top-1/2 -left-1/5 w-3/5 h-[200%]"
            style={{
              background: `radial-gradient(ellipse, ${glowColor}, transparent 70%)`,
              animation: 'badge-glow-drift 6s ease-in-out infinite',
              opacity: 0.25,
            }}
          />
        </div>

        <DragGrip />

        <button
          data-testid="badge-open-sidebar"
          className="flex items-center gap-2.5 px-1.5 py-1.5 pr-2.5 hover:bg-[var(--color-surface-hover)] transition-colors rounded-none relative z-[1]"
          onClick={onClick}
        >
          {/* Avatar stack */}
          <div className="flex -mr-0.5">
            {prColors.map((color, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white -mr-1.5 border-[1.5px] border-[var(--color-badge-glass)]"
                style={{ backgroundColor: color, zIndex: 3 - i }}
              >
                {['SC', 'KB', 'TB'][i]}
              </div>
            ))}
          </div>

          {/* Center text */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold leading-none tracking-tighter text-[var(--color-text-primary)]">
                {totalPrCount}
              </span>
              <span className="text-[10px] font-medium text-[var(--color-text-secondary)] leading-none">
                open PRs
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="w-[5px] h-[5px] rounded-full shrink-0"
                style={{
                  backgroundColor: dotColor,
                  boxShadow: `0 0 4px ${dotColor}`,
                  animation: isFailing ? 'badge-dot-blink 2s ease-in-out infinite' : 'none',
                }}
              />
              <span
                className="text-[9px] font-medium tracking-wide"
                style={{ color: dotColor, opacity: 0.7 }}
              >
                {statusText}
              </span>
            </div>
          </div>

          {/* Mini bar chart */}
          <div className="flex items-end gap-[2px] h-4 px-0.5">
            {bars.map((status, i) => (
              <div
                key={i}
                className="w-[3px] rounded-sm"
                style={{
                  height: (barHeights[i] ?? 0) * 1.2,
                  backgroundColor:
                    status === 'pass'
                      ? 'var(--color-status-green)'
                      : status === 'fail'
                        ? 'var(--color-status-red)'
                        : 'var(--color-status-yellow)',
                  opacity: status === 'pass' ? 0.4 : 0.7,
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
