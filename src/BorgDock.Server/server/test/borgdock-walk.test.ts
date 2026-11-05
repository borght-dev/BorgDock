import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Overview, PrSummary } from '../../shared/src/api.ts';
import { buildOverview } from '../src/engine/overview.ts';
import { evidenceOf, latestMessage, newestNote, toItemComment, verdictOf, type ItemFacts, type WalkItem, type WalkPullRequest, type WalkThread } from '../src/borgdock/verdict.ts';
import { applyWalk, laneSummary } from '../src/borgdock/walk.ts';
import { item, thread } from './fixtures.ts';

const NOW = new Date('2026-10-20T12:00:00Z');
const FLOW = item({ id: 1 }).states;

const walkItem = (overrides: Partial<WalkItem> = {}): WalkItem => {
  const state = overrides.state ?? 'Development In Progress';
  return {
    id: 1, state, stateCategory: FLOW.find((s) => s.name === state)?.category ?? 'Proposed', states: FLOW, notes: null, lastComment: null,
    dueDate: null, priority: 2, linkedPullRequests: [], changedAt: '2026-10-19T09:00:00Z', ...overrides,
  };
};
const agent = (overrides: Partial<WalkThread> = {}): WalkThread => ({ open: true, status: 'running', place: 'fix/1-basket', lastActivityAt: '2026-10-20T10:00:00Z', lastAgentMessage: null, ...overrides });
const pr = (overrides: Partial<WalkPullRequest> = {}): WalkPullRequest => ({ number: 42, state: 'open', isDraft: false, checks: null, approved: false, mergedAt: null, shared: false, ...overrides });
const facts = (overrides: Partial<ItemFacts> = {}): ItemFacts => ({ item: walkItem(), threads: [], pullRequests: [], now: NOW, ...overrides });

test('an agent waiting on you wins over everything else', () => {
  assert.deepEqual(verdictOf(facts({ threads: [agent({ status: 'question' })], item: walkItem({ state: 'Needs Human' }) })), { label: 'Agent asks', tone: 'bad' });
  assert.deepEqual(verdictOf(facts({ threads: [agent({ status: 'plan' })] })), { label: 'Plan to review', tone: 'bad' });
});

test('Needs Human waits on you, counting days, unless you answered last', () => {
  const needsHuman = walkItem({ state: 'Needs Human', stateCategory: 'InProgress', changedAt: '2026-10-17T08:00:00Z' });
  assert.deepEqual(verdictOf(facts({ item: needsHuman })), { label: 'Waiting on you · 3 days', tone: 'bad' });
  assert.deepEqual(verdictOf(facts({ item: { ...needsHuman, changedAt: '2026-10-20T08:00:00Z' } })), { label: 'Waiting on you', tone: 'bad' });
  const answered = { ...needsHuman, lastComment: { author: 'Koen', at: '2026-10-19T08:00:00Z', text: 'Yes', byMe: true } };
  assert.deepEqual(verdictOf(facts({ item: answered })), { label: 'You answered', tone: 'mute' });
});

test('overdue, running, out of sync, in order', () => {
  assert.deepEqual(verdictOf(facts({ item: walkItem({ dueDate: '2026-10-18' }), threads: [agent()] })), { label: 'Overdue · 2 days', tone: 'bad' });
  assert.deepEqual(verdictOf(facts({ threads: [agent()], drift: { to: 'Code Review', reason: 'x', evidence: 'open:1' } })), { label: 'Agent on it', tone: 'run' });
  assert.deepEqual(verdictOf(facts({ drift: { to: 'Code Review', reason: 'x', evidence: 'open:1' } })), { label: 'Out of sync', tone: 'warn' });
});

test('review states read the open pull request; Plan Review is never Code Review', () => {
  const review = walkItem({ state: 'Code Review' });
  assert.deepEqual(verdictOf(facts({ item: review, pullRequests: [pr({ checks: { passed: 3, failed: 1, pending: 0, total: 4 } })] })), { label: 'CI red', tone: 'bad' });
  assert.deepEqual(verdictOf(facts({ item: review, pullRequests: [pr({ approved: true, checks: { passed: 4, failed: 0, pending: 0, total: 4 } })] })), { label: 'Ready to merge', tone: 'ok' });
  assert.deepEqual(verdictOf(facts({ item: review, pullRequests: [pr({ checks: { passed: 2, failed: 0, pending: 2, total: 4 } })] })), { label: 'Checks running', tone: 'run' });
  assert.deepEqual(verdictOf(facts({ item: review })), { label: 'No open PR', tone: 'warn' });
  assert.deepEqual(verdictOf(facts({ item: walkItem({ state: 'Ready For QA' }) })), { label: 'With QA', tone: 'mute' });
  assert.deepEqual(verdictOf(facts({ item: review, pullRequests: [pr({ shared: true })] })), { label: 'No open PR', tone: 'warn' }, 'a shared PR says nothing');
});

test('in progress: nobody on it, quiet, PR open', () => {
  assert.deepEqual(verdictOf(facts()), { label: 'Nobody on it', tone: 'warn' });
  const noted = walkItem({ notes: { text: 'Started', date: '2026-10-01' }, changedAt: '2026-10-01T00:00:00Z' });
  assert.deepEqual(verdictOf(facts({ item: noted })), { label: 'Quiet · 19 days', tone: 'warn' });
  assert.deepEqual(verdictOf(facts({ pullRequests: [pr()] })), { label: 'PR open', tone: 'warn' });
  assert.deepEqual(verdictOf(facts({ pullRequests: [pr({ isDraft: true })] })), { label: 'Draft PR', tone: 'mute' });
  assert.deepEqual(verdictOf(facts({ item: walkItem({ state: 'New', stateCategory: 'Proposed' }) })), { label: 'Not started', tone: 'mute' });
});

test('evidence chips name the pull request, the agent, the due date and P1', () => {
  const evidence = evidenceOf(facts({
    item: walkItem({ dueDate: '2026-10-24', priority: 1 }),
    threads: [agent()],
    pullRequests: [pr({ approved: true, checks: { passed: 4, failed: 0, pending: 0, total: 4 } }), pr({ number: 40, state: 'merged', mergedAt: '2026-10-19T08:00:00Z' })],
  }));
  assert.deepEqual(evidence.map((e) => [e.label, e.tone]), [
    ['#42 · approved · green', 'ok'],
    ['#40 merged yesterday', null],
    ['agent running · fix/1-basket', 'run'],
    ['due 24 Oct', 'warn'],
    ['P1', 'warn'],
  ]);
  assert.deepEqual(evidenceOf(facts()).map((e) => e.label), ['no PR', 'no agent']);
});

test('the latest message is the newest of comment, notes and agent; a same-day comment beats dated notes', () => {
  const it = walkItem({ notes: { text: 'Notes', date: '2026-10-20' }, lastComment: { author: 'Sanne', at: '2026-10-20T07:00:00Z', text: 'Looks good', byMe: false } });
  assert.equal(latestMessage(it, [])?.source, 'comment');
  assert.equal(latestMessage(it, [agent({ lastAgentMessage: 'Done\n  with   it' })])?.text, 'Done with it');
  assert.equal(latestMessage(walkItem(), []), null);
});

test('ADO text: the newest Developer Notes block and signed comments', () => {
  const note = newestNote('<p>Update (2026-10-13) - Fixed the basket</p><p>Update (2026-10-01) - Started</p>');
  assert.deepEqual(note, { text: 'Fixed the basket', date: '2026-10-13' });
  const comment = toItemComment({ text: '<p>Vera · plan — Here is the plan</p>', createdDate: '2026-10-20T08:00:00Z', createdBy: { displayName: 'Koen' } }, 'Koen');
  assert.deepEqual(comment, { author: 'Vera · plan', at: '2026-10-20T08:00:00Z', text: 'Here is the plan', byMe: false });
});

test('lane summaries count what asks something, most urgent first', () => {
  const row = (label: string, tone: 'bad' | 'warn' | 'mute') => ({ overview: {} as any, label, tone });
  assert.equal(laneSummary([row('No open PR', 'warn'), row('CI red', 'bad'), row('In review', 'mute')]), '1 CI red · 1 No open PR · 1 fine');
  assert.equal(laneSummary([row('In review', 'mute')]), '');
});

test('the overview gets a walk: lanes in walk order, verdicts per item, and the briefing', () => {
  const items = [
    item({ id: 50001, state: 'Code Review' }),
    item({ id: 50002, state: 'Development In Progress', linkedPullRequests: [7] }),
    item({ id: 50003, state: 'New' }),
  ];
  const threads = [thread({ id: 't1', status: 'running', firstUserMessage: 'Pick up AB#50002', branch: 'fix/50002-x' })];
  const { overview } = buildOverview({
    items, threads, projects: [{ id: 'p-m1', title: 'M1' }], queue: new Map(), dismissed: new Set(), manualLinks: new Map(),
    worktreePattern: /^[MVW]\d+$/, threadLink: () => ({ link: '', appLink: '' }), sources: {} as Overview['sources'], now: NOW,
  });
  const prs = [{ number: 9, url: 'https://github.com/o/r/pull/9', title: 'AB#50001 Basket', headRef: 'fix/50001', state: 'open', isDraft: false, workItemIds: [50001], reviewDecision: 'approved', mergedAt: null, checks: { total: 2, passed: 2, failed: 0, pending: 0, skipped: 0, segments: [] } }] as unknown as PrSummary[];
  applyWalk(overview, { items, facts: new Map(), pullRequests: prs, placeOf: (t) => t.branch ?? t.worktree, now: NOW });
  assert.deepEqual(overview.walk!.lanes.map((l) => l.state), ['Testing Failed', 'Code Review', 'Development In Progress', 'Needs Human', 'New'], 'what QA sent back comes first');
  assert.deepEqual(overview.walk!.lanes.find((l) => l.state === 'Code Review'), { state: 'Code Review', itemIds: [50001], tone: 'ok', summary: '1 Ready to merge' });
  const byId = new Map(overview.items.map((o) => [o.item.id, o.walk!]));
  assert.equal(byId.get(50002)!.verdict.label, 'Agent on it');
  assert.equal(byId.get(50002)!.evidence.find((e) => e.kind === 'agent')!.label, 'agent running · fix/50002-x');
  assert.equal(byId.get(50003)!.verdict.label, 'Not started');
  assert.deepEqual(overview.walk!.briefing, { needYou: 0, outOfSync: 0, running: 1 });
});
