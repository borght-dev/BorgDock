import { bypassMergePullRequest, enableAutoMerge, submitReview } from '@/services/github/mutations';
import { usePrStore } from '@/stores/pr-store';

/**
 * What an approval does next: `auto` merges once GitHub allows it (at once
 * when it already does), `bypass` merges now with admin rights, past
 * failing checks that are not the PR's doing.
 */
export type ApprovalMerge = 'auto' | 'bypass';

/** Returns once GitHub has the review; a merge can take seconds, so it runs on in `autoMerge`. */
export async function submitPrReview(
  ...args: [...Parameters<typeof submitReview>, merge?: ApprovalMerge]
): Promise<{ autoMerge?: Promise<'enabled' | 'merged'> }> {
  const [client, owner, repo, number, event, body, review, mergeIntent] = args;
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
  const merge = async (intent: ApprovalMerge): Promise<'enabled' | 'merged'> => {
    if (!headSha) throw new Error('Reload the PR before merging it.');
    const result =
      intent === 'bypass'
        ? await bypassMergePullRequest(owner, repo, number, headSha).then(() => 'merged' as const)
        : await enableAutoMerge(client, owner, repo, number, headSha);
    enabled = true;
    if (result === 'merged') store.optimisticallyMarkMerged(owner, repo, number);
    else record();
    return result;
  };
  const merging = event === 'APPROVE' && mergeIntent ? merge(mergeIntent) : undefined;
  void Promise.allSettled([merging])
    .then(() => store.refreshPr(owner, repo, number))
    .then(record);
  return { autoMerge: merging };
}
