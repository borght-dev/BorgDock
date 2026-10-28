import { describe, expect, it } from 'vitest';
import { makeSignal } from '../__fixtures__/evidence';
import { candidateReasons, type FingerprintContext, fingerprintOf, hashText } from '../fingerprint';
import { isGenericText, normalizePath, normalizeText, splitTestParams } from '../normalize';

const context: FingerprintContext = {
  failedStep: 'Run bun run test',
  workflowPath: '.github/workflows/ci.yml',
};

function test(overrides: Parameters<typeof makeSignal>[0]) {
  return makeSignal({ kind: 'test', parser: 'vitest', ...overrides });
}

function fingerprint(signal: ReturnType<typeof makeSignal>, ctx: FingerprintContext = context) {
  const result = fingerprintOf(signal, ctx);
  if (!result) throw new Error('no fingerprint');
  return result;
}

describe('normalize', () => {
  it('makes runner paths repository-relative on every OS', () => {
    expect(normalizePath('/home/runner/work/fsp/fsp/src/a.ts')).toBe('src/a.ts');
    expect(normalizePath('/Users/runner/work/fsp/fsp/src/a.ts')).toBe('src/a.ts');
    expect(normalizePath('D:\\a\\fsp\\fsp\\src\\a.ts')).toBe('src/a.ts');
    expect(normalizePath('C:\\actions-runner\\_work\\fsp\\fsp\\src\\a.ts')).toBe('src/a.ts');
    expect(normalizePath('./src/a.ts')).toBe('src/a.ts');
  });

  it('replaces what differs between runs and keeps what tells failures apart', () => {
    expect(normalizeText('Timeout of 5000ms exceeded after 12.5 s')).toBe(
      'Timeout of <dur> exceeded after <dur>',
    );
    expect(normalizeText('wrote /tmp/vitest-3fa9/out.json at 2026-10-26T10:00:00.123Z')).toBe(
      'wrote <tmp>/out.json at <time>',
    );
    expect(
      normalizeText(
        'id 3f2504e0-4f89-11d3-9a0c-0305e82c3301 sha 9fceb02d0ae598e95dc970b74767f19372d61af8',
      ),
    ).toBe('id <guid> sha <id>');
    expect(normalizeText('connect ECONNREFUSED 127.0.0.1:54123')).toBe(
      'connect ECONNREFUSED 127.0.0.1:<port>',
    );
    expect(normalizeText('connect ECONNREFUSED 127.0.0.1:5432')).toBe(
      'connect ECONNREFUSED 127.0.0.1:5432',
    );
    expect(normalizeText('Expected: 200 Received: 503')).toBe('Expected: 200 Received: 503');
  });

  it('splits test parameters from the test identity', () => {
    expect(splitTestParams('Pays(card: "visa")')).toEqual({
      testId: 'Pays',
      params: 'card: "visa"',
    });
    expect(splitTestParams('test_add[3-4]')).toEqual({ testId: 'test_add', params: '3-4' });
    expect(splitTestParams('Plain test')).toEqual({ testId: 'Plain test', params: null });
  });

  it('knows text that only says something failed', () => {
    expect(isGenericText('Process completed with exit code 1.')).toBe(true);
    expect(isGenericText('Error: timeout of 30000ms exceeded')).toBe(true);
    expect(isGenericText('connect ECONNREFUSED 127.0.0.1:5432')).toBe(true);
    expect(isGenericText("Error: Cannot find module './payments/client'")).toBe(false);
  });

  it('replaces generated ids so the same failure matches across runs', () => {
    expect(normalizeText('did not calculate travel for order ORD-20261026154755-6362cdef')).toBe(
      normalizeText('did not calculate travel for order ORD-20261025231455-24676203'),
    );
    expect(normalizeText('order ORD-20261026154755-6362cdef')).toBe('order ORD-<id>-<id>');
    expect(normalizeText('commit 1a2b3c4 broke it')).toBe('commit 1a2b3c4 broke it');
    expect(normalizeText('Expected: 200 Received: 503')).toBe('Expected: 200 Received: 503');
  });

  it('hashes stably', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
    expect(hashText('abc')).toHaveLength(14);
  });
});

describe('fingerprintOf', () => {
  it('groups parameter variants of one test with the same failure', () => {
    const a = fingerprint(
      test({ testId: 'checkout > pays(visa)', message: 'expected 200 to be 503' }),
    );
    const b = fingerprint(
      test({ testId: 'checkout > pays(amex)', message: 'expected 200 to be 503' }),
    );
    expect(a.value).toBe(b.value);
    expect(a.tier).toBe('high');
    expect(a.title).toBe('checkout > pays');
  });

  it('keeps a long title whole, on one line', () => {
    const testId =
      'tests/planboard/planboard-drag-create-engineer-address.spec.ts › Planboard drag-create\n  with an engineer address keeps the address';
    expect(fingerprint(test({ testId, message: 'boom' })).title).toBe(testId.replace(/\s+/g, ' '));
    expect(fingerprint(test({ testId: 'x'.repeat(300), message: 'boom' })).title).toHaveLength(240);
  });

  it('ignores matrix values, durations and temp paths, but not assertion values', () => {
    const base = { testId: 'api.spec.ts › health', errorClass: 'AssertionError' };
    const linux = fingerprint(
      test({
        ...base,
        message: 'expected 503 in 1200ms /tmp/a1/x',
        expected: '200',
        actual: '503',
      }),
    );
    const windows = fingerprint(
      test({ ...base, message: 'expected 503 in 980ms /tmp/b7/x', expected: '200', actual: '503' }),
      { ...context, failedStep: 'Run bun run test' },
    );
    const otherValue = fingerprint(
      test({
        ...base,
        message: 'expected 503 in 1200ms /tmp/a1/x',
        expected: '200',
        actual: '404',
      }),
    );
    expect(linux.value).toBe(windows.value);
    expect(otherValue.value).not.toBe(linux.value);
  });

  it('keeps generic text low and never groups it', () => {
    const timeout = fingerprint(
      makeSignal({
        kind: 'generic',
        parser: 'generic',
        message: 'Error: Process completed with exit code 1.',
      }),
    );
    expect(timeout.tier).toBe('low');
  });

  it('turns known infrastructure faults into catalog fingerprints, step included', () => {
    const install = fingerprint(
      makeSignal({
        kind: 'generic',
        parser: 'generic',
        message: 'npm ERR! getaddrinfo ENOTFOUND registry.npmjs.org',
      }),
      { ...context, failedStep: 'Run bun install' },
    );
    const e2e = fingerprint(
      makeSignal({
        kind: 'generic',
        parser: 'generic',
        message: 'Error: getaddrinfo EAI_AGAIN api.example.com',
      }),
      { ...context, failedStep: 'Run e2e' },
    );
    const installAgain = fingerprint(
      makeSignal({
        kind: 'tooling',
        parser: 'npm',
        code: 'EAI_AGAIN',
        message: 'getaddrinfo EAI_AGAIN registry.npmjs.org',
      }),
      { ...context, failedStep: 'Run bun install' },
    );
    expect(install.value).toBe('infra:dns:Run bun install:.github/workflows/ci.yml');
    expect(install.value).toBe(installAgain.value);
    expect(install.value).not.toBe(e2e.value);
    expect(install.tier).toBe('high');
    expect(candidateReasons(install.facets, e2e.facets)).toEqual([
      'Same infrastructure error in a different step',
    ]);
  });

  it('trusts an infrastructure match without a step only as medium', () => {
    const external = fingerprint(
      makeSignal({
        kind: 'check-output',
        parser: 'check-output',
        message: 'No space left on device',
      }),
      { failedStep: null, workflowPath: null },
    );
    expect(external.tier).toBe('medium');
  });

  it('treats a startup failure as a runner that never came', () => {
    const startup = fingerprint(
      makeSignal({ kind: 'generic', parser: 'generic', message: 'failed' }),
      {
        ...context,
        conclusion: 'startup_failure',
      },
    );
    expect(startup.facets.catalogId).toBe('not-acquired');
  });

  it('fingerprints compile errors by code, file and message', () => {
    const a = fingerprint(
      makeSignal({
        code: 'TS2322',
        path: '/home/runner/work/app/app/src/api.ts',
        line: 4,
        message: "Type 'string' is not assignable to type 'number'.",
      }),
    );
    const b = fingerprint(
      makeSignal({
        code: 'TS2322',
        path: 'D:\\a\\app\\app\\src\\api.ts',
        line: 9,
        message: "Type 'string' is not assignable to type 'number'.",
      }),
    );
    const c = fingerprint(
      makeSignal({
        code: 'TS2322',
        path: 'src/api.ts',
        message: "Type 'null' is not assignable to type 'number'.",
      }),
    );
    expect(a.value).toBe(b.value);
    expect(a.title).toBe('TS2322 in src/api.ts');
    expect(c.value).not.toBe(a.value);
    expect(candidateReasons(a.facets, c.facets)).toEqual([
      'Same error code and file, different message',
    ]);
  });

  it('suggests the same test with a different message, never merges it', () => {
    const a = fingerprint(test({ testId: 'checkout', message: 'expected 200 to be 503' }));
    const b = fingerprint(test({ testId: 'checkout', message: 'element not found: #pay' }));
    expect(a.value).not.toBe(b.value);
    expect(candidateReasons(a.facets, b.facets)).toEqual(['Same test, different message']);
  });

  it('has nothing to say about unrelated failures', () => {
    const a = fingerprint(test({ testId: 'checkout', message: 'expected 200 to be 503' }));
    const b = fingerprint(makeSignal({ code: 'TS2322', path: 'src/api.ts', message: 'x' }));
    expect(candidateReasons(a.facets, b.facets)).toBeNull();
  });

  it('trusts text the generic fallback found only as medium', () => {
    const text = fingerprint(
      makeSignal({
        kind: 'generic',
        parser: 'generic',
        message: "Error: Cannot find module './client'",
      }),
    );
    expect(text.tier).toBe('medium');
    expect(text.value.startsWith('text:')).toBe(true);
  });

  it('skips test-run totals', () => {
    expect(fingerprintOf(makeSignal({ kind: 'summary', message: '3 failed' }), context)).toBeNull();
  });
});
