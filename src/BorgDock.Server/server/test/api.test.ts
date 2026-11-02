import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/api/app.ts';
import { GithubService } from '../src/github/service.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { Notifier } from '../src/push/notifier.ts';
import { Sessions } from '../src/auth/sessions.ts';
import { DeviceKeys } from '../src/borgdock/devices.ts';
import { deviceKey, signedHeaders } from './borgdock-helpers.ts';

const ORIGIN = 'https://dispatch.test';

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'dispatch-api-'));
  const config = loadConfig({ DISPATCH_DATA_DIR: dataDir, DISPATCH_ORIGIN: ORIGIN });
  const db = openDb(dataDir);
  const notifier = new Notifier(config, db);
  const started: unknown[] = [];
  const service = Object.assign(new EventEmitter(), {
    queue: () => {},
    syncNow: async () => ({ generatedAt: 'fresh', items: [], unlinkedThreads: [], worktrees: [], sources: {} }),
    overview: { generatedAt: 'now', items: [], unlinkedThreads: [], worktrees: [], sources: {} },
    ado: { me: async () => ({ name: 'Koen', email: 'koen@example.test' }) },
    startThread: async (request: unknown) => {
      started.push(request);
      return { threadId: 't1', link: 'x', adoState: null, warning: null };
    },
  });
  const github = new GithubService(config, db, service as any);
  const { app, setupCodes } = createApp({ config, db, service: service as any, notifier, github });
  const sessions = new Sessions(db);
  return { app, db, setupCodes, sessions, started };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('data needs a session', async () => {
  const { app } = setup();
  assert.equal((await app.request('/api/overview')).status, 401);
  assert.equal((await app.request('/api/config')).status, 401);
});

test('a bearer token opens the API, and writes need no browser headers', async () => {
  const { app, db, sessions, started } = setup();
  const { token, session } = sessions.create({ kind: 'app', name: 'iPhone', passkeyId: null, via: 'local' });
  const key = deviceKey();
  new DeviceKeys(db).bind(session.id, key.publicKey, null);
  const auth = { authorization: `Bearer ${token}` };
  assert.equal((await app.request('/api/overview', { headers: auth })).status, 200);
  // Starting an agent also needs the device's signature.
  assert.equal((await app.request(post('/api/threads', { itemId: 1 }, auth))).status, 403);
  const signed = { ...auth, ...signedHeaders(key.privateKey, 'POST', '/api/threads', JSON.stringify({ itemId: 1 })) };
  const response = await app.request(post('/api/threads', { itemId: 1 }, signed));
  assert.equal(response.status, 200);
  assert.equal(started.length, 1);
});

test('browser writes without our header or from another origin are blocked', async () => {
  const { app } = setup();
  assert.equal((await app.request(post('/api/auth/login/options', {}))).status, 403);
  assert.equal((await app.request(post('/api/auth/login/options', {}, { 'x-dispatch-intent': '1', origin: 'https://evil.test' }))).status, 403);
  assert.equal((await app.request(post('/api/auth/login/options', {}, { 'x-dispatch-intent': '1', 'sec-fetch-site': 'cross-site' }))).status, 403);
  const ok = await app.request(post('/api/auth/login/options', {}, { 'x-dispatch-intent': '1', origin: ORIGIN }));
  assert.equal(ok.status, 200);
  assert.ok(((await ok.json()) as any).challengeId);
});

test('registering a passkey without a session needs a valid setup code', async () => {
  const { app, setupCodes } = setup();
  const headers = { 'x-dispatch-intent': '1', origin: ORIGIN };
  assert.equal((await app.request(post('/api/auth/register/options', {}, headers))).status, 403);
  assert.equal((await app.request(post('/api/auth/register/options', { setupCode: 'AAAAA-AAAAA' }, headers))).status, 403);
  const { code } = setupCodes.create();
  const response = await app.request(post('/api/auth/register/options', { setupCode: code }, headers));
  assert.equal(response.status, 200);
  const { options } = (await response.json()) as any;
  assert.equal(options.rp.id, 'dispatch.test');
  assert.equal(options.authenticatorSelection.userVerification, 'required');
});

test('sign-in endpoints are rate limited per client', async () => {
  const { app } = setup();
  const headers = { 'x-dispatch-intent': '1', 'x-forwarded-for': '203.0.113.7', 'tailscale-funnel-request': '?1' };
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await app.request(post('/api/auth/login/options', {}, headers))).status;
  assert.equal(last, 429);
});

test('a forged app sign-in code is refused', async () => {
  const { app } = setup();
  const response = await app.request(post('/api/auth/app/token', { code: 'guess', codeVerifier: 'x'.repeat(43), deviceName: 'x' }, { 'x-dispatch-intent': '1' }));
  assert.equal(response.status, 400);
});

test('responses carry strict security headers', async () => {
  const { app } = setup();
  const response = await app.request('/api/health');
  assert.match(response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('signing out revokes the session', async () => {
  const { app, sessions } = setup();
  const { token } = sessions.create({ kind: 'app', name: 'iPhone', passkeyId: null, via: 'local' });
  const auth = { authorization: `Bearer ${token}` };
  assert.equal((await app.request(post('/api/auth/logout', {}, auth))).status, 200);
  assert.equal((await app.request('/api/overview', { headers: auth })).status, 401);
});

test('request bodies over 64 KB are refused before parsing', async () => {
  const { app } = setup();
  const response = await app.request(post('/api/auth/login/verify', { junk: 'x'.repeat(100_000) }, { 'x-dispatch-intent': '1' }));
  assert.equal(response.status, 413);
});

test('an Authorization header never falls back to the session cookie', async () => {
  const { app, sessions } = setup();
  const { token } = sessions.create({ kind: 'browser', name: 'Mac', passkeyId: 'pk', via: 'local' });
  const cookie = `__Host-dispatch=${token}`;
  assert.equal((await app.request('/api/overview', { headers: { cookie } })).status, 200);
  assert.equal((await app.request('/api/overview', { headers: { cookie, authorization: 'Basic eDp4' } })).status, 401);
  const forged = await app.request(post('/api/queue/1', {}, { cookie, authorization: 'Basic eDp4', origin: 'https://evil.test' }));
  assert.equal(forged.status, 403);
});

test('phone app sign-in and passkey changes need a recent passkey check', async () => {
  const { app, sessions, db } = setup();
  const challenge = 'A'.repeat(43);
  const app1 = sessions.create({ kind: 'app', name: 'iPhone', passkeyId: 'pk', via: 'local' });
  const asApp = { authorization: `Bearer ${app1.token}` };
  const refused = await app.request(post('/api/auth/app/code', { codeChallenge: challenge }, asApp));
  assert.equal(refused.status, 403);
  assert.equal(((await refused.json()) as any).reverify, true);

  const browser = sessions.create({ kind: 'browser', name: 'Mac', passkeyId: 'pk', via: 'local' });
  const asBrowser = { authorization: `Bearer ${browser.token}` };
  assert.equal((await app.request(post('/api/auth/app/code', { codeChallenge: challenge }, asBrowser))).status, 200, 'fresh sign-in counts');
  db.prepare('UPDATE sessions SET verified_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', browser.session.id);
  assert.equal((await app.request(post('/api/auth/app/code', { codeChallenge: challenge }, asBrowser))).status, 403, 'stale check refused');
  assert.equal((await app.request(new Request(`${ORIGIN}/api/auth/passkeys/pk`, { method: 'DELETE', headers: asBrowser }))).status, 403);
  assert.equal((await app.request(post('/api/auth/register/options', {}, asBrowser))).status, 403);
});

test('wrong setup codes lock out only the client that sent them', async () => {
  const { app, setupCodes } = setup();
  const from = (ip: string) => ({ 'x-dispatch-intent': '1', 'x-forwarded-for': ip, 'tailscale-funnel-request': '?1' });
  for (let i = 0; i < 10; i++) await app.request(post('/api/auth/register/options', { setupCode: 'WRONG-WRONG' }, from('198.51.100.1')));
  const { code } = setupCodes.create();
  assert.equal((await app.request(post('/api/auth/register/options', { setupCode: code }, from('198.51.100.1')))).status, 429);
  assert.equal((await app.request(post('/api/auth/register/options', { setupCode: code }, from('198.51.100.2')))).status, 200);
});

test('a setup code is spent by the first registration attempt, even a failed one', async () => {
  const { app, setupCodes } = setup();
  const { code } = setupCodes.create();
  const headers = { 'x-dispatch-intent': '1' };
  const attempt = await app.request(post('/api/auth/register/verify', { setupCode: code, challengeId: 'nope', response: {}, passkeyName: 'x', deviceName: 'x' }, headers));
  assert.equal(attempt.status, 400);
  assert.equal((await app.request(post('/api/auth/register/options', { setupCode: code }, headers))).status, 403);
});

test('push subscriptions must point at a real push service', async () => {
  const { app, sessions } = setup();
  const { token } = sessions.create({ kind: 'app', name: 'x', passkeyId: null, via: 'local' });
  const auth = { authorization: `Bearer ${token}` };
  const keys = { p256dh: 'k', auth: 'a' };
  assert.equal((await app.request(post('/api/push/web', { subscription: { endpoint: 'https://192.168.1.20/steal', keys } }, auth))).status, 400);
  assert.equal((await app.request(post('/api/push/web', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys } }, auth))).status, 200);
});

test('pull to refresh returns a freshly synced overview, signed in only', async () => {
  const { app, sessions } = setup();
  assert.equal((await app.request(post('/api/refresh', {}, { 'x-dispatch-intent': '1' }))).status, 401);
  const { token } = sessions.create({ kind: 'app', name: 'iPhone', passkeyId: null, via: 'local' });
  const response = await app.request(post('/api/refresh', {}, { authorization: `Bearer ${token}` }));
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as any).generatedAt, 'fresh');
});

test('a passkey sign-in in the phone app binds its device key, so signed commands work', async () => {
  const { app, sessions, db } = setup();
  const verifier = 'v'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const browser = sessions.create({ kind: 'browser', name: 'Mac', passkeyId: 'pk', via: 'local' });
  const issued = await app.request(post('/api/auth/app/code', { codeChallenge: challenge }, { authorization: `Bearer ${browser.token}` }));
  const { code } = (await issued.json()) as any;
  const key = deviceKey();
  const exchanged = await app.request(post('/api/auth/app/token', { code, codeVerifier: verifier, deviceName: 'iPhone', devicePublicKey: key.publicKey }, { 'x-dispatch-intent': '1' }));
  assert.equal(exchanged.status, 200);
  const { token, sessionId } = (await exchanged.json()) as any;
  assert.equal(new DeviceKeys(db).keyOf(sessionId), key.publicKey);
  const auth = { authorization: `Bearer ${token}` };
  const signed = { ...auth, ...signedHeaders(key.privateKey, 'POST', '/api/threads', JSON.stringify({ itemId: 1 })) };
  assert.equal((await app.request(post('/api/threads', { itemId: 1 }, signed))).status, 200);
});
