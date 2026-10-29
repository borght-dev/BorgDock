import { htmlToText } from '@/services/dispatch/item-text';
import type { WorkItem } from '@/types';
import { getField } from '@/utils/work-item-helpers';

/** What the AB# hover card shows of a work item. */
export interface WorkItemPeek {
  id: number;
  type: string;
  state: string;
  title: string;
  assignee: string | null;
  /** The last segment of the iteration path ("Sprint 2026-22"); null at the project root. */
  iteration: string | null;
  priority: number | null;
  /** Story points or effort, whichever the process has. */
  points: number | null;
  /** Plain text of the description, or of the repro steps for a bug without one. */
  description: string;
  changedAt: string | null;
  changedBy: string | null;
}

function numberField(item: WorkItem, field: string): number | null {
  const value = Number(item.fields[field]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The iteration's own name; null when the item sits at the project's root iteration. */
function iterationName(path: string): string | null {
  const parts = path.split('\\').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : null;
}

export function workItemPeekOf(item: WorkItem): WorkItemPeek {
  const description =
    htmlToText(getField(item, 'System.Description')) ||
    htmlToText(getField(item, 'Microsoft.VSTS.TCM.ReproSteps'));
  return {
    id: item.id,
    type: getField(item, 'System.WorkItemType'),
    state: getField(item, 'System.State'),
    title: getField(item, 'System.Title'),
    assignee: getField(item, 'System.AssignedTo') || null,
    iteration: iterationName(getField(item, 'System.IterationPath')),
    priority: numberField(item, 'Microsoft.VSTS.Common.Priority'),
    points:
      numberField(item, 'Microsoft.VSTS.Scheduling.StoryPoints') ??
      numberField(item, 'Microsoft.VSTS.Scheduling.Effort'),
    description,
    changedAt: getField(item, 'System.ChangedDate') || null,
    changedBy: getField(item, 'System.ChangedBy') || null,
  };
}

/**
 * The href `rehypeWorkItemRefs` gives a plain `AB#123`. rehype-sanitize may
 * prefix in-page anchors with `user-content-`, so the reader accepts both.
 */
export const WORK_ITEM_REF_HREF_PREFIX = '#bd-ab-';

const ADO_EDIT_URL = /\/_workitems\/edit\/(\d+)(?:[/?#]|$)/i;
const REF_HREF = /^#(?:user-content-)?bd-ab-(\d+)$/;

/** The work item a link points at: an ADO work item URL or an `AB#` reference; null for anything else. */
export function workItemIdFromHref(href: string | undefined): number | null {
  if (!href) return null;
  const match = REF_HREF.exec(href) ?? ADO_EDIT_URL.exec(href);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** An ADO web link, as opposed to the in-page anchor of a plain `AB#` reference. */
export function isWebHref(href: string | undefined): href is string {
  return !!href && /^https?:/i.test(href);
}

interface HtmlNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
}

const AB_REF = /\bAB#(\d+)\b/gi;
/** Elements whose text never becomes a link: links already, and code. */
const LEAVE_ALONE = new Set(['a', 'code', 'pre', 'script', 'style', 'textarea']);

function splitText(value: string): HtmlNode[] | null {
  const parts: HtmlNode[] = [];
  let last = 0;
  for (const match of value.matchAll(AB_REF)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: 'text', value: value.slice(last, start) });
    parts.push({
      type: 'element',
      tagName: 'a',
      properties: { href: `${WORK_ITEM_REF_HREF_PREFIX}${match[1]}` },
      children: [{ type: 'text', value: match[0] }],
    });
    last = start + match[0].length;
  }
  if (parts.length === 0) return null;
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
  return parts;
}

function linkRefs(node: HtmlNode): void {
  if (!node.children || LEAVE_ALONE.has(node.tagName ?? '')) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && child.value) return splitText(child.value) ?? [child];
    linkRefs(child);
    return [child];
  });
}

/**
 * Rehype plugin: every plain-text `AB#123` becomes a link the markdown
 * renderer shows as a work item reference. It runs on the HTML tree, after
 * `rehype-raw`, so text inside raw HTML (tables, `<details>`) counts too.
 */
export function rehypeWorkItemRefs() {
  return (tree: HtmlNode) => linkRefs(tree);
}
