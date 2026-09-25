import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/shared/primitives';
import type { PrGroup } from '@/services/pr-grouping';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity } from '@/types';
import { PrRow } from './PrRow';
import { prRowKey } from './pr-card-data';

/** `data-key` of a group heading, so `flip()` moves and fades it like a row. */
export function groupFlipKey(groupKey: string): string {
  return `group:${groupKey}`;
}

interface WorkbenchGroupProps {
  /** Collapse key in `ui-store.collapsedGroups` (a key in the set = collapsed). */
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
  const collapsed = useUiStore((s) => s.collapsedGroups.has(groupKey));
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
        <PrRow key={prRowKey(pr.pullRequest)} prWithChecks={pr} density={density} now={now} />
      ))}
    </WorkbenchGroup>
  );
}
