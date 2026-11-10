import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { isMyPr } from '@/services/pr-grouping';
import { loadReviewSnapshot, orderQuickReviewPrs } from '@/services/quick-review';
import { guideSkipReason } from '@/services/review-guide';
import { usePrStore } from '@/stores/pr-store';
import {
  ensureReviewGuide,
  guideKey,
  recallReviewGuide,
  skipReviewGuide,
  useReviewGuideStore,
} from '@/stores/review-guide-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequest } from '@/types';

const log = createLogger('review-guides');

/** A poll writes the store in several steps; look once they are done. */
const SETTLE_MS = 5_000;
/**
 * After a guide fails (the CLI is broken, the usage limit is reached) or a
 * PR's files don't load, nothing is tried again for this long: the rest of
 * the queue would fail the same way.
 */
const RETRY_MS = 10 * 60_000;

function enabled(): boolean {
  const { hasLoaded, settings } = useSettingsStore.getState();
  return hasLoaded && !!settings.summaries?.backgroundReviewGuides;
}

/**
 * The open PRs I can review: the ones waiting for my review first, in the
 * order Quick Review opens them, then every other one that is not mine and
 * not a draft.
 */
function reviewablePrs(): PullRequest[] {
  const { pullRequests, username, needsMyReview } = usePrStore.getState();
  if (!username) return [];
  const waiting = orderQuickReviewPrs(needsMyReview());
  const asked = new Set(waiting);
  const others = pullRequests.filter(
    (pr) => !asked.has(pr) && !isMyPr(pr, username) && !pr.pullRequest.isDraft,
  );
  return [...waiting, ...others]
    .map((pr) => pr.pullRequest)
    .filter((pr) => !!pr.headSha && pr.state.toLowerCase() === 'open');
}

function entryOf(pr: PullRequest) {
  return useReviewGuideStore.getState().entries[guideKey(pr)];
}

/**
 * Leaves the store with an answer for this head: the guide written earlier,
 * "simple, no guide", or a guide written now. A simple PR is judged by the
 * totals the poll already has, so its files are never read.
 */
async function prepareGuide(pr: PullRequest): Promise<void> {
  if (await recallReviewGuide(pr)) return;
  const simple = guideSkipReason(pr);
  if (simple) {
    skipReviewGuide(pr, simple);
    return;
  }
  const client = getClientForRepo(pr.repoOwner, pr.repoName);
  if (!client) throw new Error(`No GitHub account for ${pr.repoOwner}/${pr.repoName}`);
  await ensureReviewGuide(await loadReviewSnapshot(client, pr), { background: true });
}

/**
 * Writes review guides ahead for every open pull request I can review
 * (Settings → Agents → Summaries), main window only. One guide at a time,
 * my review requests first, once per head commit; Quick Review then opens
 * on a guide that is already there.
 */
export function startReviewGuideWriter(): () => void {
  let stopped = false;
  let busy = false;
  let pausedUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Heads tried since the last pause, whatever came of it. */
  const tried = new Set<string>();

  const sweep = async () => {
    if (busy || stopped || Date.now() < pausedUntil) return;
    busy = true;
    try {
      while (!stopped && enabled()) {
        const pr = reviewablePrs().find((open) => !entryOf(open) && !tried.has(guideKey(open)));
        if (!pr) return;
        tried.add(guideKey(pr));
        const failure = await prepareGuide(pr).then(
          () => {
            const entry = entryOf(pr);
            return entry?.status === 'error' ? entry.error : null;
          },
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        );
        if (failure) {
          log.warn('no guide written ahead', { pr: guideKey(pr), failure });
          pausedUntil = Date.now() + RETRY_MS;
          tried.clear();
          schedule(RETRY_MS);
          return;
        }
      }
    } finally {
      busy = false;
    }
  };

  function schedule(delay = SETTLE_MS) {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void sweep();
    }, delay);
  }

  const unsubscribePrs = usePrStore.subscribe(() => schedule());
  const unsubscribeSettings = useSettingsStore.subscribe(() => schedule());
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribePrs();
    unsubscribeSettings();
  };
}
