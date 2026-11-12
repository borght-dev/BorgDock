import type { AdoClient } from './client';

const PROCESS_LAYOUT_API_VERSION = '7.1-preview.1';

interface ProjectPropertiesResponse {
  count: number;
  value: Array<{ name: string; value: string }>;
}

/**
 * Fetch the project's process template GUID. For Inherited processes
 * this GUID can be used directly with the process-layout endpoint.
 * Returns null if the property is missing or unreadable (e.g. the
 * caller lacks the Read project properties permission).
 */
export async function getProjectProcessId(
  client: AdoClient,
  project: string,
): Promise<string | null> {
  try {
    const response = await client.getOrgLevel<ProjectPropertiesResponse>(
      `projects/${encodeURIComponent(project)}/properties?keys=System.ProcessTemplateType`,
      '7.1-preview.1',
    );
    const entry = response.value?.find((v) => v.name === 'System.ProcessTemplateType');
    return entry?.value ?? null;
  } catch {
    return null;
  }
}

// ---- Per-process work item type reference names ----

interface ProcessWitTypesResponse {
  value: Array<{ name: string; referenceName: string }>;
}

/**
 * For Inherited processes the layout endpoint expects the
 * process-specific reference name (e.g. "MyProcess.Bug") rather than the
 * friendly name returned in System.WorkItemType. This list lets us map
 * one to the other.
 */
export async function getProcessWitTypeRefs(
  client: AdoClient,
  processId: string,
): Promise<Map<string, string>> {
  try {
    const response = await client.getOrgLevel<ProcessWitTypesResponse>(
      `work/processes/${encodeURIComponent(processId)}/workItemTypes`,
      PROCESS_LAYOUT_API_VERSION,
    );
    return new Map((response.value ?? []).map((t) => [t.name, t.referenceName]));
  } catch {
    return new Map();
  }
}

// ---- Process layout ----

interface RawControl {
  id?: string;
  label?: string;
  controlType?: string;
  readOnly?: boolean;
  visible?: boolean;
  isContribution?: boolean;
  /** ADO sends XML options as a string for some controls, an object for others. */
  metadata?: { isContribution?: boolean } | string | null;
}

interface RawGroup {
  id?: string;
  label?: string;
  visible?: boolean;
  inherited?: boolean;
  isContribution?: boolean;
  contribution?: { contributionId?: string } | null;
  controls?: RawControl[];
}

interface RawSection {
  id?: string;
  groups?: RawGroup[];
}

interface RawPage {
  id: string;
  label?: string;
  pageType?: string;
  visible?: boolean;
  sections?: RawSection[];
}

interface ProcessLayoutResponse {
  pages?: RawPage[];
}

/** A field the form shows, a links control, or an extension BorgDock can't draw. */
export type LayoutControlKind = 'field' | 'links' | 'extension';

export interface LayoutControl {
  /** The field reference name for a field control. */
  id: string;
  /** The layout's own label; empty means "use the field's name". */
  label: string;
  kind: LayoutControlKind;
  controlType: string;
  readOnly: boolean;
}

/**
 * `development` and `related` are ADO's links controls (pull requests, branches
 * and commits; parent, children and related items). `extension` is a group
 * contributed by an extension.
 */
export type LayoutGroupKind = 'fields' | 'development' | 'related' | 'extension';

export interface LayoutGroup {
  id: string;
  label: string;
  kind: LayoutGroupKind;
  /** Added by the team's process, not inherited from the system process. */
  custom: boolean;
  controls: LayoutControl[];
}

export interface LayoutSection {
  /** `Section1` is the wide column; later sections are the narrow ones. */
  id: string;
  groups: LayoutGroup[];
}

export interface LayoutPage {
  id: string;
  label: string;
  sections: LayoutSection[];
}

export interface ProcessTab {
  id: string;
  label: string;
  fieldKeys: string[];
}

export interface ProcessLayout {
  /** The custom pages in ADO's order; the first is Details. System pages are left out. */
  pages: LayoutPage[];
  /** Custom pages after Details that bind at least one field. */
  extraTabs: ProcessTab[];
  /** Field reference names that belong to the Details page. */
  detailsFieldKeys: string[];
}

const IGNORED_CONTROL_TYPES = new Set(['labelcontrol', 'htmlcontrol', 'webpagecontrol']);

function isContributionControl(control: RawControl): boolean {
  if (control.isContribution) return true;
  return typeof control.metadata === 'object' && !!control.metadata?.isContribution;
}

function toControl(control: RawControl): LayoutControl | null {
  if (control.visible === false) return null;
  const controlType = control.controlType ?? '';
  const type = controlType.toLowerCase();
  if (IGNORED_CONTROL_TYPES.has(type)) return null;
  const base = { label: control.label?.trim() ?? '', controlType, readOnly: !!control.readOnly };
  if (isContributionControl(control)) {
    return { ...base, id: control.id ?? '', kind: 'extension' };
  }
  if (type === 'linkscontrol') return { ...base, id: control.id ?? '', kind: 'links' };
  // Field-bound controls carry the field's reference name as their id.
  if (!control.id) return null;
  return { ...base, id: control.id, kind: 'field' };
}

function groupKind(group: RawGroup, controls: LayoutControl[]): LayoutGroupKind {
  const label = (group.label ?? '').toLowerCase();
  const contributionId = (group.contribution?.contributionId ?? '').toLowerCase();
  if (label === 'development' || contributionId.includes('development')) return 'development';
  if (group.isContribution) return 'extension';
  if (controls.some((c) => c.kind === 'links')) return 'related';
  if (controls.length > 0 && controls.every((c) => c.kind === 'extension')) return 'extension';
  return 'fields';
}

function toGroup(group: RawGroup, index: number): LayoutGroup | null {
  if (group.visible === false) return null;
  const controls = (group.controls ?? [])
    .map(toControl)
    .filter((c): c is LayoutControl => c !== null);
  const kind = groupKind(group, controls);
  if (kind === 'fields' && controls.length === 0) return null;
  return {
    id: group.id ?? `group-${index}`,
    label: group.label?.trim() ?? '',
    kind,
    custom: group.inherited !== true && !group.isContribution,
    controls,
  };
}

function toPage(page: RawPage): LayoutPage {
  return {
    id: page.id,
    label: page.label?.trim() || 'Untitled',
    sections: (page.sections ?? []).map((section, index) => ({
      id: section.id ?? `Section${index + 1}`,
      groups: (section.groups ?? []).map(toGroup).filter((g): g is LayoutGroup => g !== null),
    })),
  };
}

/** The reference names of the fields a page shows, in layout order. */
export function pageFieldKeys(page: LayoutPage): string[] {
  return page.sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.controls.filter((c) => c.kind === 'field').map((c) => c.id),
    ),
  );
}

function isTabbablePage(page: RawPage): boolean {
  if (page.visible === false) return false;
  // ADO has system page types (history, links, attachments) — those are
  // covered by our own fixed tabs. Treat anything that isn't an explicit
  // 'custom' page as system-managed.
  const type = (page.pageType ?? 'custom').toLowerCase();
  return type === 'custom';
}

export function normalizeLayout(raw: ProcessLayoutResponse): ProcessLayout {
  const pages = (raw.pages ?? []).filter(isTabbablePage).map(toPage);
  if (pages.length === 0) return { pages: [], extraTabs: [], detailsFieldKeys: [] };

  const [first, ...rest] = pages;
  const extraTabs: ProcessTab[] = rest
    .map((p) => ({ id: p.id, label: p.label, fieldKeys: pageFieldKeys(p) }))
    .filter((tab) => tab.fieldKeys.length > 0);

  return {
    pages: [first!, ...rest.filter((p) => extraTabs.some((t) => t.id === p.id))],
    extraTabs,
    detailsFieldKeys: pageFieldKeys(first!),
  };
}

/**
 * Fetch the process layout for a work item type. Returns null on any error
 * so callers fall back to the layout-free form.
 */
export async function getProcessLayout(
  client: AdoClient,
  processId: string,
  witRefName: string,
): Promise<ProcessLayout | null> {
  try {
    const raw = await client.getOrgLevel<ProcessLayoutResponse>(
      `work/processes/${encodeURIComponent(processId)}/workItemTypes/${encodeURIComponent(witRefName)}/layout`,
      PROCESS_LAYOUT_API_VERSION,
    );
    return normalizeLayout(raw);
  } catch {
    return null;
  }
}
