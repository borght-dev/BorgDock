import { catalogEntry } from './catalog';

/**
 * Computed guesses about a group's cause, shown as "suggested" with their
 * reasons. A classification is what the user picks; this never sets one.
 * Many affected PRs alone never make something infrastructure.
 */
export type HypothesisKind = 'base-branch' | 'infrastructure' | 'flaky' | 'branch-specific';

export interface Hypothesis {
  kind: HypothesisKind;
  reason: string;
}

export const HYPOTHESIS_LABEL: Record<HypothesisKind, string> = {
  'base-branch': 'Base branch',
  infrastructure: 'Infrastructure',
  flaky: 'Flaky',
  'branch-specific': 'Branch-specific',
};

/** What the store knows about a group, enough to guess its cause. */
export interface GroupFacts {
  prNumbers: readonly number[];
  defaultBranchRuns: readonly number[];
  defaultBranch: string | null;
  occurrenceCount: number;
  passedOnRetry: number;
  /** Distinct runs that failed, for "passed on retry in X of Y runs". */
  runCount: number;
  catalogIds: readonly string[];
  failedSteps: readonly string[];
}

/** Steps that run before any repository code. A failure there is not the branch's doing. */
const SETUP_STEP =
  /^(?:set up job|setup job|initialize containers|checkout|run actions\/checkout@.*|set ?up .+|run actions\/setup-.+|run actions\/cache@.*|post .+)$/i;

export function isSetupStep(step: string): boolean {
  return SETUP_STEP.test(step.trim());
}

/** Every hypothesis the facts support, strongest first. */
export function hypothesesOf(
  facts: GroupFacts,
  options: { touchesChangedFiles?: boolean } = {},
): Hypothesis[] {
  const found: Hypothesis[] = [];
  if (facts.defaultBranchRuns.length > 0) {
    const branch = facts.defaultBranch ?? 'the default branch';
    const [latest] = [...facts.defaultBranchRuns].sort((a, b) => b - a);
    found.push({
      kind: 'base-branch',
      reason:
        facts.defaultBranchRuns.length === 1
          ? `Also failing on ${branch}, run #${latest}`
          : `Also failing on ${branch} in ${facts.defaultBranchRuns.length} runs, latest #${latest}`,
    });
  }
  const catalog = facts.catalogIds.map(catalogEntry).find((entry) => entry !== undefined);
  if (catalog) {
    found.push({
      kind: 'infrastructure',
      reason: `${catalog.label.charAt(0).toUpperCase()}${catalog.label.slice(1)}. Not proven.`,
    });
  } else if (facts.failedSteps.length > 0 && facts.failedSteps.every(isSetupStep)) {
    found.push({
      kind: 'infrastructure',
      reason: `Failed before repository code ran (${facts.failedSteps[0]}). Not proven.`,
    });
  }
  if (facts.passedOnRetry > 0) {
    found.push({
      kind: 'flaky',
      reason: `Passed on retry in ${facts.passedOnRetry} of ${Math.max(facts.runCount, facts.passedOnRetry)} ${facts.runCount === 1 ? 'run' : 'runs'}`,
    });
  }
  if (
    facts.prNumbers.length === 1 &&
    facts.defaultBranchRuns.length === 0 &&
    options.touchesChangedFiles
  ) {
    found.push({ kind: 'branch-specific', reason: 'Only in this PR, in a file it changes' });
  }
  return found;
}

/**
 * How a group relates to others: `shared` across PRs or with the default
 * branch, `repeated` within one PR's attempts, or a `single` observation
 * that stays hidden.
 */
export type Relatedness = 'shared' | 'repeated' | 'single';

export function relatednessOf(facts: GroupFacts): Relatedness {
  if (facts.prNumbers.length >= 2) return 'shared';
  if (facts.prNumbers.length >= 1 && facts.defaultBranchRuns.length >= 1) return 'shared';
  if (facts.prNumbers.length === 0 && facts.defaultBranchRuns.length >= 2) return 'shared';
  return facts.occurrenceCount >= 2 ? 'repeated' : 'single';
}
