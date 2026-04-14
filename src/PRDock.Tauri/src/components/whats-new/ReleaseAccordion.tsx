import { useState } from 'react';
import type { Release } from '@/types/whats-new';
import { HighlightCard } from './HighlightCard';
import { AlsoFixedList } from './AlsoFixedList';

interface Props {
  release: Release;
  defaultExpanded: boolean;
  isCurrent: boolean;
}

function Caret({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-3 text-[10px] text-[var(--color-text-muted)]"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}
    >
      ▾
    </span>
  );
}

export function ReleaseAccordion({ release, defaultExpanded, isCurrent }: Props) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline justify-between py-2.5 border-t border-[var(--color-subtle-border)] text-left hover:bg-[var(--color-surface-hover)] transition-colors px-1 -mx-1 rounded"
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${release.version}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Caret open={open} />
          <span className={`text-[14px] font-medium ${open ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]'}`}>
            {release.version}
          </span>
          {open && isCurrent && (
            <span className="text-[10.5px] font-medium tracking-[0.03em] text-[var(--color-accent)] bg-[var(--color-accent-subtle)] border border-[var(--color-purple-border)] rounded px-1.5 py-[1px]">
              Current
            </span>
          )}
          {!open && release.summary && (
            <span className="text-[12px] text-[var(--color-text-muted)] truncate">
              {release.summary}
            </span>
          )}
        </div>
        <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
          {release.date}
        </span>
      </button>

      {open && (
        <div
          className="pt-2 pb-1 pl-4 ml-[3px] border-l-2"
          style={{ borderColor: 'var(--color-whats-new-rail)' }}
        >
          {release.highlights.map((h, i) => (
            <HighlightCard key={i} highlight={h} />
          ))}
          <AlsoFixedList items={release.alsoFixed} />
        </div>
      )}
    </section>
  );
}
