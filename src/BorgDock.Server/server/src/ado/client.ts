import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrowseQuery, ItemDetail, ItemType, WorkItemSummary } from '../../../shared/src/api.ts';

const run = promisify(execFile);
const AZURE_DEVOPS_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';
const API = 'api-version=7.1';

export type StateCategory = WorkItemSummary['stateCategory'];
export type WorkflowState = { name: string; category: StateCategory };

/** A work item as the engine needs it: the API summary plus what linking and suggestions use. */
export type AdoItem = WorkItemSummary & { states: WorkflowState[]; linkedPullRequests: number[]; changedAt: string };

export type AdoSprintItem = AdoItem & { stateChangedAt: string | null; finishedAt: string | null };

export type AdoSprint = { name: string; path: string; startDate: string | null; finishDate: string | null; items: AdoSprintItem[] };

type Iteration = { id: string; name: string; path: string; attributes?: { startDate?: string | null; finishDate?: string | null } };

export class AdoError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ADO lists states per category in arbitrary order (a PBI shows Ready For QA before Code Review).
// Known states follow the team's process; unknown ones sit at the end of their category.
const PROCESS_ORDER = ['New', 'To Do', 'Approved', 'Committed', 'Development In Progress', 'In Progress', 'Code Review', 'Ready For QA', 'Done'];
const CATEGORY_POSITION: Record<StateCategory, number> = { Proposed: 3.5, InProgress: 5.5, Resolved: 7.5, Completed: 8.5, Removed: 9.5 };
const processPosition = (s: WorkflowState) => (PROCESS_ORDER.includes(s.name) ? PROCESS_ORDER.indexOf(s.name) : CATEGORY_POSITION[s.category]);

const SHORT_TYPES: Record<string, ItemType> = { Bug: 'Bug', 'Product Backlog Item': 'PBI', 'Quality Improvement': 'QI', Task: 'Task' };
const ITEM_FIELDS = [
  'System.Id', 'System.TeamProject', 'System.WorkItemType', 'System.Title', 'System.State', 'System.IterationPath',
  'System.Tags', 'System.AssignedTo', 'System.ChangedDate', 'Microsoft.VSTS.Scheduling.DueDate', 'Microsoft.VSTS.Common.Priority',
];
const STATE_CHANGE_DATE = 'Microsoft.VSTS.Common.StateChangeDate';
const CLOSED_DATE = 'Microsoft.VSTS.Common.ClosedDate';
const SPRINT_FIELDS = [...ITEM_FIELDS, STATE_CHANGE_DATE, CLOSED_DATE];
const GITHUB_PR_LINK = /^vstfs:\/\/\/GitHub\/PullRequest\/[^%]+%2F(\d+)$/i;
const OPEN_STATES = `[System.State] NOT IN ('Done', 'Closed', 'Removed')`;
const BACKLOG_ITEM_TYPES = `[System.WorkItemType] IN ('Bug', 'Product Backlog Item', 'Quality Improvement')`;

type RawItem = { id: number; fields: Record<string, any>; relations?: { rel: string; url: string }[] };

export class AdoClient {
  private readonly orgUrl: string;
  private readonly project: string;
  private readonly team: string;
  private token: { value: string; expiresAt: number } | null = null;
  private workflows = new Map<string, Promise<WorkflowState[]>>();
  private identity: Promise<{ name: string; email: string }> | null = null;

  constructor(options: { orgUrl: string; project: string; team: string }) {
    this.orgUrl = options.orgUrl;
    this.project = options.project;
    this.team = options.team;
  }

  // The signed-in Azure CLI identity; tokens last about an hour, so refresh a little early.
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - Date.now() > 5 * 60_000) return this.token.value;
    const { stdout } = await run('az', ['account', 'get-access-token', '--resource', AZURE_DEVOPS_RESOURCE, '-o', 'json']);
    const parsed = JSON.parse(stdout);
    this.token = { value: parsed.accessToken, expiresAt: Number(parsed.expires_on) * 1000 };
    return this.token.value;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.orgUrl}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) throw new AdoError(response.status, body.message ?? `ADO request failed with ${response.status}`);
    return body as T;
  }

  me(): Promise<{ name: string; email: string }> {
    this.identity ??= this.request<any>('_apis/connectionData').then((r) => ({
      name: r.authenticatedUser.providerDisplayName,
      email: r.authenticatedUser.properties.Account.$value,
    }));
    return this.identity;
  }

  private workflowFor(project: string, type: string): Promise<WorkflowState[]> {
    const key = `${project}/${type}`;
    if (!this.workflows.has(key)) {
      const path = `${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?${API}`;
      const states = this.request<{ value: WorkflowState[] }>(path).then((r) =>
        r.value.map(({ name, category }) => ({ name, category })).sort((a, b) => processPosition(a) - processPosition(b)));
      states.catch(() => this.workflows.delete(key));
      this.workflows.set(key, states);
    }
    return this.workflows.get(key)!;
  }

  private async wiqlIds(query: string, top = 200): Promise<number[]> {
    const result = await this.request<{ workItems?: { id: number }[]; workItemRelations?: { target?: { id: number } }[] }>(
      `${encodeURIComponent(this.project)}/_apis/wit/wiql?$top=${top}&${API}`,
      { method: 'POST', body: JSON.stringify({ query }) },
    );
    return idsFrom(result);
  }

  /** Raw items in the order of `ids`; ids ADO doesn't return are left out. */
  private async fetchRaw(ids: number[], select: { relations: true } | { fields: string[] }): Promise<RawItem[]> {
    const raw: RawItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const body = 'relations' in select ? { ids: ids.slice(i, i + 200), $expand: 'Relations' } : { ids: ids.slice(i, i + 200), fields: select.fields };
      raw.push(...(await this.request<{ value: RawItem[] }>(`_apis/wit/workitemsbatch?${API}`, { method: 'POST', body: JSON.stringify(body) })).value);
    }
    const byId = new Map(raw.map((r) => [r.id, r]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  private async fetchItems(ids: number[], withRelations: boolean): Promise<AdoItem[]> {
    const raw = await this.fetchRaw(ids, withRelations ? { relations: true } : { fields: ITEM_FIELDS });
    return Promise.all(raw.map((r) => this.toItem(r)));
  }

  private async toItem(r: RawItem): Promise<AdoItem> {
    const f = r.fields;
    const project = f['System.TeamProject'];
    const typeName = f['System.WorkItemType'];
    const [states, me] = await Promise.all([this.workflowFor(project, typeName), this.me().catch(() => ({ email: '' }))]);
    const state = f['System.State'];
    return {
      id: r.id,
      type: SHORT_TYPES[typeName] ?? 'Other',
      typeName,
      title: f['System.Title'],
      state,
      stateCategory: states.find((s) => s.name === state)?.category ?? 'Proposed',
      workflow: states.filter((s) => s.category !== 'Removed').map((s) => s.name),
      sprint: sprintLabel(f['System.IterationPath'], project),
      dueDate: f['Microsoft.VSTS.Scheduling.DueDate'] ?? null,
      priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
      tags: f['System.Tags'] ? String(f['System.Tags']).split(';').map((t) => t.trim()).filter(Boolean) : [],
      assignedTo: f['System.AssignedTo']?.displayName ?? null,
      assignedToMe: Boolean(me.email) && String(f['System.AssignedTo']?.uniqueName ?? '').toLowerCase() === me.email.toLowerCase(),
      url: `${this.orgUrl}/${encodeURIComponent(project)}/_workitems/edit/${r.id}`,
      states,
      linkedPullRequests: (r.relations ?? []).flatMap((rel) => {
        const m = rel.rel === 'ArtifactLink' ? GITHUB_PR_LINK.exec(rel.url) : null;
        return m ? [Number(m[1])] : [];
      }),
      changedAt: f['System.ChangedDate'],
    };
  }

  /** Every open item assigned to me, across all projects in the organisation. */
  async myOpenItems(): Promise<AdoItem[]> {
    const result = await this.request<{ workItems: { id: number }[] }>(`_apis/wit/wiql?${API}`, {
      method: 'POST',
      body: JSON.stringify({ query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND ${OPEN_STATES} ORDER BY [System.ChangedDate] DESC` }),
    });
    const items = await this.fetchItems(result.workItems.map((w) => w.id), true);
    return items.filter((i) => i.stateCategory !== 'Completed' && i.stateCategory !== 'Removed');
  }

  /** Specific items, e.g. ones queued from Browse that aren't assigned to me. */
  async itemsById(ids: number[]): Promise<AdoItem[]> {
    if (!ids.length) return [];
    const items = await this.fetchItems(ids, true);
    return items.filter((i) => i.stateCategory !== 'Completed' && i.stateCategory !== 'Removed');
  }

  async item(id: number): Promise<ItemDetail> {
    const [raw, comments] = await Promise.all([
      this.request<RawItem>(`_apis/wit/workitems/${id}?$expand=Relations&${API}`),
      this.request<{ comments: any[] }>(`${encodeURIComponent(this.project)}/_apis/wit/workItems/${id}/comments?$top=20&order=desc&api-version=7.1-preview.4`)
        .catch(() => ({ comments: [] })),
    ]);
    return {
      item: await this.toItem(raw),
      description: htmlToText(raw.fields['System.Description']),
      acceptanceCriteria: htmlToText(raw.fields['Microsoft.VSTS.Common.AcceptanceCriteria']),
      reproSteps: htmlToText(raw.fields['Microsoft.VSTS.TCM.ReproSteps']),
      qaNotes: htmlToText(raw.fields['Custom.QANotes']),
      comments: comments.comments.map((c) => ({ by: c.createdBy?.displayName ?? 'Unknown', at: c.createdDate, text: htmlToText(c.text) })),
    };
  }

  /** Developer Notes (HTML) and the newest comment, for BorgDock's states walk. One item, read-only. */
  async discussion(id: number): Promise<{ developerNotes: string | null; comments: { text: string; createdDate: string; createdBy: { displayName: string } }[] }> {
    const [raw, comments] = await Promise.all([
      this.request<RawItem>(`_apis/wit/workitems/${id}?fields=Custom.DeveloperNotes&${API}`).catch(() => ({ id, fields: {} }) as RawItem),
      this.request<{ comments: any[] }>(`${encodeURIComponent(this.project)}/_apis/wit/workItems/${id}/comments?$top=1&order=desc&api-version=7.1-preview.4`)
        .catch(() => ({ comments: [] })),
    ]);
    return { developerNotes: raw.fields['Custom.DeveloperNotes'] ?? null, comments: comments.comments };
  }

  async moveState(id: number, to: string, { validateOnly = false } = {}): Promise<string> {
    const result = await this.patch(id, [{ op: 'add', path: '/fields/System.State', value: to }], validateOnly);
    return result.fields['System.State'];
  }

  async assignToMe(id: number): Promise<void> {
    await this.patch(id, [{ op: 'add', path: '/fields/System.AssignedTo', value: (await this.me()).email }], false);
  }

  private patch(id: number, operations: object[], validateOnly: boolean) {
    return this.request<RawItem>(`_apis/wit/workitems/${id}?${API}${validateOnly ? '&validateOnly=true' : ''}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(operations),
    });
  }

  private teamPath(path: string): string {
    return `${encodeURIComponent(this.project)}/${encodeURIComponent(this.team)}/_apis/work/teamsettings/${path}`;
  }

  private async currentIteration(): Promise<Iteration> {
    const r = await this.request<{ value: Iteration[] }>(this.teamPath(`iterations?$timeframe=current&${API}`));
    if (!r.value[0]) throw new AdoError(404, `${this.team} has no current sprint`);
    return r.value[0];
  }

  /** The team's current sprint with every backlog item in it, finished ones included, whoever has them. */
  async currentSprint(): Promise<AdoSprint> {
    const iteration = await this.currentIteration();
    const [ids, backlogOrder] = await Promise.all([
      this.wiqlIds(
        `SELECT [System.Id] FROM WorkItems WHERE [System.IterationPath] = '${iteration.path.replace(/'/g, "''")}' AND ${BACKLOG_ITEM_TYPES} AND [System.State] <> 'Removed'`,
        1000,
      ),
      this.sprintBacklogOrder(iteration.id).catch(() => []),
    ]);
    const raw = await this.fetchRaw(inBacklogOrder(ids, backlogOrder), { fields: SPRINT_FIELDS });
    const items = await Promise.all(raw.map(async (r) => withSprintDates(await this.toItem(r), r.fields)));
    return {
      name: sprintLabel(iteration.path, this.project),
      path: iteration.path,
      startDate: iteration.attributes?.startDate ?? null,
      finishDate: iteration.attributes?.finishDate ?? null,
      items: items.filter((i) => i.stateCategory !== 'Removed'),
    };
  }

  /** The sprint backlog as ADO shows it: backlog priority, each task right under its parent. */
  private async sprintBacklogOrder(iterationId: string): Promise<number[]> {
    const r = await this.request<{ workItemRelations: { target: { id: number } }[] }>(this.teamPath(`iterations/${iterationId}/workitems?${API}`));
    return r.workItemRelations.map((rel) => rel.target.id);
  }

  async queries(): Promise<BrowseQuery[]> {
    const builtin: BrowseQuery[] = [
      { id: 'sprint', name: 'Current sprint, whole team', group: 'Dispatch' },
      { id: 'sprint-unassigned', name: 'Current sprint, unassigned', group: 'Dispatch' },
      { id: 'sprint-review', name: 'Current sprint, in Code Review', group: 'Dispatch' },
    ];
    const tree = await this.request<{ value: any[] }>(`${encodeURIComponent(this.project)}/_apis/wit/queries?$depth=2&${API}`).catch(() => ({ value: [] }));
    const fromAdo = tree.value.flatMap((folder) => flattenQueries(folder.children ?? [], folder.name));
    return [...builtin, ...fromAdo];
  }

  async runQuery(id: string, limit = 100): Promise<{ items: AdoItem[]; truncated: boolean }> {
    let ids: number[];
    if (id.startsWith('sprint')) {
      const iteration = await this.currentIteration();
      const extra = id === 'sprint-unassigned' ? `AND [System.AssignedTo] = ''` : id === 'sprint-review' ? `AND [System.State] = 'Code Review'` : '';
      const [matching, backlogOrder] = await Promise.all([
        this.wiqlIds(
          `SELECT [System.Id] FROM WorkItems WHERE [System.IterationPath] = '${iteration.path.replace(/'/g, "''")}' AND ${BACKLOG_ITEM_TYPES} AND ${OPEN_STATES} ${extra}`,
          1000,
        ),
        this.sprintBacklogOrder(iteration.id),
      ]);
      ids = inBacklogOrder(matching, backlogOrder);
    } else {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AdoError(400, 'Unknown query');
      const result = await this.request<any>(`${encodeURIComponent(this.project)}/_apis/wit/wiql/${id}?${API}`);
      ids = idsFrom(result);
    }
    return { items: await this.fetchItems(ids.slice(0, limit), false), truncated: ids.length > limit };
  }

  async search(text: string, limit = 50): Promise<AdoItem[]> {
    const trimmed = text.trim();
    if (/^\d{3,7}$/.test(trimmed)) return this.fetchItems([Number(trimmed)], false).catch(() => []);
    const safe = trimmed.slice(0, 100).replace(/'/g, "''");
    const ids = await this.wiqlIds(
      `SELECT [System.Id] FROM WorkItems WHERE [System.Title] CONTAINS '${safe}' AND ${OPEN_STATES} ORDER BY [System.ChangedDate] DESC`,
      limit,
    );
    return this.fetchItems(ids, false);
  }
}

function idsFrom(result: { workItems?: { id: number }[]; workItemRelations?: { target?: { id: number } }[] }): number[] {
  if (result.workItems) return result.workItems.map((w) => w.id);
  return [...new Set((result.workItemRelations ?? []).flatMap((r) => (r.target ? [r.target.id] : [])))];
}

/** Ids sorted by their position in the backlog; ids the backlog doesn't list keep their order at the end. */
export function inBacklogOrder(ids: number[], backlogOrder: number[]): number[] {
  const position = new Map(backlogOrder.map((id, index) => [id, index]));
  const rank = (id: number) => position.get(id) ?? Infinity;
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

function flattenQueries(nodes: any[], group: string): BrowseQuery[] {
  return nodes.flatMap((n) => (n.isFolder ? flattenQueries(n.children ?? [], `${group} / ${n.name}`) : [{ id: n.id, name: n.name, group }]));
}

/** A finished item counts from its closed date; ADO leaves that empty for some states, so the state change stands in. */
export function withSprintDates(item: AdoItem, fields: Record<string, any>): AdoSprintItem {
  const stateChangedAt: string | null = fields[STATE_CHANGE_DATE] ?? null;
  const finishedAt = item.stateCategory === 'Completed' ? (fields[CLOSED_DATE] ?? stateChangedAt) : null;
  return { ...item, stateChangedAt, finishedAt };
}

export function sprintLabel(iterationPath: string, project: string): string {
  if (!iterationPath || iterationPath === project) return 'Backlog';
  return iterationPath.split('\\').pop()!.replace(/^Service Pack /, '');
}

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function htmlToText(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
