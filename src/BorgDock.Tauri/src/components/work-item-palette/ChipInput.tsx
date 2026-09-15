// src/components/work-item-palette/ChipInput.tsx
import { Search, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { forwardRef, useMemo } from 'react';
import { parseOperators } from './parseOperators';

export interface ChipInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export const ChipInput = forwardRef<HTMLInputElement, ChipInputProps>(function ChipInput(
  { value, onChange, placeholder, onKeyDown },
  ref,
) {
  const { ops } = useMemo(() => parseOperators(value), [value]);

  return (
    <div
      className="bd-input"
      style={{
        height: 34,
        paddingLeft: 10,
        paddingRight: 8,
        gap: 6,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Search
        size={13}
        strokeWidth={2.25}
        style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
      />
      {ops.map((op, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 11,
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-purple-border)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {op.kind === 'mention' ? `@${op.value}` : `${op.rawKey ?? op.kind}:${op.value}`}
        </span>
      ))}
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          outline: 'none',
          fontSize: 12.5,
          color: 'var(--color-text-primary)',
          fontFamily: 'inherit',
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="bd-icon-btn"
          style={{ width: 20, height: 20 }}
        >
          <X size={11} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
});
