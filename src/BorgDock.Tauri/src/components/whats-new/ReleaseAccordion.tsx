import clsx from 'clsx';
import { useState } from 'react';
import type { Release } from '@/types/whats-new';
import { Pill } from '@/components/shared/primitives';
import { AlsoFixedList } from './AlsoFixedList';
import { HighlightCard } from './HighlightCard';

interface Props {
  release: Release;
  defaultExpanded: boolean;
  isCurrent: boolean;
}

function Caret({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-block w-3 text-[10px] text-[var(--color-text-muted)] transition-transform duration-150',
        open ? 'rotate-0' : '-rotate-90',
      )}
    >
      ▾
    </span>
  );
}

export function ReleaseAccordion({ release, defaultExpanded, isCurrent }: Props) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <section data-fixed-accordion data-open={String(open)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline justify-between py-2.5 border-t border-[var(--color-subtle-border)] text-left hover:bg-[var(--color-surface-hover)] transition-colors px-1 -mx-1 rounded"
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${release.version}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Caret open={open} />
          <span
            data-release-version={release.version}
            className={clsx(
              'text-[14px] font-medium',
              open ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)]',
            )}
          >
            {release.version}
          </span>
          {open && isCurrent && (
            <Pill tone="success">Current</Pill>
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
        <div className="pt-2 pb-1 pl-4 ml-[3px] border-l-2 border-[var(--color-whats-new-rail)]">
          {release.highlights.map((h, i) => (
            <HighlightCard key={i} highlight={h} />
          ))}
          <AlsoFixedList items={release.alsoFixed} />
        </div>
      )}
    </section>
  );
}
