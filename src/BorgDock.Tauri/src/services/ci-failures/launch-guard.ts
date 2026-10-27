import { factsOf, scopeOfRepo } from '@/stores/ci-failures-store';
import { useCiGuardStore } from '@/stores/ci-guard-store';
import { useSettingsStore } from '@/stores/settings-store';
import { relatednessOf } from './hypothesis';
import { latestPerCheck } from './prompts';
import { ciFailureSettings } from './settings';
import * as store from './store-api';
import type { CiClaim, CiGroupSummary, CiPrFailures } from './types';

/**
 * Why a launch on a PR's failed checks should stop for a moment: someone
 * already investigates one of its failure groups, or the failure is shared
 * with other PRs and nobody owns it yet.
 */
export type LaunchConflict =
  | { kind: 'owned'; group: CiGroupSummary; claim: CiClaim }
  | { kind: 'shared'; group: CiGroupSummary };

/**
 * What the launch does next. The dialog itself opens the owner, messages it
 * or starts an investigation; the launch only learns whether to go on.
 */
export type GuardDecision = 'proceed' | 'cancel';

export interface LaunchTarget {
  owner: string;
  repo: string;
  prNumber: number;
  /** The check names the launch is about; empty means every failed check of the PR. */
  checkNames: readonly string[];
  /** The PR's head now; failures recorded for an older head no longer count. */
  headSha?: string | null;
}

/** The conflict for a PR's current failures in `failures`, strongest first: an owner beats a shared group. */
export function conflictOf(
  failures: CiPrFailures,
  checkNames: readonly string[],
  headSha: string | null = null,
): LaunchConflict | null {
  const wanted = new Set(checkNames);
  // Only what fails now: not a failure that passed later, not one of an older head.
  const current = failures.occurrences.filter(
    ({ occurrence, outcome }) =>
      (wanted.size === 0 || wanted.has(occurrence.jobName)) &&
      !outcome &&
      (!headSha || !occurrence.prHeadSha || occurrence.prHeadSha === headSha),
  );
  const groupIds = new Set(
    [...latestPerCheck(current).values()].flatMap((detail) =>
      detail.signals.filter((s) => s.tier !== 'low' && s.groupId).map((s) => s.groupId as string),
    ),
  );
  const groups = failures.groups.filter(
    (group) => groupIds.has(group.id) && group.status !== 'resolved',
  );
  const owned = groups.find(
    (group) => group.claim && (group.claim.state === 'active' || group.claim.state === 'stale'),
  );
  if (owned?.claim) return { kind: 'owned', group: owned, claim: owned.claim };
  const shared = groups.find(
    (group) => group.maxTier === 'high' && relatednessOf(factsOf(group)) === 'shared',
  );
  return shared ? { kind: 'shared', group: shared } : null;
}

/** Reads the store for `target`'s conflict; none when collection is off or the store can't be read. */
export async function inspectLaunch(target: LaunchTarget): Promise<LaunchConflict | null> {
  const settings = useSettingsStore.getState().settings;
  if (!ciFailureSettings(settings).enabled) return null;
  const repo = settings.repos.find(
    (r) =>
      r.owner.toLowerCase() === target.owner.toLowerCase() &&
      r.name.toLowerCase() === target.repo.toLowerCase(),
  );
  const scope = scopeOfRepo({
    owner: target.owner,
    name: target.repo,
    githubAccount: repo?.githubAccount,
  });
  try {
    return conflictOf(
      await store.loadPr(scope, target.prNumber),
      target.checkNames,
      target.headSha ?? null,
    );
  } catch {
    return null;
  }
}

/**
 * Every agent launch on failing checks asks this first. Resolves `proceed`
 * at once when nothing conflicts; otherwise the launch guard dialog asks and
 * the decision comes back.
 */
export async function guardLaunch(target: LaunchTarget, action: string): Promise<GuardDecision> {
  const conflict = await inspectLaunch(target);
  if (!conflict) return 'proceed';
  return useCiGuardStore.getState().ask({ conflict, target, action });
}
