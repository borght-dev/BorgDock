import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AnswerRequest, ApnsRegistration, AppTokenRequest, AuthStatus, LinkThreadRequest, MoveStateRequest, NotificationPreferences,
  StartThreadRequest, WebPushRegistration,
} from '../../../shared/src/api.ts';
import { AdoError } from '../ado/client.ts';
import { allowedOrigins, type Config } from '../config.ts';
import { audit, type Db, type Via } from '../db.ts';
import type { Notifier } from '../push/notifier.ts';
import { DispatchService, UserError } from '../service.ts';
import { T3Error } from '../t3/client.ts';
import { AppCodes, SetupCodes } from '../auth/codes.ts';
import { AuthError, Passkeys } from '../auth/passkeys.ts';
import { clientOf, FailureLimiter, RateLimiter } from '../auth/request.ts';
import { Sessions } from '../auth/sessions.ts';
import { publicKeyFromX963, signatureCheck } from '../auth/signatures.ts';
import { DeviceKeys } from '../borgdock/devices.ts';
import type { GithubService } from '../github/service.ts';
import type { Env, RouteDeps } from './context.ts';
import { registerGithubRoutes } from './routes/github.ts';
import { registerPlatformRoutes, registerPublicRoutes } from './routes/platform.ts';

const COOKIE = '__Host-dispatch';
const APP_REDIRECT = 'dispatch://auth';
// Web Push endpoints of the browsers Dispatch supports; anything else would make the server POST wherever it's told.
const PUSH_SERVICES = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com)(\/|$)/i;

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export type AppDeps = { config: Config; db: Db; service: DispatchService; notifier: Notifier; github: GithubService };

export function createApp({ config, db, service, notifier, github }: AppDeps) {
  const app = new Hono<Env>();
  const origins = allowedOrigins(config);
  const sessions = new Sessions(db);
  const passkeys = new Passkeys(db, { rpId: config.rpId, origins });
  const setupCodes = new SetupCodes(db);
  const appCodes = new AppCodes();
  const authLimiter = new RateLimiter(30, 60_000);
  const enrolFailures = new FailureLimiter(10, 60 * 60_000);
  const clientKey = (c: Context<Env>) => c.get('ip') ?? c.get('via');

  const record = (c: Context<Env>, action: string, detail?: unknown) =>
    audit(db, { sessionId: c.get('session')?.id ?? null, via: c.get('via'), ip: c.get('ip'), action, detail });
  const deps: RouteDeps = { config, db, service, notifier, github, record, requireSignature: signatureCheck(db) };

  const cookieOptions = { path: '/', secure: true, httpOnly: true, sameSite: 'Strict' as const, maxAge: 30 * 86_400 };

  /* ---------- every request ---------- */

  app.use('*', async (c, next) => {
    const { via, ip } = clientOf(c);
    c.set('via', via);
    c.set('ip', ip);
    // An Authorization header means bearer auth only; it never falls back to the cookie.
    const authorization = c.req.header('authorization');
    const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_-]{20,})$/)?.[1];
    const cookie = authorization === undefined ? getCookie(c, COOKIE) : undefined;
    const session = bearer ? sessions.validate(bearer, via) : cookie ? sessions.validate(cookie, via) : null;
    c.set('session', session);
    c.set('authKind', session ? (bearer ? 'bearer' : 'cookie') : null);
    await next();
    if (session?.extended && c.get('authKind') === 'cookie' && cookie && c.get('session')) setCookie(c, COOKIE, cookie, cookieOptions);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.header(name, value);
  });

  // Writes from a browser need our header and our origin; a page elsewhere can't add either without a CORS preflight we never answer.
  const forgeryCheck: MiddlewareHandler<Env> = async (c, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || c.get('authKind') === 'bearer') return next();
    const origin = c.req.header('origin');
    const site = c.req.header('sec-fetch-site');
    if (c.req.header('x-dispatch-intent') !== '1' || (origin && !origins.includes(origin)) || (site && site !== 'same-origin' && site !== 'none')) {
      return c.json({ error: 'Request blocked: it did not come from Dispatch itself.' }, 403);
    }
    return next();
  };
  app.use('/api/*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'Request too large.' }, 413) }));
  app.use('/api/*', forgeryCheck);

  const requireSession: MiddlewareHandler<Env> = async (c, next) => {
    if (!c.get('session')) return c.json({ error: 'Sign in first.' }, 401);
    return next();
  };

  const limitAuth: MiddlewareHandler<Env> = async (c, next) => {
    if (!authLimiter.allow(clientKey(c))) return c.json({ error: 'Too many attempts. Wait a minute.' }, 429);
    return next();
  };

  // Account changes (passkeys, phone app sign-in) need a passkey check from the last few minutes,
  // so a stolen cookie alone can't add an attacker's passkey or mint long-lived app tokens.
  const requireRecentPasskey: MiddlewareHandler<Env> = async (c, next) => {
    const session = c.get('session');
    if (!session) return c.json({ error: 'Sign in first.' }, 401);
    if (!Sessions.recentlyVerified(session)) return c.json({ error: 'Confirm with your passkey first.', reverify: true }, 403);
    return next();
  };

  const WRONG_CODE = 'That setup code is wrong or expired. Create a new one on the Mac.';

  const body = async <T>(c: Context<Env>): Promise<T> => {
    try {
      return await c.req.json<T>();
    } catch {
      throw new UserError('Send a JSON body.');
    }
  };

  const signIn = (c: Context<Env>, passkeyId: string, deviceName: string) => {
    const { session, token } = sessions.create({ kind: 'browser', name: deviceName || 'Browser', passkeyId, via: c.get('via') });
    setCookie(c, COOKIE, token, cookieOptions);
    c.set('session', session);
  };

  /* ---------- auth ---------- */

  app.get('/api/health', (c) => c.json({ ok: true }));
  registerPublicRoutes(app, deps);

  app.get('/api/auth/status', (c) => {
    const session = c.get('session');
    const status: AuthStatus = { setupRequired: passkeys.count() === 0, authenticated: Boolean(session), session: session ? sessions.info(session.id) : null };
    return c.json(status);
  });

  // Without a session, enrolling needs a setup code; with one, it needs a recent passkey check.
  const enrolGate = async (c: Context<Env>, setupCode: string | undefined, consume: boolean): Promise<Response | null> => {
    const session = c.get('session');
    if (session) return Sessions.recentlyVerified(session) ? null : c.json({ error: 'Confirm with your passkey first.', reverify: true }, 403);
    if (enrolFailures.blocked(clientKey(c))) return c.json({ error: 'Too many wrong setup codes. Try again in an hour.' }, 429);
    const ok = Boolean(setupCode) && (consume ? setupCodes.consume(setupCode!) : setupCodes.isValid(setupCode!));
    if (ok) return null;
    enrolFailures.fail(clientKey(c));
    record(c, 'auth.enrol.rejected');
    return c.json({ error: WRONG_CODE }, 403);
  };

  app.post('/api/auth/register/options', limitAuth, async (c) => {
    const { setupCode } = await body<{ setupCode?: string }>(c);
    const refused = await enrolGate(c, setupCode, false);
    if (refused) return refused;
    const user = await service.ado.me().catch(() => ({ name: 'Dispatch', email: 'dispatch' }));
    return c.json(await passkeys.registrationOptions(user.email || user.name, clientKey(c)));
  });

  app.post('/api/auth/register/verify', limitAuth, async (c) => {
    const input = await body<{ challengeId: string; response: any; passkeyName: string; deviceName: string; setupCode?: string }>(c);
    const enrolling = !c.get('session');
    // The code is spent before the passkey is stored, so one code can never enrol two passkeys.
    const refused = await enrolGate(c, input.setupCode, true);
    if (refused) return refused;
    const passkeyId = await passkeys.register(input.challengeId, input.response, input.passkeyName);
    if (enrolling) signIn(c, passkeyId, input.deviceName);
    record(c, enrolling ? 'auth.enrolled' : 'auth.passkey.added', { passkey: input.passkeyName });
    return c.json({ ok: true });
  });

  app.post('/api/auth/login/options', limitAuth, async (c) => c.json(await passkeys.authenticationOptions(clientKey(c))));

  app.post('/api/auth/login/verify', limitAuth, async (c) => {
    const input = await body<{ challengeId: string; response: any; deviceName: string }>(c);
    try {
      const passkeyId = await passkeys.authenticate(input.challengeId, input.response);
      signIn(c, passkeyId, input.deviceName);
      record(c, 'auth.login');
      return c.json({ ok: true });
    } catch (error) {
      record(c, 'auth.login.failed', { reason: (error as Error).message });
      throw error;
    }
  });

  app.post('/api/auth/logout', requireSession, (c) => {
    const session = c.get('session')!;
    sessions.revoke(session.id);
    notifier.forgetSession(session.id);
    deleteCookie(c, COOKIE, cookieOptions);
    record(c, 'auth.logout');
    return c.json({ ok: true });
  });

  // Step-up: prove the passkey again on an existing session.
  app.post('/api/auth/reverify/options', limitAuth, requireSession, async (c) => c.json(await passkeys.authenticationOptions(clientKey(c))));

  app.post('/api/auth/reverify/verify', limitAuth, requireSession, async (c) => {
    const input = await body<{ challengeId: string; response: any }>(c);
    const passkeyId = await passkeys.authenticate(input.challengeId, input.response);
    sessions.markVerified(c.get('session')!.id, passkeyId);
    record(c, 'auth.reverified');
    return c.json({ ok: true });
  });

  // Step 1 of phone app sign-in, called by the signed-in web page that the app opened, after an explicit passkey check.
  app.post('/api/auth/app/code', requireRecentPasskey, async (c) => {
    const { codeChallenge } = await body<{ codeChallenge: string }>(c);
    const code = appCodes.create(codeChallenge, c.get('session')!.passkeyId);
    record(c, 'auth.app.code');
    return c.json({ code, redirect: APP_REDIRECT });
  });

  // Step 2, called by the app itself with the PKCE verifier.
  app.post('/api/auth/app/token', limitAuth, async (c) => {
    const input = await body<AppTokenRequest>(c);
    const redeemed = appCodes.redeem(String(input.code), String(input.codeVerifier));
    if (!redeemed) {
      record(c, 'auth.app.rejected');
      return c.json({ error: 'That sign-in code is invalid or expired. Sign in again.' }, 400);
    }
    // The app sends its signing key with the code its own PKCE verifier redeems, so signed commands work after a
    // passkey sign-in too. A bad key fails the exchange before any session exists.
    if (input.devicePublicKey !== undefined) {
      try {
        publicKeyFromX963(String(input.devicePublicKey));
      } catch {
        return c.json({ error: "That device key isn't a P-256 public key." }, 400);
      }
    }
    const { session, token } = sessions.create({ kind: 'app', name: input.deviceName || 'iPhone app', passkeyId: redeemed.passkeyId, via: c.get('via') });
    if (input.devicePublicKey !== undefined) new DeviceKeys(db).bind(session.id, String(input.devicePublicKey), null);
    c.set('session', session);
    record(c, 'auth.app.signed-in', { device: input.deviceName });
    return c.json({ token, sessionId: session.id });
  });

  app.get('/api/auth/sessions', requireSession, (c) => c.json(sessions.list(c.get('session')!.id)));

  app.delete('/api/auth/sessions/:id', requireSession, (c) => {
    const id = c.req.param('id');
    if (!sessions.revoke(id)) return c.json({ error: 'No such session' }, 404);
    notifier.forgetSession(id);
    record(c, 'auth.session.revoked', { id });
    if (id === c.get('session')!.id) deleteCookie(c, COOKIE, cookieOptions);
    return c.json({ ok: true });
  });

  app.get('/api/auth/passkeys', requireSession, (c) => c.json(passkeys.list()));

  app.patch('/api/auth/passkeys/:id', requireSession, async (c) => {
    const { name } = await body<{ name: string }>(c);
    if (!passkeys.rename(c.req.param('id'), String(name ?? '').trim() || 'Passkey')) return c.json({ error: 'No such passkey' }, 404);
    return c.json({ ok: true });
  });

  app.delete('/api/auth/passkeys/:id', requireRecentPasskey, (c) => {
    const id = c.req.param('id');
    if (!passkeys.remove(id)) return c.json({ error: 'No such passkey' }, 404);
    for (const sessionId of sessions.revokeForPasskey(id)) notifier.forgetSession(sessionId);
    record(c, 'auth.passkey.removed', { id });
    return c.json({ ok: true });
  });

  /* ---------- data ---------- */

  const api = new Hono<Env>();
  api.use('*', requireSession);

  api.get('/config', async (c) => c.json(await service.appConfig()));

  api.get('/overview', (c) => (service.overview ? c.json(service.overview) : c.json({ error: 'Still loading. Try again in a moment.' }, 503)));

  // Pull to refresh: fresh ADO and T3 data instead of the last poll.
  api.post('/refresh', async (c) => {
    const overview = await service.syncNow();
    return overview ? c.json(overview) : c.json({ error: 'Still loading. Try again in a moment.' }, 503);
  });

  api.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const sessionId = c.get('session')!.id;
      const send = (o: { generatedAt: string }) => stream.writeSSE({ event: 'overview', data: JSON.stringify({ generatedAt: o.generatedAt }) }).catch(() => {});
      service.on('overview', send);
      let finish = () => {};
      const ended = new Promise<void>((resolve) => { finish = resolve; });
      stream.onAbort(() => finish());
      // A signed-out session stops receiving updates within half a minute.
      const keepAlive = setInterval(() => {
        if (!sessions.isActive(sessionId)) return finish();
        stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {});
      }, 25_000);
      await ended;
      clearInterval(keepAlive);
      service.off('overview', send);
    }));

  api.get('/items/:id', async (c) => c.json(await service.itemDetail(Number(c.req.param('id')))));

  api.get('/items/:id/start', async (c) => c.json(await service.startOptions(Number(c.req.param('id')))));

  api.get('/browse/queries', async (c) => c.json(await service.queries()));

  api.get('/browse', async (c) => c.json(await service.browse(c.req.query('query') ?? null, c.req.query('search') ?? null)));

  api.post('/threads', deps.requireSignature, async (c) => {
    const request = await body<StartThreadRequest>(c);
    const result = await service.startThread(request);
    record(c, 'thread.start', { itemId: request.itemId, worktree: request.worktree, agent: request.agent, mode: request.mode, threadId: result.threadId, adoState: result.adoState, warning: result.warning });
    return c.json(result);
  });

  api.post('/threads/:id/answers', deps.requireSignature, async (c) => {
    const { requestId, answers } = await body<AnswerRequest>(c);
    await service.answer(c.req.param('id'), requestId, answers);
    record(c, 'thread.answer', { threadId: c.req.param('id') });
    return c.json({ ok: true });
  });

  api.post('/threads/:id/settle', deps.requireSignature, async (c) => {
    await service.settle(c.req.param('id'));
    record(c, 'thread.settle', { threadId: c.req.param('id') });
    return c.json({ ok: true });
  });

  api.post('/threads/:id/link', async (c) => {
    const { itemId } = await body<LinkThreadRequest>(c);
    service.linkThread(c.req.param('id'), itemId === null ? null : Number(itemId));
    record(c, 'thread.link', { threadId: c.req.param('id'), itemId });
    return c.json({ ok: true });
  });

  api.post('/items/:id/state', async (c) => {
    const { to } = await body<MoveStateRequest>(c);
    const state = await service.moveState(Number(c.req.param('id')), to);
    record(c, 'ado.state', { itemId: Number(c.req.param('id')), to: state });
    return c.json({ state });
  });

  api.post('/items/:id/dismiss', (c) => {
    service.dismissSuggestion(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  api.post('/queue/:id', (c) => {
    service.queue(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  api.delete('/queue/:id', (c) => {
    service.unqueue(Number(c.req.param('id')));
    return c.json({ ok: true });
  });

  api.post('/push/web', async (c) => {
    const { subscription } = await body<WebPushRegistration>(c);
    if (!PUSH_SERVICES.test(subscription?.endpoint ?? '') || !subscription.keys?.p256dh || !subscription.keys?.auth) throw new UserError('Invalid push subscription');
    notifier.registerWeb(c.get('session')!.id, subscription);
    return c.json({ ok: true });
  });

  api.post('/push/apns', async (c) => {
    const { deviceToken, environment } = await body<ApnsRegistration>(c);
    if (!/^[0-9a-f]{64,200}$/i.test(deviceToken ?? '') || !['sandbox', 'production'].includes(environment)) throw new UserError('Invalid device token');
    notifier.registerApns(c.get('session')!.id, deviceToken, environment);
    return c.json({ ok: true, enabled: notifier.apnsEnabled });
  });

  api.post('/push/test', async (c) => {
    await notifier.send({ key: `test:${Date.now()}`, preference: 'waiting', group: 'test', title: 'Dispatch', body: 'Notifications work on this device.', data: { kind: 'waiting', itemId: 0 } });
    return c.json({ ok: true });
  });

  api.get('/preferences/notifications', (c) => c.json(notifier.preferences()));

  api.put('/preferences/notifications', async (c) => {
    notifier.setPreferences(await body<NotificationPreferences>(c));
    return c.json(notifier.preferences());
  });

  api.get('/audit', (c) => {
    const rows = db.prepare('SELECT at, via, ip, action, detail FROM audit ORDER BY id DESC LIMIT 100').all() as any[];
    return c.json(rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })));
  });

  registerGithubRoutes(api, deps);
  registerPlatformRoutes(api, deps);

  app.route('/api', api);
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  /* ---------- web app ---------- */

  const indexFile = join(config.webDist, 'index.html');
  app.use('/assets/*', serveStatic({ root: config.webDist, onFound: (_p, c) => { c.header('Cache-Control', 'public, max-age=31536000, immutable'); } }));
  app.use('*', serveStatic({ root: config.webDist, onFound: (_p, c) => { c.header('Cache-Control', 'no-cache'); } }));
  app.get('*', (c) => {
    if (!existsSync(indexFile)) return c.text('The web app is not built yet. Run npm run build.', 503);
    c.header('Cache-Control', 'no-cache');
    return c.html(readFileSync(indexFile, 'utf8'));
  });

  app.onError((error, c) => {
    if (error instanceof UserError) return c.json({ error: error.message }, error.status as 400);
    if (error instanceof AuthError) return c.json({ error: error.message }, 400);
    if (error instanceof AdoError) return c.json({ error: `Azure DevOps: ${error.message}` }, error.status >= 400 && error.status < 500 ? 400 : 502);
    if (error instanceof T3Error) return c.json({ error: `T3 Code: ${error.message}` }, 502);
    console.error(error);
    return c.json({ error: 'Something went wrong on the server. Check the Dispatch log.' }, 500);
  });

  return { app, setupCodes, passkeys, sessions };
}
