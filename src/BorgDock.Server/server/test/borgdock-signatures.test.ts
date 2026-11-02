import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { Env } from '../src/api/context.ts';
import { canonicalString, signatureCheck, signedRequest, verifySignature, type SignedEnvelope } from '../src/auth/signatures.ts';
import { deviceKey, signedHeaders } from './borgdock-helpers.ts';
import { Sessions } from '../src/auth/sessions.ts';
import { DeviceKeys } from '../src/borgdock/devices.ts';
import { openDb } from '../src/db.ts';

function setup() {
  const db = openDb(mkdtempSync(join(tmpdir(), 'bd-sig-')));
  const sessions = new Sessions(db);
  const { session } = sessions.create({ kind: 'app', name: 'iPhone', passkeyId: null, via: 'local' });
  const key = deviceKey();
  new DeviceKeys(db).bind(session.id, key.publicKey, 'user_1');
  const seen: (SignedEnvelope | undefined)[] = [];
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('session', c.req.header('x-test-session') === 'none' ? null : { ...session, extended: false });
    c.set('via', 'local');
    c.set('ip', null);
    await next();
  });
  // A dummy signed route, like the GitHub slice's merge and review routes.
  app.post('/api/prs/o/r/1/merge', signatureCheck(db), async (c) => {
    seen.push(signedRequest.getStore());
    return c.json({ body: await c.req.json() });
  });
  const call = (headers: Record<string, string>, body = '{"method":"squash"}') =>
    app.request('/api/prs/o/r/1/merge', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  return { call, key, seen };
}

test('a signed command goes through and the route still reads its body', async () => {
  const { call, key, seen } = setup();
  const body = '{"method":"squash"}';
  const response = await call(signedHeaders(key.privateKey, 'POST', '/api/prs/o/r/1/merge', body), body);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { body: { method: 'squash' } });
  assert.equal(seen[0]?.path, '/api/prs/o/r/1/merge');
});

test('unsigned, wrongly signed, stale or tampered commands are refused', async () => {
  const { call, key } = setup();
  const body = '{"method":"squash"}';
  const unsigned = await call({}, body);
  assert.equal(unsigned.status, 403);
  assert.equal(((await unsigned.json()) as any).signatureRequired, true);

  const other = deviceKey();
  assert.equal((await call(signedHeaders(other.privateKey, 'POST', '/api/prs/o/r/1/merge', body), body)).status, 403);

  const stale = new Date(Date.now() - 3 * 60_000).toISOString();
  assert.equal((await call(signedHeaders(key.privateKey, 'POST', '/api/prs/o/r/1/merge', body, { signedAt: stale }), body)).status, 403);

  const forBody = signedHeaders(key.privateKey, 'POST', '/api/prs/o/r/1/merge', body);
  assert.equal((await call(forBody, '{"method":"merge"}')).status, 403, 'the body is part of the signature');

  const forPath = signedHeaders(key.privateKey, 'POST', '/api/prs/o/r/2/merge', body);
  assert.equal((await call(forPath, body)).status, 403, 'the path is part of the signature');

  assert.equal((await call({ ...signedHeaders(key.privateKey, 'POST', '/api/prs/o/r/1/merge', body), 'x-test-session': 'none' }, body)).status, 401);
});

test('a nonce works once', async () => {
  const { call, key } = setup();
  const body = '{}';
  const headers = signedHeaders(key.privateKey, 'POST', '/api/prs/o/r/1/merge', body);
  assert.equal((await call(headers, body)).status, 200);
  assert.equal((await call(headers, body)).status, 403);
});

test('a session without a device key cannot sign', async () => {
  const db = openDb(mkdtempSync(join(tmpdir(), 'bd-sig-')));
  const { session } = new Sessions(db).create({ kind: 'browser', name: 'Safari', passkeyId: 'p', via: 'local' });
  const app = new Hono<Env>();
  app.use('*', async (c, next) => { c.set('session', { ...session, extended: false }); c.set('via', 'local'); c.set('ip', null); await next(); });
  app.post('/api/threads', signatureCheck(db), (c) => c.json({ ok: true }));
  const key = deviceKey();
  const response = await app.request('/api/threads', { method: 'POST', headers: signedHeaders(key.privateKey, 'POST', '/api/threads', ''), body: '' });
  assert.equal(response.status, 403);
});

test('WebCrypto-style r‖s signatures verify too; garbage keys never do', () => {
  const key = deviceKey();
  const envelope = { method: 'POST', path: '/api/agents/launch', signedAt: new Date().toISOString(), nonce: 'n'.repeat(16), body: '{}', signature: '' };
  envelope.signature = sign('sha256', Buffer.from(canonicalString(envelope)), { key: key.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
  assert.equal(verifySignature(key.publicKey, envelope), true);
  assert.equal(verifySignature(Buffer.alloc(65, 1).toString('base64'), envelope), false);
  assert.throws(() => new DeviceKeys(openDb(mkdtempSync(join(tmpdir(), 'bd-sig-')))).bind('s', 'AAAA', null));
});
