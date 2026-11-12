import type { AdoClient } from './client';

/** ADO's state categories, which give an unknown state its meaning. */
export type AdoStateCategory = 'Proposed' | 'InProgress' | 'Resolved' | 'Completed' | 'Removed';

export interface WorkItemStateMeta {
  name: string;
  /** `#rrggbb`, or null when ADO sent none. */
  color: string | null;
  category: AdoStateCategory | null;
}

export interface WorkItemTypeMeta {
  name: string;
  /** `#rrggbb`, or null when ADO sent none. */
  color: string | null;
  /** ADO's icon id, such as `icon_insect`. */
  icon: string | null;
  states: WorkItemStateMeta[];
}

interface WorkItemTypesResponse {
  value?: Array<{
    name: string;
    color?: string;
    icon?: { id?: string } | null;
    states?: Array<{ name: string; color?: string; category?: string }>;
  }>;
}

const CATEGORIES = new Set<string>(['Proposed', 'InProgress', 'Resolved', 'Completed', 'Removed']);

function hex(color: string | undefined): string | null {
  if (!color) return null;
  const value = color.replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : null;
}

export function toTypeMeta(raw: WorkItemTypesResponse): Map<string, WorkItemTypeMeta> {
  return new Map(
    (raw.value ?? []).map((type) => [
      type.name,
      {
        name: type.name,
        color: hex(type.color),
        icon: type.icon?.id ?? null,
        states: (type.states ?? []).map((state) => ({
          name: state.name,
          color: hex(state.color),
          category:
            state.category && CATEGORIES.has(state.category)
              ? (state.category as AdoStateCategory)
              : null,
        })),
      },
    ]),
  );
}

/** Colour, icon and states of every work item type in the project, from one request. */
export async function getWorkItemTypes(client: AdoClient): Promise<Map<string, WorkItemTypeMeta>> {
  const response = await client.get<WorkItemTypesResponse>('wit/workitemtypes');
  return toTypeMeta(response);
}

interface AllowedValuesResponse {
  allowedValues?: unknown[];
}

/** The values a picklist field takes on a type; empty when it has no list. */
export async function getFieldAllowedValues(
  client: AdoClient,
  workItemType: string,
  field: string,
): Promise<string[]> {
  const response = await client.get<AllowedValuesResponse>(
    `wit/workitemtypes/${encodeURIComponent(workItemType)}/fields/${encodeURIComponent(field)}?$expand=allowedValues`,
  );
  return (response.allowedValues ?? []).map(String);
}
