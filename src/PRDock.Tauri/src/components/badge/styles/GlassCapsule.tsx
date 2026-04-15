import clsx from 'clsx';
import type { BadgeStyleProps } from '../BadgeStyles';
import {
  BADGE_KEYFRAMES,
  CheckIcon,
  DragGrip,
  ExpandChevron,
  GLOW_MAP,
  STATUS_DOT_MAP,
  XIcon,
} from './shared';

export function GlassCapsule({
  totalPrCount,
  statusColor,
  statusText,
  onClick,
  onToggleExpand,
  isExpanded,
}: BadgeStyleProps) {
  const glowColor = GLOW_MAP[statusColor];
  const isFailing = statusColor === 'red';
  const dotColor = STATUS_DOT_MAP[statusColor];

  return (
    <>
      <style>{BADGE_KEYFRAMES}</style>
      <div
        className={clsx(
          'flex items-center w-full',
          isExpanded ? 'rounded-xl' : 'rounded-full',
          'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
          'backdrop-blur-[20px]',
          'transition-all duration-300',
          !isExpanded && 'hover:-translate-y-0.5 hover:scale-[1.02]',
        )}
        style={{
          boxShadow: `0 2px 16px ${glowColor}, 0 0 0 1px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        <DragGrip />

        {/* Left section: icon + count + label */}
        <button
          data-testid="badge-open-sidebar"
          className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors rounded-none"
          onClick={onClick}
        >
          {/* Compact status icon */}
          <div
            className="relative flex items-center justify-center w-5 h-5 rounded-full shrink-0"
            style={{
              backgroundColor: isFailing ? 'rgba(229,64,101,0.12)' : 'rgba(125,211,192,0.12)',
            }}
          >
            <div
              className="absolute inset-[-2px] rounded-full"
              style={{
                border: `1px solid ${dotColor}`,
                opacity: 0.35,
                animation: 'badge-ring-pulse 2.5s ease-in-out infinite',
              }}
            />
            {isFailing ? (
              <XIcon size={9} color={dotColor} />
            ) : (
              <CheckIcon size={9} color={dotColor} />
            )}
          </div>

          <span className="text-sm font-bold leading-none tracking-tight text-[var(--color-text-primary)]">
            {totalPrCount}
          </span>
          <span className="text-[9px] font-medium leading-none uppercase tracking-wider text-[var(--color-text-secondary)]">
            PRs
          </span>
        </button>

        {/* Glass divider */}
        <div
          className="w-px h-4 shrink-0"
          style={{
            background:
              'linear-gradient(to bottom, transparent, var(--color-separator), transparent)',
          }}
        />

        {/* Right section: status dot + text */}
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors rounded-none"
          onClick={onClick}
        >
          <span
            className="w-[5px] h-[5px] rounded-full shrink-0"
            style={{
              backgroundColor: dotColor,
              boxShadow: `0 0 6px ${dotColor}`,
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

        <ExpandChevron isExpanded={isExpanded} onToggleExpand={onToggleExpand} />
      </div>
    </>
  );
}
