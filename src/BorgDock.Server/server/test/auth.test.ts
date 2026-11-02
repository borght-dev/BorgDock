import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.ts';
import { Sessions, sha256 } from '../src/auth/sessions.ts';
import { AppCodes, SetupCodes } from '../src/auth/codes.ts';

const freshDb = () => openDb(mkdtempSync(join(tmpdir(), 'dispatch-test-')));

test('sessions store only a hash of the token and can be revoked', () => {
  const db = freshDb();
  const sessions = new Sessions(db);
  const { session, token } = sessions.create({ kind: 'browser', name: 'Mac', passkeyId: 'pk', via: 'local' });
  const stored = db.prepare('SELECT token_hash FROM sessions WHERE id = ?').get(session.id) as { token_hash: string };
  assert.equal(stored.token_hash, sha256(token));
  assert.notEqual(stored.token_hash, token);
  assert.equal(sessions.validate(token, 'tailnet')?.id, session.id);
  assert.equal(sessions.validate('not-a-token', 'local'), null);
  sessions.revoke(session.id);
  assert.equal(sessions.validate(token, 'local'), null);
});

test('expired sessions are refused', () => {
  const db = freshDb();
  const sessions = new Sessions(db);
  const { session, token } = sessions.create({ kind: 'app', name: 'iPhone', passkeyId: null, via: 'internet' });
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', session.id);
  assert.equal(sessions.validate(token, 'internet'), null);
});

test('removing a passkey signs out its sessions', () => {
  const sessions = new Sessions(freshDb());
  const a = sessions.create({ kind: 'browser', name: 'A', passkeyId: 'pk1', via: 'local' });
  const b = sessions.create({ kind: 'browser', name: 'B', passkeyId: 'pk2', via: 'local' });
  assert.deepEqual(sessions.revokeForPasskey('pk1'), [a.session.id]);
  assert.equal(sessions.validate(a.token, 'local'), null);
  assert.ok(sessions.validate(b.token, 'local'));
});

test('setup codes work once, ignore dashes and case, and expire', () => {
  const db = freshDb();
  const codes = new SetupCodes(db);
  const { code } = codes.create();
  assert.match(code, /^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  const typed = code.toLowerCase().replace('-', ' ');
  assert.ok(codes.isValid(typed));
  assert.ok(codes.consume(typed));
  assert.ok(!codes.consume(code), 'single use');

  const second = codes.create();
  db.prepare('UPDATE setup_codes SET expires_at = ?').run('2000-01-01T00:00:00.000Z');
  assert.ok(!codes.isValid(second.code));
});

test('app codes need the matching PKCE verifier and work once', () => {
  const codes = new AppCodes();
  const verifier = 'x'.repeat(64);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const code = codes.create(challenge, 'pk');
  assert.equal(codes.redeem(code, 'wrong-verifier'), null);
  const again = codes.create(challenge, 'pk');
  assert.deepEqual(codes.redeem(again, verifier), { passkeyId: 'pk' });
  assert.equal(codes.redeem(again, verifier), null, 'single use');
  assert.throws(() => codes.create('not-a-hash', null));
});
