import type { AdoClient } from '@/services/ado/client';
import {
  getCurrentUserDisplayName,
  getNewestWorkItemComment,
  getWorkItems,
  updateWorkItem,
} from '@/services/ado/workitems';
import type { WorkItem } from '@/types';
import { getField } from '@/utils/work-item-helpers';
import { newestNote, toItemComment } from './item-text';
import type {
  DispatchItem,
  ItemComment,
  LinkedPullRequest,
  StateCategory,
  WorkflowState,
} from './types';

const MY_OPEN_ITEMS_WIQL =
  'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ' +
  'AND [System.AssignedTo] = @Me ' +
  "AND [System.State] NOT IN ('Done', 'Closed', 'Removed') " +
  'ORDER BY [System.ChangedDate] DESC';

/** The field the repo's ADO skills write their dated updates to. */
const DEVELOPER_NOTES_FIELD = 'Custom.DeveloperNotes';

const GITHUB_PULL_REQUEST_LINK = /^vstfs:\/\/\/GitHub\/PullRequest\/([^%]+)%2F(\d+)$/i;
const PARENT_LINK = 'System.LinkTypes.Hierarchy-Reverse';
const CHILD_LINK = 'System.LinkTypes.Hierarchy-Forward';
const WORK_ITEM_ID_AT_END = /\/(\d+)$/;

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

function linkedPullRequests(item: WorkItem): LinkedPullRequest[] {
  return (item.relations ?? []).flatMap((relation) => {
    const match =
      relation.rel === 'ArtifactLink' ? GITHUB_PULL_REQUEST_LINK.exec(relation.url) : null;
    return match ? [{ repositoryId: match[1]!.toLowerCase(), number: Number(match[2]) }] : [];
  });
}

function parentOf(item: WorkItem): number | null {
  const link = item.relations?.find((relation) => relation.rel === PARENT_LINK);
  const match = link ? WORK_ITEM_ID_AT_END.exec(link.url) : null;
  return match ? Number(match[1]) : null;
}

function childrenOf(item: WorkItem): number[] {
  return (item.relations ?? []).flatMap((relation) => {
    const match = relation.rel === CHILD_LINK ? WORK_ITEM_ID_AT_END.exec(relation.url) : null;
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
  const iterationPath = getField(item, 'System.IterationPath');
  return {
    id: item.id,
    typeName: getField(item, 'System.WorkItemType') || 'Task',
    title: getField(item, 'System.Title'),
    state,
    stateCategory: states.find((s) => s.name === state)?.category ?? 'Proposed',
    states: states.filter((s) => s.category !== 'Removed'),
    sprint: sprintLabel(iterationPath),
    iterationPath,
    notes: newestNote(item.fields[DEVELOPER_NOTES_FIELD]),
    lastComment: null,
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
    linkedPullRequests: linkedPullRequests(item),
    parentId: parentOf(item),
    childIds: childrenOf(item),
    changedAt: getField(item, 'System.ChangedDate'),
    rev: item.rev,
    changedBy: getField(item, 'System.ChangedBy') || null,
  };
}

export interface AdoScope {
  organization: string;
  project: string;
}

export function workItemWebUrl(scope: AdoScope, id: number): string {
  return `https://dev.azure.com/${encodeURIComponent(scope.organization)}/${encodeURIComponent(scope.project)}/_workitems/edit/${id}`;
}

async function convertItems(
  client: AdoClient,
  scope: AdoScope,
  items: WorkItem[],
  mine: ReadonlySet<number>,
): Promise<DispatchItem[]> {
  const scopeKey = `${scope.organization}/${scope.project}`;
  return Promise.all(
    items.map(async (item) => {
      const typeName = getField(item, 'System.WorkItemType') || 'Task';
      const states = await workflowOf(client, scopeKey, typeName).catch(() => []);
      return toDispatchItem(item, states, mine.has(item.id), workItemWebUrl(scope, item.id));
    }),
  );
}

async function toDispatchItems(
  client: AdoClient,
  scope: AdoScope,
  items: WorkItem[],
  mine: ReadonlySet<number>,
): Promise<DispatchItem[]> {
  const converted = await convertItems(client, scope, items, mine);
  return converted.filter(
    (item) => item.stateCategory !== 'Completed' && item.stateCategory !== 'Removed',
  );
}

export interface ContextItems {
  items: DispatchItem[];
  /** Ids ADO did not return: deleted, or out of reach. */
  missing: number[];
}

/**
 * Items a workstream links that Dispatch doesn't list: done ones, epics,
 * items of others. Done items stay in, unlike in `loadDispatchItems`.
 */
export async function loadContextItems(
  client: AdoClient,
  scope: AdoScope,
  ids: readonly number[],
  mine: ReadonlySet<number> = new Set(),
): Promise<ContextItems> {
  if (ids.length === 0) return { items: [], missing: [] };
  const found = await getWorkItems(client, [...ids]);
  const returned = new Set(found.map((item) => item.id));
  const items = await withLastComments(client, await convertItems(client, scope, found, mine));
  return { items, missing: ids.filter((id) => !returned.has(id)) };
}

let myName: Promise<string | null> | null = null;

/** Comments are read again only for items that changed: a new comment changes the item. */
const commentCache = new Map<number, { changedAt: string; comment: ItemComment | null }>();
const COMMENT_BATCH = 4;

/** Forget the comments read so far (tests). */
export function clearCommentCache(): void {
  commentCache.clear();
  myName = null;
}

async function withLastComments(client: AdoClient, items: DispatchItem[]): Promise<DispatchItem[]> {
  myName ??= getCurrentUserDisplayName(client);
  const me = await myName;
  const stale = items.filter((item) => commentCache.get(item.id)?.changedAt !== item.changedAt);
  for (let start = 0; start < stale.length; start += COMMENT_BATCH) {
    await Promise.all(
      stale.slice(start, start + COMMENT_BATCH).map(async (item) => {
        try {
          const comment = await getNewestWorkItemComment(client, item.id);
          commentCache.set(item.id, {
            changedAt: item.changedAt,
            comment: comment ? toItemComment(comment, me) : null,
          });
        } catch {
          // Shown without its comment; the next poll tries again.
        }
      }),
    );
  }
  return items.map((item) => ({
    ...item,
    lastComment: commentCache.get(item.id)?.comment ?? null,
    changedByMe: me !== null && item.changedBy === me,
  }));
}

/**
 * Every open item assigned to me in the project, plus the `extraIds` (items
 * marked Up next that belong to someone else), each with its workflow and
 * its newest comment.
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
  const items = await toDispatchItems(client, scope, await getWorkItems(client, ids), mine);
  return withLastComments(client, items);
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
