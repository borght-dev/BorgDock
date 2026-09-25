import { useEffect, useRef, useState } from 'react';
import { loadCachedPRs } from '@/services/cache';
import { aggregatePrWithChecks } from '@/services/github/aggregate';
import { getCheckRunsForRef } from '@/services/github/checks';
import type { GitHubClient } from '@/services/github/client';
import { getOpenPRs } from '@/services/github/pulls';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { PR_REFRESHED_EVENT, type PrRefreshedDetail, usePrStore } from '@/stores/pr-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';

const log = createLogger('usePrDetailData');

export interface PrDetailTarget {
  owner: string;
  repo: string;
  number: number;
}

export interface UsePrDetailDataOptions {
  /**
   * Runs once before the first fetch and returns the GitHub client to use.
   * The pop-out window has its own stores, so it loads settings, applies its
   * theme and creates its client here. Without it the hook uses the client
   * the main window already set up for the repository.
   */
  prepare?: () => Promise<GitHubClient | null>;
}

export interface PrDetailData {
  pr: PullRequestWithChecks | null;
  /** Raw check runs for the Checks tab; the PR itself only carries counts. */
  checks: CheckRun[];
  /** True until the first load settled (or the PR came from the store). */
  isLoading: boolean;
  error: string | null;
}

const MISSING_PARAMS = 'Missing PR parameters (owner, repo, number)';

function matches(prw: PullRequestWithChecks, { owner, repo, number }: PrDetailTarget): boolean {
  const p = prw.pullRequest;
  return p.repoOwner === owner && p.repoName === repo && p.number === number;
}

/** The PR from the main window's list (open or recently closed), if it is there. */
function selectStorePr(target: PrDetailTarget) {
  return (s: {
    pullRequests: PullRequestWithChecks[];
    closedPullRequests: PullRequestWithChecks[];
  }): PullRequestWithChecks | null =>
    s.pullRequests.find((p) => matches(p, target)) ??
    s.closedPullRequests.find((p) => matches(p, target)) ??
    null;
}

/**
 * What changes on a PR when its checks may have changed: a new head commit,
 * or different check counts after a poll. The check runs are refetched when
 * this moves.
 */
function checksVersion(prw: PullRequestWithChecks | null): string | null {
  if (!prw) return null;
  const p = prw.pullRequest;
  return [
    p.headSha ?? p.headRef,
    prw.passedCount,
    prw.failedCheckNames.length,
    prw.pendingCheckNames.length,
    prw.skippedCount,
    prw.totalCheckCount,
  ].join('|');
}

/**
 * The ref whose check runs belong to the PR: its head commit. A branch name
 * would miss a fork PR's head (the branch lives in the fork) and could race
 * a newer push.
 */
function headOf(p: { headSha?: string; headRef: string }): string {
  return p.headSha || p.headRef;
}

async function fetchChecks(
  client: GitHubClient | null,
  target: PrDetailTarget,
  ref: string,
): Promise<CheckRun[]> {
  if (!client) return [];
  try {
    return await getCheckRunsForRef(client, target.owner, target.repo, ref);
  } catch (err) {
    log.debug('check runs fetch failed', { error: String(err), ...target });
    return [];
  }
}

/**
 * usePrDetailData — the pull request and its check runs for a detail view.
 * Shared by the in-window `PrDetailView` and the pop-out `PrDetailApp`.
 *
 * - When the PR is in the main window's list (`usePrStore`, open or closed)
 *   it is shown at once, with no spinner, and follows the list: each poll
 *   that updates the PR updates the view, and a new head commit or changed
 *   check counts refetch the check runs.
 * - Otherwise (the pop-out, whose store is its own and empty, or a PR the
 *   list does not hold) it loads from the cache first, then from GitHub.
 * - `PR_REFRESHED_EVENT` (fired after a mutation's single-PR refresh) replaces
 *   the PR and, when the event carries them, the check runs.
 *
 * The host remounts the hook for another PR (ViewStack keys its layers by
 * PR), so the target is fixed for the hook's lifetime.
 */
export function usePrDetailData(
  target: PrDetailTarget,
  options: UsePrDetailDataOptions = {},
): PrDetailData {
  const { owner, repo, number } = target;
  const valid = Boolean(owner && repo && number);
  const storePr = usePrStore(selectStorePr(target));

  const [pr, setPr] = useState<PullRequestWithChecks | null>(storePr);
  const [checks, setChecks] = useState<CheckRun[]>([]);
  const [isLoading, setIsLoading] = useState(storePr === null);
  const [error, setError] = useState<string | null>(valid ? null : MISSING_PARAMS);

  // Latest values for the async load, without making them effect inputs.
  const prRef = useRef(pr);
  prRef.current = pr;
  const prepareRef = useRef(options.prepare);
  prepareRef.current = options.prepare;
  const storePrRef = useRef(storePr);
  storePrRef.current = storePr;
  const clientRef = useRef<GitHubClient | null>(null);
  // Guards against an older check-run fetch landing after a newer one.
  const checksSeqRef = useRef(0);

  // First load.
  useEffect(() => {
    if (!valid) {
      setError(MISSING_PARAMS);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const t = { owner, repo, number };

    (async () => {
      try {
        const prepare = prepareRef.current;
        const client = prepare ? await prepare() : getClientForRepo(owner, repo);
        if (cancelled) return;
        clientRef.current = client;

        // In the main window's list: the store is the truth for the PR, so
        // only the check runs are fetched.
        const seeded = storePrRef.current;
        if (seeded) {
          const seq = ++checksSeqRef.current;
          const runs = await fetchChecks(client, t, headOf(seeded.pullRequest));
          if (!cancelled && seq === checksSeqRef.current) setChecks(runs);
          return;
        }

        // Cache first for an instant header.
        try {
          const cached = await loadCachedPRs(owner, repo);
          if (cancelled) return;
          const hit = cached.find(
            (raw) => (raw as PullRequestWithChecks).pullRequest?.number === number,
          ) as PullRequestWithChecks | undefined;
          if (hit) {
            setPr(hit);
            setIsLoading(false);
          }
        } catch {
          // The cache is best-effort.
        }
        if (cancelled) return;

        if (!client) {
          if (!prRef.current) setError(`PR #${number} not found in ${owner}/${repo}`);
          return;
        }

        const open = await getOpenPRs(client, owner, repo);
        if (cancelled) return;
        const found = open.find((p) => p.number === number);
        if (!found) {
          if (!prRef.current) setError(`PR #${number} not found in ${owner}/${repo}`);
          return;
        }

        const seq = ++checksSeqRef.current;
        const runs = await fetchChecks(client, t, headOf(found));
        if (cancelled) return;
        setPr(aggregatePrWithChecks(found, runs));
        if (seq === checksSeqRef.current) setChecks(runs);
      } catch (err) {
        if (cancelled) return;
        log.error('failed to load PR', err, t);
        if (!prRef.current) setError('Failed to load pull request');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [valid, owner, repo, number]);

  // Follow the main window's list: a poll that replaces the PR updates the
  // view, and changed checks refetch the runs.
  const version = checksVersion(storePr);
  const seenVersionRef = useRef(version);
  useEffect(() => {
    if (!storePr) return;
    setPr(storePr);
    setIsLoading(false);
    setError(null);
  }, [storePr]);
  useEffect(() => {
    if (version === seenVersionRef.current) return;
    seenVersionRef.current = version;
    const current = storePrRef.current;
    if (!current) return;
    let cancelled = false;
    const seq = ++checksSeqRef.current;
    const client = clientRef.current ?? getClientForRepo(owner, repo);
    void fetchChecks(client, { owner, repo, number }, headOf(current.pullRequest)).then((runs) => {
      if (!cancelled && seq === checksSeqRef.current) setChecks(runs);
    });
    return () => {
      cancelled = true;
    };
  }, [version, owner, repo, number]);

  // Single-PR refreshes after a mutation. The pop-out's store is its own, so
  // this event is how it hears about them; in the main window it also carries
  // the fresh check runs.
  useEffect(() => {
    if (!valid) return;
    function handleRefreshed(e: Event) {
      const detail = (e as CustomEvent<PrRefreshedDetail>).detail;
      if (!detail || detail.owner !== owner || detail.repo !== repo || detail.number !== number) {
        return;
      }
      if (!detail.pr) return;
      setPr(detail.pr);
      setError(null);
      setIsLoading(false);
      // Optimistic refreshes (mark-merged) carry no checks: keep ours.
      if (detail.checks) {
        checksSeqRef.current++;
        setChecks(detail.checks);
      }
    }
    document.addEventListener(PR_REFRESHED_EVENT, handleRefreshed);
    return () => document.removeEventListener(PR_REFRESHED_EVENT, handleRefreshed);
  }, [valid, owner, repo, number]);

  return { pr, checks, isLoading, error };
}
