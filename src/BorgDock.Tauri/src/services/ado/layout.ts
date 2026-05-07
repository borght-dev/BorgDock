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
  controlType?: string;
  visible?: boolean;
  metadata?: { isContribution?: boolean } | null;
}

interface RawGroup {
  visible?: boolean;
  controls?: RawControl[];
}

interface RawSection {
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

export interface ProcessTab {
  id: string;
  label: string;
  fieldKeys: string[];
}

export interface ProcessLayout {
  /** Custom pages excluding the first one ADO renders.
   *  Index 0 of the source response is treated as the "Details" page and
   *  its fields stay in the default Overview tab; everything past it
   *  becomes an extra tab in the BorgDock detail panel. */
  extraTabs: ProcessTab[];
  /** Field reference names that belong to the implicit "Details" tab. */
  detailsFieldKeys: string[];
}

function collectFieldKeys(page: RawPage): string[] {
  const keys: string[] = [];
  for (const section of page.sections ?? []) {
    for (const group of section.groups ?? []) {
      if (group.visible === false) continue;
      for (const control of group.controls ?? []) {
        if (control.visible === false) continue;
        // Field-bound controls have an `id` that's a field reference name.
        // Contribution-based controls and html/label controls don't bind a
        // field; skip them.
        if (!control.id) continue;
        if (control.metadata?.isContribution) continue;
        const ct = (control.controlType ?? '').toLowerCase();
        if (ct === 'labelcontrol' || ct === 'htmlcontrol') continue;
        keys.push(control.id);
      }
    }
  }
  return keys;
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
  const tabbable = (raw.pages ?? []).filter(isTabbablePage);
  if (tabbable.length === 0) {
    return { extraTabs: [], detailsFieldKeys: [] };
  }

  const [first, ...rest] = tabbable;
  const detailsFieldKeys = first ? collectFieldKeys(first) : [];

  const extraTabs: ProcessTab[] = rest
    .map((p) => ({
      id: p.id,
      label: p.label?.trim() || 'Untitled',
      fieldKeys: collectFieldKeys(p),
    }))
    .filter((tab) => tab.fieldKeys.length > 0);

  return { extraTabs, detailsFieldKeys };
}

/**
 * Fetch the process layout for a work item type and return only the
 * data we need to drive the detail panel's tab strip. Returns null on
 * any error so callers can fall back to the un-tabbed default.
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
