import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extract, MAX_LINE_CHARS, MAX_SIGNALS } from '../src/github/ci/extract.ts';
import { fingerprintOf } from '../src/github/ci/fingerprint.ts';
import { buildGroups, checkFailureOf, groupIdOf, readFailure } from '../src/github/ci/groups.ts';
import { scrub } from '../src/github/ci/sanitize.ts';
import type { JobFailure } from '../src/github/store.ts';

// Sample logs from the desktop's src-tauri/src/ci_failures/fixtures/logs.
const log = (name: string) => readFileSync(new URL(`./github-fixtures/logs/${name}.txt`, import.meta.url), 'utf8');

test('vitest: the assertion, the test, and the source location', () => {
  const [first] = extract(log('vitest-failure'), null).signals;
  assert.equal(first.kind, 'test');
  assert.equal(first.parser, 'vitest');
  assert.equal(first.testId, 'src/services/__tests__/cart.test.ts > cart > applies the discount');
  assert.equal(first.message, 'AssertionError: expected 100 to be 90 // Object.is equality');
  assert.equal(first.errorClass, 'AssertionError');
  assert.equal(`${first.path}:${first.line}`, 'src/services/__tests__/cart.test.ts:24');
});

test('playwright: the totals first, each failed test once with its retries', () => {
  const { signals } = extract(log('playwright-retries'), null);
  assert.equal(signals[0].kind, 'summary');
  const failure = signals[1];
  assert.equal(failure.testId, 'tests/checkout.spec.ts › Checkout › applies a discount code');
  assert.equal(failure.params, 'chromium');
  assert.equal(failure.message, 'Error: expect(locator).toHaveText(expected) failed');
  assert.ok(failure.repeats > 1);
});

test('typescript, rustc, dotnet, npm and docker logs each name what failed', () => {
  const tsc = extract(log('tsc-errors'), null).signals[0];
  assert.deepEqual([tsc.parser, tsc.code, tsc.path, tsc.line], ['typescript', 'TS2322', 'src/services/cart.ts', 14]);
  const rustc = extract(log('rustc-compile-error'), null).signals[0];
  assert.deepEqual([rustc.parser, rustc.message], ['rustc', 'mismatched types']);
  const dotnet = extract(log('dotnet-xunit'), null).signals[0];
  assert.equal(dotnet.testId, 'Shop.Orders.Tests.PricingTests.Applies_volume_discount');
  assert.equal(dotnet.message, 'Assert.Equal() Failure: Values differ');
  const npm = extract(log('npm-e404'), null).signals[0];
  assert.deepEqual([npm.kind, npm.code], ['tooling', 'E404']);
  const docker = extract(log('docker-build-failure'), null).signals[0];
  assert.deepEqual([docker.parser, docker.path, docker.line], ['docker', 'Dockerfile', 9]);
  const cargo = extract(log('cargo-test-panic'), null).signals[0];
  assert.deepEqual([cargo.parser, cargo.errorClass], ['cargo-test', 'assert_eq']);
});

test('a log no parser knows falls back to its error line, inside the failed step', () => {
  const extraction = extract(log('network-generic'), 'Run node scripts/fetch-registry-metadata.mjs');
  assert.equal(extraction.stepFound, true);
  assert.equal(extraction.signals.length, 1);
  assert.equal(extraction.signals[0].message, 'Error: getaddrinfo ENOTFOUND registry.npmjs.org');
});

test('only the failed step is read: earlier steps\' errors did not fail the job', () => {
  const two = [
    '##[group]Run bun run lint', 'src/old.ts(1,1): error TS1005: x expected.', '##[endgroup]',
    '##[group]Run bun run test', 'src/app.ts(2,3): error TS2322: Type string is not assignable to type number.', '##[error]Process completed with exit code 1.',
    '##[group]Post job cleanup', 'error: something in cleanup',
  ].map((l) => `2026-10-31T10:00:00.0000000Z ${l}`).join('\n');
  assert.deepEqual(extract(two, 'Run bun run test').signals.map((s) => s.path), ['src/app.ts']);
  assert.deepEqual(extract(two, 'bun run test').signals.map((s) => s.path), ['src/app.ts']);
  assert.deepEqual(extract(two, null).signals.map((s) => s.path), ['src/old.ts', 'src/app.ts']);
});

test('signals are capped, clipped and the totals come first', () => {
  const lines = [' 3 failed', ...Array.from({ length: 40 }, (_, i) => `src/f${i}.ts(1,1): error TS2322: ${'x'.repeat(400)}`)];
  const { signals } = extract(lines.join('\n'), null);
  assert.equal(signals.length, MAX_SIGNALS);
  assert.equal([...signals[0].message].length, MAX_LINE_CHARS);
});

test('the sanitizer removes tokens, cookies, credentials in URLs and home folders', () => {
  assert.equal(scrub('token ghp_abcdefghijklmnopqrstuvwxyz0123456789 used'), 'token [REDACTED:github-token] used');
  assert.equal(scrub('Authorization: Bearer abc.def.ghi-123'), 'Authorization: [REDACTED]');
  assert.equal(scrub('Cookie: session=abc; other=def'), 'Cookie: [REDACTED]');
  assert.equal(scrub('git clone https://user:s3cret@github.com/a/b'), 'git clone https://[REDACTED]@github.com/a/b');
  assert.equal(scrub('https://x.blob.core.windows.net/a?sv=2021&sig=AbC%2Fdef&se=2026'), 'https://x.blob.core.windows.net/a?sv=2021&sig=[REDACTED]&se=2026');
  assert.equal(scrub('/Users/koen/dev/a.ts and /home/koen/a.ts'), '/Users/<user>/dev/a.ts and /home/<user>/a.ts');
  assert.equal(scrub('/home/runner/work/app/app/src/a.ts'), '/home/runner/work/app/app/src/a.ts');
  const ordinary = 'src/app.ts(12,5): error TS2322: Type string is not assignable to type number.\nExpected: 200 Received: 503';
  assert.equal(scrub(ordinary), ordinary);
});

test('the same failure on two runners has one fingerprint; a bare "failed" never groups', () => {
  const runA = 'FAIL  src/cart.test.ts > cart > total\nAssertionError: expected 100 to be 90 at /home/runner/work/shop/shop/src/cart.ts:12:5 in 34ms\n⎯⎯⎯';
  const runB = 'FAIL  src/cart.test.ts > cart > total\nAssertionError: expected 100 to be 90 at /Users/runner/work/shop/shop/src/cart.ts:12:5 in 51ms\n⎯⎯⎯';
  const a = readFailure(runA, null, 'CI');
  const b = readFailure(runB, null, 'CI');
  assert.equal(a.tier, 'high');
  assert.equal(a.fingerprint, b.fingerprint);
  const generic = extract('Error: the deploy failed', null).signals[0];
  assert.equal(fingerprintOf(generic, { failedStep: 'Deploy', workflowPath: null })?.tier, 'low');
});

const failure = (o: Partial<JobFailure> & { jobId: number }): JobFailure => {
  const read = readFailure(log('vitest-failure'), 'Run bun run test', 'CI');
  return {
    repo: 'acme/shop', runId: o.jobId * 10, headSha: 'sha', branch: 'feat/x', prKey: 'acme/shop#1', checkName: 'test', workflow: 'CI', failedStep: 'Run bun run test',
    failedAt: '2026-10-31T10:00:00Z', readAt: '2026-10-31T10:05:00Z', status: 'read', error: null, ...read, ...o,
  };
};

test('one group per fingerprint across pull requests and the base branch, base first with its suspect', () => {
  const jobs = [
    failure({ jobId: 1, branch: 'main', prKey: null, failedAt: '2026-10-30T09:00:00Z', headSha: 'm1' }),
    failure({ jobId: 2, prKey: 'acme/shop#1', failedAt: '2026-10-31T09:00:00Z' }),
    failure({ jobId: 3, prKey: 'acme/shop#2', branch: 'feat/y', failedAt: '2026-10-31T11:00:00Z' }),
    // An attempt that has since been rerun green, and a closed pull request: neither is live.
    failure({ jobId: 4, prKey: 'acme/shop#1', failedAt: '2026-10-29T09:00:00Z' }),
    failure({ jobId: 5, prKey: 'acme/shop#9' }),
  ];
  const claims = new Map([[groupIdOf(jobs[0].fingerprint!), { by: { login: 'mira', name: 'Mira', avatarUrl: null }, at: '2026-10-31T11:30:00Z', note: 'on it' }]]);
  const groups = buildGroups(jobs, {
    openPrs: new Map([['acme/shop#1', { title: 'Totals', failingJobs: new Set([2]) }], ['acme/shop#2', { title: 'Discounts', failingJobs: new Set([3]) }]]),
    baseBranches: new Map([['acme/shop:main', { suspect: { sha: 'm1', message: 'Round totals' }, runIds: new Set([10]) }]]),
    claims,
  });
  assert.equal(groups.length, 1);
  const [group] = groups;
  assert.equal(group.failures, 3);
  assert.equal(group.firstFailedAt, '2026-10-30T09:00:00Z');
  assert.equal(group.lastFailedAt, '2026-10-31T11:00:00Z');
  assert.deepEqual(group.branches.map((b) => b.prKey ?? b.branch), ['main', 'acme/shop#1', 'acme/shop#2']);
  assert.deepEqual(group.branches[0].suspect, { sha: 'm1', message: 'Round totals' });
  assert.match(group.signal, /^AssertionError: expected 100 to be 90/);
  assert.equal(group.location, 'src/services/__tests__/cart.test.ts:24');
  assert.equal(group.claim?.note, 'on it');

  const onPr = checkFailureOf(jobs[1], groups, () => '2026-10-30T08:00:00Z');
  assert.equal(onPr.groupId, group.id);
  assert.equal(onPr.newInThisPr, false);
  assert.deepEqual(onPr.alsoOnBase, { since: '2026-10-30T08:00:00Z', claimedBy: { login: 'mira', name: 'Mira', avatarUrl: null } });
  assert.equal(onPr.step, 'Run bun run test');
  assert.equal(onPr.summary, 'AssertionError: expected 100 to be 90 // Object.is equality');
  assert.ok(onPr.snippet?.includes('expected 100 to be 90'));
});

test('a failure only this pull request has is new in it; an unreadable log says why', () => {
  const only = failure({ jobId: 7 });
  const groups = buildGroups([only], { openPrs: new Map([['acme/shop#1', { title: 'x', failingJobs: new Set([7]) }]]), baseBranches: new Map(), claims: new Map() });
  const view = checkFailureOf(only, groups);
  assert.equal(view.newInThisPr, true);
  assert.equal(view.alsoOnBase, null);
  const missing = checkFailureOf(failure({ jobId: 8, status: 'unavailable', error: 'GitHub has no log for this job.', signals: [], fingerprint: null, tier: null }), groups);
  assert.deepEqual([missing.summary, missing.snippet, missing.groupId], ['GitHub has no log for this job.', null, null]);
});
