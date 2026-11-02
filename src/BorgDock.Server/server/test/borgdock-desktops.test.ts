import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Sessions } from '../src/auth/sessions.ts';
import { DesktopLinks, Desktops } from '../src/borgdock/desktops.ts';
import { openDb } from '../src/db.ts';

test('an approved link nobody picks up is revoked when it expires, without another request', () => {
  const abandoned: string[] = [];
  const links = new DesktopLinks((sessionId) => abandoned.push(sessionId));
  const t0 = Date.parse('2026-10-31T10:00:00Z');
  const started = links.start({ deviceName: 'Work laptop', client: 'local', serverUrl: 'https://borgdock.test' }, t0);
  links.approve(links.pending(started.code, t0 + 60_000), { token: 't', sessionId: 's1' }, t0 + 60_000);
  links.sweep(t0 + 9 * 60_000);
  assert.deepEqual(abandoned, [], 'still waiting to be picked up');
  links.sweep(t0 + 11 * 60_000);
  assert.deepEqual(abandoned, ['s1']);
});

test('after a restart, desktop sessions whose token was never picked up are revoked', () => {
  const db = openDb(mkdtempSync(join(tmpdir(), 'bd-desktops-')));
  const sessions = new Sessions(db);
  const desktops = new Desktops(db);
  const make = () => sessions.create({ kind: 'app', name: 'Work laptop', passkeyId: null, via: 'local' }).session.id;
  const lost = make();
  const linked = make();
  desktops.record(lost, 'Work laptop');
  desktops.record(linked, 'Home desktop');
  desktops.collected(linked);
  desktops.revokeUncollected((id) => sessions.revoke(id));
  assert.equal(sessions.isActive(lost), false);
  assert.equal(sessions.isActive(linked), true);
  assert.deepEqual(desktops.list().map((d) => d.name), ['Home desktop']);
});
