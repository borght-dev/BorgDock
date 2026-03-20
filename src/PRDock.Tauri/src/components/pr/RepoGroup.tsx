import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { PullRequestCard } from './PullRequestCard';

interface RepoGroupProps {
  repoKey: string;
  prs: PullRequestWithChecks[];
}

export function RepoGroup({ repoKey, prs }: RepoGroupProps) {
  const expandedRepoGroups = useUiStore((s) => s.expandedRepoGroups);
  const toggleRepoGroup = useUiStore((s) => s.toggleRepoGroup);
  const isExpanded = !expandedRepoGroups.has(repoKey); // default expanded; set = collapsed
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(isExpanded ? 'none' : '0px');

  useEffect(() => {
    if (isExpanded) {
      const el = contentRef.current;
      if (el) {
        setMaxHeight(`${el.scrollHeight}px`);
        // After transition, remove constraint so new children can expand
        const timer = setTimeout(() => setMaxHeight('none'), 200);
        return () => clearTimeout(timer);
      }
    } else {
      // Snap to current height first for smooth collapse
      const el = contentRef.current;
      if (el) {
        setMaxHeight(`${el.scrollHeight}px`);
        requestAnimationFrame(() => setMaxHeight('0px'));
      }
    }
  }, [isExpanded]);

  return (
    <div className="mb-0.5">
      {/* Header */}
      <button
        onClick={() => toggleRepoGroup(repoKey)}
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx(
            'shrink-0 text-[var(--color-text-ghost)] transition-transform duration-200',
            isExpanded ? 'rotate-90' : 'rotate-0',
          )}
        >
          <path d="m6 4 4 4-4 4" />
        </svg>
        <span className="truncate text-[11px] font-semibold tracking-tight text-[var(--color-text-secondary)]">
          {repoKey}
        </span>
        <span
          className="ml-auto rounded-full px-1.5 text-[9px] font-semibold leading-[16px] tabular-nums"
          style={{
            background: 'var(--color-filter-chip-bg)',
            color: 'var(--color-text-muted)',
          }}
        >
          {prs.length}
        </span>
      </button>

      {/* Content */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight }}
      >
        <div className="flex flex-col gap-1 pt-0.5 pb-0.5">
          {prs.map((pr) => (
            <PullRequestCard key={pr.pullRequest.number} prWithChecks={pr} />
          ))}
        </div>
      </div>
    </div>
  );
}
