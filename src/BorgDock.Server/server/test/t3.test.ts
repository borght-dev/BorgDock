import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { T3Client } from '../src/t3/client.ts';
import { T3Source, parseQuestions, statusOf, type ShellThread } from '../src/t3/source.ts';
import { openDb } from '../src/db.ts';

const at = new Date().toISOString();
const thread = (values: Record<string, unknown> = {}) => ({
  id: 't1', projectId: 'p1', title: 'AB#50001', branch: null,
  createdAt: at, updatedAt: at, archivedAt: null, settledAt: null,
  status: 'running', latestRunRequestedAt: at, pendingRuntimeRequest: null,
  modelSelection: { instanceId: 'codex', model: 'gpt-6.1-sol' }, ...values,
}) as ShellThread;

test('Nightly shell and bounded detail load through the real authenticated client', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dispatch-t3-'));
  const stateDb = join(dataDir, 'statev2.sqlite');
  const t3db = new DatabaseSync(stateDb);
  t3db.exec('CREATE TABLE orchestration_v2_projection_messages (thread_id TEXT, role TEXT, created_at TEXT, payload_json TEXT)');
  t3db.prepare('INSERT INTO orchestration_v2_projection_messages VALUES (?, ?, ?, ?)').run('t1', 'user', at, JSON.stringify({ text: 'Pick up AB#50001' }));
  t3db.close();
  writeFileSync(join(dataDir, 't3-session.json'), JSON.stringify({ token: 'test-only', expiresAt: '2099-01-01' }));
  const paths: string[] = [];
  const server = createServer((req, res) => {
    if (req.headers['x-t3-orchestration-protocol'] !== '2') { res.writeHead(400).end(); return; }
    assert.equal(req.headers.authorization, 'Bearer test-only');
    paths.push(req.url!);
    res.setHeader('Content-Type', 'application/json');
    const shell = { schemaVersion: 2, snapshotSequence: 1, projects: [{ id: 'p1', title: 'M5' }], threads: [thread({ status: 'waiting', pendingRuntimeRequest: { id: 'q1', kind: 'user_input' } })] };
    const projection = {
      messages: [{ role: 'assistant', text: 'Which environment?', createdAt: at }],
      runtimeRequests: [{ id: 'q1', kind: 'user_input', status: 'pending' }],
      turnItems: [{ type: 'user_input_request', requestId: 'q1', questions: [{ id: 'env', question: 'Where?', options: [{ label: 'Dev (Recommended)', value: 'dev' }] }] }],
    };
    res.end(JSON.stringify(req.url === '/api/orchestration/shell' ? shell : { snapshotSequence: 1, projection }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const db = openDb(dataDir);
  const client = new T3Client({ baseUrl: `http://127.0.0.1:${address.port}`, app: '/unused', dataDir });
  const source = new T3Source({ client, db, stateDb });
  const signals: boolean[] = [];
  source.on('change', () => signals.push(source.status.ok));
  try {
    await source.poll();
    assert.equal(source.status.ok, true, source.status.error ?? 'T3 unreachable');
    const loaded = source.threads.get('t1')!;
    assert.equal(loaded.status, 'question');
    assert.equal(loaded.questionRequestId, 'q1');
    assert.equal(loaded.lastAgentMessage, 'Which environment?');
    assert.equal(loaded.firstUserMessage, 'Pick up AB#50001');
    assert.equal(signals[0], true);
    assert.equal(loaded.questions[0].options[0].value, 'dev');
    assert.ok(paths.includes('/api/orchestration/threads/t1/bounded'));
  } finally { db.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Nightly statuses preserve work and requests after migration', () => {
  for (const status of ['preparing', 'queued', 'starting', 'running']) assert.equal(statusOf(thread({ status })), 'running', status);
  assert.equal(statusOf(thread({ status: 'failed' })), 'failed');
  assert.equal(statusOf(thread({ status: 'waiting', pendingRuntimeRequest: { kind: 'user_input' } })), 'question');
  assert.equal(statusOf(thread({ pendingRuntimeRequest: { kind: 'command' } })), 'approval');
  assert.equal(statusOf(thread({ status: 'completed', activityRunStatus: 'running', hasActionableProposedPlan: true })), 'running');
  assert.equal(statusOf(thread({ status: 'completed', hasActionableProposedPlan: true })), 'plan');
  assert.equal(statusOf(thread({ status: 'completed', pendingBackgroundTasks: [{ taskId: 'bg1', kind: 'command' }] })), 'running');
});

test('Nightly launches and answers use v2 RPC commands', async () => {
  const { commandRpc } = await import('../src/t3/client.ts');
  const launch = commandRpc({
    type: 'thread.turn.start', threadId: 't1',
    message: { messageId: 'm1', text: 'Pick up AB#50001', attachments: [] },
    modelSelection: { instanceId: 'codex', model: 'gpt-6.1-sol' },
    runtimeMode: 'full-access', interactionMode: 'default',
    bootstrap: { createThread: { projectId: 'p1', title: 'AB#50001' } },
  });
  assert.equal(launch.tag, 'orchestration.launchThread');
  assert.deepEqual(launch.payload.workspaceStrategy, { type: 'root' });
  assert.equal(launch.payload.threadId, 't1');
  assert.deepEqual(launch.payload.initialMessage, { messageId: 'm1', text: 'Pick up AB#50001', attachments: [] });
  const answer = commandRpc({ type: 'thread.user-input.respond', threadId: 't1', requestId: 'q1', answers: { env: 'dev' }, createdAt: at });
  assert.deepEqual(answer, { tag: 'orchestration.dispatchCommand', payload: { type: 'runtime-request.respond', threadId: 't1', requestId: 'q1', answers: { env: 'dev' } } });
});

test('M, V and W are the only default worktree projects', async () => {
  const { loadConfig } = await import('../src/config.ts');
  const config = loadConfig({ DISPATCH_DATA_DIR: mkdtempSync(join(tmpdir(), 'dispatch-config-')) });
  for (const name of ['M0', 'V5', 'W10']) assert.ok(config.worktreePattern.test(name), name);
  for (const name of ['Shop', 'Mac - Tauri', 'No project', 'M0-extra']) assert.equal(config.worktreePattern.test(name), false, name);
});

test('two hosts with identical IDs stay separate; remote first messages survive restart and offline', async () => {
  const { loadConfig } = await import('../src/config.ts');
  const { T3Fleet } = await import('../src/t3/fleet.ts');
  const dataDir = mkdtempSync(join(tmpdir(), 'dispatch-fleet-'));
  // Both hosts need a session file; without one a host asks the installed T3 app to issue a session.
  for (const file of ['t3-session.json', 't3-session-windows.json']) {
    writeFileSync(join(dataDir, file), JSON.stringify({ token: 'test-only', expiresAt: '2099-01-01' }));
  }
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const host = req.url!.startsWith('/windows') ? 'windows' : 'mac';
    res.end(JSON.stringify(req.url!.endsWith('/shell')
      ? { schemaVersion: 2, snapshotSequence: 1, projects: [{ id: 'p1', title: host === 'mac' ? 'M0' : 'W0' }], threads: [thread({ title: 'An investigation', status: 'completed' })] }
      : { projection: { messages: [{ role: 'user', text: host === 'mac' ? 'AB#50001' : 'AB#53748' }], runtimeRequests: [], turnItems: [] } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const config = loadConfig({ DISPATCH_DATA_DIR: dataDir });
  config.t3 = { ...config.t3, environmentId: 'mac', baseUrl: `${baseUrl}/mac`, stateDb: '' };
  config.t3Environments = [{ ...config.t3, environmentId: 'windows', label: 'Windows', baseUrl: `${baseUrl}/windows` }];
  const db = openDb(dataDir);
  const fleet = new T3Fleet(config, db);
  for (const h of fleet.hosts) h.client.rpc = async () => ({ environment: { environmentId: h.config.environmentId }, providers: [] }) as any;
  try {
    await fleet.poll();
    assert.deepEqual([...fleet.threads.keys()], ['t1', 'windows:t1']);
    assert.equal(fleet.threads.get('windows:t1')!.firstUserMessage, 'AB#53748');
    assert.equal(fleet.threads.get('t1')!.firstUserMessage, 'AB#50001');
    assert.equal(fleet.hostFor('windows:t1'), fleet.hosts[1]);
    assert.equal(fleet.rawId('windows:t1'), 't1');
    const onlineGet = fleet.hosts[1].client.get.bind(fleet.hosts[1].client);
    fleet.hosts[1].client.get = async () => { throw new Error('Offline'); };
    await fleet.poll(true);
    assert.equal(fleet.threads.get('windows:t1')!.available, false);
    assert.equal(fleet.projects.get('windows:p1')!.available, false);
    assert.equal(fleet.threads.get('t1')!.available, true);
    const restored = new T3Fleet(config, db);
    assert.equal(restored.threads.get('windows:t1')!.firstUserMessage, 'AB#53748');
    assert.equal(restored.environments[1].ok, false);
    assert.ok(restored.environments[1].at);
    restored.stop();
    fleet.hosts[1].client.get = onlineGet;
    await fleet.poll(true);
    assert.equal(fleet.threads.get('windows:t1')!.available, true);
    assert.equal(fleet.threads.get('windows:t1')!.firstUserMessage, 'AB#53748');
  } finally { fleet.stop(); db.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("a question's option keeps the agent's reason for the notification card", () => {
  const [question] = parseQuestions({
    questions: [{ id: 'q', question: 'Where should the basket live?', options: [
      { label: 'IndexedDB (Recommended)', value: 'idb', description: 'Works in the WebView, no plugin.' },
      { label: 'SQLite plugin', value: 'sqlite' },
    ] }],
  });
  assert.deepEqual(question.options, [
    { label: 'IndexedDB', value: 'idb', description: 'Works in the WebView, no plugin.' },
    { label: 'SQLite plugin', value: 'sqlite' },
  ]);
  assert.equal(question.recommended, 0);
});
