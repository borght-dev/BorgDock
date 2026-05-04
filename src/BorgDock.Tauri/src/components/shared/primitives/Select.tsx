export interface SelectOption { value: string; label: string }

export interface SelectProps {
  value: string;
  options: ReadonlyArray<SelectOption>;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function Select({ value, options, onChange, placeholder, ariaLabel }: SelectProps) {
  return (
    <div className="relative h-[30px] flex items-center pl-[10px] pr-[26px] rounded-[5px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)]">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {placeholder && <option value="" disabled aria-label={placeholder}>{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value} aria-label={o.label} />)}
      </select>
      <span className="text-xs text-[var(--color-text-primary)] pointer-events-none">
        {options.find((o) => o.value === value)?.label ?? placeholder ?? ''}
      </span>
      <svg
        className="pointer-events-none absolute right-[8px] top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
