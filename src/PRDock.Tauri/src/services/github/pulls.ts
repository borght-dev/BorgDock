import { createLogger } from '@/services/logger';
import type { PullRequest, PullRequestCommit, PullRequestFileChange, ReviewStatus } from '@/types';
import type { GitHubClient } from './client';

const log = createLogger('github:pulls');

// --- GitHub API DTOs (snake_case) ---

interface GitHubUserDto {
  login: string;
  avatar_url: string;
}

interface GitHubRefDto {
  ref: string;
}

interface GitHubLabelDto {
  name: string;
}

interface GitHubPullRequestDto {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  draft: boolean;
  mergeable: boolean | null;
  mergeable_state?: string; // "clean" | "dirty" | "unstable" | "blocked" | "unknown"
  comments: number;
  review_comments: number;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  user: GitHubUserDto | null;
  head: GitHubRefDto | null;
  base: GitHubRefDto | null;
  labels: GitHubLabelDto[] | null;
  requested_reviewers: GitHubUserDto[] | null;
}

interface GitHubReviewDto {
  state: string;
  user: GitHubUserDto | null;
}

interface GitHubCommitDto {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    } | null;
  } | null;
  author: GitHubUserDto | null;
}

interface GitHubFileChangeDto {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
  sha?: string;
}

// --- Public API ---

export async function getOpenPRs(
  client: GitHubClient,
  owner: string,
  repo: string,
  options: { hydrateDetails?: boolean } = {},
): Promise<PullRequest[]> {
  const { hydrateDetails = true } = options;
  const dtos = await client.get<GitHubPullRequestDto[]>(`repos/${owner}/${repo}/pulls?state=open`);

  const pullRequests = dtos.map((dto) => mapToPullRequest(dto, owner, repo));

  // Skip the per-PR detail+reviews hydration when the caller only needs the list.
  // This avoids 2*N extra API requests on startup, which can trip GitHub's secondary
  // rate limit and make the splash screen feel hung. The normal polling loop fills
  // these fields in on the next tick.
  if (!hydrateDetails) {
    return pullRequests;
  }

  // Fetch individual PR details + reviews in parallel
  // The list endpoint returns mergeable: null — only individual PR fetches compute it
  await Promise.allSettled(
    pullRequests.map(async (pr, i) => {
      const num = dtos[i]!.number;
      const [detail, reviews] = await Promise.all([
        client.get<GitHubPullRequestDto>(`repos/${owner}/${repo}/pulls/${num}`),
        client.get<GitHubReviewDto[]>(`repos/${owner}/${repo}/pulls/${num}/reviews`),
      ]);
      // mergeable can be null if GitHub hasn't computed it yet;
      // fall back to mergeable_state which is more reliably populated
      pr.mergeable =
        detail.mergeable ??
        mergeableFromState(detail.mergeable_state) ??
        undefined;
      pr.additions = detail.additions ?? 0;
      pr.deletions = detail.deletions ?? 0;
      pr.changedFiles = detail.changed_files ?? 0;
      pr.commitCount = detail.commits ?? 0;
      pr.reviewStatus = aggregateReviewStatus(reviews);
      pr.requestedReviewers = detail.requested_reviewers?.map((u) => u.login) ?? pr.requestedReviewers;
    }),
  );

  return pullRequests;
}

export async function getClosedPRs(
  client: GitHubClient,
  owner: string,
  repo: string,
  since?: string,
): Promise<PullRequest[]> {
  let url = `repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`;
  if (since) {
    url += `&since=${encodeURIComponent(since)}`;
  }

  const dtos = await client.get<GitHubPullRequestDto[]>(url);
  return dtos.map((dto) => mapToPullRequest(dto, owner, repo));
}

export async function getPRCommits(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestCommit[]> {
  const dtos = await client.get<GitHubCommitDto[]>(
    `repos/${owner}/${repo}/pulls/${prNumber}/commits`,
  );

  return dtos.map((d) => ({
    sha: d.sha ?? '',
    message: d.commit?.message ?? '',
    authorLogin: d.author?.login ?? d.commit?.author?.name ?? '',
    authorAvatarUrl: d.author?.avatar_url ?? '',
    date: d.commit?.author?.date ?? '',
  }));
}

export async function getPRFiles(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestFileChange[]> {
  log.info('getPRFiles start', { owner, repo, prNumber });
  const allFiles: PullRequestFileChange[] = [];
  let page = 1;

  while (true) {
    log.info('getPRFiles fetching page', { owner, repo, prNumber, page });
    const dtos = await client.get<GitHubFileChangeDto[]>(
      `repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
    );
    log.info('getPRFiles page fetched', {
      owner,
      repo,
      prNumber,
      page,
      count: dtos.length,
    });

    for (const d of dtos) {
      allFiles.push({
        filename: d.filename ?? '',
        status: d.status ?? '',
        additions: d.additions,
        deletions: d.deletions,
        patch: d.patch,
        previousFilename: d.previous_filename,
        sha: d.sha,
      });
    }

    if (dtos.length < 100) break;
    page++;
  }

  return allFiles;
}

export async function getCommitFiles(
  client: GitHubClient,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<PullRequestFileChange[]> {
  const dto = await client.get<{ files?: GitHubFileChangeDto[] }>(
    `repos/${owner}/${repo}/commits/${commitSha}`,
  );

  return (dto.files ?? []).map((d) => ({
    filename: d.filename ?? '',
    status: d.status ?? '',
    additions: d.additions,
    deletions: d.deletions,
    patch: d.patch,
    previousFilename: d.previous_filename,
    sha: d.sha,
  }));
}

// --- Helpers ---

function mergeableFromState(state?: string): boolean | null {
  switch (state) {
    case 'clean':
    case 'unstable':
    case 'has_hooks':
      return true;
    case 'dirty':
      return false;
    default:
      return null; // "unknown", "blocked", or missing
  }
}

export function aggregateReviewStatus(reviews: GitHubReviewDto[]): ReviewStatus {
  if (reviews.length === 0) return 'none';

  // Latest review per user
  const latestByUser = new Map<string, string>();
  for (const review of reviews) {
    const login = review.user?.login ?? '';
    const state = review.state ?? '';
    if (login && state) {
      latestByUser.set(login.toLowerCase(), state.toUpperCase());
    }
  }

  if (latestByUser.size === 0) return 'none';

  const states = [...latestByUser.values()];

  if (states.some((s) => s === 'CHANGES_REQUESTED')) return 'changesRequested';
  if (states.some((s) => s === 'APPROVED')) return 'approved';
  if (states.some((s) => s === 'COMMENTED')) return 'commented';
  if (states.some((s) => s === 'PENDING')) return 'pending';

  return 'none';
}

function mapToPullRequest(dto: GitHubPullRequestDto, owner: string, repo: string): PullRequest {
  return {
    number: dto.number,
    title: dto.title ?? '',
    headRef: dto.head?.ref ?? '',
    baseRef: dto.base?.ref ?? '',
    authorLogin: dto.user?.login ?? '',
    authorAvatarUrl: dto.user?.avatar_url ?? '',
    state: dto.state ?? 'open',
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    isDraft: dto.draft,
    mergeable: dto.mergeable ?? undefined,
    htmlUrl: dto.html_url ?? '',
    body: dto.body ?? '',
    repoOwner: owner,
    repoName: repo,
    reviewStatus: 'none',
    commentCount: (dto.comments ?? 0) + (dto.review_comments ?? 0),
    labels: dto.labels?.map((l) => l.name).filter((n) => n.length > 0) ?? [],
    additions: dto.additions,
    deletions: dto.deletions,
    changedFiles: dto.changed_files,
    commitCount: dto.commits,
    mergedAt: dto.merged_at ?? undefined,
    closedAt: dto.closed_at ?? undefined,
    requestedReviewers: dto.requested_reviewers?.map((u) => u.login) ?? [],
  };
}
