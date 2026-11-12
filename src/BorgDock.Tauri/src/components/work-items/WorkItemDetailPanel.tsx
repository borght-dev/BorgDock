import { PanelRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotesTab, useNoteCount } from '@/components/notes/NotesTab';
import { Tabs } from '@/components/shared/primitives';
import { useDetailViewKeys } from '@/hooks/useDetailViewKeys';
import type { WorkItemDetailDataResult } from '@/hooks/useWorkItemDetailData';
import { itemLatest, notesFieldOf } from '@/services/ado/work-item-latest';
import { getFieldAllowedValues } from '@/services/ado/work-item-types';
import { isMainWindow, showWorkItem } from '@/services/navigation';
import { rememberCaptureContext } from '@/services/notes/capture';
import { refKey } from '@/services/workstreams/identity';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItemAttachment } from '@/types';
import { formatAgo } from '@/utils/relative-time';
import { DetailsPane } from './detail/DetailsPane';
import { LayoutRail } from './detail/LayoutRail';
import { useItemContext } from './detail/useItemContext';
import type { FactsChange } from './detail/WorkItemFacts';
import { ActivityTab } from './WorkItemDetailPanel/ActivityTab';
import { AttachmentsTab } from './WorkItemDetailPanel/AttachmentsTab';
import { LinksTab, useMentioningPrs } from './WorkItemDetailPanel/LinksTab';
import type { LinkedPR } from './WorkItemDetailPanel/parseLinkedPRs';
import type { AdjacentNav } from './WorkItemDetailPanel/useAdjacentNav';
import {
  type AutoSavePatch,
  type AutoSaveValues,
  useAutoSave,
} from './WorkItemDetailPanel/useAutoSave';
import { type SaveStatus, WorkItemDetailHeader } from './WorkItemDetailPanel/WorkItemDetailHeader';

/** Below this width the rail hides; the main column takes the whole width. */
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
  /** Any other field by reference name (the type's header fact). */
  fields?: Record<string, unknown>;
}

interface Props {
  /** The item and everything around it (`useWorkItemDetailData`). */
  data: WorkItemDetailDataResult;
  /**
   * The main window's full-screen view: Back leads to the list and `J` / `K`
   * step through the tabs. The pop-out window has neither.
   */
  embedded?: boolean;
  onDelete?: () => void;
  /** Overrides the hook's download (the pop-out saves through a dialog). */
  onDownloadAttachment?: (attachment: WorkItemAttachment) => void;
  /** ↑ ↓ through the palette's list (the pop-out). */
  onArrowNav?: (dir: 'prev' | 'next') => void;
  adjacent?: AdjacentNav;
}

const NO_VALUES: AutoSaveValues = {
  title: '',
  state: '',
  assignedTo: '',
  priority: undefined,
  tags: '',
  iteration: '',
};

function valuesOf(item: NonNullable<WorkItemDetailDataResult['detailData']>): AutoSaveValues {
  return {
    title: item.title,
    state: item.state,
    assignedTo: item.assignedTo,
    priority: item.priority,
    tags: item.tags,
    iteration: item.iteration ?? '',
  };
}

/** The allowed values of the type's header fact, read once per type when its picker opens. */
function useTypeFactOptions(
  type: string,
  key: string | null,
  getClient: WorkItemDetailDataResult['getClient'],
) {
  const cacheKey = key ? `${type}|${key}` : '';
  const options = useWorkItemsStore((s) =>
    cacheKey ? s.fieldAllowedValues.get(cacheKey) : undefined,
  );
  const load = useCallback(() => {
    if (!key || options !== undefined) return;
    const client = getClient();
    if (!client) return;
    getFieldAllowedValues(client, type, key)
      .then((values) => useWorkItemsStore.getState().setFieldAllowedValues(cacheKey, values))
      .catch(() => useWorkItemsStore.getState().setFieldAllowedValues(cacheKey, []));
  }, [cacheKey, key, type, options, getClient]);
  return { options: options ?? [], load };
}

/**
 * WorkItemDetailPanel — a work item in full (design/work-item-detail/mockups.html,
 * frames A and B): the header with every fact once and what happens now, the
 * form's pages as tabs with Latest and the long-text fields, Activity, Links,
 * Attachments and Notes, and the ADO layout's groups in the rail. Hosted by
 * the main window's `WorkItemDetailView` (embedded) and the pop-out window.
 */
export function WorkItemDetailPanel({
  data,
  embedded = false,
  onDelete,
  onDownloadAttachment,
  onArrowNav,
  adjacent,
}: Props) {
  const item = data.detailData;
  const workItem = data.workItem;
  const form = data.form;
  const [tab, setTab] = useState<string>('details');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [values, setValues] = useState<AutoSaveValues | null>(item ? valuesOf(item) : null);
  const [factDraft, setFactDraft] = useState<{ key: string; value: unknown } | null>(null);
  const fieldDefinitions = useWorkItemsStore((s) => s.fieldDefinitions);

  const auto = useAutoSave({
    initial: item ? valuesOf(item) : NO_VALUES,
    onPatch: async (_patch: AutoSavePatch, target: AutoSaveValues) => {
      await data.save({ ...target, fields: undefined });
    },
  });
  const { flush: flushAutoSave, reset: resetAutoSave } = auto;
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Re-sync when the item changes (another id, or a newer revision).
  // biome-ignore lint/correctness/useExhaustiveDependencies: item.id triggers re-sync on identity change
  useEffect(() => {
    if (!item) return;
    const next = valuesOf(item);
    setValues(next);
    resetAutoSave(next);
    setFactDraft(null);
  }, [
    item?.id,
    item?.title,
    item?.state,
    item?.assignedTo,
    item?.priority,
    item?.tags,
    item?.iteration,
    resetAutoSave,
  ]);

  const { save: saveItem } = data;
  const handleFacts = useCallback(
    (change: FactsChange & { title?: string }) => {
      const current = valuesRef.current;
      if (!current) return;
      if (change.fields) {
        const [key, value] = Object.entries(change.fields)[0] ?? [];
        if (key) setFactDraft({ key, value });
        void saveItem({ ...current, fields: change.fields });
        return;
      }
      const next = { ...current, ...change };
      setValues(next);
      flushAutoSave(next);
    },
    [flushAutoSave, saveItem],
  );

  const handleTitle = useCallback((title: string) => handleFacts({ title }), [handleFacts]);

  const context = useItemContext(item?.id);
  const mentioningPrs = useMentioningPrs(item?.id);
  const linkedPRs = useMemo(() => item?.linkedPRs ?? [], [item?.linkedPRs]);
  const adoOrganization = useSettingsStore((s) => s.settings.azureDevOps.organization);
  const adoProject = useSettingsStore((s) => s.settings.azureDevOps.project);
  const noteKey =
    item?.id && adoOrganization
      ? refKey({
          kind: 'ado-item',
          organization: adoOrganization,
          project: adoProject,
          id: item.id,
        })
      : null;
  const noteCount = useNoteCount(noteKey ?? '');

  // The item on screen is what a quick note (Ctrl+F8) refers to.
  const itemId = item?.id;
  const itemTitle = item?.title ?? '';
  useEffect(() => {
    if (!itemId) return;
    const remember = () => rememberCaptureContext({ kind: 'item', id: itemId, title: itemTitle });
    remember();
    window.addEventListener('focus', remember);
    return () => window.removeEventListener('focus', remember);
  }, [itemId, itemTitle]);

  const notes = useMemo(
    () => (workItem ? notesFieldOf(workItem, fieldDefinitions) : null),
    [workItem, fieldDefinitions],
  );
  const newestComment = data.comments.length > 0 ? data.comments[data.comments.length - 1]! : null;
  const latest = useMemo(
    () => itemLatest({ notes, newestComment, threads: context.overview?.threads ?? [] }),
    [notes, newestComment, context.overview],
  );

  const typeFactKey = form?.typeFact?.key ?? null;
  const typeFactOptions = useTypeFactOptions(item?.workItemType ?? '', typeFactKey, data.getClient);
  const typeFact = useMemo(() => {
    const fact = form?.typeFact ?? null;
    if (!fact || !factDraft || factDraft.key !== fact.key) return fact;
    return { ...fact, value: factDraft.value, text: String(factDraft.value ?? '') };
  }, [form?.typeFact, factDraft]);

  const save: SaveStatus | null = useMemo(() => {
    if (auto.error || data.statusText === 'Save failed') {
      return {
        label: 'Save failed',
        tone: 'bad',
        onRetry: values ? () => flushAutoSave(values) : undefined,
      };
    }
    if (data.statusText === 'Delete failed') return { label: 'Delete failed', tone: 'bad' };
    if (auto.isSaving) return { label: 'Saving…', tone: 'busy' };
    if (auto.lastSavedAt || data.statusText === 'Saved') return { label: 'Saved', tone: 'ok' };
    return null;
  }, [auto.error, auto.isSaving, auto.lastSavedAt, data.statusText, values, flushAutoSave]);

  const updated = useMemo(() => {
    const at = workItem?.fields['System.ChangedDate'];
    if (typeof at !== 'string') return null;
    const by = workItem?.fields['System.ChangedBy'] as
      | { displayName?: string }
      | string
      | undefined;
    const name = typeof by === 'string' ? by.split(' <')[0] : by?.displayName;
    return `Updated ${formatAgo(at)}${name ? ` by ${name}` : ''}`;
  }, [workItem]);

  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the body mounts once the item is there
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setRailCollapsed(entry.contentRect.width < RAIL_COLLAPSE_BREAKPOINT_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item !== null]);

  const pages = form?.tabs ?? [];
  // A page that's gone (another type's layout) snaps back to Details.
  useEffect(() => {
    const fixed = ['activity', 'links', 'files', 'notes'];
    if (!fixed.includes(tab) && pages.length > 0 && !pages.some((p) => p.id === tab))
      setTab('details');
  }, [pages, tab]);

  const [firstPage, ...laterPages] = pages;
  const tabOrder = [
    ...(firstPage ? [firstPage.id] : []),
    'activity',
    'links',
    'files',
    ...(noteKey ? ['notes'] : []),
    ...laterPages.map((p) => p.id),
  ];
  const stepTab = (delta: number) => {
    const index = tabOrder.indexOf(tab);
    const next = tabOrder[(index + delta + tabOrder.length) % tabOrder.length];
    if (next) setTab(next);
  };
  useDetailViewKeys(rootRef, { j: () => stepTab(1), k: () => stepTab(-1) }, embedded);

  if (!item || !workItem || !values) {
    return (
      <div className="bd-detail__state" role="status">
        <span className="bd-detail__spinner" aria-label="Loading work item" />
      </div>
    );
  }

  const openInAdo = () => void data.openInBrowser(item.htmlUrl);
  const openItem = (id: number) => {
    if (isMainWindow()) void showWorkItem(id);
  };
  const activePage = pages.find((p) => p.id === tab);
  // The rail shows the page on screen; a page without groups of its own keeps Details' rail.
  const railGroups = activePage?.groups.length ? activePage.groups : (pages[0]?.groups ?? []);

  // Details first, BorgDock's own tabs, then the layout's other pages.
  const tabs = [
    ...(firstPage ? [{ id: firstPage.id, label: firstPage.label }] : []),
    { id: 'activity', label: 'Activity', count: data.comments.length || undefined },
    { id: 'links', label: 'Links', count: linkedPRs.length + mentioningPrs.length || undefined },
    { id: 'files', label: 'Attachments', count: data.attachments.length || undefined },
    ...(noteKey ? [{ id: 'notes', label: 'Notes', count: noteCount || undefined }] : []),
    ...laterPages.map((p) => ({ id: p.id, label: p.label })),
  ];

  const arrows =
    adjacent && onArrowNav && (adjacent.prevId !== null || adjacent.nextId !== null) ? (
      <span className="bd-wid-crumb" style={{ gap: 2 }}>
        <button
          type="button"
          className="bd-icon-btn bd-icon-btn--sm"
          disabled={adjacent.prevId === null}
          onClick={() => onArrowNav('prev')}
          aria-label="Previous work item"
        >
          ↑
        </button>
        <button
          type="button"
          className="bd-icon-btn bd-icon-btn--sm"
          disabled={adjacent.nextId === null}
          onClick={() => onArrowNav('next')}
          aria-label="Next work item"
        >
          ↓
        </button>
        {adjacent.total > 0 && (
          <span className="bd-wid-updated" style={{ margin: '0 6px 0 2px' }}>
            {adjacent.index + 1} / {adjacent.total}
          </span>
        )}
      </span>
    ) : null;

  return (
    <div ref={rootRef} className="bd-detail__panel bd-wid" data-wi-detail="">
      <WorkItemDetailHeader
        id={item.id}
        title={values.title}
        workItemType={item.workItemType}
        areaPath={String(workItem.fields['System.AreaPath'] ?? '')}
        facts={{
          state: values.state,
          availableStates: data.availableStates.length > 0 ? data.availableStates : [values.state],
          assignedTo: values.assignedTo,
          priority: values.priority,
          iteration: values.iteration ?? '',
          tags: values.tags,
          typeFact,
          typeFactOptions: typeFactOptions.options,
          onLoadTypeFactOptions: typeFactOptions.load,
        }}
        context={context}
        updated={updated}
        save={save}
        htmlUrl={item.htmlUrl}
        showBack={embedded}
        leading={arrows}
        onTitleChange={handleTitle}
        onFactsChange={handleFacts}
        onOpenInBrowser={openInAdo}
        onDelete={item.isNewItem ? undefined : onDelete}
      />
      <div className="bd-wid-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={tabs}
          sliding={embedded}
          aria-keyshortcuts={embedded ? 'J K' : undefined}
        />
        {form && (
          <span
            className="bd-wid-tabs__layout"
            title={form.fromLayout ? 'Built from the ADO form layout' : 'No ADO layout'}
          >
            <PanelRight size={12} strokeWidth={2} aria-hidden />
            {form.fromLayout ? `Layout: ${item.workItemType}` : 'Default layout'}
          </span>
        )}
      </div>
      <div
        ref={bodyRef}
        className="bd-wid-body"
        data-rail-collapsed={railCollapsed ? 'true' : 'false'}
      >
        <div className="bd-wid-main bd-scroll">
          {/* Keyed by tab: each switch mounts a fresh pane, whose entrance is the crossfade. */}
          <div key={tab} className="bd-wid-pane" role="tabpanel">
            {activePage && (
              <DetailsPane
                tab={activePage}
                latest={activePage.id === 'details' ? latest : null}
                notes={notes}
                onShowActivity={() => setTab('activity')}
                onOpenInAdo={openInAdo}
              />
            )}
            {tab === 'activity' && item.id !== undefined && (
              <ActivityTab
                itemId={item.id}
                comments={data.comments}
                isLoadingComments={data.isLoadingComments}
                onAddComment={data.addComment}
                getClient={data.getClient}
              />
            )}
            {tab === 'links' && <LinksTab linkedPRs={linkedPRs} mentioningPrs={mentioningPrs} />}
            {tab === 'files' && (
              <AttachmentsTab
                attachments={data.attachments}
                onDownload={(a) =>
                  onDownloadAttachment ? onDownloadAttachment(a) : void data.downloadAttachment(a)
                }
              />
            )}
            {tab === 'notes' && noteKey && item.id && (
              <NotesTab
                refKey={noteKey}
                newTitle={item.title}
                newFirstLine={`AB#${item.id} · ${item.title}`}
              />
            )}
          </div>
        </div>
        <aside className="bd-wid-rail bd-scroll" aria-label="Fields">
          <LayoutRail
            groups={railGroups}
            workItem={workItem}
            context={context}
            workItemType={item.workItemType}
            fromLayout={form?.fromLayout ?? false}
            getClient={data.getClient}
            onOpenInAdo={openInAdo}
            onOpenItem={openItem}
          />
        </aside>
      </div>
    </div>
  );
}
