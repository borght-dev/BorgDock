interface ToggleOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ToggleOption<T>[];
}

export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: SegmentedToggleProps<T>) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--color-surface-hover)',
        borderRadius: 999,
        padding: 2,
        border: '1px solid var(--color-subtle-border)',
      }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              height: 20,
              padding: '0 9px',
              border: 0,
              borderRadius: 999,
              background: active ? 'var(--color-surface)' : 'transparent',
              color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              fontFamily: 'inherit',
              transition: 'all 120ms ease',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
