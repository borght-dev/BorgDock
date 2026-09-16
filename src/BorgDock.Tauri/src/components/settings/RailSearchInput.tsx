import { Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Kbd } from '@/components/shared/primitives';
import { shortcutLabel } from '@/utils/shortcut-label';

interface Props {
  value: string;
  onChange: (s: string) => void;
}

export function RailSearchInput({ value, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === ref.current) {
        onChange('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange]);
  return (
    <div className="flex h-7 items-center gap-2 rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5">
      <Search size={12} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search settings…"
        className="flex-1 bg-transparent text-[11.5px] outline-none placeholder:text-[var(--color-text-faint)]"
      />
      <Kbd>{shortcutLabel('K')}</Kbd>
    </div>
  );
}
