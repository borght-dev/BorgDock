import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import type { StatusColor } from '../FloatingBadge';

export type { StatusColor };

/* ── Shared icon components ────────────────────────────────── */

export function XIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 4L12 12M12 4L4 12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({
  size = 12,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
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

export function PRIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
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

export function ChevronIcon({
  size = 14,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
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

/** Start native window drag immediately on mousedown. */
function handleDragMouseDown(e: React.MouseEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  getCurrentWindow().startDragging();
}

export function DragGrip() {
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

export function ExpandChevron({
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
        <ChevronIcon size={10} color="currentColor" />
      </div>
    </button>
  );
}

/* ── Helper maps and functions ─────────────────────────────── */

export const STATUS_DOT_MAP: Record<StatusColor, string> = {
  green: 'var(--color-status-green)',
  red: 'var(--color-status-red)',
  yellow: 'var(--color-status-yellow)',
};

export const GLOW_MAP: Record<StatusColor, string> = {
  green: 'var(--color-badge-glow-green)',
  red: 'var(--color-badge-glow-red)',
  yellow: 'var(--color-badge-glow-yellow)',
};

/** Generate check pip statuses from counts */
export function generateCheckPips(
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

export const BADGE_KEYFRAMES = `
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
