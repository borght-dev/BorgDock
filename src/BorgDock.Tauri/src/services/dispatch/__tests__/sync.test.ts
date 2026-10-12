import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { T3Snapshot, T3Thread, T3ThreadDetail } from '@/services/t3/api';
import type { PullRequestWithChecks } from '@/types';

const api = vi.hoisted(() => ({
  t3Snapshot: vi.fn(),
  t3ThreadDetail: vi.fn(),
  t3FirstUserMessages: vi.fn(),
}));

vi.mock('@/services/t3/api', () => ({
  LOCAL_T3_HOST_ID: 'local',
  t3Snapshot: api.t3Snapshot,
  t3ThreadDetail: api.t3ThreadDetail,
  t3FirstUserMessages: api.t3FirstUserMessages,
}));

vi.mock('@/components/work-items/work-item-toggles', () => ({
  toggleTrackedWorkItem: vi.fn(),
}));

import { useDispatchStore } from '@/stores/dispatch-store';
import {
  compileSlotPattern,
  LOCAL_HOST,
  rawId,
  resetHostSync,
  scopedId,
  syncHost,
  toAgentThread,
  toKnownPullRequest,
} from '../sync';
import { makeThread } from './fixtures';

function t3Thread(overrides: Partial<T3Thread> = {}): T3Thread {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'AB#60214 Order list',
    branch: 'fix/60214-order-list',
    worktreePath: null,
    createdAt: '2026-10-10T08:00:00Z',
    lastActivityAt: '2026-10-10T09:00:00Z',
    status: 'question',
    interactionMode: 'default',
    runtimeMode: 'full-access',
    model: 'default',
    modelInstance: 'codex',
    effort: 'high',
    pullRequests: [],
    ...overrides,
  };
}

function snapshot(threads: T3Thread[], sequence = 1): T3Snapshot {
  return {
    changed: true,
    sequence,
    projects: [{ id: 'p1', title: 'W1', workspaceRoot: 'D:/work/one' }],
    threads,
  };
}

const DETAIL: T3ThreadDetail = {
  lastAgentMessage: 'Row id or pixel offset?',
  questionRequestId: 'req',
  questions: [
    {
      id: 'q',
      question: 'Row id or pixel offset?',
      options: [{ label: 'Row id', value: 'Row id (Recommended)' }],
      recommended: 0,
      allowCustomAnswer: true,
      multiSelect: false,
    },
  ],
};

const MAC = { id: 'mac', label: 'Mac', baseUrl: 'http://mac:3773' };

describe('ids', () => {
  it('leaves local ids alone and prefixes remote ones', () => {
    expect(scopedId('local', 't1')).toBe('t1');
    expect(scopedId('mac', 't1')).toBe('mac:t1');
    expect(rawId('mac', 'mac:t1')).toBe('t1');
    expect(rawId('local', 'mac:t1')).toBe('mac:t1');
  });
});

describe('toAgentThread', () => {
  it('keeps the questions of a thread that still asks', () => {
    const previous = makeThread({
      id: 't1',
      questionRequestId: 'req',
      questions: DETAIL.questions,
    });
    const thread = toAgentThread(LOCAL_HOST, t3Thread(), 'W1', previous);
    expect(thread.questionRequestId).toBe('req');
    expect(thread.slot).toBe('W1');
    expect(thread.open).toBe(true);
  });

  it('drops the questions and the last message once the agent works again', () => {
    const previous = makeThread({
      id: 't1',
      questionRequestId: 'req',
      questions: DETAIL.questions,
      lastAgentMessage: 'Row id or pixel offset?',
      firstUserMessage: 'Pick up AB#60214',
    });
    const thread = toAgentThread(LOCAL_HOST, t3Thread({ status: 'running' }), 'W1', previous);
    expect(thread.questions).toEqual([]);
    expect(thread.questionRequestId).toBeNull();
    expect(thread.lastAgentMessage).toBeNull();
    expect(thread.firstUserMessage).toBe('Pick up AB#60214');
  });

  it('marks a settled thread as closed', () => {
    expect(toAgentThread(MAC, t3Thread({ status: 'settled' }), 'M1', undefined)).toMatchObject({
      id: 'mac:t1',
      projectId: 'mac:p1',
      hostLabel: 'Mac',
      open: false,
    });
  });
});

describe('toKnownPullRequest', () => {
  it('reads the state, the checks and the work items a pull request names', () => {
    const pr = {
      pullRequest: {
        number: 3712,
        title: 'fix: scroll position (AB#60214)',
        body: '',
        headRef: 'fix/60214-order-list',
        htmlUrl: 'https://github.com/acme/shop/pull/3712',
        state: 'closed',
        mergedAt: '2026-10-11T00:00:00Z',
        isDraft: false,
        labels: [],
      },
      failedCheckNames: ['lint'],
      pendingCheckNames: [],
      passedCount: 23,
      totalCheckCount: 24,
    } as unknown as PullRequestWithChecks;
    expect(toKnownPullRequest(pr)).toMatchObject({
      number: 3712,
      state: 'merged',
      workItemIds: [60214],
      checks: { passed: 23, failed: 1, pending: 0, total: 24 },
    });
  });
});

describe('compileSlotPattern', () => {
  it('takes every project when the pattern is empty or does not compile', () => {
    expect(compileSlotPattern(undefined)).toBeNull();
    expect(compileSlotPattern('  ')).toBeNull();
    expect(compileSlotPattern('([')).toBeNull();
  });

  it('compiles a pattern', () => {
    expect(compileSlotPattern('^[MVW]\\d+$')?.test('W3')).toBe(true);
  });
});

describe('syncHost', () => {
  beforeEach(() => {
    resetHostSync();
    api.t3Snapshot.mockReset();
    api.t3ThreadDetail.mockReset();
    api.t3FirstUserMessages.mockReset();
    useDispatchStore.setState({ threads: [], projects: [], hosts: [], items: [], overview: null });
  });

  it('stores the threads with their first message and the question they ask', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread()]));
    api.t3FirstUserMessages.mockResolvedValue({ t1: 'Pick up AB#60214' });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(LOCAL_HOST);

    const { threads, projects, hosts } = useDispatchStore.getState();
    expect(projects).toMatchObject([{ id: 'p1', title: 'W1', hostLabel: 'This machine' }]);
    expect(threads).toMatchObject([
      {
        id: 't1',
        slot: 'W1',
        firstUserMessage: 'Pick up AB#60214',
        questionRequestId: 'req',
        lastAgentMessage: 'Row id or pixel offset?',
      },
    ]);
    expect(hosts).toMatchObject([{ id: 'local', ok: true, error: null }]);
  });

  it('asks for a first message and a detail only once while nothing changes', async () => {
    api.t3Snapshot
      .mockResolvedValueOnce(snapshot([t3Thread()]))
      .mockResolvedValue({ changed: false, sequence: 1, projects: [], threads: [] });
    api.t3FirstUserMessages.mockResolvedValue({ t1: '' });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(LOCAL_HOST);
    await syncHost(LOCAL_HOST);

    expect(api.t3Snapshot).toHaveBeenLastCalledWith({ id: 'local', baseUrl: undefined }, 1);
    expect(api.t3FirstUserMessages).toHaveBeenCalledTimes(1);
    expect(api.t3ThreadDetail).toHaveBeenCalledTimes(1);
  });

  it('does not read the detail of a thread that is working', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread({ status: 'running' })]));
    api.t3FirstUserMessages.mockResolvedValue({ t1: '' });

    await syncHost(LOCAL_HOST);

    expect(api.t3ThreadDetail).not.toHaveBeenCalled();
  });

  it('talks to a remote host with raw ids and stores prefixed ones', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread()]));
    api.t3FirstUserMessages.mockResolvedValue({ t1: 'hello' });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(MAC);

    expect(api.t3FirstUserMessages).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: 'http://mac:3773' },
      ['t1'],
    );
    expect(api.t3ThreadDetail).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: 'http://mac:3773' },
      't1',
    );
    expect(useDispatchStore.getState().threads[0]).toMatchObject({
      id: 'mac:t1',
      firstUserMessage: 'hello',
    });
  });

  it('keeps the last known threads of a host that stopped answering, marked unavailable', async () => {
    api.t3Snapshot.mockResolvedValueOnce(snapshot([t3Thread({ status: 'running' })]));
    api.t3FirstUserMessages.mockResolvedValue({ t1: '' });
    await syncHost(LOCAL_HOST);

    api.t3Snapshot.mockRejectedValueOnce(new Error('T3 is not reachable'));
    await syncHost(LOCAL_HOST);

    const { threads, hosts } = useDispatchStore.getState();
    expect(threads).toMatchObject([{ id: 't1', available: false }]);
    expect(hosts[0]).toMatchObject({ ok: false, error: 'T3 is not reachable' });
    expect(hosts[0]?.at).not.toBeNull();
  });

  it('reads everything again when forced', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread()]));
    api.t3FirstUserMessages.mockResolvedValue({ t1: '' });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(LOCAL_HOST);
    await syncHost(LOCAL_HOST, true);

    expect(api.t3Snapshot).toHaveBeenLastCalledWith({ id: 'local', baseUrl: undefined }, null);
    expect(api.t3ThreadDetail).toHaveBeenCalledTimes(2);
  });
});
