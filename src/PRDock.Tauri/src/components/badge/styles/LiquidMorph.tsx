import clsx from 'clsx';
import type { BadgeStyleProps } from '../BadgeStyles';
import {
  BADGE_KEYFRAMES,
  DragGrip,
  ExpandChevron,
  GLOW_MAP,
  STATUS_DOT_MAP,
} from './shared';

export function LiquidMorph({
  totalPrCount,
  statusColor,
  statusText,
  onClick,
  onToggleExpand,
  isExpanded,
}: BadgeStyleProps) {
  const isFailing = statusColor === 'red';
  const dotColor = STATUS_DOT_MAP[statusColor];
  const glowColor = GLOW_MAP[statusColor];

  return (
    <>
      <style>{BADGE_KEYFRAMES}</style>
      <div
        className={clsx(
          'flex items-center relative w-full',
          isExpanded ? 'rounded-xl' : 'rounded-full',
          'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
          'transition-all duration-[400ms]',
          !isExpanded && 'hover:-translate-y-0.5 hover:scale-[1.03]',
        )}
        style={{
          boxShadow: `0 2px 20px ${glowColor}`,
        }}
      >
        <DragGrip />

        <button
          data-testid="badge-open-sidebar"
          className="flex items-center gap-2 px-1 py-1.5 pr-2 hover:bg-[var(--color-surface-hover)] transition-colors rounded-none"
          onClick={onClick}
        >
          {/* Blob circle with count */}
          <div className="relative flex items-center justify-center w-7 h-7 rounded-full shrink-0"
            style={{
              background: `radial-gradient(circle at 40% 40%, ${isFailing ? 'rgba(229,64,101,0.2)' : 'rgba(125,211,192,0.2)'}, ${isFailing ? 'rgba(229,64,101,0.08)' : 'rgba(125,211,192,0.08)'})`,
            }}
          >
            <div
              className="absolute inset-[-3px] rounded-full"
              style={{
                border: `1px solid ${dotColor}`,
                opacity: 0.25,
                animation: 'badge-liquid-morph 4s ease-in-out infinite',
              }}
            />
            <span
              className="text-xs font-bold leading-none relative z-[1]"
              style={{ color: dotColor }}
            >
              {totalPrCount}
            </span>
          </div>

          {/* Text */}
          <div className="flex flex-col gap-0">
            <span className="text-xs font-semibold leading-tight text-[var(--color-text-primary)]">
              Open PRs
            </span>
            <span
              className="text-[10px] font-medium"
              style={{ color: dotColor, opacity: 0.65 }}
            >
              {statusText}
            </span>
          </div>

          {/* FIX / OK tag */}
          <div
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide shrink-0"
            style={{
              backgroundColor: isFailing ? 'rgba(229,64,101,0.1)' : 'rgba(125,211,192,0.1)',
              color: dotColor,
              border: `1px solid ${isFailing ? 'rgba(229,64,101,0.15)' : 'rgba(125,211,192,0.15)'}`,
            }}
          >
            {isFailing ? 'FIX' : 'OK'}
          </div>
        </button>

        <ExpandChevron isExpanded={isExpanded} onToggleExpand={onToggleExpand} />
      </div>
    </>
  );
}
