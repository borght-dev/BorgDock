import clsx from 'clsx';
import { Avatar, type AvatarTone } from '@/components/shared/primitives';

// ---- maps ----

export interface StateMeta {
  tone: 'success' | 'warning' | 'neutral' | 'draft';
  /**
   * Colour of the leading dot inside the StatePill: a `--color-wi-state-*`
   * token (styles/work-items-workbench.css), never a literal colour.
   */
  dot: string;
}

const STATE_DOT = {
  new: 'var(--color-wi-state-new)',
  active: 'var(--color-wi-state-active)',
  failed: 'var(--color-wi-state-failed)',
  done: 'var(--color-wi-state-done)',
  closed: 'var(--color-wi-state-closed)',
} as const;

export const WI_STATES: Record<string, StateMeta> = {
  New: { tone: 'neutral', dot: STATE_DOT.new },
  Active: { tone: 'neutral', dot: STATE_DOT.active },
  'Development In Progress': { tone: 'neutral', dot: STATE_DOT.active },
  Committed: { tone: 'neutral', dot: STATE_DOT.active },
  'In Progress': { tone: 'neutral', dot: STATE_DOT.active },
  'Testing Failed': { tone: 'warning', dot: STATE_DOT.failed },
  Resolved: { tone: 'success', dot: STATE_DOT.done },
  Done: { tone: 'success', dot: STATE_DOT.done },
  Closed: { tone: 'draft', dot: STATE_DOT.closed },
  Removed: { tone: 'draft', dot: STATE_DOT.closed },
};

export const DEFAULT_STATE_META: StateMeta = { tone: 'neutral', dot: STATE_DOT.new };

export interface TypeMeta {
  glyph: string;
  /** CSS variable reference for the glyph color. */
  color: string;
  short: string;
}

export const WI_TYPES: Record<string, TypeMeta> = {
  Bug: { glyph: '●', color: 'var(--color-status-red)', short: 'Bug' },
  'User Story': { glyph: '▲', color: 'var(--color-accent)', short: 'Story' },
  Task: { glyph: '■', color: 'var(--color-status-yellow)', short: 'Task' },
  'Product Backlog Item': {
    glyph: '◆',
    color: 'var(--color-status-merged)',
    short: 'PBI',
  },
  Epic: { glyph: '◇', color: 'var(--color-accent)', short: 'Epic' },
  Feature: { glyph: '◇', color: 'var(--color-accent)', short: 'Feature' },
};

export const DEFAULT_TYPE_META: TypeMeta = {
  glyph: '▢',
  color: 'var(--color-text-muted)',
  short: 'Item',
};

export interface PrioMeta {
  label: string;
  color: string;
}

export const WI_PRIO: Record<number, PrioMeta> = {
  1: { label: 'Urgent', color: 'var(--color-status-red)' },
  2: { label: 'High', color: 'var(--color-status-yellow)' },
  3: { label: 'Med', color: 'var(--color-text-tertiary)' },
  4: { label: 'Low', color: 'var(--color-text-faint)' },
};

export const DEFAULT_PRIO_META: PrioMeta = WI_PRIO[3]!;

// ---- helpers ----

export function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return parts[0]!.slice(0, 2).toUpperCase();
}

const AVATAR_TONES: AvatarTone[] = ['blue', 'rose'];

export function avatarToneFor(initials: string): AvatarTone {
  let h = 0;
  for (let i = 0; i < initials.length; i++) {
    h = (h * 31 + initials.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]!;
}

// ---- components ----

export interface TypeGlyphProps {
  type: string;
  /** Glyph font-size in px. Default 11. */
  size?: number;
}

export function TypeGlyph({ type, size = 11 }: TypeGlyphProps) {
  const meta = WI_TYPES[type] ?? DEFAULT_TYPE_META;
  return (
    <span
      title={type}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        fontSize: size,
        color: meta.color,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {meta.glyph}
    </span>
  );
}

export interface PrioBarsProps {
  prio: number | undefined;
}

export function PrioBars({ prio }: PrioBarsProps) {
  const p = (prio != null && WI_PRIO[prio]) || DEFAULT_PRIO_META;
  const lit = prio != null && WI_PRIO[prio] ? 5 - prio : 2;
  const heights = [3, 6, 9, 12];
  return (
    <span
      title={prio != null ? `P${prio} · ${p.label}` : 'No priority'}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 1.5,
        height: 12,
        width: 14,
        flexShrink: 0,
      }}
    >
      {heights.map((h, i) => {
        const isLit = i < lit;
        return (
          <span
            key={i}
            data-lit={isLit ? 'true' : 'false'}
            style={{
              width: 2,
              height: h,
              background: isLit ? p.color : 'var(--color-text-ghost)',
              borderRadius: 1,
            }}
          />
        );
      })}
    </span>
  );
}

export interface StatePillProps {
  state: string;
  /** Tighter padding/font for use inside dense rows. */
  compact?: boolean;
}

export function StatePill({ state, compact }: StatePillProps) {
  const meta = WI_STATES[state] ?? DEFAULT_STATE_META;
  return (
    <span
      className={clsx('bd-pill', `bd-pill--${meta.tone}`)}
      style={{
        gap: 5,
        padding: compact ? '1px 6px' : '2px 8px',
        height: compact ? 18 : 20,
        lineHeight: 1,
        fontSize: compact ? 10.5 : 11,
        // fontWeight: design uses 500 here, overriding .bd-pill's 600
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: meta.dot,
          flexShrink: 0,
        }}
      />
      {state}
    </span>
  );
}

export interface MiniAvatarProps {
  initials: string;
  tone?: AvatarTone;
  /** Pixel size — accepts any value, not just the primitive's preset sizes. Default 18. */
  size?: number;
}

export function MiniAvatar({ initials, tone, size = 18 }: MiniAvatarProps) {
  const resolvedTone = tone ?? avatarToneFor(initials);
  return (
    <Avatar
      initials={initials}
      tone={resolvedTone}
      style={{
        width: size,
        height: size,
        fontSize: size <= 14 ? 8 : size <= 18 ? 9 : 10,
        fontWeight: 600,
        flexShrink: 0,
      }}
    />
  );
}
