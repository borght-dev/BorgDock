import { prRowKey } from '@/components/pr/pr-card-data';
import { jobIndexOf, prCiLens } from '@/services/ci-failures/lens';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import {
  e2eNeighbours,
  e2eVerdictOf,
  ensureE2eReports,
  hasFailedE2e,
  useE2eStore,
} from '@/services/e2e/load';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import type { PullRequestWithChecks } from '@/types';
import { authorCandidates, type HeldPr, planAuthorRun, type RunFit, runFit } from './author-run';
import { orderQuickReviewPrs } from './quick-review';

/** What a PR's fit is read from. Components pass the slices they subscribed to. */
export interface FitWorld {
  prs: readonly PullRequestWithChecks[];
  entries: ReturnType<typeof useE2eStore.getState>['entries'];
  groups: readonly CiGroupSummary[];
}

export function fitIn(world: FitWorld, pr: PullRequestWithChecks): RunFit {
  const lens = pr.failedCheckNames.length > 0 ? prCiLens(pr, jobIndexOf(world.groups)) : null;
  return runFit(pr, {
    e2e: e2eVerdictOf(pr, world.entries, world.prs),
    outsideCause: lens?.outsideCause ?? null,
  });
}

function currentWorld(): FitWorld {
  return {
    prs: usePrStore.getState().pullRequests,
    entries: useE2eStore.getState().entries,
    groups: useCiFailuresStore.getState().groups,
  };
}

/** Reads the E2E reports `candidates` need, with their neighbours' for shared failures. */
export async function readRunReports(
  candidates: readonly PullRequestWithChecks[],
  prs: readonly PullRequestWithChecks[],
): Promise<void> {
  const withE2e = candidates.filter(hasFailedE2e);
  const wanted = new Map<string, PullRequestWithChecks>();
  for (const pr of [...withE2e, ...withE2e.flatMap((pr) => e2eNeighbours(pr, prs))])
    wanted.set(prRowKey(pr.pullRequest), pr);
  await ensureE2eReports([...wanted.values()]);
}

/**
 * Opens `first` in Quick Review at once and fills the rest of its author's
 * run once the E2E reports are read: their other PRs you can merge, oldest
 * first, and the ones left out with the reason. PRs `handled` names (by
 * `prRowKey`) were just reviewed or skipped and stay out.
 */
export async function startAuthorRun(
  first: PullRequestWithChecks,
  handled: ReadonlySet<string> = new Set(),
): Promise<void> {
  const author = first.pullRequest.authorLogin;
  useQuickReviewStore.getState().startRun(author, first);
  const { pullRequests, username } = usePrStore.getState();
  const firstKey = prRowKey(first.pullRequest);
  const candidates = authorCandidates(pullRequests, author, username).filter((pr) => {
    const key = prRowKey(pr.pullRequest);
    return key !== firstKey && !handled.has(key);
  });
  await readRunReports(candidates, pullRequests);
  const world = currentWorld();
  const plan = planAuthorRun(candidates, (pr) => fitIn(world, pr));
  const unread: HeldPr[] = plan.checking.map((pr) => ({
    pr,
    fit: { kind: 'held', reason: 'e2e', why: 'E2E report not read' },
  }));
  useQuickReviewStore.getState().fillRun(author, plan.queue, [...plan.held, ...unread]);
}

/** Passing checks first, then the oldest unblocked PR, including CI fallbacks. */
export function nextFromAuthor(
  world: FitWorld,
  author: string,
  me: string,
  handled: ReadonlySet<string>,
): PullRequestWithChecks | undefined {
  return orderQuickReviewPrs(authorCandidates(world.prs, author, me)).find(
    (pr) =>
      !handled.has(prRowKey(pr.pullRequest)) &&
      pr.pullRequest.mergeable !== false &&
      pr.pullRequest.reviewStatus !== 'changesRequested',
  );
}
