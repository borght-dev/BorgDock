import { getReviews } from '@/services/github/reviews';
import type { DiffFile, PullRequest } from '@/types';
import type { GitHubClient } from './github/client';
import { toReviewDiffFile } from './quick-review';

export type LastReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';

export interface LastReview {
  state: LastReviewState;
  /** The head commit the review was given on. */
  commitId: string;
  submittedAt: string;
  body: string;
}

/**
 * What changed on a PR since the reviewer's last review. `files` is null
 * when the branch was rewritten (force-pushed or rebased) after the review:
 * the reviewed commit is no longer an ancestor, so there is no "since".
 */
export interface ReviewSince {
  review: LastReview;
  /** Commits on the head after the reviewed one. */
  commits: number;
  /** First line of the newest of those commits. */
  latestMessage: string;
  /** PR files those commits touched, each with the patch of just those commits. */
  files: DiffFile[] | null;
}

interface CompareFileDto {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
  sha?: string;
}

interface CompareDto {
  status: 'ahead' | 'behind' | 'diverged' | 'identical';
  ahead_by: number;
  commits?: Array<{ commit: { message: string } }>;
  files?: CompareFileDto[];
}

const COUNTED: readonly string[] = ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'];

/**
 * The viewer's latest review that looked at the whole PR: an approval, a
 * request for changes, or a comment review with an overall comment. A
 * comment review without one is usually a reply in a thread, which GitHub
 * also records as a review.
 */
export function lastReviewBy(
  reviews: ReadonlyArray<{
    state: string;
    body: string | null;
    submitted_at: string;
    user: { login: string } | null;
    commit_id?: string;
  }>,
  viewer: string,
): LastReview | null {
  const login = viewer.toLowerCase();
  const mine = reviews
    .filter(
      (r) =>
        r.user?.login.toLowerCase() === login &&
        r.commit_id &&
        COUNTED.includes(r.state) &&
        (r.state !== 'COMMENTED' || !!r.body?.trim()),
    )
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
  const latest = mine[0];
  return latest?.commit_id
    ? {
        state: latest.state as LastReviewState,
        commitId: latest.commit_id,
        submittedAt: latest.submitted_at,
        body: latest.body ?? '',
      }
    : null;
}

/**
 * Loads what changed since the viewer last reviewed `pr`, or null when they
 * never did or nothing was pushed since.
 */
export async function loadReviewSince(
  client: GitHubClient,
  pr: PullRequest,
  viewer: string,
  prPaths: readonly string[],
): Promise<ReviewSince | null> {
  if (!viewer || !pr.headSha) return null;
  const reviews = await getReviews(client, pr.repoOwner, pr.repoName, pr.number, {
    paginate: true,
  });
  const review = lastReviewBy(reviews, viewer);
  if (!review || review.commitId === pr.headSha) return null;
  const compare = await client.get<CompareDto>(
    `repos/${pr.repoOwner}/${pr.repoName}/compare/${review.commitId}...${pr.headSha}`,
  );
  if (compare.status === 'identical' || compare.status === 'behind') return null;
  const commits = compare.commits ?? [];
  const latestMessage = commits.at(-1)?.commit.message.split('\n')[0] ?? '';
  if (compare.status === 'diverged')
    return { review, commits: compare.ahead_by, latestMessage, files: null };
  const inPr = new Set(prPaths);
  const files = (compare.files ?? [])
    .filter((f) => inPr.has(f.filename))
    .map((f) =>
      toReviewDiffFile({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        previousFilename: f.previous_filename,
        sha: f.sha,
      }),
    );
  return { review, commits: compare.ahead_by, latestMessage, files };
}

/** "requested changes" / "approved" / "commented", for "You … on Oct 26". */
export function reviewVerb(state: LastReviewState): string {
  return state === 'APPROVED'
    ? 'approved'
    : state === 'CHANGES_REQUESTED'
      ? 'requested changes'
      : 'commented';
}
