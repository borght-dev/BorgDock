import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrStore } from '@/stores/pr-store';

export function SearchBar() {
  const setSearchQuery = usePrStore((s) => s.setSearchQuery);
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSearchQuery(v);
      }, 300);
    },
    [setSearchQuery],
  );

  const handleClear = useCallback(() => {
    setValue('');
    setSearchQuery('');
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [setSearchQuery]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="px-2.5 pb-2 pt-1">
      {/* style: focus-state-driven borderColor + color-mix boxShadow — both vary on isFocused boolean */}
      <div
        className="relative flex items-center rounded-lg border transition-all duration-200"
        style={{
          borderColor: isFocused ? 'var(--color-accent)' : 'var(--color-input-border)',
          background: 'var(--color-input-bg)',
          boxShadow: isFocused
            ? '0 0 0 2px color-mix(in srgb, var(--color-accent) 12%, transparent)'
            : 'inset 0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {/* Search icon */}
        {/* style: focus-state-driven icon color — varies on isFocused boolean */}
        <svg
          className="pointer-events-none absolute left-2.5"
          style={{ color: isFocused ? 'var(--color-accent)' : 'var(--color-text-ghost)' }}
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="7" r="5" />
          <path d="m11 11 3.5 3.5" />
        </svg>

        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Filter pull requests..."
          className="w-full bg-transparent py-1.5 pl-8 pr-7 text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-ghost)] outline-none"
        />

        {/* Clear button */}
        {value && (
          <button
            onClick={handleClear}
            className="absolute right-1.5 flex h-4 w-4 items-center justify-center rounded text-[var(--color-text-ghost)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Clear search"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="m4 4 8 8M12 4 4 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
