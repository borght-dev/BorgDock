import type { AdoClient } from '@/services/ado/client';
import { getWorkItems, updateWorkItem } from '@/services/ado/workitems';
import type { WorkItem } from '@/types';
import { getField } from '@/utils/work-item-helpers';
import type { DispatchItem, StateCategory, WorkflowState } from './types';

const MY_OPEN_ITEMS_WIQL =
  'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ' +
  'AND [System.AssignedTo] = @Me ' +
  "AND [System.State] NOT IN ('Done', 'Closed', 'Removed') " +
  'ORDER BY [System.ChangedDate] DESC';

const GITHUB_PULL_REQUEST_LINK = /^vstfs:\/\/\/GitHub\/PullRequest\/[^%]+%2F(\d+)$/i;

// ADO lists a type's states in no useful order. Well-known names follow the
// usual process; any other state sits at the end of its category.
const PROCESS_ORDER = [
  'New',
  'To Do',
  'Approved',
  'Committed',
  'Development In Progress',
  'In Progress',
  'Code Review',
  'Ready For QA',
  'Done',
];
const CATEGORY_POSITION: Record<StateCategory, number> = {
  Proposed: 3.5,
  InProgress: 5.5,
  Resolved: 7.5,
  Completed: 8.5,
  Removed: 9.5,
};

function processPosition(state: WorkflowState): number {
  const known = PROCESS_ORDER.indexOf(state.name);
  return known === -1 ? CATEGORY_POSITION[state.category] : known;
}

/** A type's states in the order an item moves through them. */
export function orderStates(states: readonly WorkflowState[]): WorkflowState[] {
  return [...states].sort((a, b) => processPosition(a) - processPosition(b));
}

function isStateCategory(value: unknown): value is StateCategory {
  return typeof value === 'string' && value in CATEGORY_POSITION;
}

const workflowCache = new Map<string, Promise<WorkflowState[]>>();

/** The workflow of a work item type, read once per session. `scope` tells projects apart. */
export function workflowOf(
  client: AdoClient,
  scope: string,
  typeName: string,
): Promise<WorkflowState[]> {
  const key = `${scope}/${typeName}`;
  let workflow = workflowCache.get(key);
  if (!workflow) {
    workflow = client
      .get<{ value?: { name: string; category?: string }[] }>(
        `wit/workitemtypes/${encodeURIComponent(typeName)}/states`,
      )
      .then((response) =>
        orderStates(
          (response.value ?? []).map((state) => ({
            name: state.name,
            category: isStateCategory(state.category) ? state.category : 'InProgress',
          })),
        ),
      );
    workflow.catch(() => workflowCache.delete(key));
    workflowCache.set(key, workflow);
  }
  return workflow;
}

/** "Sprint 12" from `Shop\Release 5\Sprint 12`; "Backlog" for an item on the project root. */
export function sprintLabel(iterationPath: string): string {
  const parts = iterationPath.split('\\').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : 'Backlog';
}

function linkedPullRequestNumbers(item: WorkItem): number[] {
  return (item.relations ?? []).flatMap((relation) => {
    const match =
      relation.rel === 'ArtifactLink' ? GITHUB_PULL_REQUEST_LINK.exec(relation.url) : null;
    return match ? [Number(match[1])] : [];
  });
}

export function toDispatchItem(
  item: WorkItem,
  states: WorkflowState[],
  assignedToMe: boolean,
  url: string,
): DispatchItem {
  const state = getField(item, 'System.State');
  const tags = getField(item, 'System.Tags');
  const dueDate = item.fields['Microsoft.VSTS.Scheduling.DueDate'];
  const priority = Number(item.fields['Microsoft.VSTS.Common.Priority']);
  return {
    id: item.id,
    typeName: getField(item, 'System.WorkItemType') || 'Task',
    title: getField(item, 'System.Title'),
    state,
    stateCategory: states.find((s) => s.name === state)?.category ?? 'Proposed',
    states: states.filter((s) => s.category !== 'Removed'),
    sprint: sprintLabel(getField(item, 'System.IterationPath')),
    dueDate: typeof dueDate === 'string' ? dueDate : null,
    priority: Number.isFinite(priority) && priority > 0 ? priority : null,
    tags: tags
      ? tags
          .split(';')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
    assignedTo: getField(item, 'System.AssignedTo') || null,
    assignedToMe,
    url,
    linkedPullRequests: linkedPullRequestNumbers(item),
    changedAt: getField(item, 'System.ChangedDate'),
  };
}

export interface AdoScope {
  organization: string;
  project: string;
}

export function workItemWebUrl(scope: AdoScope, id: number): string {
  return `https://dev.azure.com/${encodeURIComponent(scope.organization)}/${encodeURIComponent(scope.project)}/_workitems/edit/${id}`;
}

async function toDispatchItems(
  client: AdoClient,
  scope: AdoScope,
  items: WorkItem[],
  mine: ReadonlySet<number>,
): Promise<DispatchItem[]> {
  const scopeKey = `${scope.organization}/${scope.project}`;
  const converted = await Promise.all(
    items.map(async (item) => {
      const typeName = getField(item, 'System.WorkItemType') || 'Task';
      const states = await workflowOf(client, scopeKey, typeName).catch(() => []);
      return toDispatchItem(item, states, mine.has(item.id), workItemWebUrl(scope, item.id));
    }),
  );
  return converted.filter(
    (item) => item.stateCategory !== 'Completed' && item.stateCategory !== 'Removed',
  );
}

/**
 * Every open item assigned to me in the project, plus the `extraIds` (items
 * marked Up next that belong to someone else), each with its workflow.
 */
export async function loadDispatchItems(
  client: AdoClient,
  scope: AdoScope,
  extraIds: readonly number[],
): Promise<DispatchItem[]> {
  const response = await client.post<{ workItems?: { id: number }[] }>('wit/wiql', {
    query: MY_OPEN_ITEMS_WIQL,
  });
  const mineIds = (response.workItems ?? []).map((w) => w.id);
  const mine = new Set(mineIds);
  const ids = [...mineIds, ...extraIds.filter((id) => !mine.has(id))];
  return toDispatchItems(client, scope, await getWorkItems(client, ids), mine);
}

/** Moves the item to `state` and answers with the state ADO reports back. */
export async function moveItemState(client: AdoClient, id: number, state: string): Promise<string> {
  const updated = await updateWorkItem(client, id, [
    { op: 'add', path: '/fields/System.State', value: state },
  ]);
  return getField(updated, 'System.State');
}

/** The signed-in account (an email address), which ADO takes as an identity. */
export async function currentUserAccount(client: AdoClient): Promise<string | null> {
  const response = await client.getOrgLevel<{
    authenticatedUser?: { properties?: { Account?: { $value?: string } } };
  }>('connectionData');
  return response.authenticatedUser?.properties?.Account?.$value ?? null;
}

export async function assignItemToMe(client: AdoClient, id: number): Promise<void> {
  const account = await currentUserAccount(client);
  if (!account) throw new Error('Could not read your Azure DevOps account.');
  await updateWorkItem(client, id, [
    { op: 'add', path: '/fields/System.AssignedTo', value: account },
  ]);
}
