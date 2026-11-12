import { clip, htmlToText, readSignature } from '@/services/dispatch/item-text';
import type { WorkItemComment, WorkItemRelation, WorkItemUpdate } from '@/types';
import { formatFieldValue, friendlyLabel, looksLikeHtml } from '@/utils/work-item-fields';

/** Which events the Activity tab shows. */
export type ActivityFilter = 'all' | 'comments' | 'changes' | 'agent';

interface EventBase {
  /** Stable for the fact: an update id or a comment id. */
  key: string;
  /** ISO time the event happened. */
  at: string;
  author: string;
}

/** One field that changed in one update. `edited` fields are long text: no values. */
export interface ActivityFieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
  edited?: boolean;
}

export interface ActivityLink {
  kind: 'pr' | 'item' | 'hyperlink' | 'attachment' | 'artifact';
  /** "parent", "child", "related", "pull request", "attachment"… */
  label: string;
  /** The PR or work item number, when the link names one. */
  number: number | null;
  /** The link's own name: a file name, a URL, the PR link's comment. */
  detail: string | null;
  removed: boolean;
}

/** A long hash an agent step carries (`proof=…`, `html=…`), in full for copying. */
export interface AgentProof {
  /** The key it was written with, else "proof". */
  label: string;
  value: string;
}

export interface AgentStep {
  id: number;
  at: string;
  /** The signed kind: `plan`, `plan-verify`, `pr`… */
  kind: string;
  /** The first sentence, without proof hashes. */
  summary: string;
  /** What the comment says after its first sentence, without proof hashes. */
  detail: string;
  proofs: AgentProof[];
  /** The step reports a failure, a block or a repair. */
  warn: boolean;
}

export type ActivityEvent =
  | (EventBase & { kind: 'state'; from: string | null; to: string })
  | (EventBase & {
      kind: 'fields';
      changes: ActivityFieldChange[];
      tagsAdded: string[];
      tagsRemoved: string[];
    })
  | (EventBase & { kind: 'link'; links: ActivityLink[] })
  | (EventBase & { kind: 'created'; workItemType: string | null })
  | (EventBase & { kind: 'comment'; html: string })
  | (EventBase & {
      kind: 'agentRun';
      /** When the run's oldest step was posted. */
      since: string;
      /** Newest first. */
      steps: AgentStep[];
    });

export interface ActivityDay {
  /** `YYYY-MM-DD` in local time. */
  key: string;
  /** "Today", "Yesterday", "Mon 10 Nov". */
  label: string;
  events: ActivityEvent[];
}

export interface Activity {
  days: ActivityDay[];
  counts: Record<ActivityFilter, number>;
  /** The one agent that signed every agent step, or null when none or several did. */
  agentName: string | null;
}

export interface BuildActivityOptions {
  now: number;
  filter?: ActivityFilter;
  /** Fold an agent's consecutive steps into one run (default), or show each on its own. */
  foldAgentRuns?: boolean;
}

// ---- Fields ----

const NOISE_FIELDS = new Set([
  'System.Id',
  'System.Rev',
  'System.ChangedDate',
  'System.ChangedBy',
  'System.AuthorizedDate',
  'System.AuthorizedAs',
  'System.RevisedDate',
  'System.Watermark',
  'System.History',
  'System.CommentCount',
  'System.BoardColumn',
  'System.BoardColumnDone',
  'System.BoardLane',
  'System.Reason',
  'System.PersonId',
  'System.AreaId',
  'System.IterationId',
  'System.NodeName',
  'System.TeamProject',
  'System.CreatedDate',
  'System.CreatedBy',
  'System.WorkItemType',
  'System.IsDeleted',
  'System.Parent',
  'System.ExternalLinkCount',
  'System.RelatedLinkCount',
  'System.HyperLinkCount',
  'System.AttachedFileCount',
  'System.RemoteLinkCount',
  'Microsoft.VSTS.Common.StateChangeDate',
  'Microsoft.VSTS.Common.StackRank',
  'Microsoft.VSTS.Common.BacklogPriority',
]);

/** ADO's own bookkeeping: who activated, resolved or closed it and when, Kanban columns. */
const NOISE_PATTERN =
  /^(?:Microsoft\.VSTS\.Common\.(?:Activated|Resolved|Closed)(?:Date|By)|WEF_[^.]+_Kanban\.)/;

const FIELD_LABEL: Record<string, string> = {
  'System.AssignedTo': 'Assigned to',
  'System.Title': 'Title',
  'System.IterationPath': 'Iteration',
  'System.AreaPath': 'Area',
  'Microsoft.VSTS.Common.Priority': 'Priority',
  'Microsoft.VSTS.Common.Severity': 'Severity',
  'Microsoft.VSTS.Scheduling.Effort': 'Effort',
  'Microsoft.VSTS.Scheduling.StoryPoints': 'Story points',
  'Microsoft.VSTS.Scheduling.RemainingWork': 'Remaining work',
  'Microsoft.VSTS.Scheduling.OriginalEstimate': 'Original estimate',
  'Microsoft.VSTS.Scheduling.CompletedWork': 'Completed work',
  'Microsoft.VSTS.TCM.ReproSteps': 'Repro Steps',
  'Microsoft.VSTS.Common.AcceptanceCriteria': 'Acceptance Criteria',
  'System.Description': 'Description',
  'Custom.DeveloperNotes': 'Developer Notes',
};

const PATH_FIELDS = new Set(['System.IterationPath', 'System.AreaPath']);

function isNoise(field: string): boolean {
  return NOISE_FIELDS.has(field) || NOISE_PATTERN.test(field);
}

/** "Dana Reyes <dana@acme.example>" and identity objects both read as "Dana Reyes". */
function displayValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (field === 'Microsoft.VSTS.Common.Priority') return `P${value}`;
  if (PATH_FIELDS.has(field)) {
    const path = String(value);
    return path.split(/[\\/]/).pop() || path;
  }
  const text = formatFieldValue(value);
  if (text === null) return null;
  return text.replace(/\s*<[^>]+@[^>]+>$/, '').trim() || null;
}

const LONG_TEXT_FIELDS = new Set([
  'System.Description',
  'Microsoft.VSTS.TCM.ReproSteps',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.TCM.SystemInfo',
  'Custom.DeveloperNotes',
]);

function isLongText(field: string, change: { oldValue?: unknown; newValue?: unknown }): boolean {
  if (LONG_TEXT_FIELDS.has(field)) return true;
  const sample = typeof change.newValue === 'string' ? change.newValue : change.oldValue;
  return typeof sample === 'string' && (looksLikeHtml(sample) || sample.length > 120);
}

function tagList(value: unknown): string[] {
  return typeof value === 'string'
    ? value
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
}

// ---- Links ----

const AZURE_REPOS_PR = /Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)/i;
const GITHUB_PR = /^vstfs:\/\/\/GitHub\/PullRequest\/[^%/]+%2F(\d+)$/i;
const WORK_ITEM_AT_END = /\/workItems\/(\d+)$/i;

const ITEM_LINK_LABEL: Record<string, string> = {
  'System.LinkTypes.Hierarchy-Reverse': 'parent',
  'System.LinkTypes.Hierarchy-Forward': 'child',
  'System.LinkTypes.Related': 'related',
  'System.LinkTypes.Duplicate-Forward': 'duplicate',
  'System.LinkTypes.Duplicate-Reverse': 'duplicate of',
  'System.LinkTypes.Dependency-Forward': 'successor',
  'System.LinkTypes.Dependency-Reverse': 'predecessor',
};

function pullRequestNumber(url: string): number | null {
  const github = GITHUB_PR.exec(url);
  if (github) return Number(github[1]);
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Keep the raw URL.
  }
  const azure = AZURE_REPOS_PR.exec(decoded);
  return azure ? Number(azure[1]) : null;
}

function attribute(relation: WorkItemRelation, name: string): string | null {
  const value = relation.attributes?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function toActivityLink(relation: WorkItemRelation, removed: boolean): ActivityLink {
  if (relation.rel === 'ArtifactLink') {
    const number = pullRequestNumber(relation.url);
    if (number !== null) {
      const comment = attribute(relation, 'comment');
      return { kind: 'pr', label: 'pull request', number, detail: comment, removed };
    }
    return {
      kind: 'artifact',
      label: (attribute(relation, 'name') ?? 'artifact').toLowerCase(),
      number: null,
      detail: null,
      removed,
    };
  }
  if (relation.rel === 'Hyperlink') {
    return { kind: 'hyperlink', label: 'link', number: null, detail: relation.url, removed };
  }
  if (relation.rel === 'AttachedFile') {
    return {
      kind: 'attachment',
      label: 'attachment',
      number: null,
      detail: attribute(relation, 'name'),
      removed,
    };
  }
  const id = WORK_ITEM_AT_END.exec(relation.url);
  return {
    kind: 'item',
    label: ITEM_LINK_LABEL[relation.rel] ?? (attribute(relation, 'name') ?? 'linked').toLowerCase(),
    number: id ? Number(id[1]) : null,
    detail: null,
    removed,
  };
}

// ---- Agent steps ----

/** sha256, sha1 and other long hex strings, with the key they were written with. */
const PROOF = /(?:\b([\w-]+)\s*[=:]\s*)?\b([0-9a-f]{32,})\b/gi;
const WARN = /\b(?:fail(?:ed|s|ing)?|blocked|repair|error|rejected)\b/i;
const SUMMARY_LIMIT = 160;

/** `481c5a2a…5e7bbbb`: enough of a hash to recognise it. */
export function shortHash(hash: string): string {
  return hash.length <= 18 ? hash : `${hash.slice(0, 8)}…${hash.slice(-7)}`;
}

/** One line without its proofs, and without the dashes they leave behind. */
function withoutProofs(line: string): string {
  return line
    .replace(PROOF, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/(?:\s*[—-]\s+){2,}/g, ' — ')
    .replace(/^[\s—:-]+/, '')
    .trim();
}

function toAgentStep(comment: WorkItemComment, kind: string, body: string): AgentStep {
  const proofs: AgentProof[] = [];
  for (const match of body.matchAll(PROOF)) {
    const value = match[2]!;
    if (!proofs.some((p) => p.value === value)) {
      proofs.push({ label: match[1]?.toLowerCase() ?? 'proof', value });
    }
  }
  const lines = body.split('\n').map(withoutProofs).filter(Boolean);
  const flat = lines.join(' ');
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(flat)?.[1] ?? flat;
  const summary = clip(sentence, SUMMARY_LIMIT);
  const first = lines[0] ?? '';
  // The detail is what the summary leaves out: the first line loses its first sentence.
  const rest = first.startsWith(sentence) ? first.slice(sentence.length).trim() : first;
  const detail = [rest, ...lines.slice(1)].filter(Boolean).join('\n');
  return {
    id: comment.id,
    at: comment.createdDate,
    kind,
    summary,
    detail: summary.endsWith('…') ? lines.join('\n') : detail,
    proofs,
    warn: WARN.test(kind) || WARN.test(summary),
  };
}

// ---- Days ----

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "10 Nov", with the year when it is not this year's. */
export function shortDate(iso: string, now: number): string {
  const date = new Date(iso);
  const base = `${date.getDate()} ${MONTH[date.getMonth()]}`;
  return date.getFullYear() === new Date(now).getFullYear()
    ? base
    : `${base} ${date.getFullYear()}`;
}

/** "09:12" in local time. */
export function clockTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "7 – 11 Nov", "30 Oct – 2 Nov", or one date when both fall on the same day. */
export function dateRange(fromIso: string, toIso: string, now: number): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (dayKey(from) === dayKey(to)) return shortDate(toIso, now);
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${from.getDate()} – ${shortDate(toIso, now)}`;
  }
  return `${shortDate(fromIso, now)} – ${shortDate(toIso, now)}`;
}

function dayLabel(date: Date, now: number): string {
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const key = dayKey(date);
  if (key === dayKey(today)) return 'Today';
  if (key === dayKey(yesterday)) return 'Yesterday';
  return `${WEEKDAY[date.getDay()]} ${shortDate(date.toISOString(), now)}`;
}

// ---- Building ----

function byId<T extends { id: number }>(list: readonly T[]): T[] {
  const seen = new Map<number, T>();
  for (const entry of list) seen.set(entry.id, entry);
  return [...seen.values()];
}

function updateEvents(update: WorkItemUpdate): ActivityEvent[] {
  const author = update.revisedBy?.displayName?.replace(/\s*<[^>]+>$/, '') || 'Someone';
  const at =
    typeof update.fields?.['System.ChangedDate']?.newValue === 'string'
      ? (update.fields['System.ChangedDate'].newValue as string)
      : update.revisedDate;
  const base = { at, author };
  const events: ActivityEvent[] = [];
  const fields = update.fields ?? {};

  if (update.rev === 1) {
    const type = fields['System.WorkItemType']?.newValue;
    events.push({
      ...base,
      key: `u:${update.id}:created`,
      kind: 'created',
      workItemType: typeof type === 'string' ? type : null,
    });
  } else {
    const state = fields['System.State'];
    if (state && typeof state.newValue === 'string' && state.newValue !== state.oldValue) {
      events.push({
        ...base,
        key: `u:${update.id}:state`,
        kind: 'state',
        from: typeof state.oldValue === 'string' ? state.oldValue : null,
        to: state.newValue,
      });
    }

    const changes: ActivityFieldChange[] = [];
    let tagsAdded: string[] = [];
    let tagsRemoved: string[] = [];
    for (const [field, change] of Object.entries(fields)) {
      if (field === 'System.State' || isNoise(field)) continue;
      if (field === 'System.Tags') {
        const before = tagList(change.oldValue);
        const after = tagList(change.newValue);
        tagsAdded = after.filter((t) => !before.includes(t));
        tagsRemoved = before.filter((t) => !after.includes(t));
        continue;
      }
      const label = FIELD_LABEL[field] ?? friendlyLabel(field);
      if (isLongText(field, change)) {
        changes.push({ field, label, from: null, to: null, edited: true });
        continue;
      }
      const from = displayValue(field, change.oldValue);
      const to = displayValue(field, change.newValue);
      if (from === to) continue;
      changes.push({ field, label, from, to });
    }
    if (changes.length > 0 || tagsAdded.length > 0 || tagsRemoved.length > 0) {
      events.push({
        ...base,
        key: `u:${update.id}:fields`,
        kind: 'fields',
        changes,
        tagsAdded,
        tagsRemoved,
      });
    }
  }

  const links = [
    ...(update.relations?.added ?? []).map((r) => toActivityLink(r, false)),
    ...(update.relations?.removed ?? []).map((r) => toActivityLink(r, true)),
  ];
  if (links.length > 0) {
    events.push({ ...base, key: `u:${update.id}:links`, kind: 'link', links });
  }
  return events;
}

interface Run {
  signer: string;
  steps: AgentStep[];
}

function runEvent(run: Run): ActivityEvent {
  const newestFirst = [...run.steps].reverse();
  const oldest = run.steps[0]!;
  return {
    key: `run:${oldest.id}`,
    kind: 'agentRun',
    author: run.signer,
    at: newestFirst[0]!.at,
    since: oldest.at,
    steps: newestFirst,
  };
}

function commentEvents(
  comments: readonly WorkItemComment[],
  fold: boolean,
): { events: ActivityEvent[]; signers: Set<string>; steps: number; human: number } {
  const events: ActivityEvent[] = [];
  const signers = new Set<string>();
  let steps = 0;
  let human = 0;
  let run: Run | null = null;
  const closeRun = () => {
    if (run) events.push(runEvent(run));
    run = null;
  };
  const sorted = [...comments].sort(
    (a, b) => Date.parse(a.createdDate) - Date.parse(b.createdDate) || a.id - b.id,
  );
  for (const comment of sorted) {
    const signature = readSignature(htmlToText(comment.text));
    if (!signature) {
      closeRun();
      human++;
      events.push({
        key: `c:${comment.id}`,
        kind: 'comment',
        at: comment.createdDate,
        author: comment.createdBy.displayName,
        html: comment.text,
      });
      continue;
    }
    steps++;
    signers.add(signature.signer);
    const step = toAgentStep(comment, signature.kind, signature.body);
    const current = run as Run | null;
    if (fold && current && current.signer === signature.signer) {
      current.steps.push(step);
    } else {
      closeRun();
      run = { signer: signature.signer, steps: [step] };
    }
    if (!fold) closeRun();
  }
  closeRun();
  return { events, signers, steps, human };
}

function matches(event: ActivityEvent, filter: ActivityFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'comments':
      return event.kind === 'comment';
    case 'agent':
      return event.kind === 'agentRun';
    case 'changes':
      return (
        event.kind === 'state' ||
        event.kind === 'fields' ||
        event.kind === 'link' ||
        event.kind === 'created'
      );
  }
}

/**
 * The Activity tab's timeline: the item's revisions (state, fields, links)
 * and its discussion, newest first, by day. An agent's signed comments
 * (`Vera · plan — …`) fold into one run until someone else comments.
 */
export function buildActivity(
  updates: readonly WorkItemUpdate[],
  comments: readonly WorkItemComment[],
  { now, filter = 'all', foldAgentRuns = true }: BuildActivityOptions,
): Activity {
  const changes = byId(updates).flatMap(updateEvents);
  const said = commentEvents(byId(comments), foldAgentRuns);
  const all = [...changes, ...said.events].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at) || b.key.localeCompare(a.key),
  );

  const days: ActivityDay[] = [];
  for (const event of all) {
    if (!matches(event, filter)) continue;
    const date = new Date(event.at);
    const key = dayKey(date);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: dayLabel(date, now), events: [] };
      days.push(day);
    }
    day.events.push(event);
  }

  const changeCount = changes.length;
  return {
    days,
    counts: {
      all: changeCount + said.human + said.steps,
      comments: said.human,
      changes: changeCount,
      agent: said.steps,
    },
    agentName: said.signers.size === 1 ? [...said.signers][0]! : null,
  };
}
