import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Env, RouteDeps } from '../src/api/context.ts';
import { registerGithubRoutes } from '../src/api/routes/github.ts';
import { UserError } from '../src/service.ts';
import { githubWorld } from './github-fixtures/world.ts';

// biome-ignore lint/suspicious/noExplicitAny: response bodies are checked field by field
const json = async (response: Response | Promise<Response>): Promise<any> => (await response).json();

/** The GitHub routes on their own, with a signature check that wants one header, so the tests don't depend on device keys. */
function setup() {
  const world = githubWorld();
  const audited: string[] = [];
  const requireSignature: MiddlewareHandler<Env> = async (c, next) =>
    c.req.header('x-test-signed') === 'yes' ? next() : c.json({ error: 'Sign this request.', signatureRequired: true }, 403);
  const api = new Hono<Env>();
  registerGithubRoutes(api, { github: world.service, record: (_c: unknown, action: string) => audited.push(action), requireSignature } as unknown as RouteDeps);
  const app = new Hono<Env>().route('/api', api);
  app.onError((error, c) => (error instanceof UserError ? c.json({ error: error.message }, error.status as 400) : c.json({ error: 'boom' }, 500)));
  const post = (path: string, body: unknown, signed = false) =>
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(signed ? { 'x-test-signed': 'yes' } : {}) }, body: JSON.stringify(body) });
  return { ...world, app, audited, post };
}

test('GET /api/focus answers 503 before the first poll, then Focus', async () => {
  const { app, service } = setup();
  assert.equal((await app.request('/api/focus')).status, 503);
  await service.refresh();
  const focus = await json(app.request('/api/focus'));
  assert.deepEqual(Object.keys(focus).sort(), ['accounts', 'agentsWaiting', 'counts', 'generatedAt', 'pullRequests']);
  const pr = focus.pullRequests[0];
  for (const field of ['key', 'account', 'title', 'author', 'bucket', 'reason', 'checks', 'headSha', 'workItemIds', 'snoozedUntil', 'reviewedHeadSha', 'labels', 'mergeable']) {
    assert.ok(field in pr, `PrSummary.${field}`);
  }
  assert.deepEqual(Object.keys(pr.reason).sort(), ['icon', 'text', 'tone']);
});

test('GET /api/focus?refresh=1 polls first', async () => {
  const { app, gh } = setup();
  const response = await app.request('/api/focus?refresh=1');
  assert.equal(response.status, 200);
  assert.equal(gh.operations('FocusSearch').length, 1);
});

test('pull request detail, files and comments have the contract\'s shape', async () => {
  const { app, service, gh } = setup();
  gh.onRest('GET', /\/pulls\/1\/files\?/, [{ filename: 'a.ts', status: 'added', additions: 1, deletions: 0, patch: '@@ +1 @@\n+a' }]);
  gh.onGraphql('PrConversation', { repository: { pullRequest: { reviewThreads: { nodes: [] }, comments: { nodes: [] } } } });
  await service.refresh();
  const detail = await json(app.request('/api/prs/acme/shop/1'));
  for (const field of ['body', 'commits', 'reviews', 'requestedReviewers', 'requestedFromYou', 'checkRuns', 'proofImages', 'allowedMergeMethods', 'defaultMergeMethod', 'deleteBranchOnMerge', 'viewerCanMerge', 'workItems', 'threads']) {
    assert.ok(field in detail, `PrDetail.${field}`);
  }
  assert.deepEqual(Object.keys(detail.checkRuns[0]).sort(), ['completedAt', 'durationSeconds', 'failure', 'id', 'jobId', 'name', 'runId', 'startedAt', 'state', 'url', 'workflow']);
  const files = await json(app.request('/api/prs/acme/shop/1/files'));
  assert.deepEqual(Object.keys(files).sort(), ['files', 'headSha', 'reviewedHeadSha']);
  assert.deepEqual(await json(app.request('/api/prs/acme/shop/1/comments')), { threads: [], comments: [] });
});

test('a malformed pull request reference is a 404, an unknown one too', async () => {
  const { app, service } = setup();
  await service.refresh();
  assert.equal((await app.request('/api/prs/acme/shop/abc')).status, 404);
  assert.equal((await app.request('/api/prs/ac%20me/shop/1')).status, 404);
  assert.equal((await app.request('/api/prs/acme/shop/3')).status, 404);
});

test('merge and every review event need a signature', async () => {
  const { post, service, gh } = setup();
  await service.refresh();
  const merge = { method: 'squash', commitTitle: 'x', commitMessage: '', deleteBranch: false, headSha: 'h2' };
  const unsigned = await post('/api/prs/acme/shop/2/merge', merge);
  assert.equal(unsigned.status, 403);
  assert.equal((await json(unsigned)).signatureRequired, true);
  for (const event of ['APPROVE', 'REQUEST_CHANGES', 'COMMENT']) {
    assert.equal((await post('/api/prs/acme/shop/1/reviews', { event, body: 'b', headSha: 'h1', comments: [] })).status, 403, event);
  }
  assert.equal(gh.requests('PUT', /merge/).length + gh.requests('POST', /reviews/).length, 0);
});

test('a signed merge at a moved head answers 409; at the head it merges', async () => {
  const { post, service, gh, audited } = setup();
  gh.onRest('PUT', /\/pulls\/2\/merge$/, { merged: true, message: 'Merged' });
  await service.refresh();
  const stale = await post('/api/prs/acme/shop/2/merge', { method: 'squash', commitTitle: 'x', commitMessage: '', deleteBranch: false, headSha: 'old' }, true);
  assert.equal(stale.status, 409);
  assert.match((await json(stale)).error, /new commits/);
  const merged = await post('/api/prs/acme/shop/2/merge', { method: 'squash', commitTitle: 'x', commitMessage: '', deleteBranch: false, headSha: 'h2' }, true);
  assert.deepEqual(await json(merged), { merged: true, autoMerge: false, message: 'Merged' });
  assert.deepEqual(audited, ['github.merge']);
});

test('a signed review at a moved head answers 409; at the head it returns the review id', async () => {
  const { post, service, gh } = setup();
  gh.onRest('POST', /\/pulls\/1\/reviews$/, { id: 9 });
  await service.refresh();
  assert.equal((await post('/api/prs/acme/shop/1/reviews', { event: 'APPROVE', body: '', headSha: 'old', comments: [] }, true)).status, 409);
  const ok = await post('/api/prs/acme/shop/1/reviews', { event: 'APPROVE', body: '', headSha: 'h1', comments: [] }, true);
  assert.deepEqual(await json(ok), { ok: true, reviewId: 9 });
});

test('comments, resolve, rerun and snooze answer the contract', async () => {
  const { post, service, gh, app } = setup();
  gh.onRest('POST', /\/issues\/1\/comments$/, { id: 5 });
  gh.onGraphql('Resolve', { resolveReviewThread: { thread: { id: 'RT_1', isResolved: true } } });
  gh.onRest('POST', /rerun-failed-jobs$/, () => ({ status: 201 }));
  await service.refresh();
  assert.deepEqual(await json(post('/api/prs/acme/shop/1/comments', { body: 'Hi' })), { ok: true });
  assert.deepEqual(await json(post('/api/prs/acme/shop/1/threads/RT_1/resolve', {})), { ok: true });
  assert.equal(gh.operations('Resolve')[0].body.variables.threadId, 'RT_1');
  assert.deepEqual(await json(post('/api/prs/acme/shop/1/rerun-failed', {})), { reruns: 1 });
  assert.deepEqual(await json(post('/api/prs/acme/shop/1/snooze', { until: '2026-11-01T00:00:00Z' })), { ok: true });
  const focus = await json(app.request('/api/focus'));
  assert.equal(focus.pullRequests.find((p: { key: string }) => p.key === 'acme/shop#1').bucket, 'wait');
  assert.equal((await post('/api/prs/acme/shop/1/snooze', { until: 'soon' })).status, 400);
});

test('CI groups: list, one, claim and unclaim', async () => {
  const { app, service, post } = setup();
  await service.refresh();
  await service.ciSettled();
  const groups = await json(app.request('/api/ci/groups'));
  assert.equal(groups.length, 1);
  const id = groups[0].id;
  assert.deepEqual(Object.keys(groups[0]).sort(), ['branches', 'claim', 'failures', 'firstFailedAt', 'id', 'lastFailedAt', 'location', 'signal', 'title']);
  assert.equal((await json(app.request(`/api/ci/groups/${id}`))).id, id);
  assert.equal((await app.request('/api/ci/groups/nope')).status, 404);
  const claimed = await json(post(`/api/ci/groups/${id}/claim`, { note: 'Mine' }));
  assert.equal(claimed.claim.note, 'Mine');
  const released = await json(app.request(`/api/ci/groups/${id}/claim`, { method: 'DELETE' }));
  assert.equal(released.claim, null);
});
