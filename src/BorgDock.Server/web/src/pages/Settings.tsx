import { useCallback, useEffect, useState } from 'react';
import type { NotificationPreferences, PasskeyInfo, SessionInfo } from '../../../shared/src/api.ts';
import { api } from '../api.ts';
import { ago } from '../helpers.ts';
import { registerPasskey, deviceName, withPasskeyCheck } from '../passkeys.ts';
import { enablePush, pushState, type PushState } from '../push.ts';
import { useStore } from '../store.tsx';

const VIA: Record<string, string> = { internet: 'over the internet', tailnet: 'on your tailnet', local: 'on the Mac' };
const ACTIONS: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.login.failed': 'Failed sign-in', 'auth.enrolled': 'Set up with a setup code', 'auth.enrol.rejected': 'Wrong setup code',
  'auth.passkey.added': 'Passkey added', 'auth.passkey.removed': 'Passkey removed', 'auth.logout': 'Signed out', 'auth.session.revoked': 'Device signed out',
  'auth.app.code': 'iPhone app sign-in started', 'auth.app.signed-in': 'iPhone app signed in', 'auth.app.rejected': 'iPhone app sign-in refused',
  'thread.start': 'Started a thread', 'thread.answer': 'Answered an agent', 'thread.settle': 'Settled a thread', 'thread.link': 'Linked a thread', 'ado.state': 'Moved an ADO state',
};

export function Settings() {
  const { config, toast, act } = useStore();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [push, setPush] = useState<PushState>('off');
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof api.audit>>>([]);

  const load = useCallback(async () => {
    const [s, p, n, a, ps] = await Promise.all([api.sessions(), api.passkeys(), api.notificationPreferences(), api.audit(), pushState()]);
    setSessions(s); setPasskeys(p); setPrefs(n); setAudit(a); setPush(ps);
  }, []);
  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, [load, toast]);

  const run = async (work: () => Promise<string | void>) => { if (await act(work)) await load(); };

  const signOutSession = async (s: SessionInfo) => {
    await api.revokeSession(s.id);
    if (s.current) location.href = '/';
    return `${s.name} signed out`;
  };

  return (
    <div className="settings">
      <h2 className="browse-title">Settings</h2>

      <section className="panel">
        <h3>Notifications on this device</h3>
        <p className="muted">
          {push === 'on' && 'This browser gets Dispatch notifications.'}
          {push === 'off' && 'This browser does not get notifications yet. On iPhone, add Dispatch to the Home Screen first, or use the Dispatch app.'}
          {push === 'blocked' && 'Notifications are blocked for Dispatch in this browser. Allow them in the browser settings.'}
          {push === 'unsupported' && 'This browser cannot receive web notifications. On iPhone, use the Dispatch app or add Dispatch to the Home Screen.'}
        </p>
        <div className="row-actions">
          {push === 'off' && config?.vapidPublicKey && <button className="btn primary" onClick={() => run(async () => { await enablePush(config.vapidPublicKey!); return 'Notifications are on for this device'; })}>Turn on notifications</button>}
          <button className="btn" onClick={() => run(async () => { await api.testPush(); return 'Test notification sent to every device'; })}>Send a test notification</button>
        </div>
        {prefs && (
          <div className="toggles">
            {([['waiting', 'An agent asks, proposes a plan or fails'], ['finished', 'An agent finishes its turn'], ['drift', 'ADO is out of sync with the agent']] as const).map(([key, label]) => (
              <label className="check" key={key}>
                <input type="checkbox" checked={prefs[key]} onChange={(e) => run(async () => { setPrefs(await api.setNotificationPreferences({ ...prefs, [key]: e.target.checked })); })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Signed-in devices</h3>
        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id}>
              <div>
                <b>{s.name}{s.current && <span className="pill">This device</span>}</b>
                <span className="muted">{s.kind === 'app' ? 'iPhone app' : 'Browser'}, last seen {ago(s.lastSeenAt)} {VIA[s.lastSeenVia]}</span>
              </div>
              <button className="btn small" onClick={() => run(() => signOutSession(s))}>Sign out</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>Passkeys</h3>
        <p className="muted">Passkeys in iCloud Keychain work on your iPhone and Mac. On Windows, sign in with "Use a phone" or add a Windows Hello passkey here.</p>
        <ul className="list">
          {passkeys.map((p) => (
            <li key={p.id}>
              <div><b>{p.name}</b><span className="muted">Added {ago(p.createdAt)}{p.lastUsedAt ? `, used ${ago(p.lastUsedAt)}` : ''}</span></div>
              <button className="btn small" disabled={passkeys.length < 2} title={passkeys.length < 2 ? 'Add another passkey before removing your only one' : undefined}
                onClick={() => confirm(`Remove ${p.name}? Devices signed in with it are signed out.`) && run(async () => { await withPasskeyCheck(() => api.removePasskey(p.id)); return 'Passkey removed'; })}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="row-actions">
          <button className="btn" onClick={() => run(async () => { await withPasskeyCheck(() => registerPasskey(`${deviceName()} passkey`)); return 'Passkey added'; })}>Add a passkey on this device</button>
        </div>
      </section>

      <section className="panel">
        <h3>Recent activity</h3>
        <ul className="list compact">
          {audit.slice(0, 25).map((a, i) => (
            <li key={i}>
              <span className={a.action.includes('failed') || a.action.includes('rejected') ? 'warn' : ''}>{ACTIONS[a.action] ?? a.action}{a.detail?.itemId ? ` ${a.detail.itemId}` : ''}</span>
              <span className="muted">{ago(a.at)} {VIA[a.via]}{a.ip ? ` from ${a.ip}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="row-actions">
        <button className="btn danger" onClick={() => run(async () => { await api.logout(); location.href = '/'; })}>Sign out of this device</button>
      </div>
    </div>
  );
}
