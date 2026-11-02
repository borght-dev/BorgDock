import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { deviceName, registerPasskey, signInWithPasskey, withPasskeyCheck } from '../passkeys.ts';

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand big"><span className="brand-mark" />Dispatch</div>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function SignIn({ setupRequired, onSignedIn }: { setupRequired: boolean; onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (setupRequired) {
    return (
      <AuthFrame title="Set up Dispatch">
        <p>No passkey is registered yet. On the Mac, run <code>npm run cli -- setup-code</code> and enter the code on the next screen.</p>
        <a className="btn primary wide" href="/setup">Enter a setup code</a>
      </AuthFrame>
    );
  }
  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPasskey();
      onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Sign in">
      <p>Use your Dispatch passkey: Face ID, Touch ID, Windows Hello, or your phone.</p>
      <button className="btn primary wide" disabled={busy} onClick={signIn}>Sign in with passkey</button>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="muted small">Lost every device? Run <code>npm run cli -- setup-code</code> on the Mac and use <a href="/setup">a setup code</a>.</p>
    </AuthFrame>
  );
}

export function Setup({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState(new URLSearchParams(location.search).get('code') ?? '');
  const [name, setName] = useState(`${deviceName()} passkey`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await registerPasskey(name, code);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="Create your passkey">
      <form className="auth-form" onSubmit={submit}>
        <label>Setup code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoComplete="one-time-code" autoCapitalize="characters" required /></label>
        <label>Name for this passkey<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <button className="btn primary wide" disabled={busy}>Create passkey</button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="muted small">The code comes from <code>npm run cli -- setup-code</code> on the Mac. It works once, for 30 minutes.</p>
    </AuthFrame>
  );
}

/**
 * Opened by the iPhone app in ASWebAuthenticationSession; hands a one-time code back to dispatch://auth.
 * It never does that on its own: a link to this page from anywhere else only gets a button and a passkey prompt.
 */
export function AppAuth({ authenticated, onSignedIn }: { authenticated: boolean; onSignedIn: () => void }) {
  const params = new URLSearchParams(location.search);
  const state = params.get('state') ?? '';
  const challenge = params.get('code_challenge') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^[A-Za-z0-9_-]{8,128}$/.test(state) && /^[A-Za-z0-9_-]{43}$/.test(challenge);

  const handOver = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code, redirect } = await withPasskeyCheck(() => api.appCode(challenge));
      location.href = `${redirect}?${new URLSearchParams({ code, state })}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (!valid) return <AuthFrame title="Something is off"><p>This sign-in link is incomplete. Start again from the Dispatch app.</p></AuthFrame>;
  if (!authenticated) return <SignIn setupRequired={false} onSignedIn={onSignedIn} />;
  return (
    <AuthFrame title="Sign in the Dispatch app?">
      <p>Only continue if you just tapped "Sign in" in the Dispatch app on this device. The app gets its own session, which you can sign out under Settings.</p>
      <button className="btn primary wide" disabled={busy} onClick={handOver}>Sign in the Dispatch app</button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </AuthFrame>
  );
}
