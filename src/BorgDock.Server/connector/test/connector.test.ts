import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { canonicalString } from '../../server/src/auth/signatures.ts';
import { ConnectorClient, type ConnectorState } from '../../server/src/borgdock/connector-client.ts';
import { pairingProof } from '../../server/src/borgdock/connector-protocol.ts';
import type { T3Transport } from '../../server/src/t3/client.ts';

function device() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { privateKey, publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')]).toString('base64') };
}

function envelope(key: ReturnType<typeof device>['privateKey'], path: string, body: string) {
  const e = { method: 'POST', path, signedAt: new Date().toISOString(), nonce: randomBytes(16).toString('base64url'), body, signature: '' };
  e.signature = sign('sha256', Buffer.from(canonicalString(e)), { key, dsaEncoding: 'der' }).toString('base64');
  return e;
}

test('the connector pairs with a proof, then runs only commands its paired devices signed, once each', async () => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  const socket = new Promise<WebSocket>((resolve) => wss.once('connection', resolve));
  const settled: string[] = [];
  const t3: T3Transport = {
    get: async () => ({ snapshotSequence: 1, projects: [], threads: [] }) as any,
    rpc: async (tag, payload) => { if (tag === 'orchestration.dispatchCommand') settled.push((payload as any).threadId); return {} as any; },
    dispatch: async () => ({ sequence: 0 }),
    close: () => {},
  };
  let state: ConnectorState = { machineToken: null, trusted: [] };
  let link = '';
  const client = new ConnectorClient({
    serverUrl: `http://127.0.0.1:${(wss.address() as AddressInfo).port}`, machine: { id: 'win', label: 'Windows', version: '0.1.0' }, t3,
    load: () => state, save: (next) => { state = next; }, onPairing: (l) => { link = l; },
  });
  const done = client.run();
  const ws = await socket;
  try {
  const frames: any[] = [];
  const waiters: ((f: any) => void)[] = [];
  ws.on('message', (data) => { const f = JSON.parse(String(data)); const w = waiters.shift(); if (w) w(f); else frames.push(f); });
  const next = () => (frames.length ? Promise.resolve(frames.shift()) : new Promise<any>((resolve) => waiters.push(resolve)));
  const ask = async (request: unknown) => { ws.send(JSON.stringify({ type: 'request', id: randomBytes(4).toString('hex'), request })); return next(); };

  assert.equal((await next()).type, 'hello');
  ws.send(JSON.stringify({ type: 'pairing', code: 'ABCD-EFGH', expiresAt: new Date(Date.now() + 60_000).toISOString(), serverUrl: 'https://borgdock.test' }));
  await new Promise((r) => setTimeout(r, 50));
  const secret = new URL(link).searchParams.get('secret')!;
  const phone = device();
  const stranger = device();

  assert.equal((await ask({ kind: 'verify', devicePublicKey: phone.publicKey, proof: pairingProof('wrong', phone.publicKey), deviceName: 'iPhone' })).value, false);
  assert.equal((await ask({ kind: 'verify', devicePublicKey: phone.publicKey, proof: pairingProof(secret, phone.publicKey), deviceName: 'iPhone' })).value, true);
  assert.deepEqual(state.trusted.map((t) => t.name), ['iPhone']);

  const path = `/api/threads/${encodeURIComponent('win:t1')}/settle`;
  const strangers = await ask({ kind: 'command', envelope: envelope(stranger.privateKey, path, '') });
  assert.equal(strangers.ok, false);
  assert.equal(strangers.status, 403);
  const signed = envelope(phone.privateKey, path, '');
  assert.equal((await ask({ kind: 'command', envelope: signed })).ok, true);
  assert.equal((await ask({ kind: 'command', envelope: signed })).ok, false, 'a replay');
  assert.equal((await ask({ kind: 'command', envelope: envelope(phone.privateKey, `/api/threads/${encodeURIComponent('mac:t1')}/settle`, '') })).ok, false, 'for another machine');
  assert.equal((await ask({ kind: 'rpc', tag: 'orchestration.dispatchCommand', payload: { type: 'thread.settle', threadId: 't1' } })).ok, false);
  assert.deepEqual(settled, ['t1']);
  } finally {
    client.stop();
    await done;
    wss.close();
  }
});
