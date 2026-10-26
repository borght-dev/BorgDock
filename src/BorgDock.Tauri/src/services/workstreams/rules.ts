import type { StateCategory } from '@/services/dispatch/types';
import type { ResolvedMember } from './resolve';
import type { EvidenceRule, RefKind, RuleResult } from './types';

/**
 * Evidence rules. A rule reads one member and says whether the fact it
 * names holds. Only live evidence can say yes or no; anything else is
 * unknown, and unknown never verifies an outcome.
 */

export interface RuleOutcome {
  result: RuleResult;
  /** What the rule saw, in a few words: "merged into master". */
  summary: string;
}

export interface RuleKind {
  kind: string;
  label: string;
  /** The kind of member it reads. */
  reads: RefKind;
  /** The rule in a few words, with its value: "Merged into main". */
  describe: (rule: EvidenceRule) => string;
  /** What `value` means for this rule, when it takes one. */
  value?: {
    label: string;
    placeholder: string;
    required: boolean;
    choices?: (member: ResolvedMember) => string[];
  };
  evaluate: (rule: EvidenceRule, member: ResolvedMember) => RuleOutcome;
}

const registry = new Map<string, RuleKind>();

/** Add a rule kind (deployments, from another feature, come in this way). */
export function registerRule(kind: RuleKind): void {
  registry.set(kind.kind, kind);
}

export function ruleKind(kind: string): RuleKind | undefined {
  return registry.get(kind);
}

export function ruleKinds(): RuleKind[] {
  return [...registry.values()];
}

const CATEGORY_RANK: Record<StateCategory, number> = {
  Proposed: 0,
  InProgress: 1,
  Resolved: 2,
  Completed: 3,
  Removed: -1,
};

registerRule({
  kind: 'pr-merged',
  label: 'Pull request merged',
  reads: 'github-pr',
  describe: (rule) => (rule.value?.trim() ? `Merged into ${rule.value.trim()}` : 'Merged'),
  value: { label: 'Into branch', placeholder: 'any branch', required: false },
  evaluate: (rule, member) => {
    const pr = member.pr;
    if (!pr) return { result: 'unknown', summary: 'pull request not read' };
    const into = rule.value?.trim();
    if (pr.state !== 'merged')
      return { result: 'unmet', summary: `${member.identity} is ${pr.state}` };
    if (into && pr.baseRefName === null)
      return { result: 'unknown', summary: 'target branch not known' };
    if (into && pr.baseRefName !== into) {
      return {
        result: 'unmet',
        summary: `${member.identity} merged into ${pr.baseRefName}, not ${into}`,
      };
    }
    return {
      result: 'met',
      summary: `${member.identity} merged into ${pr.baseRefName ?? 'its base'}`,
    };
  },
});

registerRule({
  kind: 'pr-checks-green',
  label: 'Checks pass',
  reads: 'github-pr',
  describe: () => 'Checks pass',
  evaluate: (_rule, member) => {
    const checks = member.pr?.checks ?? null;
    if (checks === null) return { result: 'unknown', summary: 'checks not read' };
    if (checks === 'passed') return { result: 'met', summary: `checks pass on ${member.identity}` };
    return { result: 'unmet', summary: `checks ${checks} on ${member.identity}` };
  },
});

registerRule({
  kind: 'pr-approved',
  label: 'Pull request approved',
  reads: 'github-pr',
  describe: () => 'Approved',
  evaluate: (_rule, member) => {
    if (!member.pr) return { result: 'unknown', summary: 'pull request not read' };
    return member.pr.approved
      ? { result: 'met', summary: `${member.identity} approved` }
      : { result: 'unmet', summary: `${member.identity} not approved` };
  },
});

registerRule({
  kind: 'item-state',
  label: 'Work item reaches a state',
  reads: 'ado-item',
  describe: (rule) => `Reaches ${rule.value ?? 'a state'}`,
  value: {
    label: 'State',
    placeholder: 'Ready For QA',
    required: true,
    choices: (member) => member.item?.item.states.map((state) => state.name) ?? [],
  },
  evaluate: (rule, member) => {
    const item = member.item?.item;
    const target = rule.value?.trim();
    if (!item) return { result: 'unknown', summary: 'work item not read' };
    if (!target) return { result: 'unknown', summary: 'no state named' };
    const states = item.states.map((state) => state.name);
    const wanted = states.indexOf(target);
    if (wanted < 0) return { result: 'unknown', summary: `${target} is not in its workflow` };
    const now = states.indexOf(item.state);
    if (item.stateCategory === 'Removed')
      return { result: 'unmet', summary: `AB#${item.id} was removed` };
    return now >= wanted
      ? { result: 'met', summary: `AB#${item.id} is ${item.state}` }
      : { result: 'unmet', summary: `AB#${item.id} is ${item.state}, not yet ${target}` };
  },
});

registerRule({
  kind: 'item-category',
  label: 'Work item resolved or done',
  reads: 'ado-item',
  describe: (rule) => (rule.value === 'Completed' ? 'Done' : 'Resolved or later'),
  value: {
    label: 'At least',
    placeholder: 'Resolved',
    required: true,
    choices: () => ['Resolved', 'Completed'],
  },
  evaluate: (rule, member) => {
    const item = member.item?.item;
    if (!item) return { result: 'unknown', summary: 'work item not read' };
    const wanted = rule.value === 'Completed' ? 'Completed' : 'Resolved';
    return CATEGORY_RANK[item.stateCategory] >= CATEGORY_RANK[wanted]
      ? { result: 'met', summary: `AB#${item.id} is ${item.state}` }
      : { result: 'unmet', summary: `AB#${item.id} is ${item.state}` };
  },
});

registerRule({
  kind: 'item-delivered',
  label: "Work item's own pull request merged",
  reads: 'ado-item',
  describe: () => 'Own pull request merged',
  evaluate: (_rule, member) => {
    const overview = member.item;
    if (!overview) return { result: 'unknown', summary: 'work item not read' };
    const own = overview.pullRequests.filter((pr) => !pr.shared);
    if (own.length === 0) {
      return overview.pullRequests.length > 0
        ? { result: 'unmet', summary: `AB#${overview.item.id} has only a shared plan PR` }
        : { result: 'unmet', summary: `AB#${overview.item.id} has no pull request yet` };
    }
    const merged = own.find((pr) => pr.state === 'merged');
    return merged
      ? { result: 'met', summary: `AB#${overview.item.id}'s #${merged.number} merged` }
      : {
          result: 'unmet',
          summary: `AB#${overview.item.id}'s #${own[0]!.number} is ${own[0]!.state}`,
        };
  },
});

/** One rule against its member: unknown unless the member is live. */
export function evaluateRule(rule: EvidenceRule, member: ResolvedMember | undefined): RuleOutcome {
  const kind = registry.get(rule.kind);
  if (!kind)
    return { result: 'unknown', summary: `a rule this BorgDock does not know (${rule.kind})` };
  if (!member) return { result: 'unknown', summary: 'its record left the workstream' };
  if (member.member.ref.kind !== kind.reads)
    return { result: 'unknown', summary: 'it reads another kind of record' };
  if (member.freshness !== 'live') {
    return {
      result: 'unknown',
      summary: `${member.identity}: ${member.reason ?? member.freshness}`,
    };
  }
  return kind.evaluate(rule, member);
}
