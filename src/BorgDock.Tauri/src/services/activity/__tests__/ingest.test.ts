import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeJournal } from './fake-journal';

const journal = vi.hoisted(() => ({ current: null as unknown as FakeJournal }));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    openSource: (request: Parameters<FakeJournal['openSource']>[0]) =>
      journal.current.openSource(request),
    commit: (request: Parameters<FakeJournal['commit']>[0]) => journal.current.commit(request),
    listSources: () => Promise.resolve([]),
    retireSource: () => Promise.resolve(true),
  };
});

import type { DispatchHost } from '@/services/dispatch/hosts';
import type { AgentThread } from '@/services/dispatch/types';
import { useActivityStore } from '@/stores/activity-store';
import { ingestT3Host, t3HostFailed } from '../adapters/t3';
import { deriveT3, type T3Observation, type T3ThreadFacts } from '../derive/t3';
import { ingest, ingestIdle, resetActivityIngest, retryFailedCommits } from '../ingest';

const LOCAL: DispatchHost = { id: 'local', label: 'This laptop' } as DispatchHost;
const MINI: DispatchHost = {
  id: 'mini',
  label: 'Mac mini',
  baseUrl: 'http://mini:3773',
} as DispatchHost;

function facts(ordinal: number, overrides: Partial<T3ThreadFacts> = {}): T3ThreadFacts {
  return {
    rawId: 'a',
    title: 'Fix login',
    slot: 'W3',
    createdAt: '2026-10-01T09:00:00.000Z',
    runId: `run:thread:a:ordinal:${ordinal}`,
    runCompletedAt: '2026-10-27T09:00:00.000Z',
    runStatus: 'completed',
    stopRequested: false,
    lastError: null,
    lastErrorClass: null,
    pendingRequest: null,
    hasPlan: false,
    limitRecovery: null,
    lastVisitedAt: null,
    subagent: false,
    itemIds: [],
    prUrls: [],
    detail: null,
    ...overrides,
  };
}

const observation = (threads: T3ThreadFacts[]): T3Observation => ({
  hostId: 'local',
  hostLabel: 'This laptop',
  threads,
  complete: true,
  seenInT3: true,
});

const source = (configKey = 'env-1') => ({
  sourceId: 't3:local',
  kind: 't3' as const,
  label: 'This laptop',
  configKey,
});

function agentThread(ordinal: number, overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'a',
    hostId: 'local',
    hostLabel: 'This laptop',
    available: true,
    projectId: 'p',
    slot: 'W3',
    title: 'Fix login',
    branch: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    lastActivityAt: '2026-10-27T09:00:00.000Z',
    open: true,
    status: 'your-turn',
    interactionMode: 'default',
    model: 'm',
    modelInstance: null,
    effort: null,
    pullRequests: [],
    firstUserMessage: '',
    questionRequestId: null,
    questions: [],
    lastAgentMessage: 'Done: login fixed',
    run: {
      id: `run:thread:a:ordinal:${ordinal}`,
      completedAt: '2026-10-27T09:00:00.000Z',
      status: 'completed',
      stopRequested: false,
      lastError: null,
      lastErrorClass: null,
      pendingRequest: null,
      hasPlan: false,
      limitRecovery: null,
      lastVisitedAt: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  journal.current = new FakeJournal();
  resetActivityIngest();
  useActivityStore.setState({ commitErrors: {}, readOnly: false });
});

describe('ingest', () => {
  it('seeds quietly, then commits what changed', async () => {
    expect(await ingest(source(), { sequence: 10 }, deriveT3, observation([facts(3)]))).toBe(
      'committed',
    );
    expect(journal.current.commits[0]?.seed).toBe(true);
    expect(journal.current.entries.size).toBe(0);
    expect(await ingest(source(), { sequence: 11 }, deriveT3, observation([facts(4)]))).toBe(
      'committed',
    );
    expect(journal.current.categories()).toEqual(['agent.turn']);
    expect(journal.current.outbox).toEqual([
      { entryId: [...journal.current.entries.keys()][0], channel: 'popup' },
    ]);
  });

  it('does not write when nothing changed', async () => {
    await ingest(source(), { sequence: 10 }, deriveT3, observation([facts(3)]));
    expect(await ingest(source(), { sequence: 10 }, deriveT3, observation([facts(3)]))).toBe(
      'unchanged',
    );
    expect(journal.current.commits).toHaveLength(1);
  });

  it('catches up from the stored baseline after a restart', async () => {
    await ingest(source(), { sequence: 10 }, deriveT3, observation([facts(3)]));
    resetActivityIngest();
    await ingest(source(), { sequence: 20 }, deriveT3, observation([facts(4)]));
    const [entry] = journal.current.entries.values();
    expect(entry?.category).toBe('agent.turn');
    expect(entry?.coverage).toBe('catch-up');
  });

  it('seeds again quietly when the host is another T3 install', async () => {
    await ingest(source('env-1'), { sequence: 10 }, deriveT3, observation([facts(3)]));
    await ingest(source('env-2'), { sequence: 2 }, deriveT3, observation([facts(9)]));
    expect(journal.current.entries.size).toBe(0);
    expect(journal.current.sources.get('t3:local')?.generation).toBe(2);
  });

  it('seeds again when the sequence went back', async () => {
    await ingest(source(), { sequence: 500 }, deriveT3, observation([facts(3)]));
    await ingest(source(), { sequence: 7 }, deriveT3, observation([facts(9)]));
    expect(journal.current.entries.size).toBe(0);
    expect(journal.current.sources.get('t3:local')?.generation).toBe(2);
    await ingest(source(), { sequence: 8 }, deriveT3, observation([facts(10)]));
    expect(journal.current.categories()).toEqual(['agent.turn']);
  });

  it('gives a detail read in the same sequence a revision of its own', async () => {
    await ingest(source(), { sequence: 10 }, deriveT3, observation([facts(3)]));
    const asking = facts(4, {
      runStatus: 'waiting',
      pendingRequest: { id: 'r1', kind: 'user_input', createdAt: null },
    });
    await ingest(source(), { sequence: 11 }, deriveT3, observation([asking]));
    const detailed = {
      ...asking,
      detail: {
        questionRequestId: 'r1',
        lastAgentMessage: null,
        questions: [{ question: 'A or B?', options: [], recommended: null, multiSelect: false }],
      },
    };
    expect(await ingest(source(), { sequence: 11 }, deriveT3, observation([detailed]))).toBe(
      'committed',
    );
    expect(journal.current.commits.at(-1)?.revision).toBe(11_001);
    expect(journal.current.commits.at(-1)?.enrichments[0]?.summary).toBe('W3 asks: A or B?');
  });

  it('keeps the baseline after a failed commit, so nothing is lost or doubled', async () => {
    await ingest(source(), { sequence: 10 }, deriveT3, observation([facts(3)]));
    journal.current.failNext = true;
    expect(await ingest(source(), { sequence: 11 }, deriveT3, observation([facts(4)]))).toBe(
      'failed',
    );
    expect(useActivityStore.getState().commitErrors['t3:local']).toContain('disk full');
    await retryFailedCommits();
    expect(useActivityStore.getState().commitErrors['t3:local']).toBeUndefined();
    await ingest(source(), { sequence: 12 }, deriveT3, observation([facts(4)]));
    expect(journal.current.categories()).toEqual(['agent.turn']);
  });
});

describe('the T3 adapter', () => {
  it('waits for the install id before it ingests a host', async () => {
    ingestT3Host(LOCAL, null, 10, [agentThread(3)]);
    await ingestIdle('t3:local');
    expect(journal.current.commits).toHaveLength(0);
  });

  it('keeps an offline host from blocking a healthy one', async () => {
    ingestT3Host(LOCAL, 'env-local', 10, [agentThread(3)]);
    ingestT3Host(MINI, 'env-mini', 10, [{ ...agentThread(3), id: 'mini:a', hostId: 'mini' }]);
    await ingestIdle('t3:local');
    await ingestIdle('t3:mini');
    t3HostFailed(MINI);
    ingestT3Host(LOCAL, 'env-local', 11, [agentThread(4)]);
    await ingestIdle('t3:local');
    const [entry] = journal.current.entries.values();
    expect(entry?.entityKey).toBe('t3:local:thread:a');
    expect(entry?.detail).toBe('Done: login fixed');
  });
});
