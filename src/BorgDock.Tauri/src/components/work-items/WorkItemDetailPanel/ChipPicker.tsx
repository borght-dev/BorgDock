// src/components/work-items/WorkItemDetailPanel/ChipPicker.tsx
import { ChevronDown } from 'lucide-react';
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
  /**
   * `fact`: a segment of the work item header's fact strip, its label above
   * the value (styles/work-item-detail.css). Default `chip`.
   */
  variant?: 'chip' | 'fact';
  /** Shown as plain text: no button, no menu. */
  readOnly?: boolean;
  /** Called when the picker opens, e.g. to load its options. */
  onOpen?: () => void;
  /** `fact` only: an action beside the value, outside the picker's button. */
  trailing?: ReactNode;
  /** `fact` only: no chevron (the value draws its own affordance). */
  hideChevron?: boolean;
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
  variant = 'chip',
  readOnly = false,
  onOpen,
  trailing,
  hideChevron = false,
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

  if (variant === 'fact') {
    return (
      <div ref={ref} className="bd-wid-fact" data-open={open || undefined}>
        {readOnly ? (
          <div className="bd-wid-fact__btn" data-readonly="">
            <span className="bd-wid-fact__label">{label}</span>
            <span className="bd-wid-fact__value">{children}</span>
          </div>
        ) : (
          <button
            type="button"
            className="bd-wid-fact__btn"
            title={label}
            aria-haspopup={useFreeText ? 'dialog' : 'menu'}
            aria-expanded={open}
            onClick={() => {
              if (!open) onOpen?.();
              setOpen((o) => !o);
            }}
          >
            <span className="bd-wid-fact__label">{label}</span>
            <span className="bd-wid-fact__value">
              {children}
              {!hideChevron && (
                <ChevronDown className="bd-wid-fact__chev" size={12} strokeWidth={2} aria-hidden />
              )}
            </span>
          </button>
        )}
        {trailing && <span className="bd-wid-fact__trailing">{trailing}</span>}
        {open && !useFreeText && (
          <div role="menu" className="bd-wid-fact__menu">
            {opts.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                data-current={opt.value === value || undefined}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {open && useFreeText && (
          <div role="dialog" aria-label={label} className="bd-wid-fact__menu">
            <input
              autoFocus
              className="bd-wid-fact__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitFreeText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFreeText();
                else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setDraft(value);
                  setOpen(false);
                }
              }}
              placeholder={placeholder}
            />
          </div>
        )}
      </div>
    );
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
        <ChevronDown size={10} strokeWidth={2.25} />
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
            boxShadow: 'var(--elevation-2)',
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
            boxShadow: 'var(--elevation-2)',
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
