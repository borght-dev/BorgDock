import { useCallback } from 'react';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  suffix?: string;
  format?: (v: number) => string;
  ariaLabel?: string;
}

export function Slider({ value, min, max, step = 1, onChange, suffix = '', format, ariaLabel }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const big = e.shiftKey ? step * 10 : step;
    let next = value;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp': next = value + big; break;
      case 'ArrowLeft':
      case 'ArrowDown': next = value - big; break;
      case 'Home': next = min; break;
      case 'End': next = max; break;
      default: return;
    }
    e.preventDefault();
    onChange(Math.max(min, Math.min(max, next)));
  }, [value, min, max, step, onChange]);
  return (
    <div className="flex items-center gap-3 w-full">
      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="relative flex-1 h-[5px] rounded-full bg-[var(--color-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
        <div
          className="absolute -top-[5px] h-[15px] w-[15px] rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] shadow"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      <span className="text-[11px] text-[var(--color-text-tertiary)] min-w-[60px] text-right font-mono">
        {format ? format(value) : `${value}${suffix}`}
      </span>
    </div>
  );
}
