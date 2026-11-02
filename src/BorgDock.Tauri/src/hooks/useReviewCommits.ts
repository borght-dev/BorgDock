import { useEffect, useState } from 'react';
import { getCommitFiles, getPRCommits } from '@/services/github/pulls';
import { getClientForRepo } from '@/services/github/singleton';
import { toReviewDiffFile } from '@/services/quick-review';
import type { DiffFile, PullRequest, PullRequestCommit } from '@/types';
import { parseError } from '@/utils/parse-error';

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; error: string };

/** A commit's files never change, so they are kept for the session, by repository and SHA. */
const commitFiles = new Map<string, Promise<DiffFile[]>>();

function filesOf(owner: string, repo: string, sha: string): Promise<DiffFile[]> {
  const key = `${owner}/${repo}@${sha}`.toLowerCase();
  let files = commitFiles.get(key);
  if (!files) {
    const client = getClientForRepo(owner, repo);
    if (!client) return Promise.reject(new Error('No GitHub account for this repository.'));
    files = getCommitFiles(client, owner, repo, sha).then((list) => list.map(toReviewDiffFile));
    files.catch(() => commitFiles.delete(key));
    commitFiles.set(key, files);
  }
  return files;
}

/**
 * The PR's commits, oldest first, once `enabled` (the walk's Commits view
 * is open), and the files of `sha` with each one's patch for that commit.
 */
export function useReviewCommits(pr: PullRequest, enabled: boolean, sha: string | null) {
  const [commits, setCommits] = useState<{ head: string; load: Load<PullRequestCommit[]> } | null>(
    null,
  );
  const [files, setFiles] = useState<{ sha: string; load: Load<DiffFile[]> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const head = pr.headSha ?? '';

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` asks again after a failure
  useEffect(() => {
    if (!enabled || !head) return;
    const client = getClientForRepo(pr.repoOwner, pr.repoName);
    if (!client) return;
    let cancelled = false;
    setCommits({ head, load: { status: 'loading' } });
    getPRCommits(client, pr.repoOwner, pr.repoName, pr.number)
      .then((value) => {
        if (!cancelled) setCommits({ head, load: { status: 'ready', value } });
      })
      .catch((err) => {
        if (!cancelled)
          setCommits({ head, load: { status: 'error', error: parseError(err).message } });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, head, pr.repoOwner, pr.repoName, pr.number, attempt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` asks again after a failure
  useEffect(() => {
    if (!enabled || !sha) return;
    let cancelled = false;
    setFiles({ sha, load: { status: 'loading' } });
    filesOf(pr.repoOwner, pr.repoName, sha)
      .then((value) => {
        if (!cancelled) setFiles({ sha, load: { status: 'ready', value } });
      })
      .catch((err) => {
        if (!cancelled)
          setFiles({ sha, load: { status: 'error', error: parseError(err).message } });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, sha, pr.repoOwner, pr.repoName, attempt]);

  return {
    commits: commits?.head === head ? commits.load : null,
    files: files && files.sha === sha ? files.load : null,
    retry: () => setAttempt((n) => n + 1),
  };
}
