import { refKey } from './identity';
import {
  type Decision,
  type EvidenceRule,
  LIMITS,
  type LogEntry,
  MEMBER_ROLES,
  type Member,
  type NextAction,
  type Outcome,
  type Proposal,
  type Relation,
  SCHEMA_VERSION,
  type SourceRef,
  type Verification,
  WORKSTREAM_STATUSES,
  type WorkstreamDocument,
  type WorkstreamRun,
} from './types';

/**
 * Reading a workstream file. Fields this version knows are checked and given
 * defaults; fields it does not know are kept as they are, so two BorgDock
 * versions sharing a folder don't strip each other's data.
 */

export type ReadResult =
  | {
      ok: true;
      document: WorkstreamDocument;
      /** Written by a newer BorgDock: shown, never written. */
      readOnly: boolean;
      /** What was wrong and was dropped or repaired. */
      problems: string[];
    }
  | { ok: false; reason: string };

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** A reference as stored, or `null` when it can't be one. */
export function readRef(raw: unknown): SourceRef | null {
  if (!isObject(raw)) return null;
  switch (raw.kind) {
    case 'github-pr':
      if (!isNonEmpty(raw.owner) || !isNonEmpty(raw.repo) || !Number.isInteger(raw.number)) {
        return null;
      }
      return {
        ...raw,
        kind: 'github-pr',
        owner: raw.owner,
        repo: raw.repo,
        number: raw.number as number,
      };
    case 'ado-item':
      if (!isNonEmpty(raw.organization) || !Number.isInteger(raw.id)) return null;
      return {
        ...raw,
        kind: 'ado-item',
        organization: raw.organization,
        project: text(raw.project),
        id: raw.id as number,
      };
    case 't3-thread':
      if (!isNonEmpty(raw.environmentId) || !isNonEmpty(raw.threadId)) return null;
      return {
        ...raw,
        kind: 't3-thread',
        environmentId: raw.environmentId,
        threadId: raw.threadId,
        hostId: text(raw.hostId),
      };
    case 'link':
      if (!isNonEmpty(raw.url)) return null;
      return { ...raw, kind: 'link', url: raw.url, title: text(raw.title, raw.url) };
    default:
      return null;
  }
}

export function emptyVerification(): Verification {
  return {
    state: 'unverified',
    at: null,
    device: null,
    facts: [],
    evidence: [],
    note: '',
    proposedBy: null,
  };
}

function readVerification(raw: unknown): Verification {
  if (!isObject(raw)) return emptyVerification();
  const state = ['unverified', 'verified', 'confirmed', 'invalidated'].includes(raw.state as string)
    ? (raw.state as Verification['state'])
    : 'unverified';
  return {
    ...raw,
    state,
    at: optionalText(raw.at),
    device: optionalText(raw.device),
    facts: list(raw.facts).filter(isObject) as unknown as Verification['facts'],
    evidence: list(raw.evidence).filter(isNonEmpty),
    note: text(raw.note),
    proposedBy: optionalText(raw.proposedBy),
  };
}

function readRule(raw: unknown): EvidenceRule | null {
  if (!isObject(raw) || !isNonEmpty(raw.id) || !isNonEmpty(raw.kind) || !isNonEmpty(raw.target)) {
    return null;
  }
  return { ...raw, id: raw.id, kind: raw.kind, target: raw.target, value: optionalText(raw.value) };
}

function readMember(raw: unknown, problems: string[]): Member | null {
  if (!isObject(raw)) return null;
  const ref = readRef(raw.ref);
  if (!ref) {
    problems.push('A member with an unreadable reference was left out.');
    return null;
  }
  const role = MEMBER_ROLES.includes(raw.role as Member['role'])
    ? (raw.role as Member['role'])
    : 'supporting';
  return {
    ...raw,
    key: refKey(ref),
    ref,
    role,
    label: text(raw.label),
    note: text(raw.note),
    addedAt: text(raw.addedAt),
    addedBy: (['you', 'suggestion', 'agent', 'run'] as const).includes(raw.addedBy as never)
      ? (raw.addedBy as Member['addedBy'])
      : 'you',
  };
}

function readOutcome(raw: unknown): Outcome | null {
  if (!isObject(raw) || !isNonEmpty(raw.id)) return null;
  return {
    ...raw,
    id: raw.id,
    title: text(raw.title),
    required: raw.required !== false,
    rules: list(raw.rules)
      .map(readRule)
      .filter((rule): rule is EvidenceRule => rule !== null),
    verification: readVerification(raw.verification),
  };
}

function readRelation(raw: unknown): Relation | null {
  if (!isObject(raw) || !isNonEmpty(raw.id) || !isNonEmpty(raw.from) || !isNonEmpty(raw.to)) {
    return null;
  }
  if (raw.kind !== 'blocks' && raw.kind !== 'supersedes') return null;
  return { ...raw, id: raw.id, kind: raw.kind, from: raw.from, to: raw.to, note: text(raw.note) };
}

function readDecision(raw: unknown): Decision | null {
  if (!isObject(raw) || !isNonEmpty(raw.id)) return null;
  const rolesBefore: Decision['rolesBefore'] = {};
  if (isObject(raw.rolesBefore)) {
    for (const [key, role] of Object.entries(raw.rolesBefore)) {
      if (MEMBER_ROLES.includes(role as Member['role'])) rolesBefore[key] = role as Member['role'];
    }
  }
  return {
    ...raw,
    id: raw.id,
    question: text(raw.question),
    options: list(raw.options).filter(isNonEmpty),
    status: raw.status === 'decided' ? 'decided' : 'open',
    chosen: optionalText(raw.chosen),
    rationale: text(raw.rationale),
    decidedAt: optionalText(raw.decidedAt),
    rolesBefore,
  };
}

function readNextAction(raw: unknown): NextAction | null {
  if (!isObject(raw) || typeof raw.text !== 'string') return null;
  return {
    ...raw,
    text: raw.text,
    target: optionalText(raw.target),
    setAt: text(raw.setAt),
    setBy: raw.setBy === 'agent' || raw.setBy === 'suggestion' ? raw.setBy : 'you',
  };
}

function readProposal(raw: unknown): Proposal | null {
  if (!isObject(raw) || !isNonEmpty(raw.id) || !isNonEmpty(raw.runKey)) return null;
  return {
    ...raw,
    id: raw.id,
    runKey: raw.runKey,
    at: text(raw.at),
    items: list(raw.items).filter(
      (item): item is Proposal['items'][number] =>
        isObject(item) && isNonEmpty(item.id) && isNonEmpty(item.kind),
    ),
    dropped: list(raw.dropped).filter((d): d is string => typeof d === 'string'),
  };
}

function readRun(raw: unknown): WorkstreamRun | null {
  if (!isObject(raw) || !isNonEmpty(raw.key)) return null;
  return {
    ...raw,
    key: raw.key,
    kind: raw.kind === 'work' ? 'work' : 'review',
    startedAt: text(raw.startedAt),
    device: text(raw.device),
    read: raw.read === true,
  };
}

function readLog(raw: unknown): LogEntry | null {
  if (!isObject(raw) || !isNonEmpty(raw.id) || !isNonEmpty(raw.kind)) return null;
  return {
    ...raw,
    id: raw.id,
    at: text(raw.at),
    device: text(raw.device),
    kind: raw.kind as LogEntry['kind'],
    summary: text(raw.summary),
    refs: list(raw.refs).filter(isNonEmpty),
  };
}

function compact<T>(values: (T | null)[]): T[] {
  return values.filter((value): value is T => value !== null);
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Parse what a workstream file holds. */
export function readDocument(raw: unknown): ReadResult {
  if (!isObject(raw)) return { ok: false, reason: 'The file does not hold a workstream.' };
  if (!isNonEmpty(raw.id)) return { ok: false, reason: 'The workstream has no id.' };
  if (typeof raw.schema !== 'number' || raw.schema < 1) {
    return { ok: false, reason: 'The file names no schema version.' };
  }
  const problems: string[] = [];
  const members = uniqueBy(
    compact(list(raw.members).map((m) => readMember(m, problems))),
    (m) => m.key,
  );
  const outcomes = uniqueBy(compact(list(raw.outcomes).map(readOutcome)), (o) => o.id);
  const decisions = uniqueBy(compact(list(raw.decisions).map(readDecision)), (d) => d.id);
  const nodes = new Set<string>([
    ...members.map((m) => m.key),
    ...outcomes.map((o) => `outcome:${o.id}`),
    ...decisions.map((d) => `decision:${d.id}`),
  ]);
  const relations = uniqueBy(compact(list(raw.relations).map(readRelation)), (r) => r.id).filter(
    (relation) => {
      const kept = nodes.has(relation.from) && nodes.has(relation.to);
      if (!kept) problems.push('A relation to something no longer in the workstream was left out.');
      return kept;
    },
  );
  const writtenBy = isObject(raw.writtenBy) ? raw.writtenBy : {};
  const status = WORKSTREAM_STATUSES.includes(raw.status as never)
    ? (raw.status as WorkstreamDocument['status'])
    : 'active';
  const document: WorkstreamDocument = {
    ...raw,
    schema: raw.schema,
    id: raw.id,
    revision: Number.isInteger(raw.revision) ? (raw.revision as number) : 0,
    updatedAt: text(raw.updatedAt),
    writtenBy: { deviceId: text(writtenBy.deviceId), deviceLabel: text(writtenBy.deviceLabel) },
    title: text(raw.title, 'Untitled workstream'),
    goal: text(raw.goal),
    status,
    pinned: raw.pinned === true,
    members,
    outcomes,
    relations,
    decisions: decisions.map((decision) => ({
      ...decision,
      options: decision.options.filter((key) => nodes.has(key)),
    })),
    nextAction: readNextAction(raw.nextAction),
    proposals: uniqueBy(compact(list(raw.proposals).map(readProposal)), (p) => p.id),
    runs: uniqueBy(compact(list(raw.runs).map(readRun)), (r) => r.key),
    dismissedSuggestions: list(raw.dismissedSuggestions).filter(isNonEmpty),
    log: uniqueBy(compact(list(raw.log).map(readLog)), (l) => l.id),
    createdAt: text(raw.createdAt),
    completedAt: optionalText(raw.completedAt),
  };
  return { ok: true, document, readOnly: raw.schema > SCHEMA_VERSION, problems };
}

export interface Device {
  deviceId: string;
  deviceLabel: string;
}

/** A new, empty workstream. */
export function newDocument(title: string, now: string, device: Device): WorkstreamDocument {
  return {
    schema: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    revision: 0,
    updatedAt: now,
    writtenBy: device,
    title: title.trim().slice(0, LIMITS.title) || 'Untitled workstream',
    goal: '',
    status: 'active',
    pinned: false,
    members: [],
    outcomes: [],
    relations: [],
    decisions: [],
    nextAction: null,
    proposals: [],
    runs: [],
    dismissedSuggestions: [],
    log: [],
    createdAt: now,
    completedAt: null,
  };
}

/** What makes `document` too big to save, or `null` when it fits. */
export function limitProblem(document: WorkstreamDocument): string | null {
  if (document.title.length > LIMITS.title)
    return `A title holds at most ${LIMITS.title} characters.`;
  if (document.goal.length > LIMITS.goal) return `A goal holds at most ${LIMITS.goal} characters.`;
  if (document.members.length > LIMITS.members) {
    return `A workstream holds at most ${LIMITS.members} members.`;
  }
  if (document.outcomes.length > LIMITS.outcomes) {
    return `A workstream holds at most ${LIMITS.outcomes} outcomes.`;
  }
  if (document.relations.length > LIMITS.relations) {
    return `A workstream holds at most ${LIMITS.relations} relations.`;
  }
  if (document.decisions.length > LIMITS.decisions) {
    return `A workstream holds at most ${LIMITS.decisions} decisions.`;
  }
  if ((document.nextAction?.text.length ?? 0) > LIMITS.nextAction) {
    return `A next action holds at most ${LIMITS.nextAction} characters.`;
  }
  const longNote = [...document.members, ...document.relations].some(
    (entry) => entry.note.length > LIMITS.note,
  );
  if (longNote) return `A note holds at most ${LIMITS.note} characters.`;
  if (document.outcomes.some((o) => o.rules.length > LIMITS.rules)) {
    return `An outcome holds at most ${LIMITS.rules} rules.`;
  }
  return null;
}
