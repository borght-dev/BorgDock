import { useEffect, useState } from 'react';
import { getClientForRepo } from '@/services/github/singleton';
import type { ReviewSnapshot } from '@/services/quick-review';
import { loadReviewSince, type ReviewSince } from '@/services/review-since';
import { usePrStore } from '@/stores/pr-store';

/**
 * What changed on the snapshot's PR since the viewer last reviewed it
 * (`loadReviewSince`), once the snapshot has loaded. Null while loading, on
 * a first review, when nothing was pushed since, or when GitHub cannot say.
 */
export function useReviewSince(snapshot: ReviewSnapshot | null): ReviewSince | null {
  const pr = snapshot?.pr;
  const client = pr ? getClientForRepo(pr.repoOwner, pr.repoName) : null;
  const username = usePrStore((s) => s.username);
  const viewer = client?.account || username;
  const [since, setSince] = useState<{ head: string; value: ReviewSince | null } | null>(null);

  useEffect(() => {
    if (!client || !snapshot || !viewer) return;
    let cancelled = false;
    const head = snapshot.pr.headSha ?? '';
    loadReviewSince(
      client,
      snapshot.pr,
      viewer,
      snapshot.files.map((f) => f.filename),
    )
      .then((value) => {
        if (!cancelled) setSince({ head, value });
      })
      .catch(() => {
        if (!cancelled) setSince({ head, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [client, snapshot, viewer]);

  return since && since.head === (pr?.headSha ?? '') ? since.value : null;
}
