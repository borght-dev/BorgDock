import type { Context } from 'hono';
import type { ClaimRequest, MergeRequest, PostCommentRequest, PrRef, PrRepositoryPreferences, SnoozeRequest, SubmitReviewRequest } from '../../../../shared/src/api.ts';
import { UserError } from '../../service.ts';
import { readBody, type Api, type Env, type RouteDeps } from '../context.ts';

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

function refOf(c: Context<Env>): PrRef {
  const owner = c.req.param('owner') ?? '';
  const repo = c.req.param('repo') ?? '';
  const number = Number(c.req.param('number'));
  if (!NAME.test(owner) || !NAME.test(repo) || !Number.isInteger(number) || number <= 0) throw new UserError('Not a pull request', 404);
  return { owner, repo, number };
}

const keyOf = (ref: PrRef) => `${ref.owner}/${ref.repo}#${ref.number}`;

/**
 * GitHub routes (all need a session): GET /focus, /prs/:owner/:repo/:number (+ /files, /comments),
 * POST /prs/.../comments, /threads/:threadId/resolve, /reviews (signed), /merge (signed), /rerun-failed, /snooze,
 * GET /ci/groups, /ci/groups/:id, POST/DELETE /ci/groups/:id/claim, GET /github/repositories,
 * PUT /github/repositories/preferences. Types: shared/src/borgdock.ts.
 * GET /focus?refresh=1 polls GitHub first, every watched repository included (pull to refresh).
 */
export function registerGithubRoutes(api: Api, { github, record, requireSignature }: RouteDeps) {
  const PR = '/prs/:owner/:repo/:number';

  api.get('/focus', async (c) => {
    const focus = c.req.query('refresh') ? await github.refresh({ repositories: true }) : github.focus;
    return focus ? c.json(focus) : c.json({ error: 'Still loading GitHub. Try again in a moment.' }, 503);
  });

  api.get(PR, async (c) => c.json(await github.detail(refOf(c))));

  api.get(`${PR}/files`, async (c) => c.json(await github.files(refOf(c))));

  api.get(`${PR}/comments`, async (c) => c.json(await github.conversation(refOf(c))));

  api.post(`${PR}/comments`, async (c) => {
    const ref = refOf(c);
    const request = await readBody<PostCommentRequest>(c);
    await github.comment(ref, request);
    record(c, 'github.comment', { pr: keyOf(ref), reply: Boolean(request.threadId) });
    return c.json({ ok: true });
  });

  api.post(`${PR}/threads/:threadId/resolve`, async (c) => {
    const ref = refOf(c);
    await github.resolveThread(ref, c.req.param('threadId'));
    record(c, 'github.resolve', { pr: keyOf(ref), threadId: c.req.param('threadId') });
    return c.json({ ok: true });
  });

  api.post(`${PR}/reviews`, requireSignature, async (c) => {
    const ref = refOf(c);
    const request = await readBody<SubmitReviewRequest>(c);
    const { reviewId } = await github.review(ref, request);
    record(c, 'github.review', { pr: keyOf(ref), event: request.event, headSha: request.headSha, comments: request.comments?.length ?? 0 });
    return c.json({ ok: true, reviewId });
  });

  api.post(`${PR}/merge`, requireSignature, async (c) => {
    const ref = refOf(c);
    const request = await readBody<MergeRequest>(c);
    const result = await github.merge(ref, request);
    record(c, 'github.merge', { pr: keyOf(ref), method: request.method, headSha: request.headSha, ...result });
    return c.json(result);
  });

  api.post(`${PR}/rerun-failed`, async (c) => {
    const ref = refOf(c);
    const result = await github.rerunFailed(ref);
    record(c, 'github.rerun', { pr: keyOf(ref), ...result });
    return c.json(result);
  });

  api.post(`${PR}/snooze`, async (c) => {
    const ref = refOf(c);
    const { until } = await readBody<SnoozeRequest>(c);
    github.snooze(ref, until ?? null);
    return c.json({ ok: true });
  });

  api.get('/github/repositories', (c) => c.json(github.repositories()));

  api.put('/github/repositories/preferences', async (c) => {
    const result = github.setRepositoryPreferences(await readBody<PrRepositoryPreferences>(c));
    record(c, 'github.repositories.preferences', { includeInvolving: result.includeInvolving, includeTeamRequests: result.includeTeamRequests });
    return c.json(result);
  });

  api.get('/ci/groups', (c) => c.json(github.ciGroups()));

  api.get('/ci/groups/:id', (c) => c.json(github.ciGroup(c.req.param('id'))));

  api.post('/ci/groups/:id/claim', async (c) => {
    const { note } = await readBody<ClaimRequest>(c);
    const group = github.claim(c.req.param('id'), note ?? null);
    record(c, 'ci.claim', { groupId: group.id });
    return c.json(group);
  });

  api.delete('/ci/groups/:id/claim', (c) => {
    const group = github.unclaim(c.req.param('id'));
    record(c, 'ci.unclaim', { groupId: group.id });
    return c.json(group);
  });
}
