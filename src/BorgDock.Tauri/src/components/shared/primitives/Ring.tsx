import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes } from 'react';

export interface RingProps extends HTMLAttributes<HTMLDivElement> {
  /** Progress value 0..100. Values outside are clamped. */
  value: number;
  /** Square pixel size. Default 28. */
  size?: number;
  /** Stroke width in pixels. Default 3. */
  stroke?: number;
  /** Render the numeric label in the centre. Default true. */
  label?: boolean;
}

function strokeColorFor(value: number): string {
  if (value >= 80) return 'var(--color-status-green)';
  if (value >= 50) return 'var(--color-status-yellow)';
  return 'var(--color-status-red)';
}

/**
 * Ring — circular readiness indicator.
 * Thresholds: ≥80 green, ≥50 yellow, else red.
 * Renders a track circle + animated arc + optional numeric label.
 */
export function Ring({
  value,
  size = 28,
  stroke = 3,
  label = true,
  className,
  style,
  ...rest
}: RingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const color = strokeColorFor(clamped);

  return (
    <div
      className={clsx('bd-ring', className)}
      style={{ ['--ring-size' as string]: `${size}px`, ...style } as CSSProperties}
      {...rest}
    >
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="bd-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="bd-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {label && (
        <span className="bd-ring__label" style={{ color }}>
          {Math.round(clamped)}
        </span>
      )}
    </div>
  );
}
