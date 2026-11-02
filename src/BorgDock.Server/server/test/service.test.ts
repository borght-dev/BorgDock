import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { Notifier } from '../src/push/notifier.ts';
import { DispatchService, PLAN_FIRST } from '../src/service.ts';
import { item, thread } from './fixtures.ts';

function service() {
  const dataDir = mkdtempSync(join(tmpdir(), 'dispatch-service-'));
  const config = loadConfig({ DISPATCH_DATA_DIR: dataDir, DISPATCH_ORIGIN: 'https://dispatch.test' });
  const db = openDb(dataDir);
  const s = new DispatchService(config, db, new Notifier(config, db)) as any;
  const sent: any[] = [];
  s.t3.dispatch = async (command: any) => { sent.push(command); return { sequence: 1 }; };
  s.source.hosts[0].source.status.ok = true;
  s.source.hosts[0].source.projects = new Map([['p-m5', { id: 'p-m5', title: 'M5' }]]);
  s.items = [item({ id: 50001 })];
  s.afterWrite = () => {};
  s.modelChoices = () => ({
    models: [{ id: 'codex/gpt-6.1-sol', label: 'GPT-6.1-Sol', provider: 'Codex', recent: true, efforts: [{ id: 'high', label: 'High' }], defaultEffort: 'high' }],
    defaultModel: 'codex/gpt-6.1-sol',
    catalogue: { selection: () => ({ instanceId: 'codex', model: 'gpt-6.1-sol', options: [] }) },
  });
  return { s: s as DispatchService, sent };
}

const start = { itemId: 50001, worktree: 'M5', model: 'codex/gpt-6.1-sol', effort: 'high', prompt: 'Pick up AB#50001', moveAdoTo: null, assignToMe: false };

test('"plan first" runs the thread in normal mode and asks for a plan in the first message', async () => {
  const { s, sent } = service();
  await s.startThread({ ...start, mode: 'plan' });
  const [command] = sent;
  assert.equal(command.interactionMode, 'default');
  assert.equal(command.bootstrap.createThread.interactionMode, 'default', "T3's plan mode would stick to every later message");
  assert.equal(command.message.text, `Pick up AB#50001\n\n${PLAN_FIRST}`);
});

test('"straight to work" sends the message as written', async () => {
  const { s, sent } = service();
  await s.startThread({ ...start, mode: 'default' });
  assert.equal(sent[0].message.text, 'Pick up AB#50001');
  assert.equal(sent[0].interactionMode, 'default');
});

test('"update for QA" sends the QA prompt as written, in normal mode, without moving ADO', async () => {
  const { s, sent } = service();
  await s.startThread({ ...start, mode: 'qa', prompt: 'Bring AB#50001 up to date for QA' });
  assert.equal(sent[0].message.text, 'Bring AB#50001 up to date for QA');
  assert.equal(sent[0].interactionMode, 'default');
});

test('start options: QA prompt names the branch and PR, and suggests the free worktree the item last ran in', async () => {
  const { s } = service();
  (s as any).overview = {
    items: [{
      item: item({ id: 50001, title: 'Horizon | Fix the product grid' }),
      threads: [{ worktree: 'M5', branch: 'fix/50001-product-grid', status: 'settled' }],
      pullRequest: { number: 4600, branch: 'fix/50001-product-grid', state: 'open' },
    }],
    worktrees: [{ name: 'M5', state: 'free' }],
  };
  const options = await s.startOptions(50001);
  assert.equal(options.branch, 'fix/50001-product-grid');
  assert.equal(options.qaWorktree, 'M5');
  assert.match(options.prompts.qa, /switch to it first \(PR 4600\)/);
  assert.match(options.prompts.qa, /ado-update-for-qa/);
  assert.match(options.prompts.qa, /\/ado-fix/);
  assert.match(options.prompts.pickup, /branch feat\/50001-fix-product-grid/);
});

test("ADO's required-field refusal points at Update for QA", async () => {
  const { s } = service();
  const { AdoError } = await import('../src/ado/client.ts');
  (s as any).ado.moveState = async () => { throw new AdoError(400, 'TF401320: Rule Error for field Resolution. Error code: Required, InvalidEmpty.'); };
  await assert.rejects(s.moveState(50001, 'Ready For QA'), /Resolution.*Update for QA/);
});

test("start options ignore a thread branch that belongs to other work", async () => {
  const { s } = service();
  (s as any).overview = {
    items: [{ item: item({ id: 59657 }), threads: [{ worktree: 'M0', branch: 'fix/search-index-ci', status: 'settled' }], pullRequest: null }],
    worktrees: [{ name: 'M0', state: 'busy' }],
  };
  const options = await s.startOptions(59657);
  assert.equal(options.branch, null);
  assert.match(options.prompts.qa, /gh pr list --state all --search "AB#59657"/);
  assert.equal(options.qaWorktree, null, 'a busy worktree is not suggested');
});

test('"close as done" asks for the reason in the notes and stops when QA is still needed', async () => {
  const { s, sent } = service();
  (s as any).overview = {
    items: [{ item: item({ id: 50001 }), threads: [], pullRequest: { number: 4700, branch: 'fix/50001-x', state: 'merged' } }],
    worktrees: [],
  };
  const options = await s.startOptions(50001);
  assert.match(options.prompts.done, /Close AB#50001 as Done without QA/);
  assert.match(options.prompts.done, /PR is 4700 \(merged\) on `fix\/50001-x`/);
  assert.match(options.prompts.done, /why QA isn't needed/);
  assert.match(options.prompts.done, /stop and tell me instead of closing it/);
  await s.startThread({ ...start, mode: 'done', prompt: options.prompts.done });
  assert.equal(sent[0].interactionMode, 'default');
  assert.equal(sent[0].message.text, options.prompts.done);
});

test('launch, answer, settle and links use the selected remote host, with raw T3 IDs', async () => {
  const { s, sent } = service();
  const fleet = (s as any).source;
  const { T3Client } = await import('../src/t3/client.ts');
  const { T3Source } = await import('../src/t3/source.ts');
  const remoteSent: any[] = [];
  const config = { ...(s as any).config.t3, environmentId: 'windows', label: 'Windows', webBase: 'https://windows/windows' };
  const client = new T3Client({ ...config, dataDir: (s as any).config.dataDir });
  client.dispatch = async (command: any) => { remoteSent.push(command); return { sequence: 1 }; };
  const source = new T3Source({ client, db: (s as any).db, stateDb: '' });
  source.status.ok = true;
  source.projects.set('p1', { id: 'p1', title: 'W4' });
  source.threads.set('t1', { id: 't1', projectId: 'p1', questionRequestId: 'q1', questions: [{ id: 'q', question: 'Where?', options: [], recommended: null, allowCustomAnswer: true, multiSelect: false }] } as any);
  fleet.hosts.push({ config, client, source, prefix: 'windows:', providers: [], modelsAt: 0 });
  const response = await s.startThread({ ...start, worktree: 'windows:p1', mode: 'default' });
  assert.equal(sent.length, 0);
  assert.equal(remoteSent[0].bootstrap.createThread.projectId, 'p1');
  assert.equal(response.appLink, `t3code://threads/windows/${remoteSent[0].threadId}`);
  assert.equal(response.threadId, `windows:${remoteSent[0].threadId}`);
  await s.answer('windows:t1', 'q1', { q: 'Vera' });
  await s.settle('windows:t1');
  assert.deepEqual(remoteSent.slice(1).map((c) => c.threadId), ['t1', 't1']);
  source.status.ok = false;
  await assert.rejects(s.settle('windows:t1'), /Windows is offline/);
  await assert.rejects(s.startThread({ ...start, worktree: 'W4', mode: 'default' }), /Windows is offline/);
  assert.equal(remoteSent.length, 3);
  s.stop();
});

test('every project counts for an item; only the worktree rack keeps to M/V/W', () => {
  const { s } = service();
  const internal = s as any;
  const source = internal.source.hosts[0].source;
  source.projects = new Map(['M5', 'V2', 'W4', 'Dispatch'].map((title) => [title, { id: title, title }]));
  source.threads = new Map(['M5', 'V2', 'W4', 'Dispatch'].map((name) => [name, thread({ id: name, projectId: name, worktree: name, firstUserMessage: 'Pick up AB#50001' })]));
  internal.recompute();
  assert.deepEqual(s.overview!.worktrees.map((w) => w.name), ['M5', 'V2', 'W4']);
  assert.deepEqual(s.overview!.items[0].threads.map((t) => t.id).sort(), ['Dispatch', 'M5', 'V2', 'W4']);
});
