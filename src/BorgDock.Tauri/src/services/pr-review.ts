import { enableAutoMerge, submitReview } from '@/services/github/mutations';
import { usePrStore } from '@/stores/pr-store';

export async function submitPrReview(
  ...args: [...Parameters<typeof submitReview>, autoMerge?: boolean]
): Promise<{ autoMergeError?: unknown }> {
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
  let autoMergeError: unknown;
  if (event === 'APPROVE' && autoMerge) {
    try {
      if (!headSha) throw new Error('Reload the PR before enabling auto merge.');
      const result = await enableAutoMerge(client, owner, repo, number, headSha);
      enabled = true;
      if (result === 'merged') store.optimisticallyMarkMerged(owner, repo, number);
      else record();
    } catch (error) {
      autoMergeError = error;
    }
  }
  void store.refreshPr(owner, repo, number).then(record);
  return { autoMergeError };
}
