import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
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

/* ── Shared icon components ────────────────────────────────── */

function XIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 4L12 12M12 4L4 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8L6.5 11.5L13 4.5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PRIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="4" r="2" stroke={color} strokeWidth="1.5" />
      <circle cx="11" cy="12" r="2" stroke={color} strokeWidth="1.5" />
      <circle cx="5" cy="12" r="2" stroke={color} strokeWidth="1.5" />
      <path
        d="M5 6V10M11 10V6.5C11 5.67 10.33 5 9.5 5H8"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path
        d="M3 5l3 3 3-3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Shared sub-components ─────────────────────────────────── */

function DragGrip() {
  return (
    <div
      data-testid="badge-drag-handle"
      className="flex items-center pl-2 py-1 cursor-grab active:cursor-grabbing select-none"
      title="Drag to reposition"
      onMouseDown={handleDragMouseDown}
    >
      <div className="flex flex-col gap-[3px] opacity-25 pointer-events-none">
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
  );
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
        'flex items-center justify-center self-stretch px-2 ml-auto',
        isExpanded ? 'rounded-r-xl' : 'rounded-r-full',
        'border-l border-[var(--color-separator)]',
        'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
        'hover:bg-[var(--color-surface-hover)] transition-all',
      )}
      onClick={onToggleExpand}
      title={isExpanded ? 'Collapse' : 'Expand PR list'}
    >
      <div className={clsx('transition-transform duration-200', isExpanded && 'rotate-180')}>
        <ChevronIcon
          size={10}
          color="currentColor"
        />
      </div>
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

/** Generate check pip statuses from counts */
function generateCheckPips(
  total: number,
  failing: number,
  pending: number,
): ('pass' | 'fail' | 'pending')[] {
  const pips: ('pass' | 'fail' | 'pending')[] = [];
  const passing = Math.max(0, total - failing - pending);
  for (let i = 0; i < passing; i++) pips.push('pass');
  for (let i = 0; i < pending; i++) pips.push('pending');
  for (let i = 0; i < failing; i++) pips.push('fail');
  return pips;
}

/* ── Badge animations (injected once) ─────────────────────── */

const BADGE_KEYFRAMES = `
@keyframes badge-ring-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(1.15); }
}
@keyframes badge-dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes badge-liquid-morph {
  0%, 100% { border-radius: 50%; transform: scale(1); }
  25% { border-radius: 45% 55% 50% 50%; transform: scale(1.05); }
  50% { border-radius: 50% 45% 55% 50%; transform: scale(1); }
  75% { border-radius: 55% 50% 45% 55%; transform: scale(1.03); }
}
@keyframes badge-glow-drift {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(80%); }
}
`;

/* ============================================================
   VARIANT A — Glass Capsule
   ============================================================ */
function GlassCapsule({
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
          <div className="relative flex items-center justify-center w-5 h-5 rounded-full shrink-0"
            style={{ backgroundColor: isFailing ? 'rgba(229,64,101,0.12)' : 'rgba(125,211,192,0.12)' }}
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
            background: 'linear-gradient(to bottom, transparent, var(--color-separator), transparent)',
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

/* ============================================================
   VARIANT B — Minimal Notch
   ============================================================ */
function MinimalNotch({
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

/* ============================================================
   VARIANT C — Floating Island
   ============================================================ */
function FloatingIsland({
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

/* ============================================================
   VARIANT D — Liquid Morph
   ============================================================ */
function LiquidMorph({
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

/* ============================================================
   VARIANT E — Spectral Bar
   ============================================================ */
function SpectralBar({
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

export const badgeStyleMap: Record<string, React.ComponentType<BadgeStyleProps>> = {
  GlassCapsule,
  MinimalNotch,
  FloatingIsland,
  LiquidMorph,
  SpectralBar,
};

export { FloatingIsland, GlassCapsule, LiquidMorph, MinimalNotch, SpectralBar };
