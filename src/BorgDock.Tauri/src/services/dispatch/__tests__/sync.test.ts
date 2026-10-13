import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { T3Snapshot, T3Thread, T3ThreadDetail } from '@/services/t3/api';
import type { PullRequestWithChecks } from '@/types';

const api = vi.hoisted(() => ({
  t3Snapshot: vi.fn(),
  t3ThreadDetail: vi.fn(),
  t3ConversationReferences: vi.fn(),
}));

vi.mock('@/services/t3/api', () => ({
  LOCAL_T3_HOST_ID: 'local',
  t3Snapshot: api.t3Snapshot,
  t3ThreadDetail: api.t3ThreadDetail,
  t3ConversationReferences: api.t3ConversationReferences,
}));

vi.mock('@/components/work-items/work-item-toggles', () => ({
  toggleTrackedWorkItem: vi.fn(),
}));

const memory = vi.hoisted(() => ({ rememberHost: vi.fn(), forgetHostsExcept: vi.fn() }));
vi.mock('../host-memory', () => memory);

import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { T3HostSettings } from '@/types/settings';
import { LOCAL_HOST } from '../hosts';
import {
  compileSlotPattern,
  followHostList,
  resetHostSync,
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

function followInSettings(t3Hosts: T3HostSettings[]) {
  const { settings } = useSettingsStore.getState();
  const agents = { ...settings.agents, t3Hosts } as typeof settings.agents;
  useSettingsStore.setState({ settings: { ...settings, agents } });
}

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
  it('links an item mentioned later in the conversation and rescans after an edit', async () => {
    resetHostSync();
    followInSettings([]);
    useDispatchStore.setState({ threads: [], projects: [], hosts: [], items: [], overview: null });
    api.t3Snapshot.mockResolvedValue(
      snapshot([t3Thread({ status: 'running', updatedAt: '2026-10-10T10:00:00Z' })]),
    );
    api.t3ConversationReferences.mockResolvedValueOnce({
      t1: { explicitIds: [], mentionedIds: [58138] },
    });
    await syncHost(LOCAL_HOST);
    expect(useDispatchStore.getState().threads[0]?.conversationReferences?.mentionedIds).toEqual([
      58138,
    ]);

    api.t3Snapshot.mockResolvedValue(
      snapshot([t3Thread({ status: 'running', updatedAt: '2026-10-10T11:00:00Z' })], 2),
    );
    api.t3ConversationReferences.mockResolvedValueOnce({
      t1: { explicitIds: [59458], mentionedIds: [] },
    });
    await syncHost(LOCAL_HOST);
    expect(api.t3ConversationReferences).toHaveBeenCalledTimes(2);
    expect(useDispatchStore.getState().threads[0]?.conversationReferences).toEqual({
      explicitIds: [59458],
      mentionedIds: [],
    });
  });

  it('retries references missing from a partial remote response', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread({ status: 'running' })]));
    api.t3ConversationReferences
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ t1: { explicitIds: [59458], mentionedIds: [] } });
    await syncHost(MAC);
    await syncHost(MAC);
    expect(api.t3ConversationReferences).toHaveBeenCalledTimes(2);
    expect(useDispatchStore.getState().threads[0]?.conversationReferences?.explicitIds).toEqual([
      59458,
    ]);
  });
  beforeEach(() => {
    resetHostSync();
    api.t3Snapshot.mockReset();
    api.t3ThreadDetail.mockReset();
    api.t3ConversationReferences.mockReset();
    memory.rememberHost.mockReset();
    memory.forgetHostsExcept.mockReset();
    followInSettings([]);
    useDispatchStore.setState({ threads: [], projects: [], hosts: [], items: [], overview: null });
  });

  it('stores the threads with their conversation references and the question they ask', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread()]));
    api.t3ConversationReferences.mockResolvedValue({
      t1: { explicitIds: [60214], mentionedIds: [] },
    });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(LOCAL_HOST);

    const { threads, projects, hosts } = useDispatchStore.getState();
    expect(projects).toMatchObject([{ id: 'p1', title: 'W1', hostLabel: 'This machine' }]);
    expect(threads).toMatchObject([
      {
        id: 't1',
        slot: 'W1',
        conversationReferences: { explicitIds: [60214], mentionedIds: [] },
        questionRequestId: 'req',
        lastAgentMessage: 'Row id or pixel offset?',
      },
    ]);
    expect(hosts).toMatchObject([{ id: 'local', ok: true, error: null }]);
  });

  it('asks for a conversation references and a detail only once while nothing changes', async () => {
    api.t3Snapshot
      .mockResolvedValueOnce(snapshot([t3Thread()]))
      .mockResolvedValue({ changed: false, sequence: 1, projects: [], threads: [] });
    api.t3ConversationReferences.mockResolvedValue({ t1: { explicitIds: [], mentionedIds: [] } });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(LOCAL_HOST);
    await syncHost(LOCAL_HOST);

    expect(api.t3Snapshot).toHaveBeenLastCalledWith({ id: 'local', baseUrl: undefined }, 1);
    expect(api.t3ConversationReferences).toHaveBeenCalledTimes(1);
    expect(api.t3ThreadDetail).toHaveBeenCalledTimes(1);
  });

  it('does not read the detail of a thread that is working', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread({ status: 'running' })]));
    api.t3ConversationReferences.mockResolvedValue({ t1: { explicitIds: [], mentionedIds: [] } });

    await syncHost(LOCAL_HOST);

    expect(api.t3ThreadDetail).not.toHaveBeenCalled();
  });

  it('talks to a remote host with raw ids and stores prefixed ones', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread()]));
    api.t3ConversationReferences.mockResolvedValue({
      t1: { explicitIds: [60214], mentionedIds: [] },
    });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(MAC);

    expect(api.t3ConversationReferences).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: 'http://mac:3773' },
      ['t1'],
    );
    expect(api.t3ThreadDetail).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: 'http://mac:3773' },
      't1',
    );
    expect(useDispatchStore.getState().threads[0]).toMatchObject({
      id: 'mac:t1',
      conversationReferences: { explicitIds: [60214], mentionedIds: [] },
    });
  });

  it('asks a host for the conversation referencess of its open threads before the settled ones', async () => {
    api.t3Snapshot.mockResolvedValue(
      snapshot([
        t3Thread({ id: 'old', status: 'settled', lastActivityAt: '2026-10-11T09:00:00Z' }),
        t3Thread({ id: 'idle', status: 'running', lastActivityAt: '2026-10-09T09:00:00Z' }),
        t3Thread({ id: 'busy', status: 'running', lastActivityAt: '2026-10-10T09:00:00Z' }),
      ]),
    );
    api.t3ConversationReferences.mockResolvedValue({});

    await syncHost(MAC);

    expect(api.t3ConversationReferences).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: 'http://mac:3773' },
      ['busy', 'idle', 'old'],
    );
  });

  it('remembers what a remote host holds, and not what this machine holds', async () => {
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread({ status: 'running' })]));
    api.t3ConversationReferences.mockResolvedValue({ t1: { explicitIds: [], mentionedIds: [] } });

    await syncHost(LOCAL_HOST);
    expect(memory.rememberHost).not.toHaveBeenCalled();

    await syncHost(MAC);
    expect(memory.rememberHost).toHaveBeenCalledWith('mac');
  });

  it('keeps the last known threads of a host that stopped answering, marked unavailable', async () => {
    api.t3Snapshot.mockResolvedValueOnce(snapshot([t3Thread({ status: 'running' })]));
    api.t3ConversationReferences.mockResolvedValue({ t1: { explicitIds: [], mentionedIds: [] } });
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
    api.t3ConversationReferences.mockResolvedValue({ t1: { explicitIds: [], mentionedIds: [] } });
    api.t3ThreadDetail.mockResolvedValue(DETAIL);

    await syncHost(LOCAL_HOST);
    await syncHost(LOCAL_HOST, true);

    expect(api.t3Snapshot).toHaveBeenLastCalledWith({ id: 'local', baseUrl: undefined }, null);
    expect(api.t3ThreadDetail).toHaveBeenCalledTimes(2);
    expect(api.t3ConversationReferences).toHaveBeenCalledTimes(2);
  });
});

describe('followHostList', () => {
  beforeEach(() => {
    resetHostSync();
    api.t3Snapshot.mockReset();
    api.t3ThreadDetail.mockReset();
    api.t3ConversationReferences.mockReset();
    memory.forgetHostsExcept.mockReset();
    api.t3Snapshot.mockResolvedValue(snapshot([t3Thread({ status: 'running' })]));
    api.t3ConversationReferences.mockResolvedValue({ t1: { explicitIds: [], mentionedIds: [] } });
    useDispatchStore.setState({ threads: [], projects: [], hosts: [], items: [], overview: null });
  });

  it('drops a host that was removed, with its threads and what was remembered of it', async () => {
    followInSettings([MAC]);
    await syncHost(MAC);
    expect(useDispatchStore.getState().threads.map((thread) => thread.id)).toEqual(['mac:t1']);

    followInSettings([]);
    followHostList();

    const { threads, projects, hosts } = useDispatchStore.getState();
    expect(threads).toEqual([]);
    expect(projects).toEqual([]);
    expect(hosts).toEqual([]);
    expect(memory.forgetHostsExcept).toHaveBeenCalledWith(['local']);
  });

  it('ignores the answer of a host that was removed while it was being read', async () => {
    let answer: (value: T3Snapshot) => void = () => {};
    api.t3Snapshot.mockReturnValueOnce(new Promise<T3Snapshot>((resolve) => (answer = resolve)));
    followInSettings([MAC]);
    const reading = syncHost(MAC);

    followInSettings([]);
    followHostList();
    answer(snapshot([t3Thread()]));
    await reading;

    expect(useDispatchStore.getState().threads.some((thread) => thread.hostId === 'mac')).toBe(
      false,
    );
  });

  it('reads a host from the start once it moved to another address', async () => {
    followInSettings([MAC]);
    await syncHost(MAC);
    expect(api.t3Snapshot).toHaveBeenLastCalledWith(
      { id: 'mac', baseUrl: 'http://mac:3773' },
      null,
    );

    followInSettings([{ ...MAC, baseUrl: 'http://mac.tailnet:3773' }]);
    followHostList();

    await vi.waitFor(() =>
      expect(api.t3Snapshot).toHaveBeenCalledWith(
        { id: 'mac', baseUrl: 'http://mac.tailnet:3773' },
        null,
      ),
    );
  });
});
