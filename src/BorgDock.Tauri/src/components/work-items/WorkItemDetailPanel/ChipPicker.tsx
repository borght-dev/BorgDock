// src/components/work-items/WorkItemDetailPanel/ChipPicker.tsx
import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface ChipPickerOption {
  value: string;
  label: string;
}

export interface ChipPickerProps {
  label: string;
  value: string;
  /** Either bare strings (label = value) or {value,label} pairs. Empty/omitted
   * triggers free-text mode (a popover input committed on Enter / blur). */
  options?: string[] | ChipPickerOption[];
  /** Override mode explicitly. Useful when the caller wants free-text even
   * if options are provided (suggestions). */
  freeText?: boolean;
  /** Placeholder for the free-text input. */
  placeholder?: string;
  onChange: (next: string) => void;
  /** Visual preview of the current value (avatar+name, pill, etc). */
  children: ReactNode;
}

function normalize(opts: ChipPickerProps['options']): ChipPickerOption[] {
  if (!opts || opts.length === 0) return [];
  if (typeof opts[0] === 'string') {
    return (opts as string[]).map((v) => ({ value: v, label: v }));
  }
  return opts as ChipPickerOption[];
}

export function ChipPicker({
  label,
  value,
  options,
  freeText,
  placeholder,
  onChange,
  children,
}: ChipPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opts = normalize(options);
  const useFreeText = freeText || opts.length === 0;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function commitFreeText() {
    if (draft !== value) onChange(draft);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        title={label}
        aria-haspopup={useFreeText ? 'dialog' : 'menu'}
        aria-expanded={open}
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
      {open && !useFreeText && (
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
          {opts.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: 12,
                background: opt.value === value ? 'var(--color-accent-subtle)' : 'transparent',
                color: opt.value === value ? 'var(--color-accent)' : 'var(--color-text-primary)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {open && useFreeText && (
        <div
          role="dialog"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 20,
            minWidth: 220,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-subtle-border)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
            padding: 6,
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitFreeText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitFreeText();
              else if (e.key === 'Escape') {
                setDraft(value);
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '5px 8px',
              fontSize: 12,
              background: 'var(--color-input-bg)',
              border: '1px solid var(--color-input-border)',
              borderRadius: 4,
              color: 'var(--color-text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}
    </div>
  );
}
