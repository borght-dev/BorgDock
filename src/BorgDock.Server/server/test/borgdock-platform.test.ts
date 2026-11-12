import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { WebSocketServer } from 'ws';
import { createApp } from '../src/api/app.ts';
import { ClerkVerifier } from '../src/borgdock/clerk.ts';
import { ConnectorClient, type ConnectorState } from '../src/borgdock/connector-client.ts';
import { ActivityJournal } from '../src/borgdock/activity.ts';
import { DesktopLinks } from '../src/borgdock/desktops.ts';
import { pairingProof } from '../src/borgdock/connector-protocol.ts';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { GithubService } from '../src/github/service.ts';
import { Notifier } from '../src/push/notifier.ts';
import { DispatchService } from '../src/service.ts';
import type { T3Transport } from '../src/t3/client.ts';
import { deviceKey, signedHeaders } from './borgdock-helpers.ts';

const ISSUER_KEY = await generateKeyPair('RS256');
const OTHER_KEY = await generateKeyPair('RS256');
const JWK = { ...(await exportJWK(ISSUER_KEY.publicKey)), kid: 'k1', alg: 'RS256' };

async function clerkToken(sub: string, options: { issuer: string; key?: CryptoKey; exp?: number; nbf?: number | null }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ sid: 'sess_1' }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(sub).setIssuer(options.issuer).setIssuedAt()
    .setExpirationTime(options.exp ?? nowSeconds + 60);
  if (options.nbf !== null) jwt.setNotBefore(options.nbf ?? nowSeconds - 5);
  return jwt.sign(options.key ?? ISSUER_KEY.privateKey);
}

test('Clerk session tokens are checked against the JWKS: signature, iss, exp and nbf', async () => {
  const issuer = 'https://relevant-grouse.clerk.accounts.dev';
  const clerk = new ClerkVerifier({ publishableKey: 'pk', secretKey: 'sk', frontendApi: 'relevant-grouse.clerk.accounts.dev' }, { jwks: createLocalJWKSet({ keys: [JWK] }) });
  assert.equal(clerk.issuer, issuer);
  assert.deepEqual(await clerk.verify(await clerkToken('user_1', { issuer })), { userId: 'user_1', sessionId: 'sess_1' });
  const nowSeconds = Math.floor(Date.now() / 1000);
  await assert.rejects(clerk.verify(await clerkToken('user_1', { issuer, exp: nowSeconds - 60, nbf: nowSeconds - 120 })), /expired/);
  await assert.rejects(clerk.verify(await clerkToken('user_1', { issuer, nbf: nowSeconds + 120 })), /invalid/);
  await assert.rejects(clerk.verify(await clerkToken('user_1', { issuer, nbf: null })), /invalid/, 'nbf is required');
  await assert.rejects(clerk.verify(await clerkToken('user_1', { issuer: 'https://evil.clerk.accounts.dev' })), /invalid/);
  await assert.rejects(clerk.verify(await clerkToken('user_1', { issuer, key: OTHER_KEY.privateKey })), /invalid/);
  await assert.rejects(clerk.verify('not-a-token'), /invalid/);
});

/** Clerk's JWKS and Backend API, on loopback. */
async function fakeClerk(profiles: Record<string, object> = {}): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') return res.end(JSON.stringify({ keys: [JWK] }));
    const user = /^\/v1\/users\/(\w+)$/.exec(req.url ?? '')?.[1];
    if (user && req.headers.authorization === 'Bearer sk_test') {
      return res.end(JSON.stringify({ id: user, first_name: 'Koen', last_name: user === 'user_owner' ? 'van der Borght' : 'Other', username: null, image_url: null, primary_email_address_id: 'e1', email_addresses: [{ id: 'e1', email_address: `${user}@example.test` }], ...profiles[user] }));
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

const SHELL = {
  snapshotSequence: 1,
  projects: [{ id: 'p1', title: 'Shop', workspaceRoot: 'C:/src/shop', repositoryIdentity: { canonicalKey: 'github.com/acme/shop', displayName: 'acme/shop' } }],
  threads: [{ id: 't1', projectId: 'p1', title: 'Fix the basket', branch: 'fix/1', worktreePath: null, interactionMode: 'default', runtimeMode: 'full-access', createdAt: '2026-10-30T08:00:00Z', updatedAt: '2026-10-30T09:00:00Z', archivedAt: null, settledAt: null }],
};
const PROVIDERS = [{ instanceId: 'codex', driver: 'codex', enabled: true, installed: true, status: 'ready', models: [{ slug: 'gpt-6', name: 'GPT-6' }] }];

/** The machine behind the connector: answers reads and records what it was asked to run. */
function windowsT3() {
  const ran: { tag: string; payload: any }[] = [];
  const t3: T3Transport = {
    get: async (path) => (path === '/api/orchestration/shell' ? SHELL : { projection: { messages: [] } }) as any,
    rpc: async (tag, payload) => {
      if (tag === 'server.getConfig') return { environment: { environmentId: 'win-env' }, providers: PROVIDERS } as any;
      ran.push({ tag, payload });
      return {} as any;
    },
    dispatch: async () => ({ sequence: 0 }),
    close: () => {},
  };
  return { t3, ran };
}

function waitFor<T>(register: (resolve: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), 5000);
    register((value) => { clearTimeout(timer); resolve(value); });
  });
}

async function startServer(options: { profiles?: Record<string, object>; owners?: { emails: string[]; githubLogins: string[] } } = {}) {
  const clerk = await fakeClerk(options.profiles);
  const dataDir = mkdtempSync(join(tmpdir(), 'bd-platform-'));
  const config = loadConfig({ DISPATCH_DATA_DIR: dataDir, DISPATCH_ORIGIN: 'https://borgdock.test/borgdock' });
  config.t3 = { ...config.t3, baseUrl: 'http://127.0.0.1:9', environmentId: 'mac-env', label: 'Mac', stateDb: '' };
  config.clerk = { publishableKey: 'pk_test', secretKey: 'sk_test', frontendApi: clerk.url, backendApi: `${clerk.url}/v1` } as any;
  if (options.owners) config.owners = options.owners;
  const db = openDb(dataDir);
  const notifier = new Notifier(config, db);
  const service = new DispatchService(config, db, notifier);
  const github = new GithubService(config, db, service);
  const { app } = createApp({ config, db, service, notifier, github });
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1', websocket: { server: new WebSocketServer({ noServer: true }) } });
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, init: RequestInit & { json?: unknown } = {}) => fetch(`${url}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-dispatch-intent': '1', ...(init.headers as Record<string, string>) },
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
  const close = () => { server.close(); clerk.server.close(); service.stop(); };
  return { url, call, service, clerk, close, db };
}

/** A connector, paired or not, that hands back each pairing code it shows. */
function connector(url: string, options: { local?: boolean; id: string; t3?: T3Transport | null; state?: { current: ConnectorState } }) {
  const state = options.state ?? { current: { machineToken: null, trusted: [] } as ConnectorState };
  const pairings: { code: string; secret: string }[] = [];
  const listeners: ((p: { code: string; secret: string }) => void)[] = [];
  const paired: string[] = [];
  const client = new ConnectorClient({
    serverUrl: url, machine: { id: options.id, label: options.local ? 'Mac' : 'Windows', version: '0.1.0' }, t3: options.t3 ?? null, local: options.local,
    load: () => state.current, save: (next) => { state.current = next; },
    onPairing: (link) => {
      const params = new URL(link).searchParams;
      const pairing = { code: params.get('code')!, secret: params.get('secret')! };
      pairings.push(pairing);
      listeners.splice(0).forEach((l) => l(pairing));
    },
    onPaired: (device) => paired.push(device),
  });
  const done = client.run();
  const nextPairing = () => (pairings.length ? Promise.resolve(pairings.shift()!) : waitFor<{ code: string; secret: string }>((resolve) => listeners.push((p) => { pairings.splice(pairings.indexOf(p), 1); resolve(p); })));
  return { client, done, nextPairing, paired, state };
}

test('claim, sign in, pair a connector and drive its machine with signed commands only', async () => {
  const { url, call, service, clerk, close } = await startServer();
  try {
    assert.deepEqual(await (await call('/api/server')).json(), { apiVersion: 2, name: 'BorgDock', claimed: false, clerk: { publishableKey: 'pk_test', frontendApi: clerk.url } });

    const phone = deviceKey();
    const exchange = async (sub: string, key = phone, claim?: { code: string; proof: string }) =>
      call('/api/auth/clerk', { method: 'POST', json: { clerkToken: await clerkToken(sub, { issuer: clerk.url }), deviceName: 'iPhone 17', devicePublicKey: key.publicKey, claim } });

    const unclaimed = await exchange('user_owner');
    assert.equal(unclaimed.status, 403);
    assert.equal(((await unclaimed.json()) as any).claimRequired, true);

    // A connector elsewhere can't hand out claim codes; only the CLI on the server's own machine can.
    const { t3, ran } = windowsT3();
    const windows = connector(url, { id: 'win-env', t3 });
    const remoteCode = await windows.nextPairing();
    const viaRemote = await exchange('user_owner', phone, { code: remoteCode.code, proof: pairingProof(remoteCode.secret, phone.publicKey) });
    assert.equal(viaRemote.status, 403);

    const mac = connector(url, { local: true, id: 'mac-env' });
    const claimCode = await mac.nextPairing();
    assert.equal((await exchange('user_owner', phone, { code: claimCode.code, proof: 'd3Jvbmc=' })).status, 403, 'a wrong proof');
    const claimed = await exchange('user_owner', phone, { code: claimCode.code, proof: pairingProof(claimCode.secret, phone.publicKey) });
    assert.equal(claimed.status, 200);
    const { token, owner } = (await claimed.json()) as any;
    assert.deepEqual(owner, { clerkUserId: 'user_owner', name: 'Koen van der Borght', email: 'user_owner@example.test', imageUrl: null });
    assert.equal((await exchange('user_owner', phone, { code: claimCode.code, proof: pairingProof(claimCode.secret, phone.publicKey) })).status, 409, 'a code works once');
    mac.client.stop();

    assert.equal((await exchange('user_intruder', deviceKey())).status, 403, "someone else's Clerk account");
    const badToken = await call('/api/auth/clerk', { method: 'POST', json: { clerkToken: await clerkToken('user_owner', { issuer: clerk.url, key: OTHER_KEY.privateKey }), deviceName: 'x', devicePublicKey: phone.publicKey } });
    assert.equal(badToken.status, 401);

    const auth = { authorization: `Bearer ${token}` };
    const account = (await (await call('/api/account', { headers: auth })).json()) as any;
    assert.equal(account.owner.clerkUserId, 'user_owner');
    assert.deepEqual(account.devices.map((d: any) => [d.name, d.current, d.trustedBy]), [['iPhone 17', true, ['mac-env']]]);

    // Pair the Windows machine with the code it already shows.
    const pairBody = JSON.stringify({ code: remoteCode.code, proof: pairingProof(remoteCode.secret, phone.publicKey), devicePublicKey: phone.publicKey });
    assert.equal((await call('/api/machines/pair', { method: 'POST', headers: auth, body: pairBody })).status, 403, 'pairing is a signed command');
    const pairResponse = await call('/api/machines/pair', { method: 'POST', headers: { ...auth, ...signedHeaders(phone.privateKey, 'POST', '/api/machines/pair', pairBody) }, body: pairBody });
    assert.equal(pairResponse.status, 200);
    assert.equal(((await pairResponse.json()) as any).id, 'win-env');
    assert.ok(windows.state.current.machineToken, 'the connector got its token');
    assert.deepEqual(windows.state.current.trusted.map((t) => t.publicKey), [phone.publicKey]);
    await service.fleet.poll(true);
    const sources = (await (await call('/api/sources', { headers: auth })).json()) as any;
    assert.deepEqual(sources.machines.map((m: any) => [m.id, m.kind, m.online]), [['mac-env', 'local', false], ['win-env', 'connector', true]]);
    const targets = (await (await call('/api/agents/targets', { headers: auth })).json()) as any;
    assert.deepEqual(targets.projects, [{ id: 'win-env:p1', machineId: 'win-env', title: 'Shop', repository: 'acme/shop', defaultBranch: null }]);

    const launch = JSON.stringify({ machineId: 'win-env', projectId: 'win-env:p1', workspace: { kind: 'worktree', baseBranch: 'main' }, model: 'codex/gpt-6', effort: null, planFirst: false, message: 'Fix the basket', title: 'AB#1 Basket', itemId: null, moveAdoTo: null, prKey: null, ciGroupId: null });
    assert.equal((await call('/api/agents/launch', { method: 'POST', headers: auth, body: launch })).status, 403, 'unsigned');
    const headers = { ...auth, ...signedHeaders(phone.privateKey, 'POST', '/api/agents/launch', launch) };
    const launched = await call('/api/agents/launch', { method: 'POST', headers, body: launch });
    assert.equal(launched.status, 200, await launched.clone().text());
    const { threadId } = (await launched.json()) as any;
    const sent = ran.find((r) => r.tag === 'orchestration.launchThread')!.payload;
    assert.equal(threadId, `win-env:${sent.threadId}`);
    assert.equal(sent.projectId, 'p1');
    assert.deepEqual(sent.workspaceStrategy, { type: 'worktree', baseRef: 'main', startFromOrigin: true });
    assert.equal((await call('/api/agents/launch', { method: 'POST', headers, body: launch })).status, 403, 'replayed');

    // A second phone of the same owner signs in fine, but the Windows machine never paired with it.
    const tablet = deviceKey();
    const tabletToken = ((await (await exchange('user_owner', tablet)).json()) as any).token;
    const tabletLaunch = await call('/api/agents/launch', { method: 'POST', headers: { authorization: `Bearer ${tabletToken}`, ...signedHeaders(tablet.privateKey, 'POST', '/api/agents/launch', launch) }, body: launch });
    assert.equal(tabletLaunch.status, 403);
    assert.match(((await tabletLaunch.json()) as any).error, /Pair this device with Windows/);

    // Even a server that relays a command of its own making gets refused by the connector.
    const forged = { method: 'POST', path: '/api/threads/win-env%3At1/settle', signedAt: new Date().toISOString(), nonce: 'forged-nonce-123456', signature: Buffer.alloc(70).toString('base64'), body: '' };
    const host = service.fleet.byEnvironment('win-env')!;
    await assert.rejects((host.client as any).hub.relay('win-env', { kind: 'command', envelope: forged }), /No device this machine trusts/);
    await assert.rejects(host.client.rpc('orchestration.dispatchCommand', { type: 'thread.settle', threadId: 't1' }), /Not a read/);
    assert.equal(ran.filter((r) => r.tag === 'orchestration.dispatchCommand').length, 0);

    windows.client.stop();
    await windows.done;
  } finally {
    close();
  }
});

test('a removed machine pairs again, and its connector drops the token it can no longer use', async () => {
  const { url, call, service, clerk, close } = await startServer();
  try {
    const phone = deviceKey();
    const exchange = async (claim?: { code: string; proof: string }) =>
      call('/api/auth/clerk', { method: 'POST', json: { clerkToken: await clerkToken('user_owner', { issuer: clerk.url }), deviceName: 'iPhone 17', devicePublicKey: phone.publicKey, claim } });
    const mac = connector(url, { local: true, id: 'mac-env' });
    const claimCode = await mac.nextPairing();
    const { token } = (await (await exchange({ code: claimCode.code, proof: pairingProof(claimCode.secret, phone.publicKey) })).json()) as any;
    mac.client.stop();
    const auth = { authorization: `Bearer ${token}` };
    const pair = async (code: { code: string; secret: string }) => {
      const body = JSON.stringify({ code: code.code, proof: pairingProof(code.secret, phone.publicKey), devicePublicKey: phone.publicKey });
      return call('/api/machines/pair', { method: 'POST', headers: { ...auth, ...signedHeaders(phone.privateKey, 'POST', '/api/machines/pair', body) }, body });
    };

    const state = { current: { machineToken: null, trusted: [] } as ConnectorState };
    const first = connector(url, { id: 'win-env', t3: windowsT3().t3, state });
    assert.equal((await pair(await first.nextPairing())).status, 200);
    assert.equal((await call('/api/machines/win-env', { method: 'DELETE', headers: auth })).status, 200);
    await first.done;
    await service.fleet.poll(true);
    const machines = (await (await call('/api/sources', { headers: auth })).json()) as any;
    assert.deepEqual(machines.machines.map((m: any) => m.id), ['mac-env'], 'a removed machine is no longer listed');

    // Its connector comes back with the old token: told it's unpaired, it forgets the token and the trust.
    const stale = connector(url, { id: 'win-env', t3: windowsT3().t3, state });
    await stale.done;
    assert.deepEqual(state.current, { machineToken: null, trusted: [] });

    // The next connection shows a new code, and the machine pairs again.
    const again = connector(url, { id: 'win-env', t3: windowsT3().t3, state });
    assert.equal((await pair(await again.nextPairing())).status, 200);
    assert.ok(state.current.machineToken);
    again.client.stop();
    await again.done;
  } finally {
    close();
  }
});

test('an allowlisted Clerk account claims an unclaimed server without a pairing code', async () => {
  const verified = { status: 'verified' };
  const profiles = {
    user_unverified: { email_addresses: [{ id: 'e1', email_address: 'Koen@Example.test', verification: { status: 'unverified' } }] },
    user_github_unverified: { external_accounts: [{ provider: 'oauth_github', username: 'borght-dev', verification: { status: 'unverified' } }] },
    user_stranger: { email_addresses: [{ id: 'e1', email_address: 'stranger@example.test', verification: verified }], external_accounts: [{ provider: 'oauth_github', username: 'someone', verification: verified }] },
    user_email: { email_addresses: [{ id: 'e0', email_address: 'old@example.test', verification: verified }, { id: 'e1', email_address: 'Koen@Example.test', verification: verified }] },
    user_github: { external_accounts: [{ provider: 'oauth_github', username: 'Borght-Dev', verification: verified }] },
  };
  const owners = { emails: ['koen@example.test'], githubLogins: ['borght-dev'] };
  const signIn = async (clerk: { url: string }, call: (path: string, init?: any) => Promise<Response>, sub: string) =>
    call('/api/auth/clerk', { method: 'POST', json: { clerkToken: await clerkToken(sub, { issuer: clerk.url }), deviceName: 'iPhone 17', devicePublicKey: deviceKey().publicKey } });

  const byEmail = await startServer({ profiles, owners });
  try {
    for (const sub of ['user_unverified', 'user_github_unverified', 'user_stranger']) {
      const refused = await signIn(byEmail.clerk, byEmail.call, sub);
      assert.equal(refused.status, 403, sub);
      assert.equal(((await refused.json()) as any).claimRequired, true, sub);
    }
    assert.equal(((await (await byEmail.call('/api/server')).json()) as any).claimed, false);
    const claimed = await signIn(byEmail.clerk, byEmail.call, 'user_email');
    assert.equal(claimed.status, 200, 'a verified email on the list, case-insensitive, primary or not');
    assert.equal(((await claimed.json()) as any).owner.clerkUserId, 'user_email');
    assert.equal(((await (await byEmail.call('/api/server')).json()) as any).claimed, true);
    assert.equal((await signIn(byEmail.clerk, byEmail.call, 'user_email')).status, 200, 'then a normal sign-in');
    assert.equal((await signIn(byEmail.clerk, byEmail.call, 'user_github')).status, 403, 'the allowlist only claims; the owner is fixed');
  } finally {
    byEmail.close();
  }

  const byGithub = await startServer({ profiles, owners });
  try {
    assert.equal((await signIn(byGithub.clerk, byGithub.call, 'user_github')).status, 200, 'a verified GitHub login on the list');
  } finally {
    byGithub.close();
  }

  const noList = await startServer({ profiles });
  try {
    assert.equal((await signIn(noList.clerk, noList.call, 'user_email')).status, 403, 'without an allowlist only a pairing code claims');
  } finally {
    noList.close();
  }
});

/** A server claimed through the allowlist, with the owner's phone signed in. */
async function ownedServer() {
  const server = await startServer({ owners: { emails: [], githubLogins: ['borght-dev'] }, profiles: { user_owner: { external_accounts: [{ provider: 'oauth_github', username: 'borght-dev', verification: { status: 'verified' } }] } } });
  const phone = deviceKey();
  const signedIn = await server.call('/api/auth/clerk', { method: 'POST', json: { clerkToken: await clerkToken('user_owner', { issuer: server.clerk.url }), deviceName: 'iPhone 17', devicePublicKey: phone.publicKey } });
  assert.equal(signedIn.status, 200);
  const { token, sessionId } = (await signedIn.json()) as any;
  return { ...server, phone, phoneSession: sessionId as string, phoneAuth: { authorization: `Bearer ${token}` } };
}

test('a desktop links with a code the phone approves, polls its token once, and reaches only its own routes', async () => {
  const { call, close, phone, phoneSession, phoneAuth } = await ownedServer();
  try {
    const startResponse = await call('/api/desktop/links', { method: 'POST', json: { deviceName: 'Work laptop' } });
    assert.equal(startResponse.status, 200);
    const start = (await startResponse.json()) as any;
    assert.match(start.code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.equal(start.link, `borgdock://link-desktop?server=${encodeURIComponent('https://borgdock.test/borgdock')}&code=${start.code}`);
    assert.ok(Date.parse(start.expiresAt) - Date.now() > 9 * 60_000);
    const poll = (secret = start.pollSecret) => call(`/api/desktop/links/${start.linkId}?secret=${encodeURIComponent(secret)}`);
    assert.deepEqual(await (await poll()).json(), { status: 'pending' });
    assert.equal((await poll('wrong')).status, 404, 'a wrong secret looks like no link');

    const approve = (code: string) => {
      const body = JSON.stringify({ code });
      return call('/api/desktop/links/approve', { method: 'POST', headers: { ...phoneAuth, ...signedHeaders(phone.privateKey, 'POST', '/api/desktop/links/approve', body) }, body });
    };
    const unsigned = await call('/api/desktop/links/approve', { method: 'POST', headers: phoneAuth, json: { code: start.code } });
    assert.equal(unsigned.status, 403);
    assert.equal(((await unsigned.json()) as any).signatureRequired, true);
    assert.deepEqual(await (await poll()).json(), { status: 'pending' }, 'an unsigned approval does nothing');
    const approved = await approve(start.code.toLowerCase().replace('-', ' '));
    assert.equal(approved.status, 200, await approved.clone().text());
    const approval = (await approved.json()) as any;
    assert.equal(approval.deviceName, 'Work laptop');
    assert.equal((await approve(start.code)).status, 409, 'a code works once');

    const picked = (await (await poll()).json()) as any;
    assert.equal(picked.status, 'approved');
    assert.equal(picked.sessionId, approval.sessionId);
    assert.equal(picked.serverName, 'BorgDock');
    assert.equal((await poll()).status, 404, 'the token comes back only once');

    const desk = { authorization: `Bearer ${picked.token}` };
    assert.equal((await call('/api/server', { headers: desk })).status, 200);
    assert.equal((await call('/api/activity', { headers: desk })).status, 200);
    assert.equal((await call('/api/activity/reads?since=2026-01-01T00:00:00Z', { headers: desk })).status, 200);
    assert.equal((await call('/api/activity/read', { method: 'POST', headers: desk, json: { all: true } })).status, 200);
    assert.equal((await call('/api/activity/read-targets', { method: 'POST', headers: desk, json: { targets: [], before: new Date().toISOString() } })).status, 200);
    assert.equal((await call('/api/presence', { method: 'POST', headers: desk, json: { device: 'Work laptop', idleSeconds: 3 } })).status, 200);
    for (const [method, path] of [['GET', '/api/sources'], ['GET', '/api/account'], ['GET', '/api/overview'], ['GET', '/api/focus'], ['GET', '/api/preferences'],
      ['POST', '/api/desktop/links/approve'], ['DELETE', `/api/auth/sessions/${phoneSession}`], ['POST', '/api/push/apns'], ['POST', '/api/desktop/links']]) {
      const refused = await call(path, { method, headers: desk, json: method === 'GET' ? undefined : {} });
      assert.equal(refused.status, 403, `${method} ${path}`);
      assert.match(((await refused.json()) as any).error, /linked desktop can only/);
    }

    const sources = (await (await call('/api/sources', { headers: phoneAuth })).json()) as any;
    assert.deepEqual(sources.desktops.map((d: any) => [d.sessionId, d.name, d.atDesk, typeof d.lastSeenAt]), [[approval.sessionId, 'Work laptop', true, 'string']]);
    const account = (await (await call('/api/account', { headers: phoneAuth })).json()) as any;
    assert.deepEqual(account.devices.map((d: any) => [d.name, d.kind]).sort(), [['Work laptop', 'desktop'], ['iPhone 17', 'phone']]);

    assert.equal((await call(`/api/auth/sessions/${approval.sessionId}`, { method: 'DELETE', headers: phoneAuth })).status, 200);
    assert.equal((await call('/api/activity', { headers: desk })).status, 401, 'revoking the session unlinks the desktop');
    assert.deepEqual(((await (await call('/api/sources', { headers: phoneAuth })).json()) as any).desktops, []);
    assert.equal(((await (await call('/api/account', { headers: phoneAuth })).json()) as any).devices.length, 1);

    // A few links may wait at once per client.
    for (let i = 0; i < 3; i++) assert.equal((await call('/api/desktop/links', { method: 'POST', json: { deviceName: `Desk ${i}` } })).status, 200);
    assert.equal((await call('/api/desktop/links', { method: 'POST', json: { deviceName: 'One too many' } })).status, 429);
  } finally {
    close();
  }
});

test('a linked desktop shares its watched repositories; the phone sees where its pull requests come from', async () => {
  const { call, close, phone, phoneAuth } = await ownedServer();
  try {
    const start = (await (await call('/api/desktop/links', { method: 'POST', json: { deviceName: 'Work laptop' } })).json()) as any;
    const body = JSON.stringify({ code: start.code });
    assert.equal((await call('/api/desktop/links/approve', { method: 'POST', headers: { ...phoneAuth, ...signedHeaders(phone.privateKey, 'POST', '/api/desktop/links/approve', body) }, body })).status, 200);
    const desk = { authorization: `Bearer ${((await (await call(`/api/desktop/links/${start.linkId}?secret=${start.pollSecret}`)).json()) as any).token}` };

    const before = (await (await call('/api/github/repositories', { headers: phoneAuth })).json()) as any;
    assert.deepEqual([before.source, before.repositories, before.includeInvolving, before.includeTeamRequests], ['none', [], true, true]);

    const shared = await call('/api/desktop/repositories', { method: 'PUT', headers: desk, json: { repositories: ['acme/shop', 'globex/portal', 'not a repo'] } });
    assert.equal(shared.status, 200, await shared.clone().text());
    assert.equal((await call('/api/desktop/repositories', { method: 'PUT', headers: desk, json: { repositories: 'acme/shop' } })).status, 400);
    assert.equal((await call('/api/desktop/repositories', { method: 'PUT', headers: phoneAuth, json: { repositories: ['acme/shop'] } })).status, 403, 'only a desktop sends its list');
    assert.equal((await call('/api/github/repositories', { headers: desk })).status, 403, 'a desktop reads nothing back');

    const after = (await (await call('/api/github/repositories', { headers: phoneAuth })).json()) as any;
    assert.equal(after.source, 'desktop');
    assert.equal(after.desktopName, 'Work laptop');
    assert.deepEqual(after.repositories.map((r: any) => r.name), ['acme/shop', 'globex/portal']);

    const preferences = await call('/api/github/repositories/preferences', { method: 'PUT', headers: phoneAuth, json: { includeTeamRequests: false } });
    assert.deepEqual([((await preferences.json()) as any).includeInvolving, ((await (await call('/api/github/repositories', { headers: phoneAuth })).json()) as any).includeTeamRequests], [true, false]);
  } finally {
    close();
  }
});

test('desktop links expire after ten minutes, and an approved token nobody picked up revokes its session', () => {
  const revoked: string[] = [];
  const links = new DesktopLinks((sessionId) => revoked.push(sessionId));
  const t0 = Date.parse('2026-10-31T10:00:00Z');
  const lapsed = links.start({ deviceName: 'Laptop', client: 'a', serverUrl: 'https://x' }, t0);
  assert.throws(() => links.pending(lapsed.code, t0 + 10 * 60_000), /expired or was used/);
  assert.deepEqual(links.poll(lapsed.linkId, lapsed.pollSecret, 'BorgDock', t0 + 11 * 60_000), { status: 'expired' });
  assert.throws(() => links.poll(lapsed.linkId, lapsed.pollSecret, 'BorgDock', t0 + 11 * 60_000), /No such desktop link/);

  const late = links.start({ deviceName: 'Laptop', client: 'a', serverUrl: 'https://x' }, t0);
  links.approve(links.pending(late.code, t0 + 9.9 * 60_000), { token: 'tok', sessionId: 's-late' }, t0 + 9.9 * 60_000);
  assert.equal(links.poll(late.linkId, late.pollSecret, 'BorgDock', t0 + 11 * 60_000).status, 'approved', 'a last-second approval still gets picked up');

  const abandoned = links.start({ deviceName: 'Laptop', client: 'a', serverUrl: 'https://x' }, t0);
  links.approve(links.pending(abandoned.code, t0), { token: 'tok', sessionId: 's-gone' }, t0);
  links.start({ deviceName: 'Other', client: 'b', serverUrl: 'https://x' }, t0 + 11 * 60_000);
  assert.deepEqual(revoked, ['s-gone']);
});

test('what the desktop reads clears on the phone, and what the phone reads reaches the desktop', async () => {
  const { call, close, db, phone, phoneAuth } = await ownedServer();
  try {
    const start = (await (await call('/api/desktop/links', { method: 'POST', json: { deviceName: 'Work laptop' } })).json()) as any;
    const body = JSON.stringify({ code: start.code });
    assert.equal((await call('/api/desktop/links/approve', { method: 'POST', headers: { ...phoneAuth, ...signedHeaders(phone.privateKey, 'POST', '/api/desktop/links/approve', body) }, body })).status, 200);
    const desk = { authorization: `Bearer ${((await (await call(`/api/desktop/links/${start.linkId}?secret=${start.pollSecret}`)).json()) as any).token}` };

    const journal = new ActivityJournal(db);
    const T0 = new Date(Date.now() - 60 * 60_000).toISOString();
    const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
    journal.commit('github', [], T0);
    journal.commit('github', [
      { id: 'review', category: 'review', title: 'Review asked', detail: '', tone: 'bad', target: { kind: 'pr', key: 'acme/shop#12' }, at: at(10) },
      { id: 'merged', category: 'merge', title: 'Merged', detail: '', tone: 'ok', target: { kind: 'pr', key: 'acme/shop#13' }, at: at(10) },
    ], at(20));

    const since = new Date().toISOString();
    const readTargets = (headers: Record<string, string>, json: unknown) => call('/api/activity/read-targets', { method: 'POST', headers, json });
    assert.equal((await readTargets(desk, { targets: [{ kind: 'pr', key: 'Acme/Shop#12' }] })).status, 400, '`before` is required');
    const marked = await readTargets(desk, { targets: [{ kind: 'pr', key: 'Acme/Shop#12' }], before: new Date().toISOString() });
    assert.deepEqual(await marked.json(), { unread: 1 });
    const phonePage = (await (await call('/api/activity', { headers: phoneAuth })).json()) as any;
    assert.deepEqual(phonePage.entries.map((e: any) => [e.id, e.read]).sort(), [['merged', false], ['review', true]]);

    assert.equal((await call('/api/activity/read', { method: 'POST', headers: phoneAuth, json: { ids: ['merged'] } })).status, 200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const reads = (await (await call(`/api/activity/reads?since=${encodeURIComponent(since)}`, { headers: desk })).json()) as any;
    assert.deepEqual(reads.targets, [{ kind: 'pr', key: 'acme/shop#12' }, { kind: 'pr', key: 'acme/shop#13' }]);
    const next = (await (await call(`/api/activity/reads?since=${encodeURIComponent(reads.until)}`, { headers: desk })).json()) as any;
    assert.deepEqual(next.targets, []);
  } finally {
    close();
  }
});
