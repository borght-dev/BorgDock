import { useEffect, useState } from 'react';
import {
  type BranchStory,
  branchStoryOf,
  type RunRef,
  recoveredRunOf,
} from '@/services/ci-failures/culprit';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { createLogger } from '@/services/logger';

const log = createLogger('branch-story');

/** How often a shown story asks the branch watch whether the default branch passes again. */
const RECOVERY_CHECK_MS = 60_000;

/**
 * The default branch's story of a group (`branchStoryOf`): null until it is
 * read, and for a group that never failed there or whose read failed. While
 * shown, `recovered` follows the sync's branch watch: a passing run records
 * no new failure, so nothing else would tell the story it changed.
 */
export function useBranchStory(group: CiGroupSummary): BranchStory | null {
  const [story, setStory] = useState<BranchStory | null>(null);
  // `undefined`: not checked since the story was read; the story's own answer stands.
  const [recovered, setRecovered] = useState<RunRef | null | undefined>(undefined);
  const key = `${group.id}|${group.lastObservedAt}|${group.defaultBranchRuns.join(',')}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` names every part of the group the story reads
  useEffect(() => {
    let cancelled = false;
    setRecovered(undefined);
    branchStoryOf(group)
      .then((result) => {
        if (!cancelled) setStory(result);
      })
      .catch((error) => {
        log.debug('reading the default branch story failed', {
          group: group.id,
          error: String(error),
        });
        if (!cancelled) setStory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!story) return;
    let cancelled = false;
    const check = () => {
      recoveredRunOf(group.scope, story.newestRed)
        .then((run) => {
          if (!cancelled) setRecovered(run);
        })
        .catch(() => {});
    };
    const timer = setInterval(check, RECOVERY_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [story, group.scope]);

  if (!story) return null;
  return recovered === undefined ? story : { ...story, recovered };
}
