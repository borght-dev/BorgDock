import { useRef, useEffect, useState } from 'react';
import clsx from 'clsx';
import type { PullRequestWithChecks } from '@/types';
import { useUiStore } from '@/stores/ui-store';
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
    <div className="mb-1">
      {/* Header */}
      <button
        onClick={() => toggleRepoGroup(repoKey)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx(
            'shrink-0 transition-transform duration-200',
            isExpanded ? 'rotate-90' : 'rotate-0',
          )}
        >
          <path d="m6 4 4 4-4 4" />
        </svg>
        <span className="truncate text-xs font-medium text-[var(--color-text-secondary)]">
          {repoKey}
        </span>
        <span className="rounded-full bg-[var(--color-filter-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-filter-chip-fg)]">
          {prs.length}
        </span>
      </button>

      {/* Content */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight }}
      >
        <div className="flex flex-col gap-1 pl-1 pt-0.5">
          {prs.map((pr) => (
            <PullRequestCard
              key={pr.pullRequest.number}
              prWithChecks={pr}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
