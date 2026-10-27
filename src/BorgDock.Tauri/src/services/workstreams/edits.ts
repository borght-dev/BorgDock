import { wouldCycle } from './graph';
import { decisionKey, isOutcomeKey, outcomeKey, refKey, shortIdentity } from './identity';
import { emptyVerification, limitProblem } from './schema';
import {
  type AddedBy,
  type EvidenceRule,
  LIMITS,
  type LogKind,
  type Member,
  type MemberRole,
  type NodeKey,
  type Outcome,
  type Proposal,
  type ProposalItem,
  type RefKey,
  type RelationKind,
  ROLE_LABEL,
  type SourceRef,
  type Verification,
  type WorkstreamDocument,
  type WorkstreamRun,
  type WorkstreamStatus,
} from './types';

/**
 * Every change to a workstream, as a pure function from one document to the
 * next. Each one writes its own line to the log, so the Activity tab and the
 * other machine both see what changed and where.
 */

export interface EditContext {
  now: string;
  /** The device label, for the log and for provenance. */
  device: string;
}

export type EditResult = { document: WorkstreamDocument } | { error: string };

function id(): string {
  return crypto.randomUUID();
}

function withLog(
  document: WorkstreamDocument,
  context: EditContext,
  kind: LogKind,
  summary: string,
  refs: NodeKey[] = [],
): WorkstreamDocument {
  const entry = { id: id(), at: context.now, device: context.device, kind, summary, refs };
  return { ...document, log: [entry, ...document.log].slice(0, LIMITS.log) };
}

function done(document: WorkstreamDocument): EditResult {
  const problem = limitProblem(document);
  return problem ? { error: problem } : { document };
}

function memberName(document: WorkstreamDocument, key: NodeKey): string {
  const member = document.members.find((m) => m.key === key);
  if (member) return member.label || shortIdentity(member.ref);
  if (isOutcomeKey(key)) {
    const outcome = document.outcomes.find((o) => outcomeKey(o.id) === key);
    if (outcome) return `outcome "${outcome.title}"`;
  }
  const decision = document.decisions.find((d) => decisionKey(d.id) === key);
  return decision ? `decision "${decision.question}"` : key;
}

// ── The workstream itself ───────────────────────────────────

export function setTitle(
  document: WorkstreamDocument,
  title: string,
  context: EditContext,
): EditResult {
  const trimmed = title.trim();
  if (!trimmed) return { error: 'Give the workstream a title.' };
  if (trimmed === document.title) return { document };
  return done(
    withLog({ ...document, title: trimmed }, context, 'edited', `Renamed to "${trimmed}"`),
  );
}

export function setGoal(
  document: WorkstreamDocument,
  goal: string,
  context: EditContext,
): EditResult {
  if (goal === document.goal) return { document };
  return done(withLog({ ...document, goal }, context, 'edited', 'Changed the goal'));
}

const STATUS_SUMMARY: Record<WorkstreamStatus, string> = {
  active: 'Resumed',
  paused: 'Paused',
  done: 'Completed',
  archived: 'Archived',
};

export function setStatus(
  document: WorkstreamDocument,
  status: WorkstreamStatus,
  context: EditContext,
): EditResult {
  if (status === document.status) return { document };
  const completedAt =
    status === 'done' ? context.now : status === 'archived' ? document.completedAt : null;
  return done(
    withLog({ ...document, status, completedAt }, context, 'status', STATUS_SUMMARY[status]),
  );
}

export function setPinned(document: WorkstreamDocument, pinned: boolean): EditResult {
  return { document: { ...document, pinned } };
}

export function setNextAction(
  document: WorkstreamDocument,
  text: string,
  target: NodeKey | null,
  setBy: 'you' | 'agent' | 'suggestion',
  context: EditContext,
): EditResult {
  const trimmed = text.trim();
  if (!trimmed) {
    if (!document.nextAction) return { document };
    return done(
      withLog({ ...document, nextAction: null }, context, 'next-action', 'Cleared the next action'),
    );
  }
  if (document.nextAction?.text === trimmed && document.nextAction.target === target) {
    return { document };
  }
  const nextAction = { text: trimmed, target, setAt: context.now, setBy };
  const by =
    setBy === 'agent' ? ' (proposed by the agent)' : setBy === 'suggestion' ? ' (suggested)' : '';
  return done(
    withLog(
      { ...document, nextAction },
      context,
      'next-action',
      `Next action: ${trimmed}${by}`,
      target ? [target] : [],
    ),
  );
}

// ── Members ─────────────────────────────────────────────────

export interface NewMember {
  ref: SourceRef;
  label: string;
  role?: MemberRole;
  note?: string;
  addedBy?: AddedBy;
}

export function addMembers(
  document: WorkstreamDocument,
  members: readonly NewMember[],
  context: EditContext,
): EditResult {
  const known = new Set(document.members.map((m) => m.key));
  const added: Member[] = [];
  for (const member of members) {
    const key = refKey(member.ref);
    if (known.has(key)) continue;
    known.add(key);
    added.push({
      key,
      ref: member.ref,
      role: member.role ?? 'supporting',
      label: member.label.trim().slice(0, LIMITS.title),
      note: (member.note ?? '').slice(0, LIMITS.note),
      addedAt: context.now,
      addedBy: member.addedBy ?? 'you',
    });
  }
  if (added.length === 0) return { document };
  const names = added.map((m) => m.label || shortIdentity(m.ref));
  const summary =
    added.length === 1
      ? `Added ${names[0]}`
      : `Added ${added.length} records: ${names.slice(0, 3).join(', ')}${added.length > 3 ? '…' : ''}`;
  return done(
    withLog(
      { ...document, members: [...document.members, ...added] },
      context,
      'member-added',
      summary,
      added.map((m) => m.key),
    ),
  );
}

/** Take a member out, with every relation, rule and option that points at it. */
export function removeMember(
  document: WorkstreamDocument,
  key: RefKey,
  context: EditContext,
): EditResult {
  const member = document.members.find((m) => m.key === key);
  if (!member) return { document };
  const name = memberName(document, key);
  const next: WorkstreamDocument = {
    ...document,
    members: document.members.filter((m) => m.key !== key),
    relations: document.relations.filter((r) => r.from !== key && r.to !== key),
    decisions: document.decisions.map((d) => ({
      ...d,
      options: d.options.filter((option) => option !== key),
      chosen: d.chosen === key ? null : d.chosen,
      status: d.chosen === key ? 'open' : d.status,
    })),
    outcomes: document.outcomes.map((o) => ({
      ...o,
      rules: o.rules.filter((rule) => rule.target !== key),
      verification: {
        ...o.verification,
        evidence: o.verification.evidence.filter((e) => e !== key),
      },
    })),
    nextAction:
      document.nextAction?.target === key
        ? { ...document.nextAction, target: null }
        : document.nextAction,
  };
  return done(withLog(next, context, 'member-removed', `Removed ${name}`, [key]));
}

export function setMemberRole(
  document: WorkstreamDocument,
  key: RefKey,
  role: MemberRole,
  context: EditContext,
): EditResult {
  const member = document.members.find((m) => m.key === key);
  if (!member || member.role === role) return { document };
  return done(
    withLog(
      { ...document, members: document.members.map((m) => (m.key === key ? { ...m, role } : m)) },
      context,
      'member-role',
      `${memberName(document, key)} is now ${ROLE_LABEL[role].toLowerCase()}`,
      [key],
    ),
  );
}

export function setMemberNote(document: WorkstreamDocument, key: RefKey, note: string): EditResult {
  return done({
    ...document,
    members: document.members.map((m) => (m.key === key ? { ...m, note } : m)),
  });
}

/**
 * Point a member at another record: a repository that was renamed, a thread
 * on a host that was added again. Everything that pointed at the old key
 * follows.
 */
export function relinkMember(
  document: WorkstreamDocument,
  oldKey: RefKey,
  ref: SourceRef,
  context: EditContext,
): EditResult {
  const newKey = refKey(ref);
  const member = document.members.find((m) => m.key === oldKey);
  if (!member) return { document };
  if (newKey !== oldKey && document.members.some((m) => m.key === newKey)) {
    return { error: 'That record is in the workstream already.' };
  }
  const swap = (key: NodeKey) => (key === oldKey ? newKey : key);
  const next: WorkstreamDocument = {
    ...document,
    members: document.members.map((m) => (m.key === oldKey ? { ...m, key: newKey, ref } : m)),
    relations: document.relations.map((r) => ({ ...r, from: swap(r.from), to: swap(r.to) })),
    decisions: document.decisions.map((d) => {
      const rolesBefore = { ...d.rolesBefore };
      if (oldKey in rolesBefore) {
        rolesBefore[newKey] = rolesBefore[oldKey]!;
        delete rolesBefore[oldKey];
      }
      return {
        ...d,
        options: d.options.map(swap),
        chosen: d.chosen ? swap(d.chosen) : null,
        rolesBefore,
      };
    }),
    outcomes: document.outcomes.map((o) => ({
      ...o,
      rules: o.rules.map((rule) => ({ ...rule, target: swap(rule.target) })),
      verification: { ...o.verification, evidence: o.verification.evidence.map(swap) },
    })),
    nextAction: document.nextAction
      ? {
          ...document.nextAction,
          target: document.nextAction.target ? swap(document.nextAction.target) : null,
        }
      : null,
    runs: document.runs.map((run) => ({ ...run, key: swap(run.key) })),
  };
  if (newKey === oldKey) return done(next);
  return done(
    withLog(next, context, 'relinked', `Relinked ${memberName(document, oldKey)}`, [newKey]),
  );
}

// ── Relations ───────────────────────────────────────────────

function nodeExists(document: WorkstreamDocument, key: NodeKey): boolean {
  return (
    document.members.some((m) => m.key === key) ||
    document.outcomes.some((o) => outcomeKey(o.id) === key) ||
    document.decisions.some((d) => decisionKey(d.id) === key)
  );
}

export function addRelation(
  document: WorkstreamDocument,
  kind: RelationKind,
  from: NodeKey,
  to: NodeKey,
  note: string,
  context: EditContext,
): EditResult {
  if (!nodeExists(document, from) || !nodeExists(document, to)) {
    return { error: 'Both ends must be in the workstream.' };
  }
  if (document.relations.some((r) => r.kind === kind && r.from === from && r.to === to)) {
    return { document };
  }
  const cycle = wouldCycle(document.relations, kind, from, to);
  if (cycle) {
    const path = cycle.map((key) => memberName(document, key)).join(' → ');
    return { error: `That would make a circle: ${path}.` };
  }
  const relation = { id: id(), kind, from, to, note: note.slice(0, LIMITS.note) };
  const verb = kind === 'blocks' ? 'blocks' : 'supersedes';
  return done(
    withLog(
      { ...document, relations: [...document.relations, relation] },
      context,
      'relation-added',
      `${memberName(document, from)} ${verb} ${memberName(document, to)}`,
      [from, to],
    ),
  );
}

export function removeRelation(
  document: WorkstreamDocument,
  relationId: string,
  context: EditContext,
): EditResult {
  const relation = document.relations.find((r) => r.id === relationId);
  if (!relation) return { document };
  const verb = relation.kind === 'blocks' ? 'no longer blocks' : 'no longer supersedes';
  return done(
    withLog(
      { ...document, relations: document.relations.filter((r) => r.id !== relationId) },
      context,
      'relation-removed',
      `${memberName(document, relation.from)} ${verb} ${memberName(document, relation.to)}`,
      [relation.from, relation.to],
    ),
  );
}

// ── Decisions ───────────────────────────────────────────────

export function openDecision(
  document: WorkstreamDocument,
  question: string,
  options: readonly RefKey[],
  context: EditContext,
): EditResult & { decisionId?: string } {
  const trimmed = question.trim();
  if (!trimmed) return { error: 'Say what has to be decided.' };
  const unique = [...new Set(options)].filter((key) => document.members.some((m) => m.key === key));
  if (unique.length < 2) return { error: 'A decision needs at least two alternatives.' };
  const decision = {
    id: id(),
    question: trimmed,
    options: unique,
    status: 'open' as const,
    chosen: null,
    rationale: '',
    decidedAt: null,
    rolesBefore: {},
  };
  const result = done(
    withLog(
      { ...document, decisions: [...document.decisions, decision] },
      context,
      'decision-opened',
      `Opened: ${trimmed}`,
      unique,
    ),
  );
  return 'document' in result ? { ...result, decisionId: decision.id } : result;
}

export function updateDecision(
  document: WorkstreamDocument,
  decisionId: string,
  question: string,
  options: readonly RefKey[],
): EditResult {
  const decision = document.decisions.find((d) => d.id === decisionId);
  if (!decision) return { document };
  if (decision.status === 'decided') return { error: 'Reopen the decision to change it.' };
  const unique = [...new Set(options)].filter((key) => document.members.some((m) => m.key === key));
  if (unique.length < 2) return { error: 'A decision needs at least two alternatives.' };
  return done({
    ...document,
    decisions: document.decisions.map((d) =>
      d.id === decisionId ? { ...d, question: question.trim() || d.question, options: unique } : d,
    ),
  });
}

/**
 * Keep `chosen`: the other alternatives become superseded, each superseded by
 * the chosen one, and the decision records why. Nothing is closed, settled or
 * moved at the source.
 */
export function decide(
  document: WorkstreamDocument,
  decisionId: string,
  chosen: RefKey,
  rationale: string,
  context: EditContext,
): EditResult {
  const decision = document.decisions.find((d) => d.id === decisionId);
  if (!decision) return { error: 'That decision is gone.' };
  if (!decision.options.includes(chosen)) return { error: 'Pick one of the alternatives.' };
  if (decision.status === 'decided') return { error: 'Reopen the decision to decide again.' };
  const rolesBefore: Record<RefKey, MemberRole> = {};
  for (const member of document.members) {
    if (decision.options.includes(member.key)) rolesBefore[member.key] = member.role;
  }
  const members = document.members.map((m): Member => {
    if (m.key === chosen)
      return m.role === 'superseded' || m.role === 'context' ? { ...m, role: 'primary' } : m;
    return decision.options.includes(m.key) ? { ...m, role: 'superseded' } : m;
  });
  let relations = document.relations;
  for (const other of decision.options) {
    if (other === chosen) continue;
    if (relations.some((r) => r.kind === 'supersedes' && r.from === chosen && r.to === other))
      continue;
    if (wouldCycle(relations, 'supersedes', chosen, other)) continue;
    relations = [
      ...relations,
      { id: id(), kind: 'supersedes', from: chosen, to: other, note: '', decisionId },
    ];
  }
  const decisions = document.decisions.map((d) =>
    d.id === decisionId
      ? {
          ...d,
          status: 'decided' as const,
          chosen,
          rationale: rationale.trim(),
          decidedAt: context.now,
          rolesBefore,
        }
      : d,
  );
  return done(
    withLog(
      { ...document, members, relations, decisions },
      context,
      'decision-decided',
      `Decided "${decision.question}": keep ${memberName(document, chosen)}`,
      [decisionKey(decisionId), chosen],
    ),
  );
}

/** Undo a decision: the alternatives get their roles back and the relations it added go. */
export function reopenDecision(
  document: WorkstreamDocument,
  decisionId: string,
  context: EditContext,
): EditResult {
  const decision = document.decisions.find((d) => d.id === decisionId);
  if (!decision || decision.status !== 'decided') return { document };
  const members = document.members.map((m) =>
    m.key in decision.rolesBefore ? { ...m, role: decision.rolesBefore[m.key]! } : m,
  );
  const decisions = document.decisions.map((d) =>
    d.id === decisionId
      ? { ...d, status: 'open' as const, chosen: null, decidedAt: null, rolesBefore: {} }
      : d,
  );
  return done(
    withLog(
      {
        ...document,
        members,
        decisions,
        relations: document.relations.filter((r) => r.decisionId !== decisionId),
      },
      context,
      'decision-reopened',
      `Reopened "${decision.question}"`,
      [decisionKey(decisionId)],
    ),
  );
}

export function removeDecision(
  document: WorkstreamDocument,
  decisionId: string,
  context: EditContext,
): EditResult {
  const decision = document.decisions.find((d) => d.id === decisionId);
  if (!decision) return { document };
  const reopened =
    decision.status === 'decided' ? reopenDecision(document, decisionId, context) : { document };
  if ('error' in reopened) return reopened;
  const key = decisionKey(decisionId);
  const next = reopened.document;
  return done(
    withLog(
      {
        ...next,
        decisions: next.decisions.filter((d) => d.id !== decisionId),
        relations: next.relations.filter((r) => r.from !== key && r.to !== key),
      },
      context,
      'decision-removed',
      `Removed decision "${decision.question}"`,
    ),
  );
}

// ── Outcomes ────────────────────────────────────────────────

export function addOutcome(
  document: WorkstreamDocument,
  title: string,
  required: boolean,
  rules: readonly Omit<EvidenceRule, 'id'>[],
  context: EditContext,
): EditResult & { outcomeId?: string } {
  const trimmed = title.trim();
  if (!trimmed) return { error: 'Say what the outcome is.' };
  const outcome: Outcome = {
    id: id(),
    title: trimmed.slice(0, LIMITS.title),
    required,
    rules: rules.map((rule) => ({ ...rule, value: rule.value ?? null, id: id() })),
    verification: emptyVerification(),
  };
  const result = done(
    withLog(
      { ...document, outcomes: [...document.outcomes, outcome] },
      context,
      'outcome-added',
      `Added outcome "${outcome.title}"`,
      [outcomeKey(outcome.id)],
    ),
  );
  return 'document' in result ? { ...result, outcomeId: outcome.id } : result;
}

function mapOutcome(
  document: WorkstreamDocument,
  outcomeId: string,
  change: (outcome: Outcome) => Outcome,
): WorkstreamDocument {
  return {
    ...document,
    outcomes: document.outcomes.map((o) => (o.id === outcomeId ? change(o) : o)),
  };
}

export function updateOutcome(
  document: WorkstreamDocument,
  outcomeId: string,
  changes: { title?: string; required?: boolean },
): EditResult {
  if (changes.title !== undefined && !changes.title.trim())
    return { error: 'Say what the outcome is.' };
  return done(
    mapOutcome(document, outcomeId, (o) => ({
      ...o,
      title: changes.title?.trim().slice(0, LIMITS.title) ?? o.title,
      required: changes.required ?? o.required,
    })),
  );
}

export function removeOutcome(
  document: WorkstreamDocument,
  outcomeId: string,
  context: EditContext,
): EditResult {
  const outcome = document.outcomes.find((o) => o.id === outcomeId);
  if (!outcome) return { document };
  const key = outcomeKey(outcomeId);
  return done(
    withLog(
      {
        ...document,
        outcomes: document.outcomes.filter((o) => o.id !== outcomeId),
        relations: document.relations.filter((r) => r.from !== key && r.to !== key),
        nextAction:
          document.nextAction?.target === key
            ? { ...document.nextAction, target: null }
            : document.nextAction,
      },
      context,
      'outcome-removed',
      `Removed outcome "${outcome.title}"`,
    ),
  );
}

/** Move an outcome up (`-1`) or down (`1`). */
export function moveOutcome(
  document: WorkstreamDocument,
  outcomeId: string,
  delta: -1 | 1,
): EditResult {
  const index = document.outcomes.findIndex((o) => o.id === outcomeId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= document.outcomes.length) return { document };
  const outcomes = [...document.outcomes];
  [outcomes[index], outcomes[target]] = [outcomes[target]!, outcomes[index]!];
  return { document: { ...document, outcomes } };
}

export function addRule(
  document: WorkstreamDocument,
  outcomeId: string,
  rule: Omit<EvidenceRule, 'id'>,
): EditResult {
  if (!document.members.some((m) => m.key === rule.target)) {
    return { error: 'A rule reads a record in the workstream.' };
  }
  return done(
    mapOutcome(document, outcomeId, (o) => ({
      ...o,
      rules: [...o.rules, { ...rule, value: rule.value ?? null, id: id() }],
      // New facts to check: a confirmation stays, a rule verification is checked again.
      verification: o.verification.state === 'confirmed' ? o.verification : emptyVerification(),
    })),
  );
}

export function removeRule(
  document: WorkstreamDocument,
  outcomeId: string,
  ruleId: string,
): EditResult {
  return done(
    mapOutcome(document, outcomeId, (o) => ({
      ...o,
      rules: o.rules.filter((rule) => rule.id !== ruleId),
      verification: o.verification.state === 'confirmed' ? o.verification : emptyVerification(),
    })),
  );
}

/**
 * Confirm an outcome by hand. It needs what proves it and a note on why, and
 * is labelled as your confirmation wherever it shows.
 */
export function confirmOutcome(
  document: WorkstreamDocument,
  outcomeId: string,
  evidence: readonly RefKey[],
  note: string,
  context: EditContext,
  proposedBy: RefKey | null = null,
): EditResult {
  const outcome = document.outcomes.find((o) => o.id === outcomeId);
  if (!outcome) return { error: 'That outcome is gone.' };
  const known = evidence.filter((key) => document.members.some((m) => m.key === key));
  if (known.length === 0)
    return { error: 'Point at what proves it: a record or a link in the workstream.' };
  const trimmed = note.trim();
  if (!trimmed) return { error: 'Say in a few words why this proves it.' };
  if (trimmed.length > LIMITS.note)
    return { error: `A note holds at most ${LIMITS.note} characters.` };
  const verification: Verification = {
    state: 'confirmed',
    at: context.now,
    device: context.device,
    facts: [],
    evidence: [...new Set(known)],
    note: trimmed,
    proposedBy,
  };
  return done(
    withLog(
      mapOutcome(document, outcomeId, (o) => ({ ...o, verification })),
      context,
      'outcome-confirmed',
      `Confirmed "${outcome.title}"${proposedBy ? ' (proposed by the agent)' : ''}`,
      [outcomeKey(outcomeId), ...known],
    ),
  );
}

export function unconfirmOutcome(
  document: WorkstreamDocument,
  outcomeId: string,
  context: EditContext,
): EditResult {
  const outcome = document.outcomes.find((o) => o.id === outcomeId);
  if (!outcome || outcome.verification.state === 'unverified') return { document };
  return done(
    withLog(
      mapOutcome(document, outcomeId, (o) => ({ ...o, verification: emptyVerification() })),
      context,
      'outcome-unconfirmed',
      `Took back "${outcome.title}"`,
      [outcomeKey(outcomeId)],
    ),
  );
}

/** What the rules found: verified, or invalidated after it was verified. */
export function recordVerification(
  document: WorkstreamDocument,
  outcomeId: string,
  verification: Verification,
  context: EditContext,
): EditResult {
  const outcome = document.outcomes.find((o) => o.id === outcomeId);
  if (!outcome) return { document };
  const kind: LogKind =
    verification.state === 'verified' ? 'outcome-verified' : 'outcome-invalidated';
  const summary =
    verification.state === 'verified'
      ? `"${outcome.title}" verified: ${verification.facts.map((f) => f.summary).join('; ')}`
      : `"${outcome.title}" no longer holds: ${verification.facts
          .filter((f) => f.result === 'unmet')
          .map((f) => f.summary)
          .join('; ')}`;
  return done(
    withLog(
      mapOutcome(document, outcomeId, (o) => ({ ...o, verification })),
      context,
      kind,
      summary,
      [outcomeKey(outcomeId)],
    ),
  );
}

// ── Suggestions, runs and proposals ─────────────────────────

export function dismissSuggestion(document: WorkstreamDocument, suggestionId: string): EditResult {
  if (document.dismissedSuggestions.includes(suggestionId)) return { document };
  return {
    document: {
      ...document,
      dismissedSuggestions: [...document.dismissedSuggestions, suggestionId],
    },
  };
}

/** Remember a thread started from the workstream, and take it in as a member. */
export function addRun(
  document: WorkstreamDocument,
  run: WorkstreamRun,
  thread: NewMember,
  context: EditContext,
): EditResult {
  const withMember = addMembers(document, [thread], context);
  if ('error' in withMember) return withMember;
  const next = withMember.document;
  return done(
    withLog(
      { ...next, runs: [run, ...next.runs.filter((r) => r.key !== run.key)] },
      context,
      'run-started',
      run.kind === 'review'
        ? 'Started a review by an agent'
        : 'Started an agent on the next action',
      [run.key],
    ),
  );
}

export function markRunRead(document: WorkstreamDocument, runKey: RefKey): EditResult {
  return {
    document: {
      ...document,
      runs: document.runs.map((r) => (r.key === runKey ? { ...r, read: true } : r)),
    },
  };
}

export function addProposal(document: WorkstreamDocument, proposal: Proposal): EditResult {
  if (document.proposals.some((p) => p.id === proposal.id)) return { document };
  return done({
    ...document,
    proposals: [proposal, ...document.proposals].slice(0, LIMITS.proposals),
  });
}

export function setProposalItemStatus(
  document: WorkstreamDocument,
  proposalId: string,
  itemId: string,
  status: ProposalItem['status'],
): EditResult {
  return {
    document: {
      ...document,
      proposals: document.proposals.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              items: p.items.map((item) => (item.id === itemId ? { ...item, status } : item)),
            }
          : p,
      ),
    },
  };
}
