import {
  makeItem,
  makeKnownPr,
  makeThread,
  PROJECTS,
} from '@/services/dispatch/__tests__/fixtures';
import { buildOverview } from '@/services/dispatch/engine';
import type {
  AgentThread,
  DispatchItem,
  ItemOverview,
  KnownPullRequest,
} from '@/services/dispatch/types';
import type { LookupResult } from '@/services/github/pr-lookup';
import type { HostStatus } from '@/stores/dispatch-store';
import type { PolledPullRequest, SourceSnapshot } from '../resolve';

export const SNAPSHOT_NOW = Date.parse('2026-10-26T12:00:00Z');
const AT = new Date(SNAPSHOT_NOW - 30_000).toISOString();

export { makeItem, makeKnownPr, makeThread };

/** Item overviews the way Dispatch builds them. */
export function overviews(
  items: DispatchItem[],
  pullRequests: KnownPullRequest[] = [],
  threads: AgentThread[] = [],
  contextItems: DispatchItem[] = [],
): Map<number, ItemOverview> {
  const { overview } = buildOverview({
    items,
    threads,
    projects: PROJECTS,
    pullRequests,
    queued: new Set(),
    hiddenSuggestions: new Set(),
    manualLinks: new Map(),
    slotPattern: null,
    contextItems,
    now: new Date(SNAPSHOT_NOW),
  });
  return new Map([...overview.items, ...(overview.context ?? [])].map((o) => [o.item.id, o]));
}

export function host(
  id: string,
  environmentId: string | null,
  overrides: Partial<HostStatus> = {},
): HostStatus {
  return {
    id,
    label: id === 'local' ? 'This machine' : id,
    ok: true,
    at: AT,
    error: null,
    environmentId,
    ...overrides,
  };
}

export function polled(
  owner: string,
  repo: string,
  number: number,
  overrides: Partial<PolledPullRequest> = {},
) {
  const pr: PolledPullRequest = {
    owner,
    repo,
    number,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
    title: `${repo} #${number}`,
    state: 'open',
    isDraft: false,
    mergedAt: null,
    closedAt: null,
    baseRefName: 'master',
    headRefName: 'feature',
    approved: false,
    checks: 'passed',
    conflicting: false,
    polled: true,
    repositoryId: null,
    renamedTo: null,
    updatedAt: AT,
    ...overrides,
  };
  return [`${owner}/${repo}#${number}`.toLowerCase(), pr] as const;
}

export function lookedUp(
  owner: string,
  repo: string,
  number: number,
  result: Partial<LookupResult> & { status: LookupResult['status'] },
) {
  return [`${owner}/${repo}#${number}`.toLowerCase(), result as LookupResult] as const;
}

export function snapshot(overrides: Partial<SourceSnapshot> = {}): SourceSnapshot {
  return {
    now: SNAPSHOT_NOW,
    ado: { organization: 'acme', status: { ok: true, at: AT, error: null }, pollMs: 60_000 },
    items: new Map(),
    missingItemIds: new Set(),
    gitHub: { configured: true, lastPollAt: AT, pollMs: 60_000 },
    polled: new Map(),
    lookedUp: new Map(),
    threads: new Map(),
    hosts: [host('local', 'env-laptop')],
    configuredHosts: new Set(['local']),
    cache: {},
    ...overrides,
  };
}

export function threadMap(threads: AgentThread[]): Map<string, AgentThread> {
  return new Map(threads.map((t) => [t.id, t]));
}
