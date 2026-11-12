import clsx from 'clsx';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Play,
  Star,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BackButton } from '@/components/layout/BackButton';
import { Button, IconButton } from '@/components/shared/primitives';
import { typeVisual, useTypeMeta } from '@/components/work-items/shared/wi-visuals';
import {
  toggleTrackedWorkItem,
  toggleWorkingOnWorkItem,
} from '@/components/work-items/work-item-toggles';
import { ItemMembership } from '@/components/workstreams/Membership';
import { startWorkItem } from '@/services/dispatch/actions';
import { isMainWindow } from '@/services/navigation';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { ItemContext } from '../detail/useItemContext';
import { type FactsChange, WorkItemFacts, type WorkItemFactsProps } from '../detail/WorkItemFacts';
import { WorkItemNow } from '../detail/WorkItemNow';

const ICON = { size: 13, strokeWidth: 2.25, 'aria-hidden': true } as const;

/** "Active, P2" — the state line of a row. */
export function workItemStateLine(state: string, priority?: number): string {
  return priority ? `${state}, P${priority}` : state;
}

export interface SaveStatus {
  label: string;
  tone: 'ok' | 'bad' | 'busy';
  onRetry?: () => void;
}

export interface WorkItemDetailHeaderProps {
  id?: number;
  title: string;
  workItemType: string;
  /** The full area path; the last two segments show as the crumb. */
  areaPath: string;
  facts: Omit<WorkItemFactsProps, 'onChange' | 'workItemType'>;
  context: ItemContext;
  /** "Updated 4 h ago by Vera". */
  updated: string | null;
  save: SaveStatus | null;
  htmlUrl: string;
  /** The main window's view: Back leads to the list. */
  showBack: boolean;
  /** Extra controls at the start of the bar (the pop-out's ↑ ↓). */
  leading?: ReactNode;
  readOnly?: boolean;
  onTitleChange: (title: string) => void;
  onFactsChange: (change: FactsChange) => void;
  onOpenInBrowser: () => void;
  onDelete?: () => void;
}

function TypePill({ type }: { type: string }) {
  const visual = typeVisual(type, useTypeMeta(type));
  return (
    <span className="bd-wid-typepill" style={{ '--bd-wid-type': visual.color } as never}>
      <span className="bd-wid-typepill__glyph" aria-hidden="true">
        {visual.glyph}
      </span>
      {type || 'Work item'}
    </span>
  );
}

function MoreMenu({ id, onDelete }: { id?: number; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const working = useWorkItemsStore((s) => id !== undefined && s.workingOnWorkItemIds.has(id));
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (id === undefined && !onDelete) return null;
  return (
    <div className="bd-wid-menu" ref={ref}>
      <IconButton
        icon={<MoreHorizontal size={15} aria-hidden />}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        tooltip="More"
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="bd-wid-menu__list" role="menu">
          {id !== undefined && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={working}
              onClick={() => {
                toggleWorkingOnWorkItem(id);
                setOpen(false);
              }}
            >
              <span
                className="bd-wi-detail__dot"
                style={working ? { background: 'currentColor' } : undefined}
              />
              {working ? 'Stop working on it' : 'Start working'}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              data-danger=""
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 {...ICON} />
              Delete…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The head of the work item detail (design/work-item-detail/mockups.html,
 * frame A): the crumb with the type and area, save state and the item's
 * actions; the title (click to edit); the fact strip, each fact in one place;
 * then "Now" — the pull request, the agent and the next step.
 */
export function WorkItemDetailHeader({
  id,
  title,
  workItemType,
  areaPath,
  facts,
  context,
  updated,
  save,
  htmlUrl,
  showBack,
  leading,
  readOnly = false,
  onTitleChange,
  onFactsChange,
  onOpenInBrowser,
  onDelete,
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

  const area = areaPath.split('\\').filter(Boolean);
  const crumb = area.slice(-2);

  const commitTitle = () => {
    setEditing(false);
    if (draft.trim() && draft !== title) onTitleChange(draft);
    else setDraft(title);
  };

  return (
    <header className="bd-wid-head" data-wi-id={id}>
      <div className="bd-wid-bar">
        {showBack && <BackButton />}
        {leading}
        <span className="bd-wid-crumb">
          {id !== undefined && <span className="bd-wid-id">AB#{id}</span>}
          <TypePill type={workItemType} />
          {crumb.length > 0 && (
            <span className="bd-wid-path" title={area.join(' › ')}>
              {crumb.length > 1 && (
                <>
                  {crumb[0]}
                  <ChevronRight size={12} strokeWidth={2} aria-hidden />
                </>
              )}
              <b>{crumb[crumb.length - 1]}</b>
            </span>
          )}
        </span>
        <span className="bd-wid-spacer" />
        {id !== undefined && !readOnly && <ItemMembership id={id} title={title} />}
        {save && (
          <span className="bd-wid-saved" data-tone={save.tone === 'bad' ? 'bad' : undefined}>
            {save.tone === 'ok' && <Check size={12} strokeWidth={2.25} aria-hidden />}
            {save.tone === 'bad' && <AlertCircle size={12} strokeWidth={2.25} aria-hidden />}
            {save.label}
            {save.onRetry && (
              <button type="button" className="bd-wid-latest__all" onClick={save.onRetry}>
                Retry
              </button>
            )}
          </span>
        )}
        {save && updated && <span className="bd-wid-vsep" />}
        {updated && <span className="bd-wid-updated">{updated}</span>}
        {id !== undefined && (
          <IconButton
            icon={copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            aria-label={copied ? 'Copied' : 'Copy id'}
            tooltip={copied ? 'Copied' : `Copy AB#${id}`}
            onClick={() => {
              navigator.clipboard
                ?.writeText(`AB#${id}`)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            data-action-bar-action="copy-id"
          />
        )}
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
        {!readOnly && <MoreMenu id={id} onDelete={onDelete} />}
      </div>

      <div className="bd-wid-title">
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
                e.stopPropagation();
                setDraft(title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <h1
            className="bd-detail__title"
            style={{ fontSize: 'inherit', letterSpacing: 'inherit' }}
          >
            {readOnly ? (
              title
            ) : (
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
            )}
          </h1>
        )}
      </div>

      <div className="bd-wid-factrow">
        <WorkItemFacts
          {...facts}
          workItemType={workItemType}
          readOnly={readOnly}
          onChange={onFactsChange}
        />
        {id !== undefined && !readOnly && (
          <div className="bd-wid-acts" data-action-bar="">
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
            {isMainWindow() && (
              <Button
                variant="primary"
                size="md"
                leading={<Play {...ICON} fill="currentColor" />}
                onClick={() => startWorkItem(id)}
                data-action-bar-action="start"
              >
                Start in T3
              </Button>
            )}
          </div>
        )}
      </div>

      <WorkItemNow context={context} />
    </header>
  );
}
