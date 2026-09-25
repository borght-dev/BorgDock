import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Kbd, Tabs } from '@/components/shared/primitives';
import { useDetailViewKeys } from '@/hooks/useDetailViewKeys';
import type { ProcessTab } from '@/services/ado/layout';
import type { DynamicFieldItem, WorkItemAttachment, WorkItemComment } from '@/types';
import { ActivityTab } from './WorkItemDetailPanel/ActivityTab';
import { AttachmentsTab } from './WorkItemDetailPanel/AttachmentsTab';
import { DiscussionRail } from './WorkItemDetailPanel/DiscussionRail';
import { LinksTab, useMentioningPrs } from './WorkItemDetailPanel/LinksTab';
import { OverviewTab } from './WorkItemDetailPanel/OverviewTab';
import type { LinkedPR } from './WorkItemDetailPanel/parseLinkedPRs';
import { buildDetailTabs } from './WorkItemDetailPanel/partitionFields';
import { RightRail } from './WorkItemDetailPanel/RightRail';
import { TitleBlock, type TitleBlockChange } from './WorkItemDetailPanel/TitleBlock';
import type { AdjacentNav } from './WorkItemDetailPanel/useAdjacentNav';
import {
  type AutoSavePatch,
  type AutoSaveValues,
  useAutoSave,
} from './WorkItemDetailPanel/useAutoSave';
import { WorkItemDetailHeader } from './WorkItemDetailPanel/WorkItemDetailHeader';

/** Below this width the right rail collapses behind a drawer. Pairs with the
 * `[data-wi-detail][data-rail-collapsed='true']` rule in styles/index.css. */
const RAIL_COLLAPSE_BREAKPOINT_PX = 760;

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
  iteration?: string;
}

interface Props {
  item: WorkItemDetailData;
  isLoading: boolean;
  statusText?: string;
  availableStates: string[];
  richTextFields: DynamicFieldItem[];
  standardFields: DynamicFieldItem[];
  customFields: DynamicFieldItem[];
  /** ADO layout-derived custom pages, rendered as extra tabs after Overview. */
  extraTabs?: ProcessTab[];
  /** Field reference names ADO marks as belonging to the implicit Details
   *  page. Anything not in this set and not claimed by an extraTab also
   *  falls through to Overview. */
  detailsFieldKeys?: string[];
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
  /**
   * Hosted by the main window's full-screen `WorkItemDetailView`: the
   * Workbench header (Back, `AB#id`, type and state line, title, the field
   * pickers and the action bar) replaces the title block, the tabs get the
   * sliding underline and a crossfade, `J` / `K` step through them, and the
   * footer drops Close and Open in ADO (Back and the action bar have them).
   */
  embedded?: boolean;
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
    extraTabs,
    detailsFieldKeys,
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
    embedded = false,
  } = props;

  const [tab, setTab] = useState<string>('overview');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [values, setValues] = useState<AutoSaveValues>({
    title: item.title,
    state: item.state,
    assignedTo: item.assignedTo,
    priority: item.priority,
    tags: item.tags,
    iteration: item.iteration ?? '',
  });

  const auto = useAutoSave({
    initial: {
      title: item.title,
      state: item.state,
      assignedTo: item.assignedTo,
      priority: item.priority,
      tags: item.tags,
      iteration: item.iteration ?? '',
    },
    onPatch: async (_patch: AutoSavePatch, target: AutoSaveValues) => {
      await onSave({
        title: target.title,
        state: target.state,
        assignedTo: target.assignedTo,
        priority: target.priority,
        tags: target.tags,
        iteration: target.iteration,
      });
    },
  });
  // useAutoSave returns a fresh object literal each render; the inner
  // members (flush/reset) are useCallback-stable. Bind them by name so
  // dep arrays don't see spurious changes that infinite-loop the sync
  // effect below.
  const { flush: flushAutoSave, reset: resetAutoSave } = auto;

  // Sync local state when the item identity changes (next/prev nav reload).
  // biome-ignore lint/correctness/useExhaustiveDependencies: item.id triggers re-sync on identity change even though it isn't read in the body
  useEffect(() => {
    const next: AutoSaveValues = {
      title: item.title,
      state: item.state,
      assignedTo: item.assignedTo,
      priority: item.priority,
      tags: item.tags,
      iteration: item.iteration ?? '',
    };
    setValues(next);
    resetAutoSave(next);
  }, [
    item.id,
    item.title,
    item.state,
    item.assignedTo,
    item.priority,
    item.tags,
    item.iteration,
    resetAutoSave,
  ]);

  const handleChange = useCallback(
    (patch: TitleBlockChange) => {
      setValues((prev) => {
        const next = { ...prev, ...patch };
        flushAutoSave(next);
        return next;
      });
    },
    [flushAutoSave],
  );

  const linkedPRs = useMemo(() => item.linkedPRs ?? [], [item.linkedPRs]);
  // GitHub pull requests in the main window's list that mention AB#<id>.
  const mentioningPrs = useMentioningPrs(item.id);

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

  const rootRef = useRef<HTMLDivElement>(null);
  // The element the rail collapses in: the whole panel, or the body under
  // the header when embedded.
  const gridRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the grid only mounts once the loading spinner is gone; `isLoading` re-attaches the observer then
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setRailCollapsed(entry.contentRect.width < RAIL_COLLAPSE_BREAKPOINT_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading]);

  const detailSlices = useMemo(
    () =>
      buildDetailTabs(
        { richText: richTextFields, standard: standardFields, custom: customFields },
        detailsFieldKeys,
        extraTabs,
      ),
    [richTextFields, standardFields, customFields, detailsFieldKeys, extraTabs],
  );

  // If the active tab disappears (e.g. the user navigated to an item
  // whose layout doesn't include the current page), snap back to Overview.
  useEffect(() => {
    if (
      tab !== 'activity' &&
      tab !== 'links' &&
      tab !== 'files' &&
      !detailSlices.some((s) => s.id === tab)
    ) {
      setTab('overview');
    }
  }, [detailSlices, tab]);

  const tabOrder = [...detailSlices.map((s) => s.id), 'activity', 'links', 'files'];
  const stepTab = (delta: number) => {
    const index = tabOrder.indexOf(tab);
    const next = tabOrder[(index + delta + tabOrder.length) % tabOrder.length];
    if (next) setTab(next);
  };
  useDetailViewKeys(rootRef, { j: () => stepTab(1), k: () => stepTab(-1) }, embedded);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  const tabs = [
    ...detailSlices.map((s) => ({ id: s.id, label: s.label })),
    { id: 'activity', label: 'Activity' },
    { id: 'links', label: 'Links', count: linkedPRs.length + mentioningPrs.length || undefined },
    { id: 'files', label: 'Attachments', count: attachments.length || undefined },
  ];

  const activeSlice = detailSlices.find((s) => s.id === tab);

  const tabBar = (
    <div
      className={embedded ? 'bd-detail__tabs bd-wi-detail__tabs' : undefined}
      style={
        embedded
          ? undefined
          : {
              padding: '0 28px',
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-subtle-border)',
            }
      }
    >
      <Tabs
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={tabs}
        sliding={embedded}
        aria-keyshortcuts={embedded ? 'J K' : undefined}
      />
    </div>
  );

  const tabContent = (
    <>
      {activeSlice && (
        <OverviewTab
          richTextFields={activeSlice.fields.richText}
          standardFields={activeSlice.fields.standard}
          customFields={activeSlice.fields.custom}
        />
      )}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'links' && <LinksTab linkedPRs={linkedPRs} mentioningPrs={mentioningPrs} />}
      {tab === 'files' && (
        <AttachmentsTab attachments={attachments} onDownload={onDownloadAttachment} />
      )}
    </>
  );

  const footer = (
    <div
      className={embedded ? 'bd-wi-detail__footer' : undefined}
      style={
        embedded
          ? undefined
          : {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 28px',
              borderTop: '1px solid var(--color-subtle-border)',
              background: 'var(--color-status-bar-bg)',
            }
      }
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
      {!embedded && item.htmlUrl && (
        <Button variant="secondary" size="sm" onClick={() => onOpenInBrowser(item.htmlUrl)}>
          Open in ADO ↗
        </Button>
      )}
      {!embedded && (
        <Button variant="secondary" size="sm" onClick={onClose}>
          <Kbd>esc</Kbd> Close
        </Button>
      )}
    </div>
  );

  const rail = (
    <div
      className={clsx('bd-scroll wi-rail', embedded && 'bd-wi-detail__rail')}
      style={
        embedded
          ? undefined
          : {
              overflowY: 'auto',
              background: 'var(--color-surface)',
              padding: '16px 18px 32px',
            }
      }
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
        tags={
          values.tags
            ? values.tags
                .split(';')
                .map((t) => t.trim())
                .filter(Boolean)
            : []
        }
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
  );

  if (embedded) {
    return (
      <div ref={rootRef} className="bd-detail__panel bd-wi-detail">
        <WorkItemDetailHeader
          id={item.id}
          title={values.title}
          workItemType={item.workItemType}
          state={values.state}
          priority={values.priority}
          assignedTo={values.assignedTo}
          iteration={values.iteration}
          availableStates={availableStates}
          changedAgo={item.changedAgo}
          htmlUrl={item.htmlUrl}
          onChange={handleChange}
          onOpenInBrowser={() => onOpenInBrowser(item.htmlUrl)}
        />
        <div
          ref={gridRef}
          className="bd-wi-detail__body"
          data-wi-detail
          data-rail-collapsed={railCollapsed ? 'true' : 'false'}
        >
          <div className="bd-wi-detail__main">
            {tabBar}
            <div className="bd-detail__content bd-wi-detail__content">
              {/* Keyed by tab: each switch mounts a fresh pane, whose
               *  entrance animation is the crossfade. */}
              <div key={tab} className="bd-detail__pane bd-wi-detail__pane" role="tabpanel">
                {tabContent}
              </div>
            </div>
            {footer}
          </div>
          {rail}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        gridRef.current = el;
      }}
      data-wi-detail
      data-rail-collapsed={railCollapsed ? 'true' : 'false'}
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
          iteration={values.iteration}
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

        {tabBar}

        <div
          className="bd-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'var(--color-background)',
            padding: '20px 28px 80px',
          }}
        >
          {tabContent}
        </div>

        {footer}
      </div>

      {rail}
    </div>
  );
}
