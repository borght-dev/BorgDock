import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import { useState } from 'react';
import type { StatusColor } from './FloatingBadge';

export interface BadgeStyleProps {
  totalPrCount: number;
  failingCount: number;
  pendingCount: number;
  statusColor: StatusColor;
  statusText: string;
  onClick: () => void;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
}

/** Start native window drag immediately on mousedown. */
function handleDragMouseDown(e: React.MouseEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  getCurrentWindow().startDragging();
}

function ExpandChevron({
  isExpanded,
  onToggleExpand,
}: {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  if (!onToggleExpand) return null;
  return (
    <button
      data-testid="badge-expand-chevron"
      className={clsx(
        'flex items-center justify-center self-stretch px-2 rounded-r-full',
        'border-l border-[var(--color-separator)]',
        'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
        'hover:bg-[var(--color-surface-hover)] transition-colors',
      )}
      onClick={onToggleExpand}
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
  );
}

const STATUS_DOT_MAP: Record<StatusColor, string> = {
  green: 'var(--color-status-green)',
  red: 'var(--color-status-red)',
  yellow: 'var(--color-status-yellow)',
};

const GLOW_MAP: Record<StatusColor, string> = {
  green: 'var(--color-badge-glow-green)',
  red: 'var(--color-badge-glow-red)',
  yellow: 'var(--color-badge-glow-yellow)',
};

/**
 * GlassCapsule - The default glass-morphism pill badge.
 * Rounded-full, backdrop-blur, breathing glow animation.
 */
function GlassCapsule({
  totalPrCount,
  statusColor,
  statusText,
  onClick,
  onToggleExpand,
  isExpanded,
}: BadgeStyleProps) {
  const glowColor = GLOW_MAP[statusColor];

  return (
    <div
      className={clsx(
        'flex items-center rounded-full',
        'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
        'animate-[breathe_3s_ease-in-out_infinite]',
      )}
      style={{
        boxShadow: `0 0 20px ${glowColor}, 0 2px 8px rgba(0,0,0,0.08)`,
      }}
    >
      {/* Drag handle — mousedown calls startDragging() directly */}
      <div
        data-testid="badge-drag-handle"
        className="flex items-center gap-0.5 pl-2.5 py-2 cursor-grab active:cursor-grabbing select-none"
        title="Drag to reposition"
        onMouseDown={handleDragMouseDown}
      >
        <div className="flex flex-col gap-[3px] opacity-40 pointer-events-none">
          <div className="flex gap-[3px]">
            <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-tertiary)]" />
            <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-tertiary)]" />
          </div>
          <div className="flex gap-[3px]">
            <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-tertiary)]" />
            <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-tertiary)]" />
          </div>
          <div className="flex gap-[3px]">
            <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-tertiary)]" />
            <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-tertiary)]" />
          </div>
        </div>
      </div>

      {/* Open sidebar button */}
      <button
        data-testid="badge-open-sidebar"
        className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors"
        onClick={onClick}
      >
        <div
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_DOT_MAP[statusColor] }}
        />
        <span className="text-sm font-bold text-[var(--color-text-primary)]">{totalPrCount}</span>
        <div className="h-3 w-px bg-[var(--color-separator)]" />
        <span className="whitespace-nowrap text-[11px] text-[var(--color-text-tertiary)]">
          {statusText}
        </span>
      </button>
      <ExpandChevron isExpanded={isExpanded} onToggleExpand={onToggleExpand} />
    </div>
  );
}

/**
 * MinimalNotch - A small notch/tab at the screen edge.
 * Very minimal: count + colored dot. Narrow (80px), solid background.
 */
function MinimalNotch({ totalPrCount, statusColor, onClick }: BadgeStyleProps) {
  return (
    <button
      className={clsx(
        'flex items-center justify-center gap-1.5 rounded-md px-2 py-1',
        'bg-[var(--color-card-background)] border border-[var(--color-subtle-border)]',
        'transition-all hover:bg-[var(--color-surface-hover)]',
      )}
      style={{ width: 80 }}
      onClick={onClick}
    >
      <div
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_DOT_MAP[statusColor] }}
      />
      <span className="text-xs font-bold text-[var(--color-text-primary)]">{totalPrCount}</span>
    </button>
  );
}

/**
 * FloatingIsland - Dynamic Island inspired badge.
 * Rounded-2xl, wider when more info, gradient background.
 */
function FloatingIsland({
  totalPrCount,
  failingCount,
  pendingCount,
  statusColor,
  statusText,
  onClick,
}: BadgeStyleProps) {
  const hasDetails = failingCount > 0 || pendingCount > 0;

  return (
    <button
      className={clsx(
        'flex items-center gap-2 rounded-2xl px-4 py-2',
        'border border-[var(--color-badge-border)]',
        'transition-all duration-300 hover:scale-[1.02]',
      )}
      style={{
        background: `linear-gradient(135deg, var(--color-badge-glass), var(--color-badge-surface))`,
        width: hasDetails ? 240 : 160,
      }}
      onClick={onClick}
    >
      <div
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_DOT_MAP[statusColor] }}
      />
      <span className="text-sm font-bold text-[var(--color-text-primary)]">{totalPrCount}</span>
      <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">{statusText}</span>
      {hasDetails && (
        <div className="ml-auto flex items-center gap-1.5">
          {failingCount > 0 && (
            <span className="text-[10px] font-medium" style={{ color: STATUS_DOT_MAP.red }}>
              {failingCount}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-[10px] font-medium" style={{ color: STATUS_DOT_MAP.yellow }}>
              {pendingCount}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/**
 * LiquidMorph - Organic blob shape with pulsing glow.
 * Uses animated border-radius to create a morphing blob effect.
 * Shows count in center.
 */
function LiquidMorph({ totalPrCount, statusColor, onClick }: BadgeStyleProps) {
  const glowColor = GLOW_MAP[statusColor];
  const dotColor = STATUS_DOT_MAP[statusColor];

  return (
    <button
      className={clsx(
        'relative flex h-12 w-12 items-center justify-center',
        'bg-[var(--color-badge-glass)] border border-[var(--color-badge-border)]',
        'transition-transform hover:scale-105',
      )}
      style={{
        borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
        animation: 'liquidMorph 6s ease-in-out infinite, liquidGlow 3s ease-in-out infinite',
        boxShadow: `0 0 24px ${glowColor}`,
      }}
      onClick={onClick}
    >
      {/* Status ring */}
      <div
        className="absolute inset-1 rounded-full opacity-20"
        style={{ border: `2px solid ${dotColor}` }}
      />
      <span className="text-sm font-bold text-[var(--color-text-primary)]">{totalPrCount}</span>
      {/* Inline keyframes via style element */}
      <style>{`
        @keyframes liquidMorph {
          0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
          50% { border-radius: 50% 60% 30% 60% / 30% 50% 70% 60%; }
          75% { border-radius: 60% 30% 60% 40% / 70% 40% 50% 60%; }
          100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
        }
        @keyframes liquidGlow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.08); }
        }
      `}</style>
    </button>
  );
}

/**
 * SpectralBar - Thin horizontal bar (4px tall, ~200px wide) that changes color.
 * Shows count on hover with a slide-up tooltip.
 */
function SpectralBar({
  totalPrCount,
  failingCount,
  pendingCount,
  statusColor,
  statusText,
  onClick,
}: BadgeStyleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const barColor = STATUS_DOT_MAP[statusColor];

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover tooltip */}
      <div
        className={clsx(
          'mb-1 flex items-center gap-2 rounded-lg px-3 py-1.5',
          'bg-[var(--color-badge-surface)] border border-[var(--color-badge-border)]',
          'shadow-md transition-all duration-200',
          isHovered ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0',
        )}
      >
        <span className="text-xs font-bold text-[var(--color-text-primary)]">{totalPrCount}</span>
        <span className="text-[10px] text-[var(--color-text-tertiary)]">{statusText}</span>
        {failingCount > 0 && (
          <span className="text-[10px] font-medium" style={{ color: STATUS_DOT_MAP.red }}>
            {failingCount} failing
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-[10px] font-medium" style={{ color: STATUS_DOT_MAP.yellow }}>
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* The thin bar */}
      <button
        className="rounded-full transition-all duration-300 hover:h-1.5"
        style={{
          width: 200,
          height: 4,
          backgroundColor: barColor,
          boxShadow: `0 0 8px ${GLOW_MAP[statusColor]}`,
        }}
        onClick={onClick}
      />
    </div>
  );
}

export const badgeStyleMap: Record<string, React.ComponentType<BadgeStyleProps>> = {
  GlassCapsule,
  MinimalNotch,
  FloatingIsland,
  LiquidMorph,
  SpectralBar,
};

export { FloatingIsland, GlassCapsule, LiquidMorph, MinimalNotch, SpectralBar };
