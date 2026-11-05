import { create } from 'zustand';
import { prRowKey } from '@/components/pr/pr-card-data';
import type { GitHubClient } from '@/services/github/client';
import { getPRFiles } from '@/services/github/pulls';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { detectWorkItemIds } from '@/services/work-item-linker';
import type { PullRequestWithChecks } from '@/types';
import {
  coveredChecks,
  type E2eReport,
  type E2eVerdict,
  e2eVerdict,
  isE2eCheck,
  parseE2eReport,
} from './report';

const log = createLogger('e2e-report');

/**
 * The E2E report and changed files of PRs with a failed E2E check, read on
 * demand (Quick Review, an author run) and kept per PR until its head or its
 * E2E run changes. Other PRs' reports in the same repository tell whether a
 * failing test is shared.
 */

interface E2eEntry {
  /** The head and E2E run the entry was read for; a different key reads again. */
  key: string;
  status: 'loading' | 'ready' | 'error';
  report: E2eReport | null;
  files: string[];
  workItemIds: number[];
}

export const useE2eStore = create<{ entries: Record<string, E2eEntry> }>(() => ({ entries: {} }));

/** How many other PRs of the repository are read for shared failures. */
const NEIGHBOURS = 12;
const CONCURRENCY = 3;
/** Comments a little older than the failed jobs still count: GitHub's clocks are not one. */
const SINCE_SLACK_MS = 60_000;

export function hasFailedE2e(pr: PullRequestWithChecks): boolean {
  return pr.failedCheckNames.some(isE2eCheck);
}

/**
 * The report is posted after every shard finished, so a report for the
 * current run is never older than its first failed E2E job; an older one
 * belongs to an earlier push.
 */
function sinceOf(pr: PullRequestWithChecks): string | null {
  const times = (pr.ciJobs ?? [])
    .filter((job) => isE2eCheck(job.name) && job.completedAt)
    .map((job) => Date.parse(job.completedAt as string))
    .filter((t) => !Number.isNaN(t));
  return times.length > 0 ? new Date(Math.min(...times) - SINCE_SLACK_MS).toISOString() : null;
}

/** The head and E2E run `pr`'s entry is for. */
export function entryKey(pr: PullRequestWithChecks): string {
  return `${pr.pullRequest.headSha ?? ''}|${sinceOf(pr) ?? ''}`;
}

interface IssueCommentDto {
  id: number;
  body: string | null;
  html_url: string | null;
  created_at: string;
}

async function latestReport(
  client: GitHubClient,
  pr: PullRequestWithChecks,
): Promise<E2eReport | null> {
  const { repoOwner, repoName, number } = pr.pullRequest;
  const since = sinceOf(pr);
  const comments = await client.get<IssueCommentDto[]>(
    `repos/${repoOwner}/${repoName}/issues/${number}/comments?per_page=100${
      since ? `&since=${encodeURIComponent(since)}` : ''
    }`,
  );
  let latest: E2eReport | null = null;
  for (const dto of comments) {
    const report = parseE2eReport(dto.body ?? '', {
      id: dto.id,
      url: dto.html_url ?? pr.pullRequest.htmlUrl,
      createdAt: dto.created_at,
    });
    if (report && (!latest || report.createdAt >= latest.createdAt)) latest = report;
  }
  return latest;
}

async function load(pr: PullRequestWithChecks, key: string): Promise<void> {
  const id = prRowKey(pr.pullRequest);
  const set = (entry: E2eEntry) =>
    useE2eStore.setState((s) =>
      s.entries[id]?.key === key ? { entries: { ...s.entries, [id]: entry } } : s,
    );
  const workItemIds = detectWorkItemIds(pr.pullRequest);
  useE2eStore.setState((s) => ({
    entries: {
      ...s.entries,
      [id]: { key, status: 'loading', report: null, files: [], workItemIds },
    },
  }));
  const { repoOwner, repoName, number } = pr.pullRequest;
  const client = getClientForRepo(repoOwner, repoName);
  try {
    if (!client) throw new Error('No GitHub account for this repository.');
    const [report, files] = await Promise.all([
      latestReport(client, pr),
      getPRFiles(client, repoOwner, repoName, number),
    ]);
    set({ key, status: 'ready', report, files: files.map((f) => f.filename), workItemIds });
  } catch (error) {
    log.warn('E2E report not read', { pr: id, error: String(error) });
    set({ key, status: 'error', report: null, files: [], workItemIds });
  }
}

/** Reads the report of every PR in `prs` with a failed E2E check whose entry is missing or old. */
export async function ensureE2eReports(prs: readonly PullRequestWithChecks[]): Promise<void> {
  const entries = useE2eStore.getState().entries;
  const due = prs.filter(
    (pr) => hasFailedE2e(pr) && entries[prRowKey(pr.pullRequest)]?.key !== entryKey(pr),
  );
  const queue = [...due];
  const worker = async () => {
    for (let pr = queue.shift(); pr; pr = queue.shift()) await load(pr, entryKey(pr));
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/** Open PRs of `pr`'s repository with a failed E2E check, newest first, `pr` itself left out. */
export function e2eNeighbours(
  pr: PullRequestWithChecks,
  prs: readonly PullRequestWithChecks[],
): PullRequestWithChecks[] {
  const { repoOwner, repoName, number } = pr.pullRequest;
  return prs
    .filter(
      (other) =>
        other.pullRequest.repoOwner === repoOwner &&
        other.pullRequest.repoName === repoName &&
        other.pullRequest.number !== number &&
        other.pullRequest.state === 'open' &&
        hasFailedE2e(other),
    )
    .sort((a, b) => b.pullRequest.createdAt.localeCompare(a.pullRequest.createdAt))
    .slice(0, NEIGHBOURS);
}

/** What a PR's E2E report says, and which of its failed checks it speaks for. */
export interface E2eRead {
  verdict: E2eVerdict;
  covers: ReadonlySet<string>;
}

const FAILED = new Set(['failure', 'timed_out']);

/**
 * The verdict on `pr`'s failed E2E tests from what has been read: null when
 * no E2E check failed, undefined while its report is still being read.
 */
export function e2eVerdictOf(
  pr: PullRequestWithChecks,
  entries: Record<string, E2eEntry>,
  prs: readonly PullRequestWithChecks[],
): E2eRead | null | undefined {
  if (!hasFailedE2e(pr)) return null;
  const entry = entries[prRowKey(pr.pullRequest)];
  if (!entry || entry.key !== entryKey(pr) || entry.status === 'loading') return undefined;
  const otherReports = new Map<number, E2eReport>();
  for (const other of e2eNeighbours(pr, prs)) {
    const read = entries[prRowKey(other.pullRequest)];
    if (read?.status === 'ready' && read.report && read.key === entryKey(other))
      otherReports.set(other.pullRequest.number, read.report);
  }
  const verdict = e2eVerdict(entry.report, {
    changedFiles: entry.files,
    workItemIds: entry.workItemIds,
    otherReports,
  });
  const failedJobs = (pr.ciJobs ?? []).filter((job) => FAILED.has(job.conclusion));
  return { verdict, covers: coveredChecks(pr.failedCheckNames, failedJobs, entry.report) };
}
