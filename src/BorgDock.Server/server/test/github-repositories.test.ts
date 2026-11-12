import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRepositories, involvementSearches, RepositorySettings, watchedRepositories } from '../src/github/repositories.ts';
import { rawPr, searchAnswer, type Seen } from './github-fixtures/fake.ts';
import { githubWorld } from './github-fixtures/world.ts';

const DESK = { sessionId: 'desk-1', name: 'Work laptop' };
/** The repository a search reads, lower-cased: GitHub ignores case. */
const repoOf = (r: Seen) => /repo:(\S+)/.exec(r.body.variables.query)?.[1].toLowerCase() ?? null;
const readerOf = (r: Seen) => /token-of-(\w+)-/.exec(r.headers.authorization)![1];
/** What GitHub answers a `repo:` search for a repository the account can't see: an empty result and an error on it. */
const cannotSee = (name: string) => ({ body: {
  data: searchAnswer([]),
  errors: [{ type: 'INVALID', path: ['found'], message: `The listed users and repositories cannot be searched either because the resources do not exist or you do not have permission to view them. (${name})` }],
} });

test('repository names: valid owner/repo only, each once whatever its case, the desktop first', () => {
  assert.deepEqual(cleanRepositories([' acme/shop ', 'Acme/Shop', 'not a repo', 'acme/', 42, 'globex/portal.web']), ['acme/shop', 'globex/portal.web']);
  assert.deepEqual(cleanRepositories('acme/shop'), []);
  assert.deepEqual(watchedRepositories(['globex/portal'], ['acme/shop', 'GLOBEX/portal']), ['globex/portal', 'acme/shop']);
});

test('the involvement searches follow the preferences', () => {
  assert.deepEqual(involvementSearches({ includeInvolving: true, includeTeamRequests: true }).map((q) => /\S+:@me/.exec(q)![0]), ['involves:@me', 'review-requested:@me', 'reviewed-by:@me']);
  assert.match(involvementSearches({ includeInvolving: true, includeTeamRequests: false })[1], /user-review-requested:@me/);
  assert.deepEqual(involvementSearches({ includeInvolving: false, includeTeamRequests: true }), []);
});

test('the desktop list and the preferences survive a restart; only booleans change a preference', () => {
  const { db } = githubWorld();
  const settings = new RepositorySettings(db);
  assert.equal(settings.setDesktop(['acme/shop'], DESK), true);
  assert.equal(settings.setDesktop(['acme/shop'], DESK), false, 'the same list again changes nothing');
  settings.setPreferences({ includeTeamRequests: false, includeInvolving: 'no' as never });
  const again = new RepositorySettings(db);
  assert.deepEqual(again.desktop()?.repositories, ['acme/shop']);
  assert.equal(again.desktop()?.desktopName, 'Work laptop');
  assert.deepEqual(again.preferences(), { includeInvolving: true, includeTeamRequests: false });
});

test('each watched repository is searched on its own, paged past 100, by the account that can read it', async () => {
  const { service, gh, config } = githubWorld({ accounts: ['koen', 'work'] });
  config.github.repos = ['acme/shop'];
  const teammate = Array.from({ length: 120 }, (_, i) => rawPr({ number: 200 + i, title: `Teammate change ${i}`, author: 'tom' }));
  const portal = rawPr({ number: 7, owner: 'globex', repo: 'portal', title: 'Partner portal sign-in', author: 'tom' });
  gh.onGraphql('FocusSearch', (r) => {
    const repo = repoOf(r);
    if (repo === 'globex/portal') return readerOf(r) === 'work' ? { body: { data: searchAnswer([portal]) } } : cannotSee(repo);
    if (repo === 'acme/shop') {
      const page = Number(r.body.variables.after ?? 0);
      return { body: { data: searchAnswer(teammate.slice(page * 20, page * 20 + 20), 'koen', page < 5 ? String(page + 1) : null) } };
    }
    return { body: { data: searchAnswer([]) } };
  });
  service.setDesktopRepositories(['globex/portal', 'ACME/shop'], DESK);
  const focus = (await service.refresh())!;

  assert.equal(focus.pullRequests.filter((p) => p.title.startsWith('Teammate change')).length, 120, 'six pages of twenty');
  const signIn = focus.pullRequests.find((p) => p.key === 'globex/portal#7')!;
  assert.equal(signIn.account, 'work');
  const repositories = service.repositories();
  assert.equal(repositories.source, 'desktop');
  assert.equal(repositories.desktopName, 'Work laptop');
  assert.deepEqual(repositories.repositories.map((r) => [r.name, r.open, r.ok]), [['globex/portal', 1, true], ['ACME/shop', 120, true]]);
  assert.equal(repositories.cutOff, false);
  assert.ok(repositories.polledAt);

  const before = gh.operations('FocusSearch').filter((r) => repoOf(r) === 'globex/portal').length;
  await service.refresh();
  assert.equal(gh.operations('FocusSearch').filter((r) => repoOf(r) === 'globex/portal').length, before, 'read a moment ago: it waits');
  await service.refresh({ repositories: true });
  const later = gh.operations('FocusSearch').filter((r) => repoOf(r) === 'globex/portal').slice(before);
  assert.deepEqual(later.map(readerOf), ['work'], 'the account that read it last reads it first');
});

test('a repository search that fails keeps its last answer and says why; past twenty pages it is cut off', async () => {
  const { service, gh, config } = githubWorld();
  config.github.repos = ['acme/shop', 'acme/huge'];
  let shopDown = false;
  gh.onGraphql('FocusSearch', (r) => {
    const repo = repoOf(r);
    if (repo === 'acme/shop') return shopDown ? { status: 502, body: { message: 'Server Error' } } : { body: { data: searchAnswer([rawPr({ number: 40, author: 'tom' })]) } };
    if (repo === 'acme/huge') {
      const page = Number(r.body.variables.after ?? 0);
      return { body: { data: searchAnswer([rawPr({ number: 1000 + page, repo: 'huge', author: 'tom' })], 'koen', String(page + 1)) } };
    }
    return { body: { data: searchAnswer([]) } };
  });
  await service.refresh();
  shopDown = true;
  const focus = (await service.refresh({ repositories: true }))!;
  assert.ok(focus.pullRequests.some((p) => p.key === 'acme/shop#40'), 'still listed from the read before');
  const repositories = service.repositories();
  assert.equal(repositories.source, 'config');
  assert.equal(repositories.desktopName, null);
  const shop = repositories.repositories.find((r) => r.name === 'acme/shop')!;
  assert.equal(shop.ok, false);
  assert.match(shop.error!, /koen: GitHub: Server Error/);
  assert.equal(shop.open, 1);
  assert.equal(repositories.repositories.find((r) => r.name === 'acme/huge')!.open, 20);
  assert.equal(repositories.cutOff, true);
});

test('without involving searches only the watched repositories are read; without team requests your teams never count', async () => {
  const { service, gh, config } = githubWorld();
  config.github.repos = ['acme/shop'];
  const teamAsk = rawPr({ number: 3, title: 'Cache the price list', author: 'tom', teams: ['platform'] });
  gh.onGraphql('FocusSearch', (r) => ({ body: { data: searchAnswer(repoOf(r) ? [teamAsk] : []) } }));
  await service.refresh();
  assert.equal(service.focus!.pullRequests.find((p) => p.number === 3)!.bucket, 'you', "a request to your team needs you");

  const updated = service.setRepositoryPreferences({ includeInvolving: false, includeTeamRequests: false });
  assert.deepEqual([updated.includeInvolving, updated.includeTeamRequests], [false, false]);
  const seen = gh.operations('FocusSearch').length;
  await service.refresh();
  assert.deepEqual(gh.operations('FocusSearch').slice(seen).map(repoOf), ['acme/shop']);
  assert.notEqual(service.focus!.pullRequests.find((p) => p.number === 3)!.bucket, 'you');

  service.setRepositoryPreferences({ includeInvolving: true });
  const next = gh.operations('FocusSearch').length;
  await service.refresh();
  assert.ok(gh.operations('FocusSearch').slice(next).some((r) => r.body.variables.query.includes('user-review-requested:@me')));
});
