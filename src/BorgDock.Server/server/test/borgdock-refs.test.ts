import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRefs } from '../src/borgdock/queries.ts';

const pr = (owner: string, repo: string, number: number, extra: object = {}) => ({
  key: `${owner}/${repo}#${number}`, owner, repo, number, title: `${repo} change ${number}`, url: `https://github.com/${owner}/${repo}/pull/${number}`,
  isDraft: false, state: 'open', reviewDecision: null, checks: { failed: 0, pending: 0 }, ...extra,
});
const platform = {
  deps: {
    config: { ado: { orgUrl: 'https://dev.azure.com/acme' } },
    github: { pullRequests: [pr('acme', 'shop', 3712, { checks: { failed: 2, pending: 0 } }), pr('borght-dev', 'BorgDock', 108, { reviewDecision: 'approved' })] },
    service: {
      fleet: null,
      overview: { items: [{ item: { id: 61021, title: 'Basket empties', state: 'Code Review', url: 'https://dev.azure.com/acme/_workitems/edit/61021' }, walk: { verdict: { label: 'CI red', tone: 'bad' } } }] },
    },
  },
} as any;

test('refs resolve in the long forms and the short forms notes write, keyed as sent', () => {
  const result = resolveRefs(platform, ['gh:github.com/acme/shop#3712', 'ado:acme#61021', 'AB#61021', 'shop#3712', 'borght-dev/borgdock#108', 'BorgDock#999', 'AB#1']);
  assert.deepEqual(Object.keys(result).sort(), ['AB#1', 'AB#61021', 'BorgDock#999', 'ado:acme#61021', 'borght-dev/borgdock#108', 'gh:github.com/acme/shop#3712', 'shop#3712'].sort());
  assert.equal(result['gh:github.com/acme/shop#3712'].tone, 'bad');
  assert.equal(result['shop#3712'].title, 'shop change 3712');
  assert.equal(result['shop#3712'].live, true);
  assert.equal(result['AB#61021'].title, 'Basket empties');
  assert.equal(result['AB#61021'].tone, 'bad');
  assert.deepEqual(result['ado:acme#61021'], result['AB#61021']);
  assert.equal(result['borght-dev/borgdock#108'].tone, 'ok', 'owner/repo matches case-insensitively');
  assert.deepEqual(result['BorgDock#999'], { title: 'BorgDock#999', state: 'unknown', tone: 'mute', url: null, live: false });
  assert.equal(result['AB#1'].live, false);
  assert.equal(result['AB#1'].url, 'https://dev.azure.com/acme/_workitems/edit/1');
});
