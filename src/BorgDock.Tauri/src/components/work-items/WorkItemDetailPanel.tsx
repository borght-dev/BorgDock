import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Kbd, Tabs } from '@/components/shared/primitives';
import { ActivityTab } from './WorkItemDetailPanel/ActivityTab';
import { AttachmentsTab } from './WorkItemDetailPanel/AttachmentsTab';
import { DiscussionRail } from './WorkItemDetailPanel/DiscussionRail';
import { LinksTab } from './WorkItemDetailPanel/LinksTab';
import { OverviewTab } from './WorkItemDetailPanel/OverviewTab';
import { RightRail } from './WorkItemDetailPanel/RightRail';
import { TitleBlock, type TitleBlockChange } from './WorkItemDetailPanel/TitleBlock';
import type { AdjacentNav } from './WorkItemDetailPanel/useAdjacentNav';
import {
  type AutoSavePatch,
  type AutoSaveValues,
  useAutoSave,
} from './WorkItemDetailPanel/useAutoSave';
import type { LinkedPR } from './WorkItemDetailPanel/parseLinkedPRs';
import type {
  DynamicFieldItem,
  WorkItemAttachment,
  WorkItemComment,
} from '@/types';

export interface WorkItemDetailData {
  id?: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
  priority?: number;
  tags: string;
  htmlUrl: string;
  isNewItem: boolean;
  /** Severity (Microsoft.VSTS.Common.Severity) if present. */
  severity?: string;
  reporter?: string;
  iteration?: string;
  area?: string;
  backlogPriority?: number | string;
  foundIn?: string;
  changedAgo?: string;
  linkedPRs?: LinkedPR[];
}

export interface WorkItemFieldUpdates {
  title: string;
  state: string;
  assignedTo: string;
  priority?: number;
  tags: string;
  workItemType?: string;
}

interface Props {
  item: WorkItemDetailData;
  isLoading: boolean;
  statusText?: string;
  availableStates: string[];
  richTextFields: DynamicFieldItem[];
  standardFields: DynamicFieldItem[];
  customFields: DynamicFieldItem[];
  attachments: WorkItemAttachment[];
  comments?: WorkItemComment[];
  isLoadingComments?: boolean;
  onSave: (updates: WorkItemFieldUpdates) => Promise<void> | void;
  onDelete?: () => void;
  onClose: () => void;
  onOpenInBrowser: (url: string) => void;
  onDownloadAttachment: (attachment: WorkItemAttachment) => void;
  onAddComment?: (text: string) => Promise<void>;
  /** Optional adjacent nav callback — if absent, ↑↓ buttons hide. */
  onArrowNav?: (dir: 'prev' | 'next') => void;
  adjacent?: AdjacentNav;
}

export function WorkItemDetailPanel(props: Props) {
  const {
    item,
    isLoading,
    statusText,
    availableStates,
    richTextFields,
    standardFields,
    customFields,
    attachments,
    comments,
    isLoadingComments,
    onSave,
    onDelete,
    onClose,
    onOpenInBrowser,
    onDownloadAttachment,
    onAddComment,
    onArrowNav,
    adjacent,
  } = props;

  const [tab, setTab] = useState<'overview' | 'activity' | 'links' | 'files'>('overview');
  const [values, setValues] = useState<AutoSaveValues>({
    title: item.title,
    state: item.state,
    assignedTo: item.assignedTo,
    priority: item.priority,
    tags: item.tags,
  });

  const auto = useAutoSave({
    initial: {
      title: item.title,
      state: item.state,
      assignedTo: item.assignedTo,
      priority: item.priority,
      tags: item.tags,
    },
    onPatch: async (_patch: AutoSavePatch, target: AutoSaveValues) => {
      await onSave({
        title: target.title,
        state: target.state,
        assignedTo: target.assignedTo,
        priority: target.priority,
        tags: target.tags,
      });
    },
  });

  // Sync local state when the item identity changes (next/prev nav reload).
  useEffect(() => {
    const next: AutoSaveValues = {
      title: item.title,
      state: item.state,
      assignedTo: item.assignedTo,
      priority: item.priority,
      tags: item.tags,
    };
    setValues(next);
    auto.reset(next);
  }, [item.id, item.title, item.state, item.assignedTo, item.priority, item.tags, auto]);

  const handleChange = useCallback(
    (patch: TitleBlockChange) => {
      setValues((prev) => {
        const next = { ...prev, ...patch };
        auto.flush(next);
        return next;
      });
    },
    [auto],
  );

  const linkedPRs = useMemo(() => item.linkedPRs ?? [], [item.linkedPRs]);

  const savedLabel = useMemo(() => {
    if (auto.error) return `Save failed — ${auto.error}`;
    if (auto.isSaving) return 'Saving…';
    if (auto.lastSavedAt) {
      const ago = Math.floor((Date.now() - auto.lastSavedAt) / 1000);
      if (ago < 5) return 'Saved just now';
      if (ago < 60) return `Saved ${ago}s ago`;
      return `Saved ${Math.floor(ago / 60)}m ago`;
    }
    return 'Auto-saves on blur';
  }, [auto.error, auto.isSaving, auto.lastSavedAt]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'links', label: 'Links', count: linkedPRs.length || undefined },
    { id: 'files', label: 'Attachments', count: attachments.length || undefined },
  ];

  return (
    <div
      data-wi-detail
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 320px',
        height: '100%',
        background: 'var(--color-surface)',
        containerType: 'inline-size',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRight: '1px solid var(--color-subtle-border)',
        }}
      >
        <TitleBlock
          id={item.id}
          title={values.title}
          workItemType={item.workItemType}
          state={values.state}
          priority={values.priority}
          assignedTo={values.assignedTo}
          iteration={item.iteration}
          availableStates={availableStates}
          changedAgo={item.changedAgo}
          onChange={handleChange}
          onCopyId={() => {
            if (item.id) navigator.clipboard?.writeText(`#${item.id}`).catch(() => {});
          }}
          onOpenInBrowser={() => onOpenInBrowser(item.htmlUrl)}
        />

        {adjacent && (adjacent.prevId !== null || adjacent.nextId !== null) && onArrowNav && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '4px 28px',
              borderBottom: '1px solid var(--color-subtle-border)',
              background: 'var(--color-surface)',
              fontSize: 11,
              color: 'var(--color-text-muted)',
            }}
          >
            <button
              type="button"
              disabled={adjacent.prevId === null}
              onClick={() => onArrowNav('prev')}
              className="bd-icon-btn"
              aria-label="Previous work item"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={adjacent.nextId === null}
              onClick={() => onArrowNav('next')}
              className="bd-icon-btn"
              aria-label="Next work item"
            >
              ↓
            </button>
            {adjacent.total > 0 && (
              <span style={{ alignSelf: 'center' }}>
                {adjacent.index + 1} / {adjacent.total}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            padding: '0 28px',
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-subtle-border)',
          }}
        >
          <Tabs value={tab} onChange={(id) => setTab(id as typeof tab)} tabs={tabs} />
        </div>

        <div
          className="bd-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'var(--color-background)',
            padding: '20px 28px 80px',
          }}
        >
          {tab === 'overview' && (
            <OverviewTab
              richTextFields={richTextFields}
              standardFields={standardFields}
              customFields={customFields}
            />
          )}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'links' && <LinksTab linkedPRs={linkedPRs} />}
          {tab === 'files' && (
            <AttachmentsTab attachments={attachments} onDownload={onDownloadAttachment} />
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 28px',
            borderTop: '1px solid var(--color-subtle-border)',
            background: 'var(--color-status-bar-bg)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {savedLabel}
            {statusText ? ` · ${statusText}` : ''}
          </span>
          {auto.error && (
            <Button variant="secondary" size="sm" onClick={() => auto.flush(values)}>
              Retry
            </Button>
          )}
          <span style={{ flex: 1 }} />
          {!item.isNewItem && onDelete && (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
          {item.htmlUrl && (
            <Button variant="secondary" size="sm" onClick={() => onOpenInBrowser(item.htmlUrl)}>
              Open in ADO ↗
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            <Kbd>esc</Kbd> Close
          </Button>
        </div>
      </div>

      <div
        className="bd-scroll wi-rail"
        style={{
          overflowY: 'auto',
          background: 'var(--color-surface)',
          padding: '16px 18px 32px',
        }}
      >
        <RightRail
          state={values.state}
          priority={values.priority}
          severity={item.severity}
          workItemType={item.workItemType}
          assignedTo={values.assignedTo}
          reporter={item.reporter ?? ''}
          iteration={item.iteration ?? ''}
          area={item.area ?? ''}
          backlogPriority={item.backlogPriority}
          foundIn={item.foundIn}
          tags={values.tags ? values.tags.split(';').map((t) => t.trim()).filter(Boolean) : []}
          linkedPRs={linkedPRs}
        />
        {!item.isNewItem && onAddComment && (
          <DiscussionRail
            comments={comments ?? []}
            isLoading={!!isLoadingComments}
            onAddComment={onAddComment}
          />
        )}
      </div>
    </div>
  );
}
