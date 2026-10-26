import { cyclicRelations } from './graph';
import { decisionKey, isDecisionKey, isOutcomeKey, outcomeKey, prRefFromUrl } from './identity';
import { asOfLabel, type ResolvedMember, resolveMember, type SourceSnapshot } from './resolve';
import { evaluateRule } from './rules';
import type {
  Decision,
  EvidenceRule,
  GitHubPrRef,
  NodeKey,
  Outcome,
  RefKey,
  RuleResult,
  Verification,
  WorkstreamDocument,
} from './types';

/**
 * What a workstream needs from you, derived from its document and what its
 * sources say now. Pure: the same inputs always give the same assessment.
 */

export interface RuleStatus {
  rule: EvidenceRule;
  result: RuleResult;
  summary: string;
  member: ResolvedMember | undefined;
}

export interface Blocker {
  key: NodeKey;
  name: string;
  relationId: string;
}

export interface OutcomeStatus {
  outcome: Outcome;
  key: NodeKey;
  rules: RuleStatus[];
  /** At least one rule, and every rule met by live evidence. */
  rulesMet: boolean;
  /** A rule says no, from live evidence. */
  contradicted: boolean;
  blockers: Blocker[];
  /** Verified or confirmed, not contradicted, nothing blocking: it counts toward progress. */
  counts: boolean;
  /** Members its rules or evidence read that can't be read now. */
  unavailable: ResolvedMember[];
}

export type AttentionTone = 'bad' | 'warn' | 'ok';

export interface Attention {
  /** Stable while the cause holds: notifications key on it. */
  id: string;
  tone: AttentionTone;
  reason: string;
  /** What to do about it, as a next action. */
  action: string;
  target: NodeKey | null;
}

export interface Transition {
  outcomeId: string;
  verification: Verification;
}

export interface Relink {
  key: RefKey;
  ref: GitHubPrRef;
}

export interface SourceHealth {
  label: string;
  tone: AttentionTone;
  detail: string;
}

export interface Assessment {
  members: Map<RefKey, ResolvedMember>;
  outcomes: OutcomeStatus[];
  progress: { counted: number; required: number };
  openDecisions: Decision[];
  /** Relations that close a circle (two machines each added half). */
  cyclic: Set<string>;
  blockedBy: Map<NodeKey, Blocker[]>;
  attention: Attention[];
  /** Every required outcome counts: you can complete the workstream. */
  ready: boolean;
  /** What the rules found that the document doesn't say yet. */
  transitions: Transition[];
  /** Pull requests whose repository GitHub now names differently, or whose node id was learned. */
  relinks: Relink[];
  health: SourceHealth[];
  counts: Record<'items' | 'pullRequests' | 'threads' | 'links', number>;
  /** When anything in the workstream last moved at its source. */
  lastActivityAt: string | null;
}

export interface AssessOptions {
  now: number;
  device: string;
  /** The document is waiting for you to merge it with another machine's version. */
  conflict?: boolean;
}

const STALLED_MS = 7 * 86_400_000;

const TONE_RANK: Record<AttentionTone, number> = { bad: 0, warn: 1, ok: 2 };

function nameOf(
  document: WorkstreamDocument,
  members: Map<RefKey, ResolvedMember>,
  key: NodeKey,
): string {
  const member = members.get(key);
  if (member)
    return member.identity === member.title ? member.title : `${member.identity} ${member.title}`;
  if (isOutcomeKey(key)) {
    const outcome = document.outcomes.find((o) => outcomeKey(o.id) === key);
    return outcome ? `"${outcome.title}"` : 'an outcome';
  }
  if (isDecisionKey(key)) {
    const decision = document.decisions.find((d) => decisionKey(d.id) === key);
    return decision ? `the decision "${decision.question}"` : 'a decision';
  }
  return key;
}

function verificationOf(
  outcome: Outcome,
  rules: readonly RuleStatus[],
  state: 'verified' | 'invalidated',
  options: AssessOptions,
): Verification {
  const at = new Date(options.now).toISOString();
  return {
    state,
    at,
    device: options.device,
    facts: rules.map((r) => ({
      ruleId: r.rule.id,
      result: r.result,
      observedAt: r.member?.asOf ?? at,
      sourceKey: r.rule.target,
      summary: r.summary,
    })),
    evidence: outcome.verification.evidence,
    note: '',
    proposedBy: null,
  };
}

export function assessWorkstream(
  document: WorkstreamDocument,
  snapshot: SourceSnapshot,
  options: AssessOptions,
): Assessment {
  const members = new Map(document.members.map((m) => [m.key, resolveMember(m, snapshot)]));
  const cyclic = cyclicRelations(document.relations);
  const activeRelations = document.relations.filter((r) => !cyclic.has(r.id));

  const ruleStatuses = new Map(
    document.outcomes.map((outcome) => [
      outcome.id,
      outcome.rules.map((rule): RuleStatus => {
        const member = members.get(rule.target);
        return { rule, ...evaluateRule(rule, member), member };
      }),
    ]),
  );
  const outcomeDone = (outcome: Outcome) => {
    const rules = ruleStatuses.get(outcome.id) ?? [];
    const contradicted = rules.some((r) => r.result === 'unmet');
    const rulesMet = rules.length > 0 && rules.every((r) => r.result === 'met');
    const state = outcome.verification.state;
    if (rules.length > 0 && (state === 'verified' || state === 'confirmed') && contradicted)
      return false;
    if (rulesMet && state !== 'confirmed') return true;
    return state === 'verified' || state === 'confirmed';
  };

  const resolvedNode = (key: NodeKey): boolean => {
    const member = members.get(key);
    if (member) return member.resolved || member.member.role === 'superseded';
    if (isOutcomeKey(key)) {
      const outcome = document.outcomes.find((o) => outcomeKey(o.id) === key);
      return outcome ? outcomeDone(outcome) : true;
    }
    if (isDecisionKey(key)) {
      const decision = document.decisions.find((d) => decisionKey(d.id) === key);
      return !decision || decision.status === 'decided';
    }
    return true;
  };

  const blockedBy = new Map<NodeKey, Blocker[]>();
  for (const relation of activeRelations) {
    if (relation.kind !== 'blocks' || resolvedNode(relation.from)) continue;
    const list = blockedBy.get(relation.to) ?? [];
    list.push({
      key: relation.from,
      name: nameOf(document, members, relation.from),
      relationId: relation.id,
    });
    blockedBy.set(relation.to, list);
  }

  const transitions: Transition[] = [];
  const outcomes = document.outcomes.map((outcome): OutcomeStatus => {
    const rules = ruleStatuses.get(outcome.id) ?? [];
    const rulesMet = rules.length > 0 && rules.every((r) => r.result === 'met');
    const contradicted = rules.some((r) => r.result === 'unmet');
    const state = outcome.verification.state;
    if (rulesMet && (state === 'unverified' || state === 'invalidated')) {
      transitions.push({
        outcomeId: outcome.id,
        verification: verificationOf(outcome, rules, 'verified', options),
      });
    } else if (contradicted && (state === 'verified' || state === 'confirmed')) {
      transitions.push({
        outcomeId: outcome.id,
        verification: verificationOf(outcome, rules, 'invalidated', options),
      });
    }
    const key = outcomeKey(outcome.id);
    const blockers = blockedBy.get(key) ?? [];
    const readKeys = new Set([
      ...outcome.rules.map((r) => r.target),
      ...outcome.verification.evidence,
    ]);
    const unavailable = [...readKeys]
      .map((k) => members.get(k))
      .filter(
        (m): m is ResolvedMember =>
          !!m &&
          (m.freshness === 'missing' ||
            m.freshness === 'not-connected' ||
            m.freshness === 'offline'),
      );
    return {
      outcome,
      key,
      rules,
      rulesMet,
      contradicted,
      blockers,
      counts: outcomeDone(outcome) && blockers.length === 0,
      unavailable,
    };
  });

  const required = outcomes.filter((o) => o.outcome.required);
  const progress = { counted: required.filter((o) => o.counts).length, required: required.length };
  const openDecisions = document.decisions.filter((d) => d.status === 'open');
  const live = document.status === 'active' || document.status === 'paused';
  const ready =
    live &&
    required.length > 0 &&
    progress.counted === required.length &&
    !required.some((o) => o.outcome.verification.state === 'invalidated');

  const resolved = [...members.values()];
  const lastActivityAt =
    resolved
      .map((m) => m.activityAt)
      .filter((at): at is string => !!at)
      .sort()
      .at(-1) ?? null;

  const relinks: Relink[] = [];
  for (const m of resolved) {
    const ref = m.member.ref;
    const pr = m.pr;
    if (ref.kind !== 'github-pr' || !pr?.repositoryId) continue;
    const renamed = pr.renamedTo?.split('/');
    if (renamed?.length === 2) {
      relinks.push({
        key: m.member.key,
        ref: { ...ref, owner: renamed[0]!, repo: renamed[1]!, repositoryId: pr.repositoryId },
      });
    } else if (ref.repositoryId !== pr.repositoryId) {
      relinks.push({ key: m.member.key, ref: { ...ref, repositoryId: pr.repositoryId } });
    }
  }

  const attention =
    live || document.status === 'done'
      ? attentionOf(
          document,
          members,
          outcomes,
          openDecisions,
          cyclic,
          blockedBy,
          ready,
          lastActivityAt,
          options,
        )
      : [];

  return {
    members,
    outcomes,
    progress,
    openDecisions,
    cyclic,
    blockedBy,
    attention,
    ready,
    transitions,
    relinks,
    health: healthOf(resolved),
    counts: {
      items: document.members.filter((m) => m.ref.kind === 'ado-item').length,
      pullRequests: document.members.filter((m) => m.ref.kind === 'github-pr').length,
      threads: document.members.filter((m) => m.ref.kind === 't3-thread').length,
      links: document.members.filter((m) => m.ref.kind === 'link').length,
    },
    lastActivityAt,
  };
}

function attentionOf(
  document: WorkstreamDocument,
  members: Map<RefKey, ResolvedMember>,
  outcomes: readonly OutcomeStatus[],
  openDecisions: readonly Decision[],
  cyclic: ReadonlySet<string>,
  blockedBy: ReadonlyMap<NodeKey, Blocker[]>,
  ready: boolean,
  lastActivityAt: string | null,
  options: AssessOptions,
): Attention[] {
  const found: Attention[] = [];
  const add = (entry: Attention) => {
    if (!found.some((f) => f.id === entry.id)) found.push(entry);
  };
  const active = [...members.values()].filter((m) => m.member.role !== 'superseded');

  if (options.conflict) {
    add({
      id: 'conflict',
      tone: 'bad',
      reason: 'Changed on another machine as well.',
      action: 'Choose what to keep from the other version.',
      target: null,
    });
  }

  if (document.status === 'done') {
    for (const status of outcomes) {
      if (status.outcome.required && !status.counts) {
        add({
          id: `reopened:${status.outcome.id}`,
          tone: 'bad',
          reason: `Completed, but "${status.outcome.title}" no longer holds.`,
          action: `Re-check "${status.outcome.title}" and reopen the workstream.`,
          target: status.key,
        });
      }
    }
    return found;
  }

  for (const status of outcomes) {
    const state = status.outcome.verification.state;
    const invalidated =
      (state === 'invalidated' && !status.rulesMet) ||
      (status.contradicted && (state === 'verified' || state === 'confirmed'));
    if (!invalidated) continue;
    const why = status.rules.find((r) => r.result === 'unmet')?.summary ?? 'its evidence changed';
    add({
      id: `invalidated:${status.outcome.id}`,
      tone: 'bad',
      reason: `"${status.outcome.title}" no longer holds: ${why}.`,
      action: `Re-check "${status.outcome.title}": ${why}.`,
      target: status.key,
    });
  }

  for (const member of active) {
    if (!member.needsYou) continue;
    const where = member.thread ? `${member.thread.slot}` : member.identity;
    add({
      id: `needs-you:${member.member.key}`,
      tone: 'bad',
      reason: member.thread
        ? `${member.stateLabel} in ${where}: ${member.title}`
        : `${member.item?.verdict.label ?? member.stateLabel}: ${member.identity} ${member.title}`,
      action: member.thread
        ? `Answer the agent in ${where} (${member.title}).`
        : `${member.item?.verdict.label ?? 'Look at'} ${member.identity}.`,
      target: member.member.key,
    });
  }

  for (const decision of openDecisions) {
    const key = decisionKey(decision.id);
    const blocksRequired = outcomes.some(
      (o) => o.outcome.required && o.blockers.some((b) => b.key === key),
    );
    const options = decision.options.map((k) => members.get(k)?.identity ?? k).join(' or ');
    add({
      id: `decision:${decision.id}`,
      tone: blocksRequired ? 'bad' : 'warn',
      reason: `Open decision: ${decision.question}`,
      action: `Decide between ${options}.`,
      target: key,
    });
  }

  for (const member of active) {
    if (member.member.role !== 'primary' || !member.pr || member.pr.state !== 'open') continue;
    if (member.pr.checks === 'failed') {
      add({
        id: `checks:${member.member.key}`,
        tone: 'bad',
        reason: `Checks fail on ${member.identity}.`,
        action: `Fix the failing checks on ${member.identity}.`,
        target: member.member.key,
      });
    }
    if (member.pr.conflicting) {
      add({
        id: `conflicting:${member.member.key}`,
        tone: 'bad',
        reason: `${member.identity} has merge conflicts.`,
        action: `Resolve the merge conflicts on ${member.identity}.`,
        target: member.member.key,
      });
    }
  }

  for (const status of outcomes) {
    if (!status.outcome.required || status.counts) continue;
    for (const member of status.unavailable) {
      add({
        id: `unavailable:${status.outcome.id}:${member.member.key}`,
        tone: 'warn',
        reason: `"${status.outcome.title}" reads ${member.identity}, which can't be read: ${member.reason ?? asOfLabel(member)}`,
        action:
          member.freshness === 'not-connected'
            ? `Connect or relink ${member.identity}.`
            : `Check ${member.identity}: ${member.reason ?? asOfLabel(member)}.`,
        target: member.member.key,
      });
    }
  }

  for (const relation of document.relations) {
    if (!cyclic.has(relation.id)) continue;
    add({
      id: `cycle:${relation.id}`,
      tone: 'warn',
      reason: 'Two relations make a circle, so neither can resolve.',
      action: 'Remove one of the relations that make a circle.',
      target: relation.to,
    });
  }

  const nextAt = document.nextAction ? Date.parse(document.nextAction.setAt) : null;
  if (nextAt !== null) {
    for (const relation of document.relations) {
      if (relation.kind !== 'blocks' || cyclic.has(relation.id)) continue;
      if ((blockedBy.get(relation.to) ?? []).length > 0) continue;
      const blocker = members.get(relation.from);
      const at = blocker?.resolvedAt ? Date.parse(blocker.resolvedAt) : null;
      if (!blocker?.resolved || at === null || at <= nextAt) continue;
      const target = nameOf(document, members, relation.to);
      add({
        id: `unblocked:${relation.id}`,
        tone: 'ok',
        reason: `Unblocked: ${target} (${blocker.identity} is ${blocker.stateLabel.toLowerCase()}).`,
        action: `Pick up ${target}: ${blocker.identity} is done.`,
        target: relation.to,
      });
    }
  }

  if (document.status === 'active') {
    if (!document.nextAction && document.members.length > 0 && !ready) {
      add({
        id: 'no-next-action',
        tone: 'warn',
        reason: 'No next action.',
        action: 'Say what moves the goal forward next.',
        target: null,
      });
    } else if (nextAt !== null && options.now - nextAt > STALLED_MS) {
      const moved = lastActivityAt ? Date.parse(lastActivityAt) > nextAt : false;
      if (!moved) {
        const days = Math.floor((options.now - nextAt) / 86_400_000);
        add({
          id: 'stalled',
          tone: 'warn',
          reason: `Stalled for ${days} days: nothing moved since the next action was set.`,
          action: document.nextAction!.text,
          target: document.nextAction!.target,
        });
      }
    }
  }

  if (ready) {
    add({
      id: 'ready',
      tone: 'ok',
      reason: 'Every required outcome is verified.',
      action: 'Complete the workstream.',
      target: null,
    });
  }

  return found
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => TONE_RANK[a.entry.tone] - TONE_RANK[b.entry.tone] || a.index - b.index)
    .map(({ entry }) => entry);
}

function healthOf(members: readonly ResolvedMember[]): SourceHealth[] {
  const groups = new Map<string, ResolvedMember[]>();
  for (const member of members) {
    const ref = member.member.ref;
    if (ref.kind === 'link') continue;
    const label =
      ref.kind === 'github-pr'
        ? 'GitHub'
        : ref.kind === 'ado-item'
          ? 'Azure DevOps'
          : (member.hostLabel ?? 'T3');
    groups.set(label, [...(groups.get(label) ?? []), member]);
  }
  return [...groups.entries()].map(([label, list]) => {
    const broken = list.filter((m) => m.freshness === 'missing' || m.freshness === 'not-connected');
    const behind = list.filter(
      (m) => m.freshness === 'stale' || m.freshness === 'offline' || m.freshness === 'unread',
    );
    const tone: AttentionTone = broken.length > 0 ? 'bad' : behind.length > 0 ? 'warn' : 'ok';
    const detail =
      broken.length > 0
        ? `${broken.length} can't be read`
        : behind.length > 0
          ? `${behind.length} not current`
          : 'Live';
    return { label, tone, detail };
  });
}

/** The pull request a member thread opened, as a reference (for suggestions). */
export function threadPullRequests(member: ResolvedMember): GitHubPrRef[] {
  return (member.thread?.pullRequests ?? []).flatMap((pr) => {
    const ref = prRefFromUrl(pr.url);
    return ref ? [ref] : [];
  });
}
