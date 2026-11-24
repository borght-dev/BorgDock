import clsx from 'clsx';
import type { ReactNode } from 'react';

/** How much is left of something the rail meters: grey, amber, red. */
export type RailTone = 'normal' | 'low' | 'critical';

export interface RailBlockProps {
  title: string;
  children: ReactNode;
}

/**
 * RailBlock — one status block at the foot of the rail: a small heading and
 * its rows. Spans only, so it can sit inside a `RailFlyout` trigger.
 */
export function RailBlock({ title, children }: RailBlockProps) {
  return (
    <span className="bd-rail__block">
      <span className="bd-rail__blockhead">{title}</span>
      {children}
    </span>
  );
}

export interface RailMeterProps {
  /** Filled share, 0 to 100. */
  value: number;
  tone?: RailTone;
  /** A mark on the track, 0 to 100: where the fill would be at an even pace. */
  tick?: number | null;
  className?: string;
}

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;
}

/** A thin bar: a track, a fill in the tone's colour and an optional tick. */
export function RailMeter({ value, tone = 'normal', tick, className }: RailMeterProps) {
  return (
    <span className={clsx('bd-rail__bar', className)} data-tone={tone} aria-hidden="true">
      {/* style: the fill is the live share */}
      <i style={{ width: percent(value) }} />
      {tick != null && <u style={{ left: percent(tick) }} />}
    </span>
  );
}

export interface RailStatProps {
  /** What the row is about: a dot, an icon, a provider mark. */
  lead: ReactNode;
  label?: ReactNode;
  /** Between the label and the value. */
  meter?: ReactNode;
  value: ReactNode;
  tone?: RailTone;
}

/** One row of a rail block: lead, label, an optional meter and a value on the right. */
export function RailStat({ lead, label, meter, value, tone = 'normal' }: RailStatProps) {
  return (
    <span className="bd-rail__stat" data-tone={tone}>
      {lead}
      {label != null && <span className="bd-rail__statlabel">{label}</span>}
      {meter}
      <span className="bd-rail__statvalue">{value}</span>
    </span>
  );
}
