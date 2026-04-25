import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  type AvatarTone,
  Card,
  IconButton,
  Pill,
  type PillTone,
} from '@/components/shared/primitives';
import type { WorktreeInfo } from '../../types';

export interface WorkItemCardData {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
  priority?: number;
  tags: string;
  age: string;
  htmlUrl: string;
  isTracked: boolean;
  isWorkingOn: boolean;
  isSelected: boolean;
  worktreePath?: string;
}

interface WorkItemCardProps {
  item: WorkItemCardData;
  worktrees: WorktreeInfo[];
  onSelect: (id: number) => void;
  onToggleTracked: (id: number) => void;
  onToggleWorkingOn: (id: number) => void;
  onAssignWorktree: (id: number, path: string) => void;
  onOpenInBrowser: (url: string) => void;
}

const TYPE_LETTERS: Record<string, string> = {
  Bug: 'B',
  Task: 'T',
  Feature: 'F',
  Epic: 'E',
  'User Story': 'U',
};

// State → Pill tone. Two-letter mapping kept narrow on purpose.
// Color-tone refinement (e.g. distinct "warning-blue" for active) belongs in a
// future Pill primitive variant rather than here.
function pillTone(state: string): PillTone {
  const s = state.toLowerCase();
  if (s === 'active' || s === 'committed' || s === 'in progress') return 'warning';
  if (s === 'resolved' || s === 'done' || s === 'closed') return 'success';
  if (s === 'removed') return 'neutral';
  if (s === 'new') return 'neutral';
  return 'neutral';
}

// State → Avatar tone. Heuristic — a fully matching mapping would need a real
// "neutral" Avatar tone variant, but those are the visual buckets we have today.
function avatarTone(state: string): AvatarTone {
  const s = state.toLowerCase();
  if (['resolved', 'done', 'closed'].includes(s)) return 'own';
  return 'them';
}

function priorityIcon(priority?: number): { label: string; icon: string } | null {
  switch (priority) {
    case 1:
      return { label: 'Critical', icon: '!!' };
    case 2:
      return { label: 'High', icon: '\u2191' };
    case 3:
      return { label: 'Medium', icon: '\u2013' };
    case 4:
      return { label: 'Low', icon: '\u2193' };
    default:
      return null;
  }
}

export function WorkItemCard({
  item,
  worktrees,
  onSelect,
  onToggleTracked,
  onToggleWorkingOn,
  onAssignWorktree,
  onOpenInBrowser,
}: WorkItemCardProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const typeLetter = TYPE_LETTERS[item.workItemType] ?? '?';
  const pri = priorityIcon(item.priority);

  // The Card primitive's `variant="own"` handles the my-PR stripe; the
  // workingOn / tracked / selected colour rules ride through className so we
  // don't lose visual state.
  const stateClass = item.isWorkingOn
    ? 'border-[var(--color-working-on-border)] bg-[var(--color-working-on-soft)]'
    : item.isTracked
      ? 'border-[var(--color-tracked-border)] bg-[var(--color-tracked-soft)]'
      : item.isSelected
        ? 'border-[var(--color-accent)] bg-[var(--color-selected-row-bg)]'
        : 'hover:bg-[var(--color-surface-hover)]';

  return (
    <>
      <Card
        variant={item.isWorkingOn ? 'own' : 'default'}
        interactive
        padding="sm"
        className={clsx('group/card relative', stateClass)}
        onClick={() => onSelect(item.id)}
        onContextMenu={handleContextMenu}
      >
        <div className="flex gap-3">
          {/* Type icon */}
          <Avatar
            initials={typeLetter}
            tone={avatarTone(item.state)}
            size="md"
            className="shrink-0 text-[13px] font-bold"
          />

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-[var(--color-text-primary)]">
              {item.title}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-ghost)]">
              <span>#{item.id}</span>
              <span>&middot;</span>
              <span>{item.workItemType}</span>
              {item.assignedTo && (
                <>
                  <span>&middot;</span>
                  <span className="truncate">{item.assignedTo}</span>
                </>
              )}
            </div>
            {item.isWorkingOn && item.worktreePath && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-purple)]">
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.5 2A1.5 1.5 0 013 .5h4.586a1.5 1.5 0 011.06.44l1.415 1.414A1.5 1.5 0 0110.5 3.5H13A1.5 1.5 0 0114.5 5v8A1.5 1.5 0 0113 14.5H3A1.5 1.5 0 011.5 13V2z" />
                </svg>
                <span className="truncate font-mono">{item.worktreePath}</span>
              </div>
            )}
          </div>

          {/* Right side: tracking buttons + state badge */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {/* Tracking buttons */}
            <div
              className={clsx(
                'flex gap-1',
                !item.isTracked &&
                  !item.isWorkingOn &&
                  'opacity-0 transition-opacity group-hover/card:opacity-100',
              )}
            >
              <IconButton
                size={22}
                active={item.isTracked}
                tooltip={item.isTracked ? 'Stop tracking' : 'Track this item'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTracked(item.id);
                }}
                icon={
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 16 16"
                    fill={item.isTracked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.3"
                  >
                    <path d="M8 1.5C4.5 1.5 1.5 8 1.5 8s3 6.5 6.5 6.5S14.5 8 14.5 8s-3-6.5-6.5-6.5z" />
                    <circle cx="8" cy="8" r="2.5" />
                  </svg>
                }
              />
              <IconButton
                size={22}
                active={item.isWorkingOn}
                tooltip={item.isWorkingOn ? 'Stop working on' : 'Mark as working on'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWorkingOn(item.id);
                }}
                icon={
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  >
                    <path d="M2 5l3.5 3.5L14 2" strokeLinecap="round" strokeLinejoin="round" />
                    {item.isWorkingOn && (
                      <path d="M2 10l3.5 3.5L14 7" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                }
              />
            </div>

            {/* State badge */}
            <Pill tone={pillTone(item.state)}>{item.state}</Pill>

            {/* Priority + age */}
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-ghost)]">
              {pri && (
                <span title={pri.label} className="font-mono">
                  {pri.icon}
                </span>
              )}
              {item.age && <span>{item.age}</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] rounded-lg border border-[var(--color-modal-border)] bg-[var(--color-modal-bg)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            onClick={() => {
              onToggleTracked(item.id);
              setContextMenu(null);
            }}
          >
            {item.isTracked ? 'Stop tracking' : 'Track this item'}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            onClick={() => {
              onToggleWorkingOn(item.id);
              setContextMenu(null);
            }}
          >
            {item.isWorkingOn ? 'Stop working on' : 'Mark as working on'}
          </button>

          {worktrees.length > 0 && (
            <>
              <div className="my-1 h-px bg-[var(--color-separator)]" />
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]">
                Set worktree
              </div>
              {worktrees.map((wt) => (
                <button
                  key={wt.path}
                  type="button"
                  className={clsx(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-[var(--color-surface-hover)]',
                    wt.path === item.worktreePath
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)]',
                  )}
                  onClick={() => {
                    onAssignWorktree(item.id, wt.path);
                    setContextMenu(null);
                  }}
                >
                  {wt.path === item.worktreePath && (
                    <svg
                      className="h-3 w-3 shrink-0"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  <span className="truncate font-mono text-[12px]">{wt.branchName || wt.path}</span>
                </button>
              ))}
            </>
          )}

          <div className="my-1 h-px bg-[var(--color-separator)]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            onClick={() => {
              onOpenInBrowser(item.htmlUrl);
              setContextMenu(null);
            }}
          >
            Open in browser
          </button>
        </div>
      )}
    </>
  );
}
