import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketFor, checkSummary, compareFocus, isWaitingOnMe, prKey, reasonFor, scoreOf, workItemIdsOf, type FocusContext,
} from '../src/github/focus.ts';
import { mapPr } from '../src/github/queries.ts';
import { ago, days, hours, NOW, rawPr } from './github-fixtures/fake.ts';

const pr = (o: Parameters<typeof rawPr>[0] = {}) => mapPr(rawPr(o), 'koen');

function ctx(o: Partial<FocusContext> = {}): FocusContext {
  return { login: 'koen', teams: [], now: NOW, staleAfterDays: 7, snoozedUntil: () => null, reviewRequestedAt: () => null, ...o };
}

test('a review requested from you needs you, with who asked and when', () => {
  const p = pr({ requested: ['koen'] });
  const c = ctx({ reviewRequestedAt: (key) => (key === 'acme/shop#1' ? ago(hours(5)) : null) });
  assert.equal(bucketFor(p, c), 'you');
  assert.deepEqual(reasonFor(p, c), { text: 'Sanne asked for your review 5 h ago.', tone: 'warn', icon: 'review' });
});

test('a team request counts when you are on the team, named in the reason', () => {
  const p = pr({ teams: ['acme/Platform'] });
  assert.equal(bucketFor(p, ctx()), 'wait');
  const mine = ctx({ teams: ['platform'] });
  assert.equal(bucketFor(p, mine), 'you');
  assert.match(reasonFor(p, mine).text, /^Sanne asked the platform team for a review/);
});

test('a re-review counts the commits since your review', () => {
  const p = pr({ requested: ['koen'], headSha: 'c4', commits: ['c1', 'c2', 'c3', 'c4'], reviews: [{ login: 'koen', state: 'COMMENTED', sha: 'c1' }] });
  assert.deepEqual(reasonFor(p, ctx()), { text: 'Sanne asked you to look again, 3 new commits since your review.', tone: 'warn', icon: 'rerun' });
});

test('approving the head ends the wait on you; a newer head brings it back', () => {
  assert.equal(isWaitingOnMe(pr({ requested: ['koen'], reviews: [{ login: 'koen', state: 'APPROVED' }] }), 'koen', []), false);
  assert.equal(isWaitingOnMe(pr({ requested: ['koen'], headSha: 'new', reviews: [{ login: 'koen', state: 'APPROVED', sha: 'old' }] }), 'koen', []), true);
});

test('your own pull request: failing checks, changes requested and comments need you', () => {
  const failing = pr({ author: 'koen', checks: [{ name: 'e2e', conclusion: 'FAILURE' }, { name: 'unit', conclusion: 'TIMED_OUT' }, { name: 'lint' }] });
  assert.equal(bucketFor(failing, ctx()), 'you');
  assert.deepEqual(reasonFor(failing, ctx()), { text: 'Your PR, 2 checks failing.', tone: 'bad', icon: 'failing' });
  const changes = pr({ author: 'koen', reviews: [{ login: 'mira', state: 'CHANGES_REQUESTED' }] });
  assert.equal(reasonFor(changes, ctx()).text, 'Changes requested on your PR.');
  const comments = pr({ author: 'koen', reviews: [{ login: 'mira', state: 'COMMENTED' }] });
  assert.equal(reasonFor(comments, ctx()).text, 'Comments on your PR to answer.');
});

test('approved, green and mergeable is ready', () => {
  const p = pr({ author: 'koen', reviews: [{ login: 'mira', state: 'APPROVED' }], checks: [{ name: 'a' }, { name: 'b' }, { name: 'c', conclusion: 'SKIPPED' }] });
  assert.equal(bucketFor(p, ctx()), 'ready');
  assert.deepEqual(reasonFor(p, ctx()), { text: 'Approved by mira, all 2 checks passed.', tone: 'ok', icon: 'approved' });
  assert.equal(bucketFor(pr({ author: 'koen', mergeable: 'CONFLICTING', reviews: [{ login: 'mira', state: 'APPROVED' }] }), ctx()), 'wait');
});

test('stale wins over a review request, and says how long', () => {
  const p = pr({ requested: ['koen'], updatedAgo: days(12) });
  assert.equal(bucketFor(p, ctx()), 'stale');
  assert.deepEqual(reasonFor(p, ctx()), { text: 'No update in 12 days.', tone: 'mute', icon: 'clock' });
});

test('a snoozed review waits until the snooze runs out', () => {
  const p = pr({ requested: ['koen'] });
  const snoozed = ctx({ snoozedUntil: () => NOW + hours(10) });
  assert.equal(bucketFor(p, snoozed), 'wait');
  assert.equal(reasonFor(p, snoozed).text, 'Snoozed until tomorrow.');
  assert.equal(bucketFor(p, ctx({ snoozedUntil: () => NOW - 1 })), 'you');
});

test('waiting on others says who or what', () => {
  assert.equal(reasonFor(pr({ draft: true }), ctx()).text, 'Draft, Sanne is still working on it.');
  assert.deepEqual(reasonFor(pr({ mergeable: 'CONFLICTING' }), ctx()), { text: "Sanne's PR has merge conflicts.", tone: 'bad', icon: 'conflict' });
  const running = pr({ author: 'koen', checks: [{ name: 'a' }, { name: 'b', status: 'IN_PROGRESS', conclusion: null }] });
  assert.deepEqual(reasonFor(running, ctx()), { text: 'Checks running, 1 of 2 done.', tone: 'run', icon: 'clock' });
  const autoMerge = pr({ author: 'koen', autoMerge: true, checks: [{ name: 'b', status: 'QUEUED', conclusion: null }] });
  assert.equal(reasonFor(autoMerge, ctx()).icon, 'merge');
  assert.equal(reasonFor(pr({ requested: ['mira'] }), ctx()).text, "Sanne's PR, waiting on mira.");
  assert.equal(reasonFor(pr({ authorName: null, author: 'bob' }), ctx()).text, "bob's PR, not assigned to you.");
});

test('the score ranks reviews you owe and your red builds above the rest; others\' drafts score nothing', () => {
  const owed = scoreOf(pr({ requested: ['koen'] }), ctx({ reviewRequestedAt: () => ago(hours(30)) }));
  const red = scoreOf(pr({ author: 'koen', checks: [{ name: 'e2e', conclusion: 'FAILURE' }] }), ctx());
  const others = scoreOf(pr(), ctx());
  assert.equal(owed, 15 + 8);
  assert.ok(red >= 20);
  assert.equal(others, 0);
  assert.equal(scoreOf(pr({ draft: true, requested: ['koen'] }), ctx()), 0);
});

test('Focus order: bucket, then score, then the oldest update', () => {
  const rows = [
    { bucket: 'wait' as const, score: 50, updatedAt: ago(1), size: 1 },
    { bucket: 'you' as const, score: 10, updatedAt: ago(1), size: 1 },
    { bucket: 'you' as const, score: 30, updatedAt: ago(1), size: 1 },
    { bucket: 'you' as const, score: 30, updatedAt: ago(hours(5)), size: 1 },
  ];
  const sorted = [...rows].sort(compareFocus);
  assert.deepEqual(sorted.map((r) => [r.bucket, r.score, r.updatedAt]), [
    ['you', 30, ago(hours(5))], ['you', 30, ago(1)], ['you', 10, ago(1)], ['wait', 50, ago(1)],
  ]);
});

test('check summary puts failures first and caps the bar at twelve', () => {
  const p = pr({ checks: [...Array.from({ length: 14 }, (_, i) => ({ name: `ok${i}` })), { name: 'bad', conclusion: 'FAILURE' }, { name: 'skip', conclusion: 'SKIPPED' }] });
  const summary = checkSummary(p.checks);
  assert.equal(summary.total, 16);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.segments.length, 12);
  assert.equal(summary.segments[0], 'failure');
});

test('a rerun replaces the earlier attempt of the same check', () => {
  const raw = rawPr({ checks: [{ name: 'e2e', conclusion: 'FAILURE', id: 1 }, { name: 'e2e', id: 2 }] });
  raw.head.nodes[0].commit.statusCheckRollup!.contexts.nodes[1].startedAt = ago(hours(1));
  const record = mapPr(raw, 'koen');
  assert.deepEqual(record.checks.map((c) => [c.id, c.state]), [[2, 'success']]);
});

test('work items come from AB# in the title or body and from the branch', () => {
  assert.deepEqual(workItemIdsOf({ title: 'Fix totals AB#60379', body: 'Also ab#123', headRef: 'feat/61000-totals' }).sort(), [123, 60379, 61000]);
  assert.deepEqual(workItemIdsOf({ title: 'x', body: '', headRef: 'main' }), []);
  assert.equal(prKey({ owner: 'acme', repo: 'shop', number: 7 }), 'acme/shop#7');
});
