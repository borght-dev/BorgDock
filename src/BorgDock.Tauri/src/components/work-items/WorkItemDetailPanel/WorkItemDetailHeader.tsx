import clsx from 'clsx';
import { Copy, ExternalLink, Star } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { BackButton } from '@/components/layout/BackButton';
import { Button } from '@/components/shared/primitives';
import {
  avatarToneFor,
  getInitials,
  MiniAvatar,
  PrioBars,
  StatePill,
  WI_PRIO,
} from '@/components/work-items/shared/wi-visuals';
import { WorkItemTypePill } from '@/components/work-items/WorkItemTypePill';
import {
  toggleTrackedWorkItem,
  toggleWorkingOnWorkItem,
} from '@/components/work-items/work-item-toggles';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { ChipPicker } from './ChipPicker';
import type { TitleBlockChange } from './TitleBlock';

const ICON = { size: 13, strokeWidth: 2.25, 'aria-hidden': true } as const;

const PRIORITY_OPTIONS = [
  { value: '1', label: 'P1 · Urgent' },
  { value: '2', label: 'P2 · High' },
  { value: '3', label: 'P3 · Med' },
  { value: '4', label: 'P4 · Low' },
];

/** The view-transition name a work item row gives its title (WorkbenchWorkItemRow). */
export function workItemTitleTransitionName(id: number): string {
  return `wi-title-${id}`;
}

/** "Active, P2" — the state line of a row and of the detail header. */
export function workItemStateLine(state: string, priority?: number): string {
  return priority ? `${state}, P${priority}` : state;
}

export interface WorkItemDetailHeaderProps {
  id?: number;
  title: string;
  workItemType: string;
  state: string;
  priority?: number;
  assignedTo: string;
  iteration?: string;
  availableStates: string[];
  changedAgo?: string;
  htmlUrl: string;
  onChange: (patch: TitleBlockChange) => void;
  onOpenInBrowser: () => void;
}

/**
 * WorkItemDetailHeader — the head of the full-screen work item view
 * (plans/ui-overhaul-workbench.md, phase 5), in the PR detail header's shape:
 * Back, `AB#id`, the type pill and the state line on the top line; the title
 * (click to edit; it carries the row's view-transition name, so the row's
 * title morphs into it); the state, priority, assignee and iteration pickers;
 * then the action bar: Open in ADO, Copy id, and the Track and Working
 * toggles. Replaces the panel's `TitleBlock` when the panel is embedded.
 */
export function WorkItemDetailHeader({
  id,
  title,
  workItemType,
  state,
  priority,
  assignedTo,
  iteration,
  availableStates,
  changedAgo,
  htmlUrl,
  onChange,
  onOpenInBrowser,
}: WorkItemDetailHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [copied, setCopied] = useState(false);
  useEffect(() => setDraft(title), [title]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const tracked = useWorkItemsStore((s) => id !== undefined && s.trackedWorkItemIds.has(id));
  const working = useWorkItemsStore((s) => id !== undefined && s.workingOnWorkItemIds.has(id));

  const initials = getInitials(assignedTo || '??');
  const prio = priority != null ? WI_PRIO[priority] : null;
  const titleStyle =
    id !== undefined
      ? ({ viewTransitionName: workItemTitleTransitionName(id) } as CSSProperties)
      : undefined;

  const commitTitle = () => {
    setEditing(false);
    if (draft.trim() && draft !== title) onChange({ title: draft });
    else setDraft(title);
  };

  return (
    <header className="bd-detail__head bd-wi-detail__head" data-wi-id={id}>
      <div className="bd-detail__bar">
        <BackButton />
        <span className="bd-detail__crumb bd-wi-detail__crumb">
          {id !== undefined && <span className="bd-wi-detail__id">AB#{id}</span>}
          <WorkItemTypePill type={workItemType} />
          <span className="bd-wi-detail__stateline">{workItemStateLine(state, priority)}</span>
        </span>
      </div>

      <div className="bd-detail__titlerow">
        {editing ? (
          <input
            autoFocus
            aria-label="Title"
            className="bd-wi-detail__title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                // Esc cancels the edit here; it must not also leave the view.
                e.preventDefault();
                setDraft(title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <h1 className="bd-detail__title" style={titleStyle}>
            <button
              type="button"
              className="bd-wi-detail__title-btn"
              title="Edit title"
              onClick={() => {
                setDraft(title);
                setEditing(true);
              }}
            >
              {title}
            </button>
          </h1>
        )}
      </div>

      <div className="bd-wi-detail__fields">
        <ChipPicker
          label="State"
          value={state}
          options={availableStates}
          onChange={(next) => onChange({ state: next })}
        >
          <StatePill state={state} compact />
        </ChipPicker>
        <ChipPicker
          label="Priority"
          value={priority != null ? String(priority) : ''}
          options={PRIORITY_OPTIONS}
          onChange={(next) => onChange({ priority: Number(next) })}
        >
          <span className="bd-wi-detail__field">
            <PrioBars prio={priority} />
            {prio ? `P${priority} · ${prio.label}` : 'No priority'}
          </span>
        </ChipPicker>
        <ChipPicker
          label="Assigned to"
          value={assignedTo}
          placeholder="display name or email"
          onChange={(next) => onChange({ assignedTo: next })}
        >
          <span className="bd-wi-detail__field">
            <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={16} />
            {assignedTo || 'Unassigned'}
          </span>
        </ChipPicker>
        <ChipPicker
          label="Iteration"
          value={iteration ?? ''}
          placeholder="e.g. R5.2.7.5"
          onChange={(next) => onChange({ iteration: next })}
        >
          <span className="bd-wi-detail__field">{iteration || 'No iteration'}</span>
        </ChipPicker>
        {changedAgo && <span className="bd-wi-detail__changed">updated {changedAgo} ago</span>}
      </div>

      <div className="bd-detail-actions" data-action-bar="">
        {htmlUrl && (
          <Button
            variant="secondary"
            size="md"
            leading={<ExternalLink {...ICON} />}
            onClick={onOpenInBrowser}
            data-action-bar-action="ado"
          >
            Open in ADO
          </Button>
        )}
        {id !== undefined && (
          <Button
            variant="secondary"
            size="md"
            leading={<Copy {...ICON} />}
            onClick={() => {
              navigator.clipboard
                ?.writeText(`AB#${id}`)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            data-action-bar-action="copy-id"
          >
            {copied ? 'Copied' : 'Copy id'}
          </Button>
        )}
        {id !== undefined && (
          <Button
            variant="secondary"
            size="md"
            leading={<Star {...ICON} fill={tracked ? 'currentColor' : 'none'} />}
            aria-pressed={tracked}
            className={clsx(tracked && 'bd-detail-actions__toggle--on')}
            onClick={() => toggleTrackedWorkItem(id)}
            data-action-bar-action="track"
          >
            {tracked ? 'Tracked' : 'Track'}
          </Button>
        )}
        {id !== undefined && (
          <Button
            variant="secondary"
            size="md"
            leading={<span className="bd-wi-detail__dot" aria-hidden="true" />}
            aria-pressed={working}
            className={clsx(working && 'bd-detail-actions__toggle--on')}
            onClick={() => toggleWorkingOnWorkItem(id)}
            data-action-bar-action="working"
          >
            {working ? 'Working on it' : 'Start working'}
          </Button>
        )}
      </div>
    </header>
  );
}
