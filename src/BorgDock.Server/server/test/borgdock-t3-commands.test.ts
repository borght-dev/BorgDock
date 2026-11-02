import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LaunchRequest } from '../../shared/src/api.ts';
import type { T3Transport } from '../src/t3/client.ts';
import { executeCommand, GO_AHEAD_MESSAGE, isRelayableRead, parseCommand, PLAN_FIRST } from '../src/t3/commands.ts';

const SHELL = {
  snapshotSequence: 1,
  projects: [{ id: 'p1', title: 'Shop', workspaceRoot: '/src/shop' }],
  threads: [
    { id: 't-running', projectId: 'p1', title: 'Busy', branch: 'fix/1', worktreePath: '/src/shop/.t3/one', interactionMode: 'default', runtimeMode: 'full-access', activityRunStatus: 'running', createdAt: '2026-10-01', updatedAt: '2026-10-02', archivedAt: null, settledAt: null },
    { id: 't-plan', projectId: 'p1', title: 'Planned', branch: null, worktreePath: null, interactionMode: 'plan', runtimeMode: 'approval-required', createdAt: '2026-10-01', updatedAt: '2026-10-03', archivedAt: null, settledAt: null, hasActionableProposedPlan: true },
  ],
};
const CONFIG = {
  providers: [{
    instanceId: 'codex', driver: 'codex', enabled: true, installed: true, status: 'ready',
    models: [{ slug: 'gpt-6', name: 'GPT-6', capabilities: { optionDescriptors: [{ id: 'reasoningEffort', type: 'select', options: [{ id: 'low' }, { id: 'high', isDefault: true }] }] } }],
  }],
};

function fakeT3() {
  const rpcs: { tag: string; payload: any }[] = [];
  const t3: T3Transport = {
    get: async (path) => {
      assert.equal(path, '/api/orchestration/shell');
      return SHELL as any;
    },
    rpc: async (tag, payload) => {
      rpcs.push({ tag, payload });
      if (tag === 'server.getConfig') return CONFIG as any;
      if (tag === 'vcs.listRefs') return { refs: [{ name: 'origin/main', isDefault: true, isRemote: true }, { name: 'main', isDefault: true }, { name: 'feature' }] } as any;
      return {} as any;
    },
    dispatch: async () => ({ sequence: 0 }),
    close: () => {},
  };
  return { t3, rpcs };
}

const launch = (overrides: Partial<LaunchRequest> = {}): LaunchRequest => ({
  machineId: 'mac', projectId: 'p1', workspace: { kind: 'worktree', baseBranch: null }, model: 'codex/gpt-6', effort: 'low', planFirst: false,
  message: 'Fix the basket', title: 'AB#1 Basket', itemId: 1, moveAdoTo: null, prKey: null, ciGroupId: null, ...overrides,
});

test('a launch in a fresh worktree starts from the default branch, by its local name, in default mode', async () => {
  const { t3, rpcs } = fakeT3();
  const { threadId } = await executeCommand(t3, { kind: 'launch', request: launch({ planFirst: true }) });
  assert.deepEqual(rpcs.find((r) => r.tag === 'vcs.listRefs')!.payload, { cwd: '/src/shop', refKind: 'all', limit: 100 });
  const sent = rpcs.find((r) => r.tag === 'orchestration.launchThread')!.payload;
  assert.equal(sent.threadId, threadId);
  assert.equal(sent.projectId, 'p1');
  assert.deepEqual(sent.workspaceStrategy, { type: 'worktree', baseRef: 'main', startFromOrigin: true });
  assert.equal(sent.interactionMode, 'default');
  assert.equal(sent.runtimeMode, 'approval-required', 'the runtime mode of the thread touched last');
  assert.deepEqual(sent.modelSelection, { instanceId: 'codex', model: 'gpt-6', options: [{ id: 'reasoningEffort', value: 'low' }] });
  assert.equal(sent.initialMessage.text, `Fix the basket\n\n${PLAN_FIRST}`);
  assert.deepEqual(sent.initialMessage.attachments, []);
  assert.equal(sent.title, 'AB#1 Basket');
});

test('a picked base branch is used as is', async () => {
  const { t3, rpcs } = fakeT3();
  await executeCommand(t3, { kind: 'launch', request: launch({ workspace: { kind: 'worktree', baseBranch: 'feature' } }) });
  assert.equal(rpcs.some((r) => r.tag === 'vcs.listRefs'), false);
  assert.equal(rpcs.find((r) => r.tag === 'orchestration.launchThread')!.payload.workspaceStrategy.baseRef, 'feature');
});

test('beside a thread binds its checkout; beside a root thread runs in the root', async () => {
  const { t3, rpcs } = fakeT3();
  await executeCommand(t3, { kind: 'launch', request: launch({ workspace: { kind: 'thread', threadId: 't-running', mode: 'beside' } }) });
  await executeCommand(t3, { kind: 'launch', request: launch({ workspace: { kind: 'thread', threadId: 't-plan', mode: 'beside' } }) });
  const [first, second] = rpcs.filter((r) => r.tag === 'orchestration.launchThread').map((r) => r.payload.workspaceStrategy);
  assert.deepEqual(first, { type: 'existing_worktree', worktreePath: '/src/shop/.t3/one', branch: 'fix/1' });
  assert.deepEqual(second, { type: 'root' });
});

test('continuing sends a message and keeps the thread; a running thread refuses', async () => {
  const { t3, rpcs } = fakeT3();
  const { threadId } = await executeCommand(t3, { kind: 'launch', request: launch({ workspace: { kind: 'thread', threadId: 't-plan', mode: 'continue' } }) });
  assert.equal(threadId, 't-plan');
  const sent = rpcs.find((r) => r.tag === 'orchestration.dispatchCommand')!.payload;
  assert.equal(sent.type, 'message.dispatch');
  assert.equal(sent.threadId, 't-plan');
  assert.deepEqual(sent.dispatchMode, { type: 'start_immediately' });
  assert.equal(sent.deliveryIntent, 'auto');
  assert.equal(rpcs.some((r) => r.tag === 'orchestration.launchThread'), false);
  await assert.rejects(executeCommand(t3, { kind: 'launch', request: launch({ workspace: { kind: 'thread', threadId: 't-running', mode: 'continue' } }) }), /still at work/);
});

test('approving a plan leaves plan mode first, then sends the go-ahead', async () => {
  const { t3, rpcs } = fakeT3();
  await executeCommand(t3, { kind: 'approve-plan', threadId: 't-plan' });
  const sent = rpcs.filter((r) => r.tag === 'orchestration.dispatchCommand').map((r) => r.payload);
  assert.deepEqual(sent[0], { type: 'thread.interaction-mode.set', threadId: 't-plan', interactionMode: 'default' });
  assert.equal(sent[1].type, 'message.dispatch');
  assert.equal(sent[1].text, GO_AHEAD_MESSAGE);
  const { t3: other, rpcs: otherRpcs } = fakeT3();
  await executeCommand(other, { kind: 'approve-plan', threadId: 't-running' });
  assert.equal(otherRpcs.filter((r) => r.tag === 'orchestration.dispatchCommand').length, 1, 'a default-mode thread only gets the message');
});

test('answers and settles use the protocol 2 command types', async () => {
  const { t3, rpcs } = fakeT3();
  await executeCommand(t3, { kind: 'answer', threadId: 't-plan', requestId: 'r1', answers: { q: 'yes' } });
  await executeCommand(t3, { kind: 'settle', threadId: 't-plan' });
  assert.deepEqual(rpcs.map((r) => r.payload), [
    { type: 'runtime-request.respond', threadId: 't-plan', requestId: 'r1', answers: { q: 'yes' } },
    { type: 'thread.settle', threadId: 't-plan' },
  ]);
});

test('a command is read from the signed request, for its own machine only', () => {
  const remote = { id: 'win', prefix: 'win:' };
  const body = JSON.stringify(launch({ machineId: 'win', projectId: 'win:p1', workspace: { kind: 'thread', threadId: 'win:t:with:colons', mode: 'beside' } }));
  const parsed = parseCommand('POST', '/api/agents/launch', body, remote);
  assert.equal(parsed.kind, 'launch');
  assert.equal((parsed as any).request.projectId, 'p1');
  assert.equal((parsed as any).request.workspace.threadId, 't:with:colons');
  assert.throws(() => parseCommand('POST', '/api/agents/launch', JSON.stringify(launch({ machineId: 'mac' })), remote), /another machine/);
  assert.throws(() => parseCommand('POST', '/api/threads/mac%3At1/messages', '{"text":"hi"}', remote), /another machine/);
  assert.deepEqual(parseCommand('POST', `/api/threads/${encodeURIComponent('win:t1')}/messages`, '{"text":"hi"}', remote), { kind: 'message', threadId: 't1', text: 'hi' });
  assert.deepEqual(parseCommand('POST', '/api/threads/t1/settle', '', { id: 'mac', prefix: '' }), { kind: 'settle', threadId: 't1' });
  assert.throws(() => parseCommand('POST', '/api/prs/o/r/1/merge', '{}', remote), /Not an agent command/);
});

test('a connector relays only reads without a signature', () => {
  assert.equal(isRelayableRead({ kind: 'get', path: '/api/orchestration/shell' }), true);
  assert.equal(isRelayableRead({ kind: 'get', path: `/api/orchestration/threads/${encodeURIComponent('a:b')}/bounded` }), true);
  assert.equal(isRelayableRead({ kind: 'get', path: '/api/orchestration/threads/a/../../auth' }), false);
  assert.equal(isRelayableRead({ kind: 'rpc', tag: 'server.getConfig' }), true);
  assert.equal(isRelayableRead({ kind: 'rpc', tag: 'orchestration.dispatchCommand' }), false);
  assert.equal(isRelayableRead({ kind: 'rpc', tag: 'orchestration.launchThread' }), false);
});
