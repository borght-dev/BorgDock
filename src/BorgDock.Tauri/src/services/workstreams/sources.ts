import type { GitHubClient } from '@/services/github/client';
import type { PullRequestTarget } from '@/services/github/pr-lookup';
import type { AppSettings, PullRequestWithChecks } from '@/types';
import type { PolledPullRequest } from './resolve';
import type { GitHubPrRef, WorkstreamDocument } from './types';

/**
 * What the workstreams need read beyond what BorgDock reads anyway: the ADO
 * items Dispatch doesn't list and the pull requests BorgDock doesn't poll.
 */

/** Workstreams that still matter: archived ones are not read. */
function current(documents: readonly WorkstreamDocument[]): WorkstreamDocument[] {
  return documents.filter((d) => d.status !== 'archived');
}

/** The ADO ids the workstreams link in the configured organization. */
export function contextItemIds(
  documents: readonly WorkstreamDocument[],
  organization: string | null,
): number[] {
  if (!organization) return [];
  const ids = new Set<number>();
  for (const document of current(documents)) {
    for (const member of document.members) {
      const ref = member.ref;
      if (
        ref.kind === 'ado-item' &&
        ref.organization.toLowerCase() === organization.toLowerCase()
      ) {
        ids.add(ref.id);
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}

export function polledKey(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`.toLowerCase();
}

/** Every pull request the workstreams link, by `owner/repo#number`. */
export function linkedPullRequests(
  documents: readonly WorkstreamDocument[],
): Map<string, GitHubPrRef> {
  const refs = new Map<string, GitHubPrRef>();
  for (const document of current(documents)) {
    for (const member of document.members) {
      if (member.ref.kind === 'github-pr') {
        refs.set(polledKey(member.ref.owner, member.ref.repo, member.ref.number), member.ref);
      }
    }
  }
  return refs;
}

/** The linked pull requests BorgDock doesn't poll: they are looked up by number. */
export function pullRequestTargets(
  documents: readonly WorkstreamDocument[],
  polled: ReadonlySet<string>,
): (PullRequestTarget & { account: string | null })[] {
  return [...linkedPullRequests(documents).entries()]
    .filter(([key]) => !polled.has(key))
    .map(([, ref]) => ({
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      account: ref.account ?? null,
    }));
}

/** A pull request BorgDock polls, as the workstream resolver reads it. */
export function toPolled(entry: PullRequestWithChecks): PolledPullRequest {
  const pr = entry.pullRequest;
  const checks =
    entry.checksUnavailable || entry.totalCheckCount === 0
      ? null
      : entry.failedCheckNames.length > 0
        ? 'failed'
        : entry.pendingCheckNames.length > 0
          ? 'pending'
          : 'passed';
  return {
    owner: pr.repoOwner,
    repo: pr.repoName,
    number: pr.number,
    url: pr.htmlUrl,
    title: pr.title,
    state: pr.mergedAt ? 'merged' : pr.state === 'open' ? 'open' : 'closed',
    isDraft: pr.isDraft,
    mergedAt: pr.mergedAt ?? null,
    closedAt: pr.closedAt ?? null,
    baseRefName: pr.baseRef || null,
    headRefName: pr.headRef || null,
    approved: pr.reviewStatus === 'approved',
    checks,
    conflicting: pr.mergeable === false,
    polled: true,
    repositoryId: null,
    renamedTo: null,
    updatedAt: pr.updatedAt || null,
  };
}

/**
 * The `gh` account a pull request is read with: the one bound to its
 * repository in settings, else the one named on the reference, else the
 * account of a configured repository with the same owner, else the default.
 */
export function accountFor(
  target: { owner: string; repo: string; account: string | null },
  repos: AppSettings['repos'],
): string | null {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const configured = repos.find((r) => same(r.owner, target.owner) && same(r.name, target.repo));
  if (configured) return configured.githubAccount?.trim() || null;
  if (target.account) return target.account;
  const sameOwner = repos.find((r) => same(r.owner, target.owner) && r.githubAccount?.trim());
  return sameOwner?.githubAccount?.trim() || null;
}

export type ClientLookup = (account: string | null) => GitHubClient | null;
