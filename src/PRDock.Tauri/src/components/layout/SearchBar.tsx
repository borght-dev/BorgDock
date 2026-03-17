import { useState, useRef, useCallback, useEffect } from 'react';
import { usePrStore } from '@/stores/pr-store';

export function SearchBar() {
  const setSearchQuery = usePrStore((s) => s.setSearchQuery);
  const [value, setValue] = useState('');
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
    <div className="px-3 py-1.5">
      <div className="relative flex items-center">
        {/* Search icon */}
        <svg
          className="pointer-events-none absolute left-2.5 text-[var(--color-text-muted)]"
          width="14"
          height="14"
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
          placeholder="Search PRs..."
          className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] py-1.5 pl-8 pr-7 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] transition-colors"
        />

        {/* Clear button */}
        {value && (
          <button
            onClick={handleClear}
            className="absolute right-2 rounded-sm p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Clear search"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
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
