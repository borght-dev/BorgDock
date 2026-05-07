import type { AdoFieldMeta } from '@/services/ado/fields';
import type { DynamicFieldItem, WorkItem, WorkItemAttachment } from '@/types';

// ---- Rich text / standard / custom field classification ----

// Fallback list used when ADO field metadata isn't loaded yet.
// Once metadata arrives the `type === 'html' | 'history'` check supersedes this.
export const RICH_TEXT_FIELDS = new Set([
  'System.Description',
  'Microsoft.VSTS.TCM.ReproSteps',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'System.History',
]);

// Fields already shown in the header/form or that are noise
export const SKIP_FIELDS = new Set([
  'System.Id',
  'System.Rev',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.Tags',
  'Microsoft.VSTS.Common.Priority',
  'System.CreatedDate',
  'System.AreaId',
  'System.IterationId',
  'System.NodeName',
  'System.TeamProject',
  'System.Watermark',
  'System.CommentCount',
  'System.BoardColumn',
  'System.BoardColumnDone',
  'System.AuthorizedDate',
  'System.RevisedDate',
  'System.PersonId',
  'System.IsDeleted',
  'System.Reason',
]);

/** Format an ISO date string to a human-readable form, or return null if not a date. */
export function tryFormatDate(value: string): string | null {
  // Only attempt if it looks like an ISO date (e.g. 2026-03-13T07:46:03.1Z)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Extract a display string from an ADO field value that may be a primitive, object, or array. */
export function formatFieldValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  // Identity objects: { displayName, uniqueName, ... }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.uniqueName === 'string') return obj.uniqueName;
    // Skip unrecognised objects entirely
    return null;
  }

  if (Array.isArray(value)) {
    return (
      value
        .map((v) => formatFieldValue(v))
        .filter(Boolean)
        .join(', ') || null
    );
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  const str = String(value);
  // Try to format as date
  const dateStr = tryFormatDate(str);
  if (dateStr) return dateStr;

  return str;
}

/** Detect whether a string value contains HTML tags. */
export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** Make a human-friendly label from a field reference name. */
export function friendlyLabel(key: string): string {
  const last = key.split('.').pop() ?? key;
  // Insert spaces before capitals: "StateChangeDate" → "State Change Date"
  return last.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function isHtmlType(meta: AdoFieldMeta | undefined): boolean {
  if (!meta) return false;
  return meta.type === 'html' || meta.type === 'history';
}

function isCustomRef(refName: string): boolean {
  return (
    refName.startsWith('Custom.') ||
    refName.startsWith('Microsoft.VSTS.CMMI.') ||
    (!refName.startsWith('System.') && !refName.startsWith('Microsoft.VSTS.'))
  );
}

export function classifyFields(
  item: WorkItem,
  fieldDefinitions?: Map<string, AdoFieldMeta> | null,
): {
  richText: DynamicFieldItem[];
  standard: DynamicFieldItem[];
  custom: DynamicFieldItem[];
} {
  const richText: DynamicFieldItem[] = [];
  const standard: DynamicFieldItem[] = [];
  const custom: DynamicFieldItem[] = [];

  const labelFor = (key: string) => fieldDefinitions?.get(key)?.name ?? friendlyLabel(key);

  for (const [key, value] of Object.entries(item.fields)) {
    if (SKIP_FIELDS.has(key)) continue;

    const meta = fieldDefinitions?.get(key);
    const isKnownHtml = isHtmlType(meta) || (!meta && RICH_TEXT_FIELDS.has(key));
    const label = labelFor(key);

    // Handle known rich-text fields
    if (isKnownHtml) {
      const strValue = typeof value === 'string' ? value : '';
      if (!strValue) continue;
      richText.push({
        fieldKey: key,
        label,
        isHtml: true,
        htmlContent: strValue,
        section: 'richText',
      });
      continue;
    }

    // Format the value
    const formatted = formatFieldValue(value);
    if (!formatted) continue;

    // Detect HTML in string values when metadata isn't available
    if (!meta && typeof value === 'string' && looksLikeHtml(value)) {
      richText.push({
        fieldKey: key,
        label,
        isHtml: true,
        htmlContent: formatted,
        section: 'richText',
      });
      continue;
    }

    const field: DynamicFieldItem = {
      fieldKey: key,
      label,
      value: formatted,
      isHtml: false,
      section: isCustomRef(key) ? 'custom' : 'standard',
    };

    if (isCustomRef(key)) {
      custom.push(field);
    } else {
      standard.push(field);
    }
  }

  return { richText, standard, custom };
}

export function extractAttachments(item: WorkItem): WorkItemAttachment[] {
  if (!item.relations) return [];
  return item.relations
    .filter((r) => r.rel === 'AttachedFile')
    .map((r) => ({
      id: String(r.attributes.id ?? r.url.split('/').pop() ?? ''),
      fileName: String(r.attributes.name ?? 'attachment'),
      size: Number(r.attributes.resourceSize ?? 0),
      url: r.url,
    }));
}
