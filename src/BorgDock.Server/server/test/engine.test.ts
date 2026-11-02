import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkThreads, referencedItemIds, guessItem } from '../src/engine/link.ts';
import { buildOverview, type EngineInput } from '../src/engine/overview.ts';
import { noticesFor } from '../src/engine/notifications.ts';
import { categoryFor } from '../src/push/notifier.ts';
import { statusOf, type ShellThread } from '../src/t3/source.ts';
import { item, thread, PROJECTS } from './fixtures.ts';

const NOW = new Date('2026-10-02T12:00:00Z');
const input = (overrides: Partial<EngineInput>): EngineInput => ({
  items: [],
  threads: [],
  projects: PROJECTS,
  queue: new Map(),
  dismissed: new Set(),
  manualLinks: new Map(),
  worktreePattern: /^M\d+$/,
  threadLink: (id) => ({ link: `http://t3/${id}`, appLink: `t3code://threads/env/${id}` }),
  sources: { ado: { ok: true, at: null, error: null }, t3: { ok: true, at: null, error: null } },
  now: NOW,
  ...overrides,
});
const overviewOf = (overrides: Partial<EngineInput>) => buildOverview(input(overrides)).overview;

test('finds item references in titles, messages, branches and PRs', () => {
  const mine = new Set([59541, 59463]);
  const ids = (t: Parameters<typeof thread>[0]) => [...referencedItemIds(thread(t), mine, new Map([[4466, [59567]]]))].sort();
  assert.deepEqual(ids({ id: 'a', title: 'AB#59463 renew the TLS certificate' }), [59463]);
  assert.deepEqual(ids({ id: 'b', branch: 'fix/AB58930-split-bundle' }), [58930]);
  assert.deepEqual(ids({ id: 'c', branch: 'feat/59458-gift-cards' }), [59458]);
  assert.deepEqual(ids({ id: 'd', firstUserMessage: 'Please pick up 59541 and 12345' }), [59541], 'a bare number only counts when it is my item');
  assert.deepEqual(ids({ id: 'e', pullRequests: [{ number: 4466, url: '', state: 'merged', title: 'x', headBranch: null, isDraft: false, checks: null }] }), [59567]);
});

test('overview threads that name many items link to none of them', () => {
  const items = [1, 2, 3, 4].map((n) => item({ id: 50000 + n }));
  const triage = thread({ id: 't', firstUserMessage: 'AB#50001 AB#50002 AB#50003 AB#50004' });
  const links = linkThreads(items, [triage], new Map());
  assert.ok([...links.threadsByItem.values()].every((l) => l.length === 0));
  assert.equal(links.unlinked.length, 0);
});

test('a manual link wins over the heuristics, and a manual unlink hides the thread', () => {
  const items = [item({ id: 50001 }), item({ id: 50002 })];
  const t = thread({ id: 't', title: 'AB#50001 work' });
  assert.deepEqual(linkThreads(items, [t], new Map([['t', 50002]])).threadsByItem.get(50002)!.map((x) => x.id), ['t']);
  const unlinked = linkThreads(items, [thread({ id: 'u', title: 'loose end' })], new Map([['u', null]]));
  assert.equal(unlinked.unlinked.length, 0);
});

test('guesses an item for an unlinked thread by shared title words', () => {
  const items = [item({ id: 59464, title: 'Show gift card balances in the account page' })];
  assert.equal(guessItem(thread({ id: 'x', title: 'gift card balances page' }), items), 59464);
  assert.equal(guessItem(thread({ id: 'y', title: 'Hue remote control' }), items), null);
});

test('suggests Ready For QA when a PR for the item is merged', () => {
  const o = overviewOf({
    items: [item({ id: 59567, state: 'Code Review' })],
    threads: [thread({ id: 't', status: 'settled', open: false, title: 'AB#59567', pullRequests: [{ number: 4466, url: '', state: 'merged', title: 'fix: refund rounding (AB#59567)', headBranch: null, isDraft: false, checks: null }] })],
  });
  assert.equal(o.items[0].bay, 'drift');
  assert.deepEqual(o.items[0].suggestion, { id: '59567:merged:4466', to: 'Ready For QA', reason: 'PR 4466 is merged. ADO still says Code Review.' });
});

test('a PR in the thread that does not name the item is not evidence', () => {
  const o = overviewOf({
    items: [item({ id: 59463, state: 'New' })],
    threads: [thread({ id: 't', status: 'settled', open: false, firstUserMessage: 'see 59463', pullRequests: [{ number: 4350, url: '', state: 'merged', title: 'renew the certificate', headBranch: 'feat/renewals', isDraft: false, checks: null }] })],
  });
  assert.equal(o.items[0].suggestion?.to, 'Development In Progress', 'started, not merged');
});

test('open PR suggests Code Review; stale and untouched in-progress items are flagged without a target', () => {
  const open = overviewOf({
    items: [item({ id: 50001, state: 'Development In Progress' })],
    threads: [thread({ id: 't', status: 'running', title: 'AB#50001', pullRequests: [{ number: 7, url: '', state: 'open', title: 'AB#50001', headBranch: null, isDraft: false, checks: 'passing' }] })],
  });
  assert.equal(open.items[0].suggestion?.to, 'Code Review');

  const stale = overviewOf({ items: [item({ id: 50002, state: 'Development In Progress' })], threads: [thread({ id: 't', open: false, status: 'settled', title: 'AB#50002', lastActivityAt: '2026-09-20T00:00:00Z' })] });
  assert.equal(stale.items[0].suggestion?.to, null);
  assert.match(stale.items[0].suggestion!.reason, /no agent activity since 2026-09-20/);

  const untouched = overviewOf({ items: [item({ id: 50003, state: 'Development In Progress' })] });
  assert.equal(untouched.items[0].suggestion?.id, '50003:untouched:Development In Progress');

  const onHold = overviewOf({ items: [item({ id: 50004, state: 'On Hold' })] });
  assert.equal(onHold.items[0].suggestion, null);
});

test('a dismissed suggestion stays hidden until the evidence changes', () => {
  const base = { items: [item({ id: 50001, state: 'New' })], threads: [thread({ id: 't', title: 'AB#50001', status: 'running' })] };
  assert.equal(overviewOf({ ...base, dismissed: new Set(['50001:started']) }).items[0].suggestion, null);
  assert.equal(overviewOf({ ...base, dismissed: new Set(['50001:merged:9']) }).items[0].suggestion?.id, '50001:started');
});

test('waiting beats drift; questions, plans and Needs Human all wait on you', () => {
  const o = overviewOf({
    items: [item({ id: 50001, state: 'New' }), item({ id: 50002, state: 'Needs Human', states: [{ name: 'Needs Human', category: 'InProgress' }] })],
    threads: [thread({ id: 't', title: 'AB#50001', status: 'question', worktree: 'M1' })],
  });
  assert.equal(o.items[0].bay, 'waiting');
  assert.equal(o.items[0].waitingFor, 'Agent asks in M1');
  assert.ok(o.items[0].suggestion, 'the suggestion is still attached');
  assert.equal(o.items[1].waitingFor, 'ADO says Needs Human');
});

test('queued items sit in Up next and leave the queue once an agent works on them', () => {
  const queued = buildOverview(input({ items: [item({ id: 50001 })], queue: new Map([[50001, '2026-10-01T00:00:00Z']]) }));
  assert.equal(queued.overview.items[0].bay, 'next');
  assert.deepEqual(queued.dequeue, []);
  const started = buildOverview(input({ items: [item({ id: 50001 })], queue: new Map([[50001, '2026-10-01T00:00:00Z']]), threads: [thread({ id: 't', title: 'AB#50001', status: 'running' })] }));
  assert.deepEqual(started.dequeue, [50001]);
  assert.equal(started.overview.items[0].bay, 'drift', 'started on a New item suggests In Progress');
});

test('worktrees are free, mine, or busy with someone else\'s work', () => {
  const o = overviewOf({
    items: [item({ id: 50001 })],
    threads: [
      thread({ id: 'a', projectId: 'p-m0', worktree: 'M0', title: 'AB#50001', status: 'question' }),
      thread({ id: 'b', projectId: 'p-m1', worktree: 'M1', title: 'AB#99999 not mine', status: 'running' }),
      thread({ id: 'c', projectId: 'p-m2', worktree: 'M2', title: 'AB#50001 old', status: 'settled', open: false }),
    ],
  });
  assert.deepEqual(o.worktrees.map((w) => [w.name, w.state, w.itemId, w.needsYou]), [['M0', 'mine', 50001, true], ['M1', 'busy', null, false], ['M2', 'free', null, false]]);
});

test('notices: answerable questions carry their options; suggestions carry the target', () => {
  const o = overviewOf({
    items: [item({ id: 50001 }), item({ id: 50002, state: 'Code Review' })],
    threads: [
      thread({
        id: 't', title: 'AB#50001', status: 'question', questionRequestId: 'req',
        questions: [{ id: 'q', question: 'Ship it?', options: [{ label: 'Yes', value: 'Yes (Recommended)' }, { label: 'No', value: 'No' }], recommended: 0, allowCustomAnswer: true, multiSelect: false }],
      }),
      thread({ id: 'u', title: 'AB#50002', status: 'settled', open: false, pullRequests: [{ number: 5, url: '', state: 'merged', title: 'AB#50002', headBranch: null, isDraft: false, checks: null }] }),
    ],
  });
  const notices = noticesFor(o);
  const question = notices.find((n) => n.data.kind === 'question')!;
  assert.equal(question.key, 'question:t:req');
  assert.deepEqual(question.data, {
    kind: 'question', itemId: 50001, threadId: 't', requestId: 'req', questionId: 'q', options: [{ label: 'Yes', value: 'Yes (Recommended)' }, { label: 'No', value: 'No' }],
    recommended: 0, allowCustomAnswer: true, question: 'Ship it?', context: 'AB#50001 · Item 50001',
  });
  const drift = notices.find((n) => n.data.kind === 'suggestion' && n.data.itemId === 50002)!;
  assert.deepEqual(drift.data, { kind: 'suggestion', itemId: 50002, to: 'Ready For QA' });
});

test('question notifications pick the category whose lock-screen actions fit', () => {
  const q = (recommended: number | null, allowCustomAnswer: boolean) =>
    categoryFor({ kind: 'question', itemId: 1, threadId: 't', requestId: 'r', questionId: 'q', options: [], recommended, allowCustomAnswer });
  assert.equal(q(0, true), 'DISPATCH_QUESTION');
  assert.equal(q(0, false), 'DISPATCH_QUESTION_RECOMMENDED');
  assert.equal(q(null, true), 'DISPATCH_QUESTION_TEXT');
  assert.equal(q(null, false), 'DISPATCH_DEFAULT');
  assert.equal(categoryFor({ kind: 'suggestion', itemId: 1, to: 'Done' }), 'DISPATCH_SUGGESTION');
});

test('threads carry both the T3 web link and the T3 iOS app link', () => {
  const o = overviewOf({ items: [item({ id: 50001 })], threads: [thread({ id: 'abc', title: 'AB#50001', status: 'running' })] });
  assert.equal(o.items[0].threads[0].link, 'http://t3/abc');
  assert.equal(o.items[0].threads[0].appLink, 't3code://threads/env/abc');
});

test('T3 status: only waiting for input, approval, or a stopped agent needs you', () => {
  const base: ShellThread = { id: 't', projectId: 'p', title: 'x', branch: null, createdAt: '', updatedAt: '', archivedAt: null, settledAt: null };
  const status = (extra: Partial<ShellThread>) => statusOf({ ...base, ...extra });
  const finished = { session: { status: 'ready' }, latestTurn: { state: 'completed' } };
  assert.equal(status({ ...finished, hasActionableProposedPlan: true, backgroundLiveness: 'working' }), 'running', 'implementing a plan in the background');
  assert.equal(status({ ...finished, backgroundLiveness: 'monitoring' }), 'running');
  assert.equal(status({ ...finished, hasActionableProposedPlan: true }), 'plan', 'plan ready and nothing running');
  assert.equal(status({ session: { status: 'running' }, hasActionableProposedPlan: true }), 'running');
  assert.equal(status({ ...finished, hasPendingUserInput: true, backgroundLiveness: 'working' }), 'question', 'a question always needs you');
  assert.equal(status({ ...finished, hasPendingApprovals: true }), 'approval');
  assert.equal(status({ session: { status: 'error' } }), 'failed');
  assert.equal(status(finished), 'your-turn');
  assert.equal(status({ ...finished, settledAt: '2026-10-01' }), 'settled');
});
