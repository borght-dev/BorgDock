// src/components/work-items/WorkItemDetailPanel/ChipPicker.tsx
import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface ChipPickerProps {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  /** Visual preview of the current value (avatar+name, pill, etc). */
  children: ReactNode;
}

export function ChipPicker({ label, value, options, onChange, children }: ChipPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        title={label}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: 'transparent',
          border: '1px solid var(--color-subtle-border)',
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {children}
        <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 20,
            minWidth: 180,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-subtle-border)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
            padding: 4,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: 12,
                background: opt === value ? 'var(--color-accent-subtle)' : 'transparent',
                color: opt === value ? 'var(--color-accent)' : 'var(--color-text-primary)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
