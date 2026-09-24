import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Avatar, Pill } from '@/components/shared/primitives';
import type { PrGroup } from '@/services/pr-grouping';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity } from '@/types';
import { PrCardContainer } from './PrCardContainer';
import { PrPanel } from './PrRow';
import { prRowKey } from './pr-card-data';
import { WorkbenchPrRow } from './WorkbenchPrRow';

interface RepoGroupProps {
  group: PrGroup;
}

export function RepoGroup({ group }: RepoGroupProps) {
  const expandedRepoGroups = useUiStore((s) => s.expandedRepoGroups);
  const toggleRepoGroup = useUiStore((s) => s.toggleRepoGroup);
  const density = useSettingsStore((s) => s.settings.ui.prDensity ?? 'comfortable');
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
    <div className="bd-repo-group">
      {/* Header \u2014 chevron + section label + horizontal rule + count pill.
          Wrapper stays a single <button> so the entire row is clickable as one
          target (matches keyboard-nav expectations). The inner chevron / hr are
          decorative, not separate buttons. */}
      <button onClick={() => toggleRepoGroup(repoKey)} className="bd-repo-group__header">
        <ChevronRight
          size={13}
          strokeWidth={3}
          className={clsx('bd-repo-group__chevron', isExpanded ? 'rotate-90' : 'rotate-0')}
        />
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
        <PrPanel density={density}>
          {prs.map((pr) => (
            <PrCardContainer
              key={`${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}`}
              prWithChecks={pr}
              density={density}
            />
          ))}
        </PrPanel>
      </div>
    </div>
  );
}

// ── Workbench groups (ui.layoutV3) ──────────────────────────────────────────

/** `data-key` of a group heading, so `flip()` moves and fades it like a row. */
export function groupFlipKey(groupKey: string): string {
  return `group:${groupKey}`;
}

interface WorkbenchGroupProps {
  /** Collapse key in `ui-store.expandedRepoGroups` (a key in the set = collapsed). */
  groupKey: string;
  label: ReactNode;
  count: number;
  /** Shown after the hairline, e.g. the oldest review request's wait. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * WorkbenchGroup — a sentence-case group heading with its count and a
 * hairline (`.wb-group` in the iteration-2 mockup), and the rows under it.
 * Clicking the heading collapses the group; the rows fold away with a
 * grid-row transition (`--motion-expand`) and stay mounted but `inert`, so
 * keyboard navigation and focus skip them.
 */
export function WorkbenchGroup({ groupKey, label, count, aside, children }: WorkbenchGroupProps) {
  const collapsed = useUiStore((s) => s.expandedRepoGroups.has(groupKey));
  const toggleRepoGroup = useUiStore((s) => s.toggleRepoGroup);

  return (
    <section className="bd-wb-group" data-group-key={groupKey}>
      <button
        type="button"
        className="bd-wb-group__head"
        // Keyed like the rows so a FLIP moves the heading with its group.
        data-key={groupFlipKey(groupKey)}
        aria-expanded={!collapsed}
        onClick={() => toggleRepoGroup(groupKey)}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.25}
          aria-hidden="true"
          className="bd-wb-group__chevron"
        />
        <span className="bd-wb-group__label">{label}</span>
        <span className="bd-wb-group__count">{count}</span>
        <span className="bd-wb-group__rule" aria-hidden="true" />
        {aside}
      </button>
      <div className="bd-wb-group__body" data-collapsed={collapsed ? 'true' : undefined}>
        <div className="bd-wb-group__rows" inert={collapsed}>
          {children}
        </div>
      </div>
    </section>
  );
}

interface WorkbenchPrGroupProps {
  group: PrGroup;
  density: PrDensity;
  now: number;
  aside?: ReactNode;
}

/** A `PrGroup` as a Workbench group: author groups lead with the avatar. */
export function WorkbenchPrGroup({ group, density, now, aside }: WorkbenchPrGroupProps) {
  const label = group.author ? (
    <>
      <Avatar
        initials={group.author.login.slice(0, 2).toUpperCase()}
        tone={group.author.isMe ? 'own' : 'them'}
        size="sm"
        className="bd-wb-group__avatar"
        aria-hidden="true"
      />
      {group.label}
      {group.author.isMe ? ' (you)' : ''}
    </>
  ) : (
    group.label
  );
  return (
    <WorkbenchGroup groupKey={group.key} label={label} count={group.prs.length} aside={aside}>
      {group.prs.map((pr) => (
        <WorkbenchPrRow
          key={prRowKey(pr.pullRequest)}
          prWithChecks={pr}
          density={density}
          now={now}
        />
      ))}
    </WorkbenchGroup>
  );
}
