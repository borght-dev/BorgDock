// A GitHub with one repository, two open pull requests and a red main branch, in recorded-response shape.

import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config.ts';
import { openDb } from '../../src/db.ts';
import { GithubService } from '../../src/github/service.ts';
import { ago, days, FakeGithub, fakeTokens, hours, NOW, rawPr, searchAnswer } from './fake.ts';

export const VITEST_LOG = readFileSync(new URL('./logs/vitest-failure.txt', import.meta.url), 'utf8');

/** #1: a review Sanne asked from koen, its e2e job red. #2: koen's own, approved and green. main: red since m1. */
export function githubWorld(o: { accounts?: string[] } = {}) {
  const gh = new FakeGithub();
  const dataDir = mkdtempSync(join(tmpdir(), 'borgdock-github-'));
  const config = loadConfig({ DISPATCH_DATA_DIR: dataDir, DISPATCH_ORIGIN: 'https://dispatch.test' });
  config.github.accounts = o.accounts ?? ['koen'];
  const db = openDb(dataDir);
  const overview = {
    generatedAt: 'now', unlinkedThreads: [], worktrees: [], sources: {},
    items: [{
      item: { id: 60379, title: 'Keep the basket on timeout', type: 'PBI' }, bay: 'waiting', waitingFor: 'Question in M1', suggestion: null, pullRequest: null, queuedAt: null,
      threads: [{ id: 't-1', status: 'question', branch: 'feat/1-basket', questions: [{ question: 'Retry once or twice?' }], lastAgentMessage: null }],
    }],
  };
  const dispatch = Object.assign(new EventEmitter(), { overview });

  const review = rawPr({
    number: 1, title: 'Keep the basket on timeout AB#60379', head: 'feat/1-basket', headSha: 'h1', requested: ['koen'],
    checks: [{ name: 'e2e', conclusion: 'FAILURE', id: 501, runId: 50, workflow: 'CI' }, { name: 'lint', id: 502, runId: 50 }],
    body: 'Before/after:\n![basket kept](https://github.com/user-attachments/assets/basket.png)\n<img src="https://github.com/user-attachments/assets/after.png" alt="after">',
  });
  const mine = rawPr({ number: 2, title: 'Round totals', author: 'koen', authorName: 'Koen', headSha: 'h2', reviews: [{ login: 'mira', state: 'APPROVED', sha: 'h2' }], checks: [{ name: 'build', id: 601, runId: 60 }] });
  const prs = { 1: review, 2: mine } as const;

  gh.onGraphql('FocusSearch', (r) => (r.headers.authorization.includes('broken')
    ? { status: 502, body: { message: 'Server Error' } }
    : { body: { data: searchAnswer(/involves:@me/.test(r.body.variables.query) ? [review, mine] : []) } }));
  gh.onGraphql('ViewerTeams', { viewer: { organizations: { nodes: [{ teams: { nodes: [{ slug: 'platform' }] } }] } } });
  gh.onGraphql('PrDetail', (r) => {
    const pr = prs[r.body.variables.number as 1 | 2];
    return { body: { data: { repository: pr ? {
      squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: true, deleteBranchOnMerge: true, viewerPermission: 'WRITE', viewerDefaultMergeMethod: 'SQUASH',
      pullRequest: {
        ...pr, commits: { totalCount: 3 },
        reviews: { nodes: [{ state: 'COMMENTED', submittedAt: ago(hours(3)), body: 'Looks close', author: { login: 'mira', avatarUrl: null, name: 'Mira' } }] },
        reviewRequestsFull: { nodes: [{ requestedReviewer: { __typename: 'User', login: 'koen', name: 'Koen', avatarUrl: null } }] },
      },
    } : { pullRequest: null } } } };
  });
  gh.onGraphql('PrHead', (r) => {
    const pr = prs[r.body.variables.number as 1 | 2];
    return { body: { data: { repository: { pullRequest: { id: pr.id, headRefOid: pr.headRefOid, state: 'OPEN', headRefName: pr.headRefName, isCrossRepository: false, head: pr.head } } } } };
  });

  // The PR's failed job: its steps, then the log through GitHub's redirect to storage.
  gh.onRest('GET', /\/repos\/acme\/shop\/actions\/jobs\/501$/, { id: 501, steps: [{ name: 'Set up job', conclusion: 'success' }, { name: 'Run bun run test', conclusion: 'failure' }] });
  gh.onRest('GET', /\/actions\/jobs\/(\d+)\/logs$/, (r) => ({ status: 302, headers: { location: `https://storage.example/logs/${/jobs\/(\d+)/.exec(r.url)![1]}?sig=secret` } }));
  gh.onRest('GET', /^https:\/\/storage\.example\/logs\//, () => ({ status: 206, text: VITEST_LOG, headers: { 'content-range': 'bytes 0-1/2' } }));

  // main: run 900 and 899 red (899 the first), 898 green.
  gh.onRest('GET', /\/repos\/acme\/shop\/actions\/runs\?branch=main/, { workflow_runs: [
    { id: 900, workflow_id: 7, name: 'CI', status: 'completed', conclusion: 'failure', head_sha: 'm2', created_at: ago(hours(4)), head_commit: { message: 'Tidy the cart' } },
    { id: 899, workflow_id: 7, name: 'CI', status: 'completed', conclusion: 'failure', head_sha: 'm1', created_at: ago(days(1)), head_commit: { message: 'Round totals\n\nlong body' } },
    { id: 898, workflow_id: 7, name: 'CI', status: 'completed', conclusion: 'success', head_sha: 'm0', created_at: ago(days(2)), head_commit: { message: 'Green' } },
  ] });
  gh.onRest('GET', /\/actions\/runs\/900\/jobs/, { jobs: [
    { id: 901, run_id: 900, name: 'test', conclusion: 'failure', completed_at: ago(hours(3)), head_sha: 'm2', steps: [{ name: 'Run bun run test', conclusion: 'failure' }] },
    { id: 902, run_id: 900, name: 'lint', conclusion: 'success', completed_at: ago(hours(3)), head_sha: 'm2' },
  ] });

  const service = new GithubService(config, db, dispatch as never, { tokens: fakeTokens(config.github.accounts), fetch: gh.fetch, now: () => NOW });
  return { gh, service, config, db, dispatch, prs };
}
