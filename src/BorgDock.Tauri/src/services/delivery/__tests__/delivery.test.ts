import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELIVERY_MS } from '@/services/activity/adapters/delivery';
import type { GitHubClient } from '@/services/github/client';
import { PollingManager } from '@/services/polling';
import { DeploymentReader, STATUSES_PER_CYCLE } from '../deployments';
import { matchesEnvironment, suggestEnvironments } from '../environments';
import { COMPARES_PER_CYCLE, InclusionChecker, type MergedPr } from '../inclusion';

/**
 * Shaped like the Deployments API answers fsp-horizon gets: dev, selecta-a
 * and staging-1..6 deploys, plus monitor-* runs nobody follows.
 */
const NOW = Date.parse('2026-10-27T10:00:00Z');
const ENVIRONMENTS = ['dev', 'selecta-a', 'staging-1', 'staging-2', 'monitor-dev', 'acc'];

function deployment(id: number, environment: string, minutesAgo: number, sha = `sha${id}`) {
  return {
    id,
    sha,
    environment,
    created_at: new Date(NOW - minutesAgo * 60_000).toISOString().replace('.000', ''),
  };
}

function fakeClient(
  deployments: ReturnType<typeof deployment>[],
  statuses: Record<number, string>,
  compare: (base: string, head: string) => string = () => 'ahead',
) {
  const calls: string[] = [];
  const client = {
    account: '',
    get: vi.fn(async (path: string) => {
      calls.push(path);
      if (path.endsWith('/deployments?per_page=100')) return deployments;
      const status = /deployments\/(\d+)\/statuses/.exec(path);
      if (status) {
        const id = Number(status[1]);
        return [
          {
            id: id * 10,
            state: statuses[id] ?? 'success',
            created_at: new Date(NOW).toISOString(),
            log_url: `https://github.com/acme/app/actions/runs/${id}`,
          },
        ];
      }
      const compared = /compare\/(\w+)\.\.\.(\w+)/.exec(path);
      if (compared) return { status: compare(compared[1]!, compared[2]!) };
      throw new Error(`unexpected ${path}`);
    }),
  } as unknown as GitHubClient;
  return { client, calls };
}

describe('environments', () => {
  it('matches glob patterns without regard to case', () => {
    expect(matchesEnvironment('staging-3', ['staging-*'])).toBe(true);
    expect(matchesEnvironment('selecta-a', ['*-a'])).toBe(true);
    expect(matchesEnvironment('monitor-dev', ['dev'])).toBe(false);
    expect(matchesEnvironment('ACC', ['acc*'])).toBe(true);
    expect(matchesEnvironment('dev', [''])).toBe(false);
  });

  it('suggests the environments most deployed to first', () => {
    expect(suggestEnvironments(['dev', 'staging-1', 'dev', 'acc', 'dev', 'staging-1'])).toEqual([
      'dev',
      'staging-1',
      'acc',
    ]);
  });
});

describe('DeploymentReader', () => {
  it('reads the list once and at most ten statuses per cycle, newest first', async () => {
    const listed = Array.from({ length: 30 }, (_, i) =>
      deployment(100 + i, ENVIRONMENTS[i % ENVIRONMENTS.length]!, i),
    );
    const { client, calls } = fakeClient(listed, {});
    const reader = new DeploymentReader();
    const first = await reader.read(client, 'acme', 'app', ['dev', 'staging-*', 'selecta-a'], NOW);
    expect(calls.filter((call) => call.endsWith('/deployments?per_page=100'))).toHaveLength(1);
    expect(calls.filter((call) => call.includes('/statuses'))).toHaveLength(STATUSES_PER_CYCLE);
    expect(first.requests).toBe(1 + STATUSES_PER_CYCLE);
    expect(first.deployments.every((d) => !d.environment.startsWith('monitor'))).toBe(true);
    expect(first.deployments.filter((d) => d.status)).toHaveLength(10);
    expect(first.deployments[0]?.id).toBe(100);

    calls.length = 0;
    const second = await reader.read(client, 'acme', 'app', ['dev', 'staging-*', 'selecta-a'], NOW);
    expect(calls.filter((call) => call.includes('/statuses'))).toHaveLength(10);
    expect(second.deployments.filter((d) => d.status)).toHaveLength(20);
  });

  it('reads a status again until it settles', async () => {
    const { client, calls } = fakeClient([deployment(1, 'dev', 1)], { 1: 'in_progress' });
    const reader = new DeploymentReader();
    await reader.read(client, 'acme', 'app', ['dev'], NOW);
    await reader.read(client, 'acme', 'app', ['dev'], NOW);
    expect(calls.filter((call) => call.includes('/statuses'))).toHaveLength(2);
  });

  it('leaves deployments older than two weeks alone', async () => {
    const { client } = fakeClient([deployment(1, 'dev', 15 * 24 * 60)], {});
    const read = await new DeploymentReader().read(client, 'acme', 'app', ['dev'], NOW);
    expect(read.deployments).toEqual([]);
  });
});

describe('InclusionChecker', () => {
  const merged = (number: number): MergedPr => ({
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/app/pull/${number}`,
    mergedAt: '2026-10-27T08:00:00Z',
    mergeCommitSha: `m${number}`,
  });

  it('compares at most ten pairs per cycle and remembers answers', async () => {
    const listed = ['dev', 'acc', 'staging-1'].map((environment, i) =>
      deployment(i + 1, environment, 5, `d${i}`),
    );
    const { client, calls } = fakeClient(listed, {}, (base) =>
      base === 'm2' ? 'diverged' : 'ahead',
    );
    const read = await new DeploymentReader().read(client, 'acme', 'app', ['*'], NOW);
    const checker = new InclusionChecker();
    const prs = [1, 2, 3, 4, 5].map(merged);
    const first = await checker.inclusions(
      client,
      'acme',
      'app',
      read.deployments,
      prs,
      () => new Set(),
    );
    expect(calls.filter((call) => call.includes('/compare/'))).toHaveLength(COMPARES_PER_CYCLE);
    expect(first).toHaveLength(10);
    expect(first.find((fact) => fact.pr.number === 2)?.included).toBe(false);

    calls.length = 0;
    const second = await checker.inclusions(
      client,
      'acme',
      'app',
      read.deployments,
      prs,
      () => new Set(),
    );
    expect(calls.filter((call) => call.includes('/compare/'))).toHaveLength(5);
    expect(second).toHaveLength(15);
  });

  it('skips environments a PR already reached and deployments before its merge', async () => {
    const listed = [deployment(1, 'dev', 5), deployment(2, 'acc', 200)];
    const { client, calls } = fakeClient(listed, {});
    const read = await new DeploymentReader().read(client, 'acme', 'app', ['*'], NOW);
    const facts = await new InclusionChecker().inclusions(
      client,
      'acme',
      'app',
      read.deployments,
      [merged(1)],
      () => new Set(['dev']),
    );
    expect(facts).toEqual([]);
    expect(calls.filter((call) => call.includes('/compare/'))).toHaveLength(0);
  });
});

describe('the deployment poller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads every two minutes, and every eight while all windows are hidden', async () => {
    vi.useFakeTimers();
    expect(DELIVERY_MS).toBe(2 * 60_000);
    const poll = vi.fn().mockResolvedValue(undefined);
    const manager = new PollingManager(poll, DELIVERY_MS);
    manager.startDeferred();
    await vi.advanceTimersByTimeAsync(DELIVERY_MS);
    expect(poll).toHaveBeenCalledTimes(1);
    manager.setHidden(true);
    await vi.advanceTimersByTimeAsync(DELIVERY_MS * 3);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DELIVERY_MS);
    expect(poll).toHaveBeenCalledTimes(2);
    manager.stop();
  });
});
