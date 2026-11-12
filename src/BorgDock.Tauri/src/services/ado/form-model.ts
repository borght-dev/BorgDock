import type { WorkItem } from '@/types';
import {
  formatFieldValue,
  friendlyLabel,
  looksLikeHtml,
  RICH_TEXT_FIELDS,
  SKIP_FIELDS,
} from '@/utils/work-item-fields';
import type { AdoFieldMeta, AdoFieldType } from './fields';
import type { LayoutGroup, LayoutGroupKind, LayoutPage, ProcessLayout } from './layout';

/**
 * The work item form as BorgDock draws it, built from the ADO form layout
 * (docs: design/work-item-detail/mockups.html, frame C):
 *
 * - The header facts (state, assignee, priority, iteration, tags) and the
 *   type's own fact live in the header and nowhere else.
 * - Every custom page is a tab. Long-text fields go in the main column in
 *   layout order; the layout's groups become rail groups with ADO's labels.
 * - Links controls are drawn natively; extension groups get a row that opens ADO.
 *
 * Without a layout (no permission, an on-premises process) the form falls back
 * to one Details tab: the long-text fields, then one group of the rest.
 */

/** Fields the header shows; the rail skips them. */
export const HEADER_FIELDS = new Set([
  'System.Title',
  'System.State',
  'System.AssignedTo',
  'Microsoft.VSTS.Common.Priority',
  'System.IterationPath',
  'System.Tags',
]);

/** The type's own header fact: the first of these the type has. */
export const TYPE_FACT_FIELDS = [
  'Microsoft.VSTS.Common.Severity',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.DueDate',
] as const;

/** Bookkeeping fields no form should show, on top of `SKIP_FIELDS`. */
const NOISE_FIELDS = new Set([
  'System.ChangedDate',
  'System.ChangedBy',
  'System.CreatedBy',
  'System.History',
  'System.Parent',
  'System.BoardLane',
  'System.ExternalLinkCount',
  'System.HyperLinkCount',
  'System.AttachedFileCount',
  'System.RelatedLinkCount',
  'System.RemoteLinkCount',
  'Microsoft.VSTS.Common.StateChangeDate',
  'Microsoft.VSTS.Common.ActivatedDate',
  'Microsoft.VSTS.Common.ActivatedBy',
  'Microsoft.VSTS.Common.ResolvedDate',
  'Microsoft.VSTS.Common.ResolvedBy',
  'Microsoft.VSTS.Common.ResolvedReason',
  'Microsoft.VSTS.Common.ClosedDate',
  'Microsoft.VSTS.Common.ClosedBy',
]);

/** The fallback order of well-known long-text fields. */
const HTML_ORDER = [
  'System.Description',
  'Microsoft.VSTS.TCM.ReproSteps',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.TCM.SystemInfo',
];

export interface FormField {
  key: string;
  label: string;
  type: AdoFieldType | 'unknown';
  /** The raw ADO value; `undefined` when the item doesn't carry the field. */
  value: unknown;
  /** The value as text; '' when empty. */
  text: string;
  readOnly: boolean;
  /** A field the team added (`Custom.*`), not one of ADO's. */
  custom: boolean;
}

export interface HtmlBlock {
  key: string;
  label: string;
  html: string;
  custom: boolean;
}

export interface FormGroup {
  id: string;
  label: string;
  kind: LayoutGroupKind;
  custom: boolean;
  fields: FormField[];
  /** Fields of the group without a value; the rail folds them. */
  empty: FormField[];
}

export interface FormTab {
  /** `details` for the first page, the page id for the others. */
  id: string;
  label: string;
  html: HtmlBlock[];
  /** Short fields that sit in the wide column; drawn as a grid under the long text. */
  plain: FormField[];
  /** Long-text fields of the layout without a value, offered as "+ Add". */
  emptyHtml: FormField[];
  groups: FormGroup[];
}

export interface FormModel {
  /** The type's own header fact (Severity on a Bug, Effort on a PBI), when it has one. */
  typeFact: FormField | null;
  tabs: FormTab[];
  /** Built from ADO's layout, not the fallback. */
  fromLayout: boolean;
}

type FieldDefs = Map<string, AdoFieldMeta> | null | undefined;

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function fieldType(key: string, defs: FieldDefs): AdoFieldType | 'unknown' {
  return defs?.get(key)?.type ?? 'unknown';
}

/** A long-text field: ADO says html, or (without metadata) a known one or one holding markup. */
export function isHtmlField(key: string, value: unknown, defs: FieldDefs): boolean {
  const meta = defs?.get(key);
  if (meta) return meta.type === 'html';
  if (RICH_TEXT_FIELDS.has(key) && key !== 'System.History') return true;
  return typeof value === 'string' && looksLikeHtml(value);
}

export function toFormField(
  item: WorkItem,
  key: string,
  defs: FieldDefs,
  label = '',
  readOnly = false,
): FormField {
  const value = item.fields[key];
  const meta = defs?.get(key);
  return {
    key,
    label: label || meta?.name || friendlyLabel(key),
    type: fieldType(key, defs),
    value,
    text: isEmptyValue(value) ? '' : (formatFieldValue(value) ?? ''),
    readOnly: readOnly || !!meta?.readOnly,
    custom: key.startsWith('Custom.'),
  };
}

function hasValue(field: FormField): boolean {
  return !isEmptyValue(field.value) && field.text !== '';
}

/** The first of `TYPE_FACT_FIELDS` the type has, by its layout or else by the item's fields. */
export function typeFactKey(item: WorkItem, layout: ProcessLayout | null): string | null {
  if (layout && layout.pages.length > 0) {
    const inLayout = new Set(
      layout.pages.flatMap((page) =>
        page.sections.flatMap((s) => s.groups.flatMap((g) => g.controls.map((c) => c.id))),
      ),
    );
    return TYPE_FACT_FIELDS.find((key) => inLayout.has(key)) ?? null;
  }
  return TYPE_FACT_FIELDS.find((key) => !isEmptyValue(item.fields[key])) ?? null;
}

function shownInRail(key: string, factKey: string | null): boolean {
  return !HEADER_FIELDS.has(key) && key !== factKey && !NOISE_FIELDS.has(key);
}

function groupFromLayout(
  item: WorkItem,
  group: LayoutGroup,
  defs: FieldDefs,
  factKey: string | null,
): FormGroup | null {
  if (group.kind !== 'fields') {
    return {
      id: group.id,
      label: group.label,
      kind: group.kind,
      custom: group.custom,
      fields: [],
      empty: [],
    };
  }
  const fields: FormField[] = [];
  const empty: FormField[] = [];
  for (const control of group.controls) {
    if (control.kind !== 'field' || !shownInRail(control.id, factKey)) continue;
    const field = toFormField(item, control.id, defs, control.label, control.readOnly);
    (hasValue(field) ? fields : empty).push(field);
  }
  if (fields.length === 0 && empty.length === 0) return null;
  return {
    id: group.id,
    label: group.label,
    kind: 'fields',
    custom: group.custom,
    fields,
    empty,
  };
}

function tabFromPage(
  item: WorkItem,
  page: LayoutPage,
  index: number,
  defs: FieldDefs,
  factKey: string | null,
): FormTab {
  const tab: FormTab = {
    id: index === 0 ? 'details' : page.id,
    label: index === 0 ? 'Details' : page.label,
    html: [],
    plain: [],
    emptyHtml: [],
    groups: [],
  };
  page.sections.forEach((section, sectionIndex) => {
    const wide = sectionIndex === 0;
    for (const group of section.groups) {
      // Long-text fields go in the main column wherever the layout put them.
      const rest: LayoutGroup = { ...group, controls: [] };
      for (const control of group.controls) {
        const value = item.fields[control.id];
        const html =
          control.controlType.toLowerCase() === 'htmlfieldcontrol' ||
          isHtmlField(control.id, value, defs);
        if (control.kind === 'field' && html) {
          // ADO gives a long-text field its own group; that group's label names it.
          const label =
            control.label || (group.controls.length === 1 ? group.label : '') || undefined;
          const field = toFormField(item, control.id, defs, label, control.readOnly);
          if (isEmptyValue(value)) tab.emptyHtml.push(field);
          else
            tab.html.push({
              key: field.key,
              label: field.label,
              html: String(value),
              custom: field.custom,
            });
        } else {
          rest.controls.push(control);
        }
      }
      if (group.kind === 'fields' && rest.controls.length === 0) continue;
      if (wide && group.kind === 'fields') {
        for (const control of rest.controls) {
          if (control.kind !== 'field' || !shownInRail(control.id, factKey)) continue;
          const field = toFormField(item, control.id, defs, control.label, control.readOnly);
          if (hasValue(field)) tab.plain.push(field);
        }
        continue;
      }
      const formGroup = groupFromLayout(item, rest, defs, factKey);
      if (formGroup) tab.groups.push(formGroup);
    }
  });
  return tab;
}

function hasDevelopmentLinks(item: WorkItem): boolean {
  return (item.relations ?? []).some(
    (r) =>
      r.rel === 'ArtifactLink' &&
      /^vstfs:\/\/\/(Git|GitHub)\/(PullRequest|Ref|Commit|Branch)/i.test(r.url),
  );
}

function hasRelatedLinks(item: WorkItem): boolean {
  return (item.relations ?? []).some((r) => r.rel.startsWith('System.LinkTypes.'));
}

function fallbackModel(item: WorkItem, defs: FieldDefs): FormModel {
  const factKey = typeFactKey(item, null);
  const html: HtmlBlock[] = [];
  const fields: FormField[] = [];
  for (const [key, value] of Object.entries(item.fields)) {
    if (SKIP_FIELDS.has(key) || isEmptyValue(value)) continue;
    if (isHtmlField(key, value, defs)) {
      if (key === 'System.History') continue;
      const field = toFormField(item, key, defs);
      html.push({ key, label: field.label, html: String(value), custom: field.custom });
      continue;
    }
    if (!shownInRail(key, factKey)) continue;
    const field = toFormField(item, key, defs);
    if (hasValue(field)) fields.push(field);
  }
  const rank = (key: string) => {
    const i = HTML_ORDER.indexOf(key);
    return i === -1 ? HTML_ORDER.length : i;
  };
  html.sort((a, b) => rank(a.key) - rank(b.key));

  const groups: FormGroup[] = [];
  if (fields.length > 0) {
    groups.push({
      id: 'details',
      label: 'Details',
      kind: 'fields',
      custom: false,
      fields,
      empty: [],
    });
  }
  if (hasDevelopmentLinks(item)) {
    groups.push({
      id: 'development',
      label: 'Development',
      kind: 'development',
      custom: false,
      fields: [],
      empty: [],
    });
  }
  if (hasRelatedLinks(item)) {
    groups.push({
      id: 'related',
      label: 'Related Work',
      kind: 'related',
      custom: false,
      fields: [],
      empty: [],
    });
  }
  return {
    typeFact: factKey ? toFormField(item, factKey, defs) : null,
    tabs: [{ id: 'details', label: 'Details', html, plain: [], emptyHtml: [], groups }],
    fromLayout: false,
  };
}

/** The form of `item`: its layout's pages and groups, or the fallback without one. */
export function buildFormModel(
  item: WorkItem,
  layout: ProcessLayout | null | undefined,
  defs: FieldDefs,
): FormModel {
  if (!layout || layout.pages.length === 0) return fallbackModel(item, defs);
  const factKey = typeFactKey(item, layout);
  const tabs = layout.pages
    .map((page, index) => tabFromPage(item, page, index, defs, factKey))
    .filter(
      (tab, index) =>
        index === 0 || tab.html.length > 0 || tab.plain.length > 0 || tab.groups.length > 0,
    );
  return {
    typeFact: factKey ? toFormField(item, factKey, defs) : null,
    tabs,
    fromLayout: true,
  };
}
