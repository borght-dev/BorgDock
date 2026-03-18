import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AdoClient } from '@/services/ado/client';
import { getWorkItem, getWorkItemTypeStates, updateWorkItem, deleteWorkItem } from '@/services/ado/workitems';
import {
  WorkItemDetailPanel,
  type WorkItemDetailData,
  type WorkItemFieldUpdates,
} from './WorkItemDetailPanel';
import type { WorkItem, DynamicFieldItem, WorkItemAttachment, JsonPatchOperation } from '@/types';
import type { AppSettings, AzureDevOpsSettings } from '@/types/settings';
import { useSettingsStore } from '@/stores/settings-store';

// ---- Field helpers (shared with WorkItemsSection) ----

function getField(item: WorkItem, field: string): string {
  const value = item.fields[field];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
    if (typeof obj.uniqueName === 'string') return obj.uniqueName;
  }
  return '';
}

const RICH_TEXT_FIELDS = new Set([
  'System.Description',
  'Microsoft.VSTS.TCM.ReproSteps',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'System.History',
]);

const SKIP_FIELDS = new Set([
  'System.Id', 'System.Rev', 'System.Title', 'System.State',
  'System.WorkItemType', 'System.AssignedTo', 'System.Tags',
  'Microsoft.VSTS.Common.Priority', 'System.CreatedDate',
  'System.AreaId', 'System.IterationId', 'System.NodeName',
  'System.TeamProject', 'System.Watermark', 'System.CommentCount',
  'System.BoardColumn', 'System.BoardColumnDone',
  'System.AuthorizedDate', 'System.RevisedDate', 'System.PersonId',
  'System.IsDeleted', 'System.Reason',
]);

function tryFormatDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatFieldValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.uniqueName === 'string') return obj.uniqueName;
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((v) => formatFieldValue(v)).filter(Boolean).join(', ') || null;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const str = String(value);
  return tryFormatDate(str) ?? str;
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function friendlyLabel(key: string): string {
  const last = key.split('.').pop() ?? key;
  return last.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function classifyFields(item: WorkItem) {
  const richText: DynamicFieldItem[] = [];
  const standard: DynamicFieldItem[] = [];
  const custom: DynamicFieldItem[] = [];

  for (const [key, value] of Object.entries(item.fields)) {
    if (SKIP_FIELDS.has(key)) continue;
    const isKnownHtml = RICH_TEXT_FIELDS.has(key);
    const label = friendlyLabel(key);

    if (isKnownHtml) {
      const strValue = typeof value === 'string' ? value : '';
      if (!strValue) continue;
      richText.push({ fieldKey: key, label, isHtml: true, htmlContent: strValue, section: 'richText' });
      continue;
    }

    const formatted = formatFieldValue(value);
    if (!formatted) continue;

    const isHtml = typeof value === 'string' && looksLikeHtml(value);
    if (isHtml) {
      richText.push({ fieldKey: key, label, isHtml: true, htmlContent: formatted, section: 'richText' });
      continue;
    }

    if (key.startsWith('Custom.') || key.startsWith('Microsoft.VSTS.CMMI.')) {
      custom.push({ fieldKey: key, label, value: formatted, isHtml: false, section: 'custom' });
    } else {
      standard.push({ fieldKey: key, label, value: formatted, isHtml: false, section: 'standard' });
    }
  }

  return { richText, standard, custom };
}

function extractAttachments(item: WorkItem): WorkItemAttachment[] {
  if (!item.relations) return [];
  return item.relations
    .filter((r) => r.rel === 'AttachedFile')
    .map((r) => ({
      id: String(r.attributes['id'] ?? r.url.split('/').pop() ?? ''),
      fileName: String(r.attributes['name'] ?? 'attachment'),
      size: Number(r.attributes['resourceSize'] ?? 0),
      url: r.url,
    }));
}

// ---- Image auth ----

async function replaceAdoImageUrls(html: string, pat: string): Promise<string> {
  const authHeader = 'Basic ' + btoa(':' + pat);
  // Match img src attributes pointing to ADO
  const imgRegex = /(<img[^>]+src=["'])([^"']*(?:dev\.azure\.com|visualstudio\.com)[^"']*)(["'])/gi;
  const matches = [...html.matchAll(imgRegex)];
  if (matches.length === 0) return html;

  let result = html;
  for (const match of matches) {
    const url = match[2]!;
    try {
      const response = await fetch(url, { headers: { Authorization: authHeader } });
      if (!response.ok) continue;
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      result = result.replace(url, blobUrl);
    } catch {
      // leave original URL
    }
  }
  return result;
}

async function processFieldImages(fields: DynamicFieldItem[], pat: string): Promise<DynamicFieldItem[]> {
  const processed: DynamicFieldItem[] = [];
  for (const field of fields) {
    if (field.isHtml && field.htmlContent) {
      const newHtml = await replaceAdoImageUrls(field.htmlContent, pat);
      processed.push({ ...field, htmlContent: newHtml });
    } else {
      processed.push(field);
    }
  }
  return processed;
}

// ---- Component ----

export function WorkItemDetailApp() {
  const [adoSettings, setAdoSettings] = useState<AzureDevOpsSettings | null>(null);
  const [workItem, setWorkItem] = useState<WorkItem | null>(null);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [processedRichText, setProcessedRichText] = useState<DynamicFieldItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  // Get work item ID from URL search params
  const workItemId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return Number(params.get('id')) || null;
  }, []);

  const getClient = useCallback(() => {
    if (!adoSettings) return null;
    return new AdoClient(
      adoSettings.organization,
      adoSettings.project,
      adoSettings.personalAccessToken ?? '',
    );
  }, [adoSettings]);

  // Load settings and work item
  useEffect(() => {
    (async () => {
      try {
        const settings = await invoke<AppSettings>('load_settings');
        setAdoSettings(settings.azureDevOps);
        // Populate the settings store so useAdoImageAuth can read the PAT
        useSettingsStore.setState({ settings, isLoading: false });

        // Apply theme
        const t = settings.ui?.theme ?? 'system';
        const isDark = t === 'dark' ||
          (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', isDark);

        if (!workItemId) {
          setError('No work item ID provided');
          setIsLoading(false);
          return;
        }

        const ado = settings.azureDevOps;
        const client = new AdoClient(ado.organization, ado.project, ado.personalAccessToken ?? '');

        const item = await getWorkItem(client, workItemId);
        setWorkItem(item);

        // Set window title
        const title = getField(item, 'System.Title');
        getCurrentWindow().setTitle(`#${workItemId} - ${title}`).catch(() => {});

        // Load available states
        const itemType = getField(item, 'System.WorkItemType');
        if (itemType) {
          try {
            const states = await getWorkItemTypeStates(client, itemType);
            setAvailableStates(states);
          } catch {
            setAvailableStates([getField(item, 'System.State')]);
          }
        }

        // Pre-process rich text images with ADO auth
        const pat = ado.personalAccessToken;
        if (pat) {
          const { richText } = classifyFields(item);
          const processed = await processFieldImages(richText, pat);
          setProcessedRichText(processed);
        }
      } catch (err) {
        console.error('Failed to load work item:', err);
        setError('Failed to load work item');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [workItemId]);

  const handleSave = useCallback(
    async (updates: WorkItemFieldUpdates) => {
      if (!workItemId || !workItem) return;
      const client = getClient();
      if (!client) return;

      setIsSaving(true);
      setStatusText(undefined);

      const operations: JsonPatchOperation[] = [];
      if (updates.title !== getField(workItem, 'System.Title'))
        operations.push({ op: 'replace', path: '/fields/System.Title', value: updates.title });
      if (updates.state !== getField(workItem, 'System.State'))
        operations.push({ op: 'replace', path: '/fields/System.State', value: updates.state });
      if (updates.assignedTo !== getField(workItem, 'System.AssignedTo'))
        operations.push({ op: 'replace', path: '/fields/System.AssignedTo', value: updates.assignedTo });
      if (updates.priority !== (Number(workItem.fields['Microsoft.VSTS.Common.Priority']) || undefined))
        operations.push({ op: 'replace', path: '/fields/Microsoft.VSTS.Common.Priority', value: updates.priority ?? '' });
      if (updates.tags !== getField(workItem, 'System.Tags'))
        operations.push({ op: 'replace', path: '/fields/System.Tags', value: updates.tags });

      if (operations.length === 0) {
        setStatusText('No changes');
        setIsSaving(false);
        return;
      }

      try {
        const updated = await updateWorkItem(client, workItemId, operations);
        setWorkItem(updated);
        setStatusText('Saved');
      } catch (err) {
        console.error('Failed to save:', err);
        setStatusText('Save failed');
      } finally {
        setIsSaving(false);
      }
    },
    [workItemId, workItem, getClient],
  );

  const handleDelete = useCallback(async () => {
    if (!workItemId) return;
    const client = getClient();
    if (!client) return;

    setIsSaving(true);
    try {
      await deleteWorkItem(client, workItemId);
      getCurrentWindow().close().catch(() => {});
    } catch (err) {
      console.error('Failed to delete:', err);
      setStatusText('Delete failed');
    } finally {
      setIsSaving(false);
    }
  }, [workItemId, getClient]);

  const handleClose = useCallback(() => {
    getCurrentWindow().close().catch(() => {});
  }, []);

  const handleOpenInBrowser = useCallback(async (url: string) => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  }, []);

  const handleDownloadAttachment = useCallback(
    async (attachment: WorkItemAttachment) => {
      const client = getClient();
      if (!client) return;
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const savePath = await save({ defaultPath: attachment.fileName });
        if (!savePath) return;

        const blob = await client.getStream(
          `wit/attachments/${attachment.id}?fileName=${encodeURIComponent(attachment.fileName)}`,
        );
        const buffer = await blob.arrayBuffer();
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        await writeFile(savePath, new Uint8Array(buffer));
      } catch (err) {
        console.error('Failed to download:', err);
      }
    },
    [getClient],
  );

  // Derived data
  const detailData: WorkItemDetailData | null = useMemo(() => {
    if (!workItem || !adoSettings) return null;
    const htmlUrl =
      workItem.htmlUrl ||
      `https://dev.azure.com/${encodeURIComponent(adoSettings.organization)}/${encodeURIComponent(adoSettings.project)}/_workitems/edit/${workItem.id}`;
    return {
      id: workItem.id,
      title: getField(workItem, 'System.Title'),
      state: getField(workItem, 'System.State'),
      workItemType: getField(workItem, 'System.WorkItemType'),
      assignedTo: getField(workItem, 'System.AssignedTo'),
      priority: Number(workItem.fields['Microsoft.VSTS.Common.Priority']) || undefined,
      tags: getField(workItem, 'System.Tags'),
      htmlUrl,
      isNewItem: false,
    };
  }, [workItem, adoSettings]);

  const { richText, standard, custom } = useMemo(() => {
    if (!workItem) return { richText: [] as DynamicFieldItem[], standard: [] as DynamicFieldItem[], custom: [] as DynamicFieldItem[] };
    return classifyFields(workItem);
  }, [workItem]);

  const attachments = useMemo(() => {
    if (!workItem) return [];
    return extractAttachments(workItem);
  }, [workItem]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{error}</p>
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  return (
    <div className="h-screen" style={{ backgroundColor: 'var(--color-surface)' }}>
      <WorkItemDetailPanel
        item={detailData}
        isLoading={isLoading}
        isSaving={isSaving}
        statusText={statusText}
        availableStates={availableStates}
        richTextFields={processedRichText ?? richText}
        standardFields={standard}
        customFields={custom}
        attachments={attachments}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={handleClose}
        onOpenInBrowser={handleOpenInBrowser}
        onDownloadAttachment={handleDownloadAttachment}
      />
    </div>
  );
}
