import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Focus } from '../../shared/src/api.ts';
import { UserError } from '../src/service.ts';
import { checkRun, rawPr, searchAnswer, type Seen } from './github-fixtures/fake.ts';
import { githubWorld, VITEST_LOG } from './github-fixtures/world.ts';

const ONE = { owner: 'acme', repo: 'shop', number: 1 };
const TWO = { owner: 'acme', repo: 'shop', number: 2 };

test('a poll buckets the pull requests that involve you, with reasons and the agents waiting', async () => {
  const { service, gh } = githubWorld();
  const events: Focus[] = [];
  service.on('focus', (f) => events.push(f));
  const focus = (await service.refresh())!;
  assert.deepEqual(focus.counts, { you: 1, wait: 0, ready: 1, stale: 0 });
  const [first, second] = focus.pullRequests;
  assert.equal(first.key, 'acme/shop#1');
  assert.equal(first.bucket, 'you');
  assert.match(first.reason.text, /^Sanne asked for your review/);
  assert.deepEqual(first.workItemIds, [60379]);
  assert.equal(first.checks.failed, 1);
  assert.equal(first.isMine, false);
  assert.equal(second.bucket, 'ready');
  assert.equal(second.isMine, true);
  assert.deepEqual(second.approvedBy, ['mira']);
  assert.deepEqual(focus.agentsWaiting, [{ itemId: 60379, threadId: 't-1', title: 'Keep the basket on timeout', detail: 'Retry once or twice?', tone: 'warn' }]);
  assert.deepEqual(focus.accounts.map((a) => [a.login, a.ok]), [['koen', true]]);
  assert.deepEqual(gh.operations('FocusSearch').map((r) => /\S+:@me/.exec(r.body.variables.query)?.[0]), ['involves:@me', 'review-requested:@me', 'reviewed-by:@me']);

  await service.ciSettled();
  const before = events.length;
  await service.refresh();
  await service.ciSettled();
  assert.equal(events.length, before, 'an unchanged poll emits nothing');
});

test('review requests and your reviews come from their own searches: involves:@me never finds them', async () => {
  const { service, gh, prs } = githubWorld();
  const teamAsks = Array.from({ length: 25 }, (_, i) => rawPr({ number: 100 + i, title: `Team change ${i}`, author: 'tom', teams: ['platform'] }));
  const reviewed = rawPr({ number: 4, title: 'Split the checkout', author: 'mira', headSha: 'new', commits: ['old', 'new'], reviews: [{ login: 'koen', state: 'APPROVED', sha: 'old' }] });
  gh.onGraphql('FocusSearch', (r) => {
    const { query, after } = r.body.variables;
    if (query.includes('involves:@me')) return { body: { data: searchAnswer([prs[1], prs[2]]) } };
    if (query.includes('reviewed-by:@me')) return { body: { data: searchAnswer([reviewed]) } };
    return { body: { data: after === 'page-2' ? searchAnswer([...teamAsks.slice(20), prs[1]]) : searchAnswer(teamAsks.slice(0, 20), 'koen', 'page-2') } };
  });
  const focus = (await service.refresh())!;
  assert.equal(focus.pullRequests.length, 28, '#1, #2, #4 and 25 team requests, each once');
  assert.equal(focus.pullRequests.find((p) => p.key === 'acme/shop#124')!.bucket, 'you', 'a request to your team needs you');
  assert.equal(gh.operations('FocusSearch').filter((r) => r.body.variables.query.includes('review-requested:@me')).length, 2, 'two pages');
  assert.equal(focus.accounts[0].ok, true);
});

test('a search that times out keeps its last answer and says so; the others refresh', async () => {
  const { service, gh, prs } = githubWorld();
  const teamAsk = rawPr({ number: 3, title: 'Cache the price list', author: 'tom', teams: ['platform'] });
  let requestedDown = false;
  gh.onGraphql('FocusSearch', (r) => {
    const { query } = r.body.variables;
    if (query.includes('review-requested:@me')) return requestedDown ? { status: 504, text: '<!DOCTYPE html>' } : { body: { data: searchAnswer([teamAsk]) } };
    return { body: { data: searchAnswer(query.includes('involves:@me') ? [prs[1], prs[2]] : []) } };
  });
  await service.refresh();
  requestedDown = true;
  const focus = (await service.refresh())!;
  assert.deepEqual(focus.pullRequests.map((p) => p.key).sort(), ['acme/shop#1', 'acme/shop#2', 'acme/shop#3']);
  assert.equal(focus.accounts[0].ok, false);
  assert.match(focus.accounts[0].error!, /^Showing older results for review-requested:@me/);
});

test('an account that fails keeps its error; the others still count', async () => {
  const { service } = githubWorld({ accounts: ['koen', 'broken'] });
  const focus = (await service.refresh())!;
  assert.equal(focus.pullRequests.length, 2);
  const broken = focus.accounts.find((a) => a.login === 'broken')!;
  assert.equal(broken.ok, false);
  assert.match(broken.error!, /Server Error/);
});

test('failed jobs: the log tail through the redirect, a group with the base branch, master health', async () => {
  const { service, gh } = githubWorld();
  await service.refresh();
  await service.ciSettled();

  const storage = gh.requests('GET', /storage\.example/);
  assert.equal(storage.length, 2, 'one tail for the PR job, one for main');
  for (const s of storage) {
    assert.equal(s.headers.range, 'bytes=-65536');
    assert.equal(s.headers.authorization, undefined, 'the token never reaches log storage');
  }

  const [group] = service.ciGroups();
  assert.equal(service.ciGroups().length, 1);
  assert.deepEqual(group.branches.map((b) => b.prKey ?? b.branch), ['main', 'acme/shop#1']);
  assert.deepEqual(group.branches[0].suspect, { sha: 'm1', message: 'Round totals' });

  const master = service.masterHealth();
  assert.equal(master.state, 'failing');
  assert.equal(master.repo, 'acme/shop');
  assert.equal(master.job, 'test');
  assert.equal(master.prsHit, 1);

  const detail = await service.detail(ONE);
  const failed = detail.checkRuns[0];
  assert.equal(failed.name, 'e2e');
  assert.equal(failed.jobId, 501);
  assert.equal(failed.failure?.step, 'Run bun run test');
  assert.equal(failed.failure?.summary, 'AssertionError: expected 100 to be 90 // Object.is equality');
  assert.equal(failed.failure?.groupId, group.id);
  assert.equal(failed.failure?.newInThisPr, false);
  assert.ok(failed.failure?.alsoOnBase);

  // Read once: the next poll leaves the logs alone.
  await service.refresh();
  await service.ciSettled();
  assert.equal(gh.requests('GET', /storage\.example/).length, 2);

  const claimed = service.claim(group.id, ' on it ');
  assert.equal(claimed.claim?.note, 'on it');
  assert.equal(claimed.claim?.by.login, 'koen');
  assert.equal(service.masterHealth().claimedBy, 'koen');
  assert.equal(service.unclaim(group.id).claim, null);
  assert.throws(() => service.ciGroup('nope'), (e: UserError) => e.status === 404);
});

test('detail: merge options, proof images, reviews, the linked work item and threads on the branch', async () => {
  const { service } = githubWorld();
  await service.refresh();
  const detail = await service.detail(ONE);
  assert.deepEqual(detail.allowedMergeMethods, ['squash', 'rebase']);
  assert.equal(detail.defaultMergeMethod, 'squash');
  assert.equal(detail.viewerCanMerge, true);
  assert.equal(detail.requestedFromYou, true);
  assert.deepEqual(detail.proofImages.map((i) => i.alt), ['basket kept', 'after']);
  assert.deepEqual(detail.reviews.map((r) => [r.author.login, r.state]), [['mira', 'commented']]);
  assert.deepEqual(detail.workItems.map((w) => w.id), [60379]);
  assert.deepEqual(detail.threads.map((t) => t.id), ['t-1']);
  assert.equal(detail.commits, 3);
});

test('detail answers before the failed job\'s log is read; the next read carries the reason', async () => {
  const { service, gh } = githubWorld();
  let release = () => {};
  const storage = new Promise<void>((resolve) => { release = resolve; });
  gh.onRest('GET', /^https:\/\/storage\.example\/logs\//, async () => {
    await storage;
    return { status: 206, text: VITEST_LOG, headers: { 'content-range': 'bytes 0-1/2' } };
  });
  const first = await service.detail(ONE);
  assert.equal(first.checkRuns[0].name, 'e2e');
  assert.equal(first.checkRuns[0].failure, null, 'answered while the log is still on its way');
  await service.detail(ONE);
  assert.equal(gh.requests('GET', /actions\/jobs\/501$/).length, 1, 'a second read joins the one in flight');

  release();
  await service.ciSettled();
  assert.equal((await service.detail(ONE)).checkRuns[0].failure?.step, 'Run bun run test');
});

test('a detail and its files read at once ask GitHub for the pull request once', async () => {
  const { service, gh } = githubWorld();
  gh.onRest('GET', /\/pulls\/1\/files\?/, [{ filename: 'src/cart.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n+a' }]);
  await service.refresh();
  await Promise.all([service.detail(ONE), service.files(ONE), service.detail(ONE)]);
  assert.equal(gh.operations('PrDetail').length, 1);
});

test('merge: a moved head is a 409 and nothing merges', async () => {
  const { service, gh } = githubWorld();
  await service.refresh();
  await assert.rejects(service.merge(TWO, { method: 'squash', commitTitle: 'Round totals', commitMessage: '', deleteBranch: true, headSha: 'old' }), (e: UserError) => e.status === 409);
  assert.equal(gh.requests('PUT', /merge/).length, 0);
});

test('merge: green checks merge at the head and delete the branch', async () => {
  const { service, gh } = githubWorld();
  gh.onRest('PUT', /\/pulls\/2\/merge$/, { merged: true, message: 'Pull Request successfully merged' });
  gh.onRest('DELETE', /\/git\/refs\/heads\/feat\/2-thing$/, () => ({ status: 204 }));
  await service.refresh();
  const result = await service.merge(TWO, { method: 'squash', commitTitle: 'Round totals (#2)', commitMessage: 'Body', deleteBranch: true, headSha: 'h2' });
  assert.deepEqual(result, { merged: true, autoMerge: false, message: 'Pull Request successfully merged' });
  assert.deepEqual(gh.requests('PUT', /merge$/)[0].body, { sha: 'h2', merge_method: 'squash', commit_title: 'Round totals (#2)', commit_message: 'Body' });
  assert.equal(gh.requests('DELETE', /refs\/heads\/feat\/2-thing$/).length, 1);
});

test('merge: running checks turn on auto-merge instead', async () => {
  const { service, gh, prs } = githubWorld();
  prs[2].head.nodes[0].commit.statusCheckRollup!.contexts.nodes = [checkRun({ name: 'build', status: 'IN_PROGRESS', conclusion: null })] as never[];
  gh.onGraphql('AutoMerge', { enablePullRequestAutoMerge: { clientMutationId: null } });
  await service.refresh();
  const result = await service.merge(TWO, { method: 'squash', commitTitle: '', commitMessage: '', deleteBranch: false, headSha: 'h2' });
  assert.equal(result.autoMerge, true);
  assert.equal(result.merged, false);
  const [mutation] = gh.operations('AutoMerge');
  assert.deepEqual([mutation.body.variables.method, mutation.body.variables.head], ['SQUASH', 'h2']);
  assert.equal(gh.requests('PUT', /merge/).length, 0);
});

test('review: posted at the head the reviewer saw; a moved head is a 409', async () => {
  const { service, gh } = githubWorld();
  gh.onRest('POST', /\/pulls\/1\/reviews$/, { id: 77 });
  await service.refresh();
  await assert.rejects(service.review(ONE, { event: 'APPROVE', body: '', headSha: 'stale', comments: [] }), (e: UserError) => e.status === 409);
  await assert.rejects(service.review(ONE, { event: 'REQUEST_CHANGES', body: ' ', headSha: 'h1', comments: [] }), (e: UserError) => e.status === 400);
  const { reviewId } = await service.review(ONE, { event: 'COMMENT', body: 'Two notes', headSha: 'h1', comments: [{ path: 'src/cart.ts', line: 12, side: 'RIGHT', body: 'Round here?' }] });
  assert.equal(reviewId, 77);
  const [posted] = gh.requests('POST', /reviews$/);
  assert.equal(posted.body.commit_id, 'h1');
  assert.deepEqual(posted.body.comments, [{ path: 'src/cart.ts', line: 12, side: 'RIGHT', body: 'Round here?' }]);
});

test('rerun failed restarts each red workflow run once', async () => {
  const { service, gh, prs } = githubWorld();
  prs[1].head.nodes[0].commit.statusCheckRollup!.contexts.nodes = [
    checkRun({ name: 'e2e', conclusion: 'FAILURE', id: 501, runId: 50 }), checkRun({ name: 'unit', conclusion: 'FAILURE', id: 503, runId: 50 }),
    checkRun({ name: 'deploy', conclusion: 'FAILURE', id: 504, runId: 51, workflow: 'Deploy' }), checkRun({ name: 'lint', id: 502, runId: 52 }),
  ] as never[];
  gh.onRest('POST', /rerun-failed-jobs$/, () => ({ status: 201 }));
  await service.refresh();
  assert.deepEqual(await service.rerunFailed(ONE), { reruns: 2 });
  assert.deepEqual(gh.requests('POST', /rerun-failed-jobs$/).map((r) => /runs\/(\d+)/.exec(r.url)![1]), ['50', '51']);
});

test('a snooze moves a review out of Needs you until it runs out', async () => {
  const { service } = githubWorld();
  await service.refresh();
  service.snooze(ONE, '2026-11-01T00:00:00Z');
  assert.equal(service.focus!.pullRequests.find((p) => p.key === 'acme/shop#1')!.bucket, 'wait');
  assert.equal(service.focus!.pullRequests.find((p) => p.key === 'acme/shop#1')!.snoozedUntil, '2026-11-01T00:00:00.000Z');
  service.snooze(ONE, null);
  assert.equal(service.focus!.pullRequests.find((p) => p.key === 'acme/shop#1')!.bucket, 'you');
  assert.throws(() => service.snooze(ONE, 'tomorrow'), (e: UserError) => e.status === 400);
});

test('files: changed since your review comes from comparing your review\'s commit with the head', async () => {
  const { service, gh, prs } = githubWorld();
  prs[1].latestReviews!.nodes = [{ state: 'COMMENTED', submittedAt: '2026-10-30T10:00:00Z', author: { login: 'koen' }, commit: { oid: 'r1' } }];
  gh.onRest('GET', /\/pulls\/1\/files\?/, [
    { filename: 'src/cart.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' },
    { filename: 'src/new.ts', previous_filename: 'src/old.ts', status: 'renamed', additions: 0, deletions: 0 },
    { filename: 'e2e/cart.spec.ts', status: 'added', additions: 9, deletions: 0, patch: '@@ -0,0 +1 @@\n+test' },
    { filename: 'public/logo.png', status: 'added', additions: 0, deletions: 0 },
  ]);
  gh.onRest('GET', /\/compare\/r1\.\.\.h1$/, { files: [{ filename: 'src/cart.ts' }] });
  await service.refresh();
  const files = await service.files(ONE);
  assert.equal(files.reviewedHeadSha, 'r1');
  assert.deepEqual(files.files.map((f) => [f.path, f.status, f.changedSinceReview, f.category]), [
    ['src/cart.ts', 'modified', true, 'source'], ['src/new.ts', 'renamed', false, 'source'], ['e2e/cart.spec.ts', 'added', false, 'tests'], ['public/logo.png', 'added', false, 'generated'],
  ]);
  assert.equal(files.files[1].patch, null);
  assert.equal(files.files[1].previousPath, 'src/old.ts');

  // A force-push dropped the reviewed commit: everything counts as changed.
  gh.onRest('GET', /\/compare\//, () => ({ status: 404, body: { message: 'Not Found' } }));
  (service as unknown as { detailCache: Map<string, unknown> }).detailCache.clear();
  assert.ok((await service.files(ONE)).files.every((f) => f.changedSinceReview));
});

test('conversation and comments: threads with their diff lines, replies through GraphQL, top-level through REST', async () => {
  const { service, gh } = githubWorld();
  const actor = { login: 'mira', avatarUrl: null, name: 'Mira' };
  gh.onGraphql('PrConversation', { repository: { pullRequest: {
    reviewThreads: { nodes: [{ id: 'RT_1', path: 'src/cart.ts', line: null, originalLine: 12, isResolved: false, comments: { nodes: [
      { id: 'C_1', body: 'Round here?', createdAt: '2026-10-31T09:00:00Z', diffHunk: '@@ -1,9 +1,9 @@\n a\n b\n c\n d\n e\n f\n g\n+h', author: actor, reactionGroups: [{ content: 'THUMBS_UP', reactors: { totalCount: 2 } }, { content: 'EYES', reactors: { totalCount: 0 } }] },
    ] } }] },
    comments: { nodes: [{ id: 'IC_1', body: 'Ship it', createdAt: '2026-10-31T10:00:00Z', author: actor, reactionGroups: [] }] },
  } } });
  gh.onGraphql('Reply', { addPullRequestReviewThreadReply: { comment: { id: 'C_2' } } });
  gh.onRest('POST', /\/issues\/1\/comments$/, { id: 5 });
  await service.refresh();
  const conversation = await service.conversation(ONE);
  const [thread] = conversation.threads;
  assert.equal(thread.line, 12);
  assert.equal(thread.diffHunk!.split('\n').length, 7);
  assert.deepEqual(thread.comments[0].reactions, [{ content: 'thumbs_up', count: 2 }]);
  assert.equal(conversation.comments[0].body, 'Ship it');

  await service.comment(ONE, { body: 'Done', threadId: 'RT_1' });
  assert.equal(gh.operations('Reply')[0].body.variables.threadId, 'RT_1');
  await service.comment(ONE, { body: 'Thanks' });
  assert.deepEqual(gh.requests('POST', /issues\/1\/comments$/)[0].body, { body: 'Thanks' });
  await assert.rejects(service.comment(ONE, { body: '  ' }), (e: UserError) => e.status === 400);
});

test('search: a number or AB# finds that pull request first, words match title, branch and author', async () => {
  const { service } = githubWorld();
  await service.refresh();
  assert.deepEqual(service.search('2').map((p) => p.key), ['acme/shop#2']);
  assert.deepEqual(service.search('AB#60379').map((p) => p.key), ['acme/shop#1']);
  assert.deepEqual(service.search('basket sanne').map((p) => p.key), ['acme/shop#1']);
  assert.deepEqual(service.search(''), []);
});

test('a pull request no poll has shown is read by the account that can see it, and later reads keep that account', async () => {
  const { service, gh } = githubWorld({ accounts: ['koen', 'work'] });
  const portal = rawPr({ number: 7, owner: 'globex', repo: 'portal', title: 'Partner portal sign-in', headSha: 'g7' });
  const ref = { owner: 'globex', repo: 'portal', number: 7 };
  const onlyWork = (r: Seen, data: unknown) => (r.headers.authorization.includes('token-of-work-')
    ? { body: { data } }
    : { body: { data: { repository: null }, errors: [{ type: 'NOT_FOUND', message: "Could not resolve to a Repository with the name 'globex/portal'." }] } });
  gh.onGraphql('PrDetail', (r) => onlyWork(r, { repository: {
    squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: false, deleteBranchOnMerge: false, viewerPermission: 'READ', viewerDefaultMergeMethod: 'SQUASH',
    pullRequest: { ...portal, commits: { totalCount: 1 }, reviews: { nodes: [] }, reviewRequestsFull: { nodes: [] } },
  } }));
  gh.onGraphql('PrConversation', (r) => onlyWork(r, { repository: { pullRequest: { reviewThreads: { nodes: [] }, comments: { nodes: [] } } } }));
  await service.refresh();

  const detail = await service.detail(ref);
  assert.equal(detail.title, 'Partner portal sign-in');
  const readers = (operation: string) => gh.operations(operation).map((r) => /token-of-(\w+)-/.exec(r.headers.authorization)![1]);
  assert.deepEqual(readers('PrDetail'), ['koen', 'work'], 'the first account cannot see it, the second can');
  await service.conversation(ref);
  assert.deepEqual(readers('PrConversation'), ['work']);
});
