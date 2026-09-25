import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkItemDetailData,
  WorkItemFieldUpdates,
} from '@/components/work-items/WorkItemDetailPanel';
import { parseLinkedPRs } from '@/components/work-items/WorkItemDetailPanel/parseLinkedPRs';
import { AdoClient } from '@/services/ado/client';
import { getProjectFields, indexFieldsByRef } from '@/services/ado/fields';
import {
  getProcessLayout,
  getProcessWitTypeRefs,
  getProjectProcessId,
  type ProcessTab,
} from '@/services/ado/layout';
import {
  addWorkItemComment,
  deleteWorkItem,
  downloadAttachment,
  getWorkItem,
  getWorkItemComments,
  getWorkItemTypeStates,
  updateWorkItem,
} from '@/services/ado/workitems';
import { createLogger } from '@/services/logger';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type {
  DynamicFieldItem,
  JsonPatchOperation,
  WorkItem,
  WorkItemAttachment,
  WorkItemComment,
} from '@/types';
import type { AzureDevOpsSettings } from '@/types/settings';
import { classifyFields, extractAttachments } from '@/utils/work-item-fields';
import { getField } from '@/utils/work-item-helpers';

const log = createLogger('useWorkItemDetailData');

export const NO_WORK_ITEM_ID = 'No work item ID provided';
export const LOAD_FAILED = 'Failed to load work item';

// ---- Pure helpers ----

function lastSegment(path: unknown): string | undefined {
  const p = String(path ?? '');
  return p ? (p.split(/[\\/]/).pop() ?? p) : undefined;
}

/** "5m", "3h", "2d" since `iso`; undefined when it is not a date string. */
export function changedAgo(iso: unknown, now = Date.now()): string | undefined {
  if (typeof iso !== 'string') return undefined;
  const seconds = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/** The ADO web URL of a work item: its own `htmlUrl`, else built from the org and project. */
export function workItemWebUrl(
  item: WorkItem,
  ado: Pick<AzureDevOpsSettings, 'organization' | 'project'>,
): string {
  return (
    item.htmlUrl ||
    `https://dev.azure.com/${encodeURIComponent(ado.organization)}/${encodeURIComponent(ado.project)}/_workitems/edit/${item.id}`
  );
}

/** A work item as the detail panel shows it. */
export function toWorkItemDetailData(
  item: WorkItem,
  ado: Pick<AzureDevOpsSettings, 'organization' | 'project'>,
): WorkItemDetailData {
  const f = item.fields;
  return {
    id: item.id,
    title: getField(item, 'System.Title'),
    state: getField(item, 'System.State'),
    workItemType: getField(item, 'System.WorkItemType'),
    assignedTo: getField(item, 'System.AssignedTo'),
    priority: Number(f['Microsoft.VSTS.Common.Priority']) || undefined,
    tags: getField(item, 'System.Tags'),
    htmlUrl: workItemWebUrl(item, ado),
    isNewItem: false,
    severity:
      typeof f['Microsoft.VSTS.Common.Severity'] === 'string'
        ? f['Microsoft.VSTS.Common.Severity']
        : undefined,
    reporter: getField(item, 'System.CreatedBy'),
    iteration: lastSegment(f['System.IterationPath']),
    area: lastSegment(f['System.AreaPath']),
    backlogPriority:
      (f['Microsoft.VSTS.Common.BacklogPriority'] as number | string | undefined) ?? undefined,
    foundIn:
      typeof f['Microsoft.VSTS.Build.FoundIn'] === 'string'
        ? f['Microsoft.VSTS.Build.FoundIn']
        : undefined,
    changedAgo: changedAgo(f['System.ChangedDate']),
    linkedPRs: parseLinkedPRs(item.relations),
  };
}

/**
 * The JSON-patch operations that take `item` to `updates`. The panel sends
 * only the last segment of the iteration path; a value without a slash
 * replaces that segment, one with a slash is taken as a full path.
 */
export function workItemPatch(item: WorkItem, updates: WorkItemFieldUpdates): JsonPatchOperation[] {
  const ops: JsonPatchOperation[] = [];
  const replace = (field: string, value: unknown) =>
    ops.push({ op: 'replace', path: `/fields/${field}`, value });
  if (updates.title !== getField(item, 'System.Title')) replace('System.Title', updates.title);
  if (updates.state !== getField(item, 'System.State')) replace('System.State', updates.state);
  if (updates.assignedTo !== getField(item, 'System.AssignedTo'))
    replace('System.AssignedTo', updates.assignedTo);
  if (updates.priority !== (Number(item.fields['Microsoft.VSTS.Common.Priority']) || undefined))
    replace('Microsoft.VSTS.Common.Priority', updates.priority ?? '');
  if (updates.tags !== getField(item, 'System.Tags')) replace('System.Tags', updates.tags);
  if (updates.iteration !== undefined) {
    const currentPath = String(item.fields['System.IterationPath'] ?? '');
    const currentSeg = currentPath ? (currentPath.split(/[\\/]/).pop() ?? '') : '';
    if (updates.iteration !== currentSeg) {
      const fullPath = /[\\/]/.test(updates.iteration)
        ? updates.iteration
        : currentPath
          ? currentPath.replace(/[^\\/]+$/, updates.iteration)
          : updates.iteration;
      replace('System.IterationPath', fullPath);
    }
  }
  return ops;
}

function clientFor(ado: AzureDevOpsSettings | null): AdoClient | null {
  if (!ado?.organization) return null;
  if (ado.authMethod !== 'azCli' && !ado.personalAccessToken) return null;
  return new AdoClient(
    ado.organization,
    ado.project,
    ado.personalAccessToken ?? '',
    ado.authMethod,
  );
}

/**
 * Loads the process layout of a work item type into the work-items store
 * (once per type per session), which drives the detail panel's extra tabs.
 * Failures leave the layout `null`: the panel falls back to one Overview tab.
 */
async function ensureTypeLayout(client: AdoClient, project: string, wit: string): Promise<void> {
  const store = useWorkItemsStore.getState();
  if (store.workItemTypeLayouts.has(wit)) return;
  let processId = store.processId;
  if (!store.processIdResolved) {
    processId = await getProjectProcessId(client, project);
    useWorkItemsStore.getState().setProcessId(processId);
    useWorkItemsStore.getState().setProcessIdResolved(true);
  }
  if (!processId) {
    useWorkItemsStore.getState().setWorkItemTypeLayout(wit, null);
    return;
  }
  let refs = useWorkItemsStore.getState().witTypeRefs;
  if (refs.size === 0) {
    refs = await getProcessWitTypeRefs(client, processId);
    useWorkItemsStore.getState().setWitTypeRefs(refs);
  }
  const ref = refs.get(wit);
  if (!ref) {
    useWorkItemsStore.getState().setWorkItemTypeLayout(wit, null);
    return;
  }
  const layout = await getProcessLayout(client, processId, ref);
  useWorkItemsStore.getState().setWorkItemTypeLayout(wit, layout);
}

// ---- Image auth (pop-out) ----

async function replaceAdoImageUrls(html: string, pat: string): Promise<string> {
  const authHeader = `Basic ${btoa(`:${pat}`)}`;
  const imgRegex = /(<img[^>]+src=["'])([^"']*(?:dev\.azure\.com|visualstudio\.com)[^"']*)(["'])/gi;
  const matches = [...html.matchAll(imgRegex)];
  if (matches.length === 0) return html;
  let result = html;
  for (const match of matches) {
    const url = match[2]!;
    try {
      const response = await fetch(url, { headers: { Authorization: authHeader } });
      if (!response.ok) continue;
      const blobUrl = URL.createObjectURL(await response.blob());
      result = result.replace(url, blobUrl);
    } catch {
      // Leave the original URL.
    }
  }
  return result;
}

async function processFieldImages(
  fields: DynamicFieldItem[],
  pat: string,
): Promise<DynamicFieldItem[]> {
  const processed: DynamicFieldItem[] = [];
  for (const field of fields) {
    if (field.isHtml && field.htmlContent) {
      processed.push({ ...field, htmlContent: await replaceAdoImageUrls(field.htmlContent, pat) });
    } else {
      processed.push(field);
    }
  }
  return processed;
}

// ---- The hook ----

export interface UseWorkItemDetailDataOptions {
  /**
   * Runs before each load and returns the Azure DevOps settings to use. The
   * pop-out window has its own stores, so it loads the settings, fills its
   * settings store and applies its theme here. Without it the hook reads the
   * main window's settings store.
   */
  prepare?: () => Promise<AzureDevOpsSettings>;
  /** Called with each freshly loaded item (the pop-out titles its window). */
  onLoaded?: (item: WorkItem) => void;
  /** Inline the ADO images of rich-text fields with the PAT (the pop-out). */
  resolveImages?: boolean;
}

export interface WorkItemDetailDataResult {
  workItem: WorkItem | null;
  /** The item as the panel shows it; null until there is one. */
  detailData: WorkItemDetailData | null;
  richText: DynamicFieldItem[];
  standard: DynamicFieldItem[];
  custom: DynamicFieldItem[];
  extraTabs?: ProcessTab[];
  detailsFieldKeys?: string[];
  attachments: WorkItemAttachment[];
  availableStates: string[];
  comments: WorkItemComment[];
  isLoadingComments: boolean;
  /** True until the first load settled, unless the item came from the store. */
  isLoading: boolean;
  statusText?: string;
  error: string | null;
  /** A client for the item's organisation, or null without credentials. */
  getClient: () => AdoClient | null;
  save: (updates: WorkItemFieldUpdates) => Promise<void>;
  /** Deletes the item; true when it is gone. */
  remove: () => Promise<boolean>;
  addComment: (text: string) => Promise<void>;
  openInBrowser: (url: string) => Promise<void>;
  /** Saves an attachment through a download link (the main window). */
  downloadAttachment: (attachment: WorkItemAttachment) => Promise<void>;
}

const EMPTY_FIELDS: Record<'richText' | 'standard' | 'custom', DynamicFieldItem[]> = {
  richText: [],
  standard: [],
  custom: [],
};

/**
 * useWorkItemDetailData — a work item and everything its detail panel needs,
 * for the full-screen `WorkItemDetailView` in the main window and the
 * pop-out `WorkItemDetailApp` (plans/ui-overhaul-workbench.md, phase 5; the
 * work item counterpart of `usePrDetailData`).
 *
 * - When the item is in the work-items store (the list's query results) it
 *   shows at once, with no spinner, and follows the store when a poll brings
 *   a newer revision. The full item, its states and comments load behind it.
 * - Otherwise it loads the item, then the states of its type, the comments,
 *   the project's field definitions and the type's process layout.
 * - Saves and deletes go to ADO and update the store's list, so the list
 *   under the detail view shows the change on Back.
 */
export function useWorkItemDetailData(
  id: number | null,
  options: UseWorkItemDetailDataOptions = {},
): WorkItemDetailDataResult {
  const storeItem = useWorkItemsStore((s) =>
    id === null ? undefined : s.workItems.find((w) => w.id === id),
  );
  const fieldDefinitions = useWorkItemsStore((s) => s.fieldDefinitions);
  const workItemTypeLayouts = useWorkItemsStore((s) => s.workItemTypeLayouts);

  const [workItem, setWorkItem] = useState<WorkItem | null>(storeItem ?? null);
  const [ado, setAdo] = useState<AzureDevOpsSettings | null>(() =>
    options.prepare ? null : useSettingsStore.getState().settings.azureDevOps,
  );
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [processedRichText, setProcessedRichText] = useState<DynamicFieldItem[] | null>(null);
  const [comments, setComments] = useState<WorkItemComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoading, setIsLoading] = useState(storeItem === undefined);
  const [statusText, setStatusText] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const workItemRef = useRef(workItem);
  workItemRef.current = workItem;
  const adoRef = useRef(ado);
  adoRef.current = ado;

  useEffect(() => {
    // Another item (the pop-out's ↑ / ↓): drop everything that belonged to
    // the previous one, so its title, comments or states never show under
    // the new id. The new item shows at once when the list has it.
    if (workItemRef.current && workItemRef.current.id !== id) {
      const seed =
        id === null
          ? null
          : (useWorkItemsStore.getState().workItems.find((w) => w.id === id) ?? null);
      workItemRef.current = seed;
      setWorkItem(seed);
      setIsLoading(seed === null);
    }
    setComments((c) => (c.length === 0 ? c : []));
    setProcessedRichText(null);
    setAvailableStates((s) => (s.length === 0 ? s : []));
    setStatusText(undefined);
    setError(null);

    let cancelled = false;
    (async () => {
      try {
        const { prepare, onLoaded, resolveImages } = optionsRef.current;
        const settings = prepare
          ? await prepare()
          : useSettingsStore.getState().settings.azureDevOps;
        if (cancelled) return;
        setAdo(settings);

        if (!id) {
          setError(NO_WORK_ITEM_ID);
          return;
        }

        const client = clientFor(settings);
        if (!client) {
          if (!workItemRef.current) setError(LOAD_FAILED);
          return;
        }

        const item = await getWorkItem(client, id);
        if (cancelled) return;
        setWorkItem(item);
        setError(null);
        onLoaded?.(item);

        const itemType = getField(item, 'System.WorkItemType');
        if (itemType) {
          try {
            const states = await getWorkItemTypeStates(client, itemType);
            if (cancelled) return;
            setAvailableStates(states);
          } catch {
            if (cancelled) return;
            setAvailableStates([getField(item, 'System.State')]);
          }
          ensureTypeLayout(client, settings.project, itemType).catch((err) =>
            log.debug('process layout unavailable', { error: String(err) }),
          );
        }

        if (useWorkItemsStore.getState().fieldDefinitions === null) {
          getProjectFields(client)
            .then((fields) => {
              if (!cancelled)
                useWorkItemsStore.getState().setFieldDefinitions(indexFieldsByRef(fields));
            })
            .catch((err) => log.debug('field definitions unavailable', { error: String(err) }));
        }

        setIsLoadingComments(true);
        getWorkItemComments(client, id)
          .then((c) => {
            if (!cancelled) setComments(c);
          })
          .catch((err) => {
            if (!cancelled) log.error('failed to load comments', err, { id });
          })
          .finally(() => {
            if (!cancelled) setIsLoadingComments(false);
          });

        const pat = settings.personalAccessToken;
        if (resolveImages && pat) {
          const { richText } = classifyFields(item, useWorkItemsStore.getState().fieldDefinitions);
          const processed = await processFieldImages(richText, pat);
          if (cancelled) return;
          setProcessedRichText(processed);
        }
      } catch (err) {
        if (cancelled) return;
        log.error('failed to load work item', err, { id });
        if (!workItemRef.current) setError(LOAD_FAILED);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Follow the list: a poll that brings a newer revision of the item shows it.
  useEffect(() => {
    if (!storeItem) return;
    const current = workItemRef.current;
    if (current && current.id === storeItem.id && (current.rev ?? 0) > (storeItem.rev ?? 0)) {
      return;
    }
    if (current === storeItem) return;
    setWorkItem(storeItem);
    setIsLoading(false);
    setError(null);
  }, [storeItem]);

  const getClient = useCallback(() => clientFor(adoRef.current), []);

  /** Put `updated` in the list too, so the row shows it on Back. */
  const syncStore = useCallback((updated: WorkItem) => {
    const store = useWorkItemsStore.getState();
    if (!store.workItems.some((w) => w.id === updated.id)) return;
    store.setWorkItems(store.workItems.map((w) => (w.id === updated.id ? updated : w)));
  }, []);

  const save = useCallback(
    async (updates: WorkItemFieldUpdates) => {
      const item = workItemRef.current;
      const client = getClient();
      if (!item || !client) return;
      setStatusText(undefined);
      const ops = workItemPatch(item, updates);
      if (ops.length === 0) {
        setStatusText('No changes');
        return;
      }
      try {
        const updated = await updateWorkItem(client, item.id, ops);
        setWorkItem(updated);
        syncStore(updated);
        setStatusText('Saved');
      } catch (err) {
        log.error('failed to save work item', err, { id: item.id });
        setStatusText('Save failed');
      }
    },
    [getClient, syncStore],
  );

  const remove = useCallback(async () => {
    const item = workItemRef.current;
    const client = getClient();
    if (!item || !client) return false;
    try {
      await deleteWorkItem(client, item.id);
      const store = useWorkItemsStore.getState();
      store.setWorkItems(store.workItems.filter((w) => w.id !== item.id));
      return true;
    } catch (err) {
      log.error('failed to delete work item', err, { id: item.id });
      setStatusText('Delete failed');
      return false;
    }
  }, [getClient]);

  const addComment = useCallback(
    async (text: string) => {
      const item = workItemRef.current;
      const client = getClient();
      if (!item || !client) return;
      const comment = await addWorkItemComment(client, item.id, text);
      setComments((prev) => [...prev, comment]);
    },
    [getClient],
  );

  const openInBrowser = useCallback(async (url: string) => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch (err) {
      log.error('open in ADO failed', err);
    }
  }, []);

  const saveAttachment = useCallback(
    async (attachment: WorkItemAttachment) => {
      const client = getClient();
      if (!client) return;
      try {
        const blob = await downloadAttachment(client, attachment.id, attachment.fileName);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        log.error('failed to download attachment', err);
      }
    },
    [getClient],
  );

  const detailData = useMemo(
    () => (workItem && ado ? toWorkItemDetailData(workItem, ado) : null),
    [workItem, ado],
  );
  const fields = useMemo(
    () => (workItem ? classifyFields(workItem, fieldDefinitions) : EMPTY_FIELDS),
    [workItem, fieldDefinitions],
  );
  const attachments = useMemo(() => (workItem ? extractAttachments(workItem) : []), [workItem]);
  const layout = useMemo(() => {
    const wit = workItem ? getField(workItem, 'System.WorkItemType') : '';
    return wit ? (workItemTypeLayouts.get(wit) ?? null) : null;
  }, [workItem, workItemTypeLayouts]);

  return {
    workItem,
    detailData,
    richText: processedRichText ?? fields.richText,
    standard: fields.standard,
    custom: fields.custom,
    extraTabs: layout?.extraTabs,
    detailsFieldKeys: layout?.detailsFieldKeys,
    attachments,
    availableStates,
    comments,
    isLoadingComments,
    isLoading,
    statusText,
    error,
    getClient,
    save,
    remove,
    addComment,
    openInBrowser,
    downloadAttachment: saveAttachment,
  };
}
