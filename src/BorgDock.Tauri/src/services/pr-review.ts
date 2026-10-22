import { enableAutoMerge, submitReview } from '@/services/github/mutations';
import { usePrStore } from '@/stores/pr-store';

/** Returns once GitHub has the review; a merge can take seconds, so it runs on in `autoMerge`. */
export async function submitPrReview(
  ...args: [...Parameters<typeof submitReview>, autoMerge?: boolean]
): Promise<{ autoMerge?: ReturnType<typeof enableAutoMerge> }> {
  const [client, owner, repo, number, event, body, review, autoMerge] = args;
  const posted = await submitReview(client, owner, repo, number, event, body, review);
  const store = usePrStore.getState();
  const reviewer = posted?.authorLogin || client.account || store.username;
  const headSha = review?.commit_id ?? posted?.commitSha;
  let enabled: boolean | undefined;
  const record = () => {
    if (event === 'APPROVE')
      usePrStore.getState().recordApproval(owner, repo, number, reviewer, headSha, enabled);
  };
  record();
  const merge = async () => {
    if (!headSha) throw new Error('Reload the PR before enabling auto merge.');
    const result = await enableAutoMerge(client, owner, repo, number, headSha);
    enabled = true;
    if (result === 'merged') store.optimisticallyMarkMerged(owner, repo, number);
    else record();
    return result;
  };
  const merging = event === 'APPROVE' && autoMerge ? merge() : undefined;
  void Promise.allSettled([merging])
    .then(() => store.refreshPr(owner, repo, number))
    .then(record);
  return { autoMerge: merging };
}
