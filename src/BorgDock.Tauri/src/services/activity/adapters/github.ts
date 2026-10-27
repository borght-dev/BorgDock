import * as ciStore from '@/services/ci-failures/store-api';
import type { GitHubClient } from '@/services/github/client';
import { resolvedLogin } from '@/services/github/login';
import {
  type LookupResult,
  lookUpPullRequests,
  type PullRequestTarget,
  targetKey,
} from '@/services/github/pr-lookup';
import { getBotReviewComments } from '@/services/github/reviews';
import { GITHUB_HOST, scopeOf } from '@/services/github/scope';
import { createLogger } from '@/services/logger';
import { isReadyToMerge } from '@/services/notification';
import { isTeamRequested } from '@/services/team-membership';
import { isSharedGroup, scopeOfRepo, useCiFailuresStore } from '@/stores/ci-failures-store';
import { myReviewRequestedAt, usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { CiJob, PullRequestWithChecks } from '@/types';
import { firstLine } from '../copy';
import {
  deriveGitHub,
  type FailingJob,
  type FindingItem,
  type GitHubBaseline,
  type GitHubObservation,
  type PrFacts,
  type PrFindings,
  prsNeedingFindings,
  prsToVerify,
  type VerifiedPr,
} from '../derive/github';
import { ingest, markSourceFailed, peekBaseline, type SourceDescriptor } from '../ingest';
import { sourceId } from '../sources';
import { ingestDeliveryHeads } from './delivery';

const log = createLogger('activity:github');

/** At most this many verification reads and findings fetches per repository and poll. */
export const VERIFY_PER_POLL = 10;
export const FINDINGS_PER_POLL = 3;

/** One repository the poll read fresh, and how. */
export interface FreshRepository {
  owner: string;
  name: string;
  /** The account the settings bind it to; empty for whichever gh has active. */
  account: string;
  /** REST drops reviews when the head moved, so a REST read never adds review entries. */
  path: 'graphql' | 'rest';
}

export interface GitHubPoll {
  repositories: FreshRepository[];
  results: readonly PullRequestWithChecks[];
  startedAt: number;
  clientFor: (owner: string, repo: string) => GitHubClient | null;
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure', 'action_required', 'error']);

/** What was read last per PR, so a verified merge can join the closed list with its details. */
const lastSeen = new Map<string, PullRequestWithChecks>();
const lookups = new Map<string, LookupResult>();

function keyOf(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`.toLowerCase();
}

export function githubSource(owner: string, repo: string, login: string): SourceDescriptor {
  const scope = scopeOf({ host: GITHUB_HOST, account: login, owner, repo });
  return {
    sourceId: sourceId.gh(scope),
    kind: 'gh',
    label: `${owner}/${repo} (${login})`,
    configKey: scope,
  };
}

/** The Claude bot's review as the poll sees it; a change makes findings worth a fetch. */
function claudeKeyOf(pr: PullRequestWithChecks, bot: string): string | null {
  const review = pr.pullRequest.latestReviews?.find((r) =>
    r.authorLogin.toLowerCase().includes(bot),
  );
  if (!review && pr.pullRequest.commentCount === 0) return null;
  return `${review?.id ?? ''}:${review?.submittedAt ?? ''}:${pr.pullRequest.commentCount}`;
}

interface JobEvidence {
  signal: string | null;
  groupId: string | null;
}

function failingJobsOf(
  pr: PullRequestWithChecks,
  scope: string,
  evidence: ReadonlyMap<number, JobEvidence>,
): FailingJob[] {
  const groups = useCiFailuresStore
    .getState()
    .groups.filter((group) => group.scope === scope && isSharedGroup(group))
    .filter((group) => group.prNumbers.includes(pr.pullRequest.number));
  const failing: CiJob[] = (pr.ciJobs ?? []).filter((job) => FAILED.has(job.conclusion));
  if (failing.length === 0) {
    return pr.failedCheckNames.map((name, index) => ({
      id: -(index + 1),
      name,
      completedAt: null,
      signal: null,
      group: null,
    }));
  }
  return failing.map((job) => {
    const known = evidence.get(job.id);
    const group = groups.find((candidate) => candidate.id === known?.groupId) ?? null;
    return {
      id: job.id,
      name: job.name,
      completedAt: job.completedAt ?? null,
      signal: known?.signal ?? null,
      group: group
        ? {
            scope: group.scope,
            id: group.id,
            title: group.title,
            owned: !!group.claim && group.claim.state !== 'released',
          }
        : null,
    };
  });
}

/**
 * What CI failures read from the logs of my red PRs' jobs: each job's first
 * signal, and the group that signal belongs to.
 */
async function evidenceOf(
  scope: string,
  numbers: readonly number[],
): Promise<Map<number, JobEvidence>> {
  const evidence = new Map<number, JobEvidence>();
  for (const number of numbers) {
    try {
      const failures = await ciStore.loadPr(scope, number);
      for (const detail of failures.occurrences) {
        const jobId = detail.occurrence.jobId;
        const [first] = [...detail.signals].sort((a, b) => a.ordinal - b.ordinal);
        if (!jobId || !first || evidence.has(jobId)) continue;
        const { code, message, path } = first.signal;
        evidence.set(jobId, {
          signal: [code, firstLine(message), path ? `(${path})` : ''].filter(Boolean).join(' '),
          groupId: first.groupId,
        });
      }
    } catch {
      // Without its evidence the entry still names the job.
    }
  }
  return evidence;
}

function factsOf(
  pr: PullRequestWithChecks,
  login: string,
  path: FreshRepository['path'],
  bot: string,
  failing: FailingJob[],
): PrFacts {
  const p = pr.pullRequest;
  const prStore = usePrStore.getState();
  const requestedMe =
    p.requestedReviewers.some((reviewer) => reviewer.toLowerCase() === login) ||
    isTeamRequested(p.requestedTeams, prStore.teams);
  return {
    number: p.number,
    title: p.title,
    url: p.htmlUrl,
    author: p.authorLogin,
    createdAt: p.createdAt,
    headSha: p.headSha ?? p.headRef,
    isDraft: p.isDraft,
    mergeable: p.mergeable ?? null,
    ready: isReadyToMerge(pr),
    reviews:
      path === 'graphql' && p.latestReviews
        ? p.latestReviews.flatMap((review) =>
            review.id
              ? [
                  {
                    id: review.id,
                    author: review.authorLogin,
                    state: review.state,
                    submittedAt: review.submittedAt ?? null,
                    bot: review.authorLogin.toLowerCase().includes(bot),
                  },
                ]
              : [],
          )
        : null,
    requestedMe,
    requestedAt: requestedMe
      ? myReviewRequestedAt(pr, login, prStore.reviewRequestTimestamps)
      : null,
    claudeKey: claudeKeyOf(pr, bot),
    checks: {
      known: !pr.checksUnavailable,
      overall: pr.overallStatus,
      failing,
    },
  };
}

function severityOf(severity: string): FindingItem['severity'] {
  return severity === 'critical' || severity === 'suggestion' || severity === 'praise'
    ? severity
    : 'info';
}

async function fetchFindings(
  client: GitHubClient,
  owner: string,
  repo: string,
  wanted: { number: number; since: string | null }[],
  bot: string,
): Promise<PrFindings[]> {
  const found: PrFindings[] = [];
  for (const { number, since } of wanted.slice(0, FINDINGS_PER_POLL)) {
    try {
      const comments = (await getBotReviewComments(client, owner, repo, number, bot)).filter(
        (comment) => !since || comment.createdAt > since,
      );
      const newest = [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      found.push({
        number,
        key: newest?.id ?? `none:${since ?? 'start'}`,
        at: newest?.createdAt ?? since,
        items: comments.map((comment) => ({
          severity: severityOf(comment.severity),
          title: firstLine(comment.body.replace(/[#*_`>]/g, '')).slice(0, 120),
        })),
      });
    } catch (error) {
      log.warn('could not read Claude findings', { owner, repo, number, error: String(error) });
    }
  }
  return found;
}

async function verify(
  client: GitHubClient,
  owner: string,
  repo: string,
  numbers: readonly number[],
): Promise<VerifiedPr[]> {
  const targets: PullRequestTarget[] = numbers
    .slice(0, VERIFY_PER_POLL)
    .map((number) => ({ owner, repo, number }));
  if (targets.length === 0) return [];
  const results = await lookUpPullRequests(targets, () => client, lookups);
  const verified: VerifiedPr[] = [];
  for (const target of targets) {
    const key = targetKey(target);
    const result = results.get(key);
    if (result) lookups.set(key, result);
    if (result?.status !== 'found') continue;
    const pr = result.pullRequest;
    if (pr.state !== 'merged' && pr.state !== 'closed' && pr.state !== 'open') continue;
    verified.push({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author:
        pr.authorLogin ??
        lastSeen.get(keyOf(owner, repo, pr.number))?.pullRequest.authorLogin ??
        '',
      state: pr.state,
      mergedAt: pr.mergedAt,
      mergedBy: pr.mergedBy ?? null,
      closedAt: pr.closedAt,
      mergeCommitSha: pr.mergeCommitSha ?? null,
    });
  }
  return verified;
}

/** Verified merges and closes join the closed list now, so Dispatch and workstreams see them. */
function addToClosed(owner: string, repo: string, verified: readonly VerifiedPr[]): void {
  const closed = verified.flatMap((pr) => {
    if (pr.state === 'open') return [];
    const prior = lastSeen.get(keyOf(owner, repo, pr.number));
    if (!prior) return [];
    return [
      {
        ...prior,
        pullRequest: {
          ...prior.pullRequest,
          state: pr.state,
          mergedAt: pr.mergedAt ?? undefined,
          closedAt: pr.closedAt ?? undefined,
          ...(pr.mergeCommitSha ? { mergeCommitSha: pr.mergeCommitSha } : {}),
        },
      },
    ];
  });
  if (closed.length === 0) return;
  const store = usePrStore.getState();
  const known = new Set(closed.map((pr) => keyOf(owner, repo, pr.pullRequest.number)));
  store.setClosedPullRequests([
    ...closed,
    ...store.closedPullRequests.filter(
      (pr) =>
        !known.has(keyOf(pr.pullRequest.repoOwner, pr.pullRequest.repoName, pr.pullRequest.number)),
    ),
  ]);
}

async function observeRepository(poll: GitHubPoll, repository: FreshRepository): Promise<void> {
  const { owner, name } = repository;
  const client = poll.clientFor(owner, name);
  if (!client) return;
  const login = await resolvedLogin(client);
  if (!login) return;
  const source = githubSource(owner, name, login);
  const settings = useSettingsStore.getState().settings;
  const bot = (settings.claudeReview?.botUsername ?? 'claude[bot]')
    .toLowerCase()
    .replace(/\[bot\]$/, '');
  const prs = poll.results.filter(
    (pr) =>
      pr.pullRequest.repoOwner.toLowerCase() === owner.toLowerCase() &&
      pr.pullRequest.repoName.toLowerCase() === name.toLowerCase(),
  );
  const ciScope = scopeOfRepo({ owner, name, githubAccount: repository.account });
  const myRed = prs
    .filter(
      (pr) => pr.pullRequest.authorLogin.toLowerCase() === login && pr.overallStatus === 'red',
    )
    .map((pr) => pr.pullRequest.number);
  const evidence = await evidenceOf(ciScope, myRed);
  const facts = prs.map((pr) =>
    factsOf(pr, login, repository.path, bot, failingJobsOf(pr, ciScope, evidence)),
  );

  const baseline = await peekBaseline<GitHubBaseline>(source);
  const verified = await verify(client, owner, name, prsToVerify(baseline, { prs: facts }));
  const findings = await fetchFindings(
    client,
    owner,
    name,
    prsNeedingFindings(baseline, { login, prs: facts }, FINDINGS_PER_POLL),
    settings.claudeReview?.botUsername ?? 'claude[bot]',
  );
  for (const pr of prs) {
    lastSeen.set(keyOf(owner, name, pr.pullRequest.number), pr);
  }
  addToClosed(owner, name, verified);

  const observation: GitHubObservation = {
    owner,
    repo: name,
    login,
    path: repository.path,
    prs: facts,
    verified,
    findings,
  };
  await ingest(source, { time: poll.startedAt }, deriveGitHub, observation);
  await ingestDeliveryHeads(owner, name, login, prs);
}

/**
 * Every repository a poll read fresh. A repository that kept its old PRs
 * because both reads failed is not here, so it adds nothing.
 */
export async function ingestGitHubPoll(poll: GitHubPoll): Promise<void> {
  await Promise.all(
    poll.repositories.map((repository) =>
      observeRepository(poll, repository).catch((error) =>
        log.warn('activity: GitHub observation failed', {
          repo: `${repository.owner}/${repository.name}`,
          error: String(error),
        }),
      ),
    ),
  );
}

/** A repository both reads failed for; enough of them in a row make the next commit a catch-up. */
export async function gitHubRepositoryFailed(
  owner: string,
  name: string,
  client: GitHubClient | null,
): Promise<void> {
  if (!client) return;
  const login = await resolvedLogin(client);
  if (login) markSourceFailed(githubSource(owner, name, login).sourceId);
}
