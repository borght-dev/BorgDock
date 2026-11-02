import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubClient, type TokenSource } from '../src/github/client.ts';
import { FakeGithub } from './github-fixtures/fake.ts';

/** A token gh hands out until it is told the token was refused; then it hands out `next`. */
function rotatingTokens(first: string, next: string): TokenSource & { forgotten: number } {
  let current = first;
  return {
    forgotten: 0,
    accounts: async () => ['koen'],
    token: async () => current,
    forget() {
      this.forgotten++;
      current = next;
    },
  };
}

test('a refused token is asked of gh again once, and the call goes through', async () => {
  const gh = new FakeGithub();
  gh.onRest('GET', /\/user$/, (r) => (r.headers.authorization === 'Bearer fresh' ? { body: { login: 'koen' } } : { status: 401, body: { message: 'Bad credentials' } }));
  const tokens = rotatingTokens('stale', 'fresh');
  const user = await new GithubClient('koen', tokens, gh.fetch).rest<{ login: string }>('GET', '/user');
  assert.equal(user.login, 'koen');
  assert.deepEqual(gh.requests('GET', /\/user$/).map((r) => r.headers.authorization), ['Bearer stale', 'Bearer fresh']);
});

test('a token gh keeps handing out refused fails after one retry', async () => {
  const gh = new FakeGithub();
  gh.onRest('GET', /\/user$/, () => ({ status: 401, body: { message: 'Bad credentials' } }));
  const tokens = rotatingTokens('stale', 'still-stale');
  await assert.rejects(new GithubClient('koen', tokens, gh.fetch).rest('GET', '/user'), /rejected the token/);
  assert.equal(gh.requests('GET', /\/user$/).length, 2);
  assert.equal(tokens.forgotten, 1);
});
