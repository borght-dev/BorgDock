import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Focus, Overview, PrSummary } from '../../shared/src/api.ts';
import { ActivityJournal } from '../src/borgdock/activity.ts';
import { focusDrafts, overviewDrafts } from '../src/borgdock/activity-derive.ts';
import { PresenceBoard, Preferences } from '../src/borgdock/preferences.ts';
import { openDb } from '../src/db.ts';
import { Sessions } from '../src/auth/sessions.ts';
import { BorgDockPusher, pushCategory, type PushSender } from '../src/push/borgdock.ts';
import { agentState, LiveActivities } from '../src/push/live-activities.ts';

const db = () => openDb(mkdtempSync(join(tmpdir(), 'bd-activity-')));
/** A signed-in phone's session; Live Activity pushes only go to active ones. */
const phoneSession = (database: ReturnType<typeof db>) => new Sessions(database).create({ kind: 'app', name: 'iPhone', passkeyId: null, via: 'local' }).session.id;
// The journal's clock: the first observation at T0, later ones past the warm-up.
const T0 = '2026-10-20T07:00:00.000Z';
const later = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

const thread = (overrides: Record<string, unknown> = {}) => ({
  id: 't1', title: 'AB#50001 Basket', worktree: 'Shop', branch: null, status: 'running', createdAt: '2026-10-20T08:00:00Z', lastActivityAt: '2026-10-20T09:00:00Z',
  model: 'gpt-6', questionRequestId: null, questions: [], lastAgentMessage: null, link: '', appLink: '', ...overrides,
});

function overview(threads: ReturnType<typeof thread>[], state = 'Development In Progress', extra: Record<string, unknown> = {}): Overview {
  return {
    generatedAt: '2026-10-20T10:00:00Z',
    items: [{ item: { id: 50001, title: 'Basket', state } as any, bay: 'working', waitingFor: null, suggestion: null, pullRequest: null, threads: threads as any, queuedAt: null, ...extra }],
    unlinkedThreads: [], worktrees: [], sources: {} as Overview['sources'],
  };
}

test('the first observation seeds; later ones add each new fact once', () => {
  const journal = new ActivityJournal(db());
  const seed = journal.commit('dispatch', overviewDrafts(overview([thread({ status: 'your-turn' })]), new Set(), 'now'), T0);
  assert.equal(seed.entries.length, 0, 'what is already true adds nothing');
  assert.equal(journal.page({}).entries.length, 0);

  const asks = overview([thread({ status: 'question', questionRequestId: 'r1', questions: [{ id: 'q', question: 'Which row?', options: [{ label: 'A', value: 'a' }], recommended: 0, allowCustomAnswer: true, multiSelect: false }] })]);
  const first = journal.commit('dispatch', overviewDrafts(asks, new Set(), 'now'), later(5));
  assert.deepEqual(first.entries.map((e) => [e.category, e.title, e.detail]), [['agent', '50001: the agent asks', 'Which row?']]);
  assert.equal(first.entries[0].push?.kind, 'question');
  assert.equal(journal.commit('dispatch', overviewDrafts(asks, new Set(), 'now'), later(6)).entries.length, 0, 'the same observation twice adds nothing');

  const moved = journal.commit('dispatch', overviewDrafts(overview([thread({ status: 'question', questionRequestId: 'r1' })], 'Code Review'), new Set(), 'now'), later(7));
  assert.deepEqual(moved.entries.map((e) => e.title), ['50001 is now Code Review']);
  const page = journal.page({});
  assert.equal(page.unread, 2);
  assert.equal(page.unreadByCategory.agent, 1);
});

test('threads outside items only count when BorgDock launched them', () => {
  const o = overview([]);
  o.unlinkedThreads = [{ ...thread({ id: 'run', status: 'your-turn', title: 'Dispatch: Sync all' }), guessItemId: null }, { ...thread({ id: 'desk', status: 'your-turn' }), guessItemId: null }] as any;
  const ids = overviewDrafts(o, new Set(['run']), 'now').filter((d) => d.category === 'agent').map((d) => d.target);
  assert.deepEqual(ids, [{ kind: 'thread', id: 'run', itemId: null }]);
});

test('GitHub Focus: review requests, verdicts and red checks on yours, merges; leaving the list says nothing', () => {
  const pr = (overrides: Partial<PrSummary>): PrSummary => ({
    key: 'acme/shop#9', owner: 'acme', repo: 'shop', number: 9, title: 'Basket', url: 'https://github.com/acme/shop/pull/9', state: 'open', bucket: 'wait', isMine: true,
    headSha: 'abc', updatedAt: '2026-10-20T08:00:00Z', mergedAt: null, reviewDecision: null, checks: { total: 2, passed: 2, failed: 0, pending: 0, skipped: 0, segments: [] },
    reason: { text: 'Waiting on review', tone: 'mute', icon: 'clock' }, ...overrides,
  } as PrSummary);
  const focus = (prs: PrSummary[]) => ({ pullRequests: prs } as Focus);
  const journal = new ActivityJournal(db());
  journal.commit('github', focusDrafts(focus([pr({})])), T0);
  const next = journal.commit('github', focusDrafts(focus([
    pr({ checks: { total: 2, passed: 1, failed: 1, pending: 0, skipped: 0, segments: [] } }),
    pr({ key: 'acme/shop#10', number: 10, isMine: false, bucket: 'you', reason: { text: 'Sanne asked for your review', tone: 'bad', icon: 'review' } }),
  ])), later(5));
  assert.deepEqual(next.entries.map((e) => [e.category, e.title]), [['ci', 'shop#9: 1 check failed'], ['review', 'shop#10: Sanne asked for your review']]);
  assert.equal(journal.commit('github', focusDrafts(focus([])), later(6)).entries.length, 0);
});

test('a source reporting in pieces at startup only seeds, and history is never news', () => {
  const journal = new ActivityJournal(db());
  const draft = (id: string, at: string) => ({ id, category: 'agent' as const, title: id, detail: '', tone: 'mute' as const, target: { kind: 'none' as const }, at });
  journal.commit('dispatch', [draft('ado-fact', later(-60))], T0);
  // T3 hosts answer a little later: still warming up, so their facts only seed.
  assert.equal(journal.commit('dispatch', [draft('host-fact', later(1))], later(1)).entries.length, 0);
  // After the warm-up a new fact counts, but one that happened before BorgDock first looked (a host back online
  // with a thread that finished yesterday) does not.
  const after = journal.commit('dispatch', [draft('host-fact', later(1)), draft('fresh', later(9)), draft('yesterday', later(-24 * 60))], later(10));
  assert.deepEqual(after.entries.map((e) => e.id), ['fresh']);
});

function sender() {
  const pushes: { token: string; push: any }[] = [];
  const s: PushSender = { push: async (token, _env, push) => { pushes.push({ token, push }); return 'sent'; } };
  return { s, pushes };
}

test('push categories follow what the entry offers', () => {
  const question = { kind: 'question' as const, itemId: 1, threadId: 't', requestId: 'r', questionId: 'q', options: [], recommended: 0, allowCustomAnswer: true };
  assert.equal(pushCategory('agent', question), 'BORGDOCK_QUESTION');
  assert.equal(pushCategory('agent', { ...question, allowCustomAnswer: false }), 'BORGDOCK_QUESTION_RECOMMENDED');
  assert.equal(pushCategory('agent', { ...question, recommended: null }), 'BORGDOCK_QUESTION_TEXT');
  assert.equal(pushCategory('workitem', { kind: 'suggestion', itemId: 1, to: 'Code Review' }), 'BORGDOCK_SUGGESTION');
  const activity = { kind: 'activity' as const, entryId: 'x', category: 'review' as const, target: { kind: 'none' as const } };
  assert.equal(pushCategory('review', activity), 'BORGDOCK_PR');
  assert.equal(pushCategory('ci', activity), 'BORGDOCK_CI');
  assert.equal(pushCategory('merge', activity), 'BORGDOCK_DEFAULT');
});

test('pushes follow category preferences, stay quiet at the desk and turn bursts into one summary', async () => {
  const database = db();
  database.prepare(`INSERT INTO push_apns (device_token, session_id, environment, created_at) VALUES ('aa', 's', 'production', 'now')`).run();
  const preferences = new Preferences(database);
  const presence = new PresenceBoard();
  const { s, pushes } = sender();
  const pusher = new BorgDockPusher({ db: database, sender: () => s, preferences, presence });
  const entry = (id: string, category: any) => ({ id, category, title: id, detail: '', at: 'now', tone: 'bad' as const, read: false, target: { kind: 'none' as const }, push: null });

  const result = await pusher.deliver({ entries: [entry('ci-1', 'ci'), entry('merged-1', 'merge')], burst: false });
  assert.deepEqual(result.alerts, ['ci-1'], 'merges are summarised by default');
  assert.equal(pushes[0].push.payload.aps.category, 'BORGDOCK_CI');
  assert.equal(pushes[0].push.payload.dispatch.kind, 'activity');

  preferences.set({ categories: { ci: 'off' } as any });
  assert.deepEqual((await pusher.deliver({ entries: [entry('ci-2', 'ci')], burst: false })).alerts, []);

  presence.report({ device: 'desk', idleSeconds: 10 });
  assert.deepEqual((await pusher.deliver({ entries: [entry('review-1', 'review')], burst: false })).alerts, [], 'quiet at the desk');

  const quietPresence = new PresenceBoard();
  const burstPusher = new BorgDockPusher({ db: database, sender: () => s, preferences, presence: quietPresence });
  pushes.length = 0;
  const burst = await burstPusher.deliver({ entries: ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id, 'review')), burst: true });
  assert.deepEqual(burst.alerts, []);
  assert.equal(pushes.filter((p) => p.push.pushType === 'alert').length, 1);
  assert.equal(pushes[0].push.payload.aps.alert.title, '5 updates in BorgDock');

  pushes.length = 0;
  await burstPusher.read(['a', 'b']);
  assert.deepEqual(pushes[0].push, { pushType: 'background', payload: { aps: { 'content-available': 1 }, dispatch: { kind: 'read', ids: ['a', 'b'] } } });
  pusher.stop();
  burstPusher.stop();
});

test('Live Activities: updates when the run moves on, ends when it is done, push-to-start for launched threads', async () => {
  const database = db();
  const { s, pushes } = sender();
  const live = new LiveActivities(database, () => s, () => 'sandbox');
  const session = phoneSession(database);
  live.register(session, { kind: 'agent', threadId: 't1', pushToken: 'ab'.repeat(32) });
  live.registerStartToken(session, 'cd'.repeat(32));
  live.launched('t2', session);
  const threads = (status1: any, status2: any) => new Map([
    ['t1', { id: 't1', title: 'Basket', place: 'fix/1', machine: 'mac-mini', itemId: 1, status: status1, createdAt: '2026-10-20T08:00:00Z' }],
    ['t2', { id: 't2', title: 'Sync', place: 'Shop', machine: 'mac-mini', itemId: null, status: status2, createdAt: '2026-10-20T08:00:00Z' }],
  ]);
  assert.equal(await live.threadsChanged(threads('running', 'running')), 2);
  assert.equal(pushes[0].push.pushType, 'liveactivity');
  assert.equal(pushes[0].push.payload.aps.event, 'update');
  assert.deepEqual(pushes[0].push.payload.aps['content-state'], agentState({ status: 'running', createdAt: '2026-10-20T08:00:00Z' } as any));
  assert.equal(pushes[1].push.payload.aps.event, 'start');
  assert.equal(pushes[1].push.payload.aps['attributes-type'], 'AgentActivityAttributes');
  // The app's AgentActivityAttributes decodes exactly these keys; a missing one drops the push-to-start.
  assert.deepEqual(Object.keys(pushes[1].push.payload.aps.attributes).sort(), ['itemId', 'machine', 'threadId', 'title']);
  assert.equal(await live.threadsChanged(threads('running', 'running')), 0, 'nothing moved, nothing sent; a start happens once');
  assert.equal(await live.threadsChanged(threads('your-turn', 'running')), 1);
  assert.equal(pushes.at(-1)!.push.payload.aps.event, 'end');
  assert.equal(await live.threadsChanged(threads('running', 'running')), 0, 'an ended activity is forgotten');
});

test('Live Activities: no push-to-start for a launched thread whose activity the phone already started', async () => {
  const database = db();
  const { s, pushes } = sender();
  const live = new LiveActivities(database, () => s, () => 'sandbox');
  const session = phoneSession(database);
  live.registerStartToken(session, 'cd'.repeat(32));
  live.launched('t3', session);
  // The phone started the activity right after launching and registered its update token.
  live.register(session, { kind: 'agent', threadId: 't3', pushToken: 'ef'.repeat(32) });
  const running = new Map([['t3', { id: 't3', title: 'Fix', place: 'fix/3', machine: 'mac-mini', itemId: 3, status: 'running' as const, createdAt: '2026-10-20T08:00:00Z' }]]);
  assert.equal(await live.threadsChanged(running), 1);
  assert.deepEqual(pushes.map((p) => p.push.payload.aps.event), ['update']);
});

test('a signed-out device gets no more Live Activity pushes', async () => {
  const database = db();
  const { s, pushes } = sender();
  const live = new LiveActivities(database, () => s, () => 'sandbox');
  const session = phoneSession(database);
  live.register(session, { kind: 'agent', threadId: 't4', pushToken: 'ab'.repeat(32) });
  live.registerStartToken(session, 'cd'.repeat(32));
  live.launched('t5', session);
  new Sessions(database).revoke(session);
  const running = (id: string) => [id, { id, title: 'Fix', place: 'fix/4', machine: 'mac-mini', itemId: 4, status: 'running' as const, createdAt: '2026-10-20T08:00:00Z' }] as const;
  assert.equal(await live.threadsChanged(new Map([running('t4'), running('t5')])), 0);
  assert.equal(pushes.length, 0);
});

test('reading targets elsewhere marks their earlier lines read, and reads since a time list what was read', () => {
  const journal = new ActivityJournal(db());
  const line = (id: string, target: any, at: string) => ({ id, category: 'review' as const, title: id, detail: '', tone: 'bad' as const, target, at });
  journal.commit('github', [], T0);
  journal.commit('github', [
    line('pr-old', { kind: 'pr', key: 'Acme/Shop#12' }, later(5)),
    line('pr-new', { kind: 'pr', key: 'acme/shop#12' }, later(20)),
    line('item', { kind: 'item', id: 50001 }, later(5)),
    line('thread', { kind: 'thread', id: 'win-env:t1', itemId: 50001 }, later(5)),
    line('ci', { kind: 'ci', groupId: 'g1' }, later(5)),
    line('other-pr', { kind: 'pr', key: 'acme/shop#13' }, later(5)),
  ], later(30));
  assert.equal(journal.unread(), 6);

  const result = journal.markTargetsRead([{ kind: 'pr', key: 'ACME/shop#12' }, { kind: 'item', id: 50001 }, { kind: 'ci', groupId: 'g1' }, { kind: 'none' }, 'junk'], later(10));
  assert.deepEqual(result.ids.sort(), ['ci', 'item', 'pr-old'], 'by kind and id, the pull request key in any case, only lines from before `before`');
  assert.equal(result.unread, 3);
  assert.deepEqual(journal.markTargetsRead([{ kind: 'pr', key: 'acme/shop#12' }], later(10)).ids, [], 'twice changes nothing');
  assert.deepEqual(journal.markTargetsRead([{ kind: 'thread', id: 'win-env:t1', itemId: null }], later(10)).ids, ['thread'], "a thread by its id, whatever its item");

  const until = new Date(Date.now() + 1000).toISOString();
  const reads = journal.readsSince(new Date(Date.now() - 60_000).toISOString(), until);
  assert.equal(reads.until, until);
  assert.deepEqual(reads.targets.map((t) => t.kind).sort(), ['ci', 'item', 'pr', 'thread'], 'one per target');
  assert.deepEqual(journal.readsSince(until).targets, [], 'nothing read since the last call');
  journal.markRead({ ids: ['other-pr'] });
  assert.deepEqual(journal.readsSince(new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 1000).toISOString()).targets.map((t) => (t as any).key ?? t.kind).sort(),
    ['Acme/Shop#12', 'acme/shop#13', 'ci', 'item', 'thread'], 'reads from /activity/read count too');
});
