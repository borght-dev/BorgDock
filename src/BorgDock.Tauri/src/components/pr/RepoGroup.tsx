import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Pill } from '@/components/shared/primitives';
import type { PrGroup } from '@/services/pr-grouping';
import { useUiStore } from '@/stores/ui-store';
import { PrCardContainer } from './PrCardContainer';

interface RepoGroupProps {
  group: PrGroup;
}

export function RepoGroup({ group }: RepoGroupProps) {
  const expandedRepoGroups = useUiStore((s) => s.expandedRepoGroups);
  const toggleRepoGroup = useUiStore((s) => s.toggleRepoGroup);
  const density = useUiStore((s) => s.prDensity);
  const repoKey = group.key;
  const prs = group.prs;
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

  const failing = group.stats.failing;

  return (
    <div className="mb-0.5 bd-repo-group">
      {/* Header \u2014 chevron + section label + horizontal rule + count pill.
          Wrapper stays a single <button> so the entire row is clickable as one
          target (matches keyboard-nav expectations). The inner chevron / hr are
          decorative, not separate buttons. */}
      <button onClick={() => toggleRepoGroup(repoKey)} className="bd-repo-group__header">
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx('bd-repo-group__chevron', isExpanded ? 'rotate-90' : 'rotate-0')}
        >
          <path d="m6 4 4 4-4 4" />
        </svg>
        {group.author && (
          <Avatar initials={group.author.login.slice(0, 2).toUpperCase()} size="sm" />
        )}
        <span className="bd-section-label">
          {group.label}
          {group.author?.isMe ? ' (you)' : ''}
        </span>
        <span className="bd-repo-group__hr" aria-hidden />
        <span className="bd-repo-group__count">
          {failing > 0 && (
            <span className="rounded-full px-1.5 text-[9px] font-semibold leading-[16px] tabular-nums bg-[var(--color-action-danger-bg)] text-[var(--color-status-red)]">
              {failing}
              {'\u2716'}
            </span>
          )}
          <Pill tone="ghost" className="tabular-nums">
            {prs.length}
          </Pill>
        </span>
      </button>

      {/* Content */}
      {/* style: maxHeight is raf-tweened via requestAnimationFrame for smooth collapse/expand animation */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight }}
      >
        <div className="flex flex-col gap-1 pt-0.5 pb-0.5">
          {prs.map((pr) => (
            <PrCardContainer
              key={`${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}`}
              prWithChecks={pr}
              density={density}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
