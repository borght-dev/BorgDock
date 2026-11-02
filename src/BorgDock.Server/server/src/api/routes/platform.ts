import type { Context, Hono } from 'hono';
import { upgradeWebSocket } from '@hono/node-server';
import type {
  ApproveDesktopRequest, BorgDockPreferences, ClerkExchangeRequest, ClerkExchangeResponse, DesktopLinkApproval, DesktopLinkRequest, LaunchRequest, LiveActivityRegistration, MarkReadRequest, PairMachineRequest,
  Presence, PushToStartRegistration, ReadTargetsRequest, ResolveRefsRequest, ServerInfo,
} from '../../../../shared/src/api.ts';
import { API_VERSION } from '../../../../shared/src/api.ts';
import { clientOf, RateLimiter } from '../../auth/request.ts';
import { Sessions } from '../../auth/sessions.ts';
import { publicKeyFromX963, signedRequest } from '../../auth/signatures.ts';
import { branches, launch, targets, threadCommand, threadDetail } from '../../borgdock/agents.ts';
import { allowlisted, ClerkError } from '../../borgdock/clerk.ts';
import { DesktopLinkError, desktopScope } from '../../borgdock/desktops.ts';
import { PairingError } from '../../borgdock/machines.ts';
import { platformFor } from '../../borgdock/platform.ts';
import { account, refOf, resolveRefs, search, sources, widgets } from '../../borgdock/queries.ts';
import { UserError } from '../../service.ts';
import { readBody, type Api, type Env, type RouteDeps } from '../context.ts';

const PING_EVERY_MS = 25_000;

/** Errors with a status of their own (Clerk, pairing, desktop links) answer with it; everything else goes to the app's handler. */
async function answering(c: Context<Env>, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ClerkError || error instanceof PairingError || error instanceof DesktopLinkError) return c.json({ error: error.message }, error.status as 401);
    throw error;
  }
}

const envelopeOf = () => {
  const envelope = signedRequest.getStore();
  if (!envelope) throw new UserError('This needs a signature from your device.', 403);
  return envelope;
};

/**
 * Routes that need no session: GET /api/server, POST /api/auth/clerk, the desktop link's start and poll, and the
 * connector's socket. Registered on the root app before the session check, behind the desktop scope: a linked
 * desktop's session reaches only the routes in DESKTOP_ROUTES, these and every later one.
 */
export function registerPublicRoutes(app: Hono<Env>, deps: RouteDeps) {
  const platform = platformFor(deps);
  const sessions = new Sessions(deps.db);
  const limiter = new RateLimiter(20, 60_000);
  const linkLimiter = new RateLimiter(10, 60_000);

  app.use('/api/*', desktopScope(platform.desktops));

  app.get('/api/server', (c) => {
    const clerk = deps.config.clerk;
    const info: ServerInfo = {
      apiVersion: API_VERSION,
      name: deps.config.serverName,
      claimed: platform.owners.get() !== null,
      clerk: clerk ? { publishableKey: clerk.publishableKey, frontendApi: clerk.frontendApi } : null,
    };
    return c.json(info);
  });

  app.post('/api/auth/clerk', (c) => answering(c, async () => {
    if (!limiter.allow(c.get('ip') ?? c.get('via'))) return c.json({ error: 'Too many attempts. Wait a minute.' }, 429);
    const clerk = platform.clerk;
    if (!clerk) return c.json({ error: 'This server has no Clerk application set up yet.' }, 503);
    const input = await readBody<ClerkExchangeRequest>(c);
    const deviceName = String(input.deviceName ?? '').trim().slice(0, 80) || 'iPhone';
    try {
      publicKeyFromX963(input.devicePublicKey);
    } catch (error) {
      throw new UserError((error as Error).message);
    }
    const { userId } = await clerk.verify(input.clerkToken);
    let owner = platform.owners.get();
    let paired: { machineId: string } | null = null;
    const proof = input.claim ? { code: String(input.claim.code ?? ''), proof: String(input.claim.proof ?? ''), devicePublicKey: input.devicePublicKey, deviceName } : null;
    if (!owner) {
      const { owners } = deps.config;
      const hasAllowlist = owners.emails.length > 0 || owners.githubLogins.length > 0;
      const identity = proof || hasAllowlist ? await clerk.identity(userId) : null;
      const byAllowlist = !proof && identity !== null && allowlisted(identity, owners);
      if (!proof && !byAllowlist) return c.json({ error: 'Nobody owns this server yet. Scan the pairing code on its own machine to claim it.', claimRequired: true }, 403);
      if (proof) paired = await platform.hub.verifyPairing(proof, { requireLocal: true });
      if (!platform.owners.claim(identity!.owner)) return c.json({ error: 'Someone claimed this server a moment ago.' }, 403);
      owner = identity!.owner;
      deps.record(c, 'borgdock.claimed', { owner: owner.clerkUserId, device: deviceName, via: byAllowlist ? 'allowlist' : 'pairing' });
    } else if (owner.clerkUserId !== userId) {
      deps.record(c, 'auth.clerk.rejected', { user: userId });
      return c.json({ error: 'This BorgDock belongs to someone else.' }, 403);
    } else {
      clerk.profile(userId).then((p) => platform.owners.refresh(p)).catch(() => {});
      if (proof) paired = await platform.hub.verifyPairing(proof, { requireLocal: false });
    }
    const { session, token } = sessions.create({ kind: 'app', name: deviceName, passkeyId: null, via: c.get('via') });
    platform.devices.bind(session.id, input.devicePublicKey, userId);
    if (paired) platform.hub.trust(paired.machineId, session.id);
    c.set('session', session);
    deps.record(c, 'auth.clerk.signed-in', { device: deviceName, paired: paired?.machineId ?? null });
    const response: ClerkExchangeResponse = { token, sessionId: session.id, owner };
    return c.json(response);
  }));

  app.post('/api/desktop/links', (c) => answering(c, async () => {
    const client = c.get('ip') ?? c.get('via');
    if (!linkLimiter.allow(client)) return c.json({ error: 'Too many attempts. Wait a minute.' }, 429);
    const input = await readBody<DesktopLinkRequest>(c);
    const deviceName = String(input.deviceName ?? '').trim().slice(0, 80) || 'BorgDock desktop';
    return c.json(platform.desktopLinks.start({ deviceName, client, serverUrl: deps.config.publicOrigin }));
  }));

  app.get('/api/desktop/links/:linkId', (c) => answering(c, async () => {
    const status = platform.desktopLinks.poll(c.req.param('linkId'), c.req.query('secret'), deps.config.serverName);
    if (status.status === 'approved') platform.desktops.collected(status.sessionId);
    return c.json(status);
  }));

  // Connectors dial out to here; nothing else on the socket is trusted until the connector proves its token.
  app.get('/api/connector', upgradeWebSocket((c) => {
    const client = clientOf(c);
    let link: ReturnType<typeof platform.hub.open> | null = null;
    let ping: NodeJS.Timeout | null = null;
    return {
      onOpen: (_event, ws) => {
        link = platform.hub.open({ send: (text) => ws.send(text), close: (code, reason) => ws.close(code, reason) }, client);
        const raw = ws.raw as { ping?: () => void } | undefined;
        ping = setInterval(() => raw?.ping?.(), PING_EVERY_MS);
      },
      onMessage: (event) => link?.message(typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString('utf8')),
      onClose: () => {
        if (ping) clearInterval(ping);
        link?.closed();
      },
    };
  }));
}

/**
 * BorgDock's platform routes (need a session): account, sources, machines and pairing, threads and launching,
 * activity, search, widgets, live activities, presence, preferences, refs. Types: shared/src/borgdock.ts.
 */
export function registerPlatformRoutes(api: Api, deps: RouteDeps) {
  const platform = platformFor(deps);
  const signed = deps.requireSignature;
  const sessionId = (c: Context<Env>) => c.get('session')!.id;

  /* ---------- account and machines ---------- */

  api.get('/account', (c) => {
    const result = account(platform, sessionId(c));
    return result ? c.json(result) : c.json({ error: 'Nobody owns this server yet.', claimRequired: true }, 404);
  });

  // A browser session binds a WebCrypto key right after its passkey check, so the web app can sign too.
  api.post('/devices/key', async (c) => {
    const session = c.get('session')!;
    const { devicePublicKey } = await readBody<{ devicePublicKey: string }>(c);
    if (platform.devices.keyOf(session.id)) return c.json({ error: 'This session already has a device key.' }, 409);
    if (!Sessions.recentlyVerified(session)) return c.json({ error: 'Confirm with your passkey first.', reverify: true }, 403);
    try {
      platform.devices.bind(session.id, devicePublicKey, null);
    } catch (error) {
      throw new UserError((error as Error).message);
    }
    deps.record(c, 'device.key.bound');
    return c.json({ ok: true });
  });

  api.get('/sources', (c) => c.json(sources(platform)));

  api.get('/machines', (c) => c.json(platform.hub.machines()));

  api.post('/machines/pair', signed, (c) => answering(c, async () => {
    const input = await readBody<PairMachineRequest>(c);
    const key = platform.devices.keyOf(sessionId(c));
    if (!key || key !== input.devicePublicKey) throw new UserError("Pair with this device's own key.", 403);
    const session = c.get('session')!;
    const result = await platform.hub.verifyPairing({ code: input.code, proof: input.proof, devicePublicKey: key, deviceName: session.name }, { requireLocal: false });
    platform.hub.trust(result.machineId, session.id);
    deps.record(c, 'machine.paired', { machineId: result.machineId });
    const machine = platform.hub.machines().find((m) => m.id === result.machineId)
      ?? { id: result.machineId, label: result.label, kind: result.local ? 'local' : 'connector', online: true, lastSeenAt: null, threads: 0, version: null };
    return c.json(machine);
  }));

  // The phone approves a desktop's code; the desktop then picks up its own session by polling its link.
  api.post('/desktop/links/approve', signed, (c) => answering(c, async () => {
    const { code } = await readBody<ApproveDesktopRequest>(c);
    const link = platform.desktopLinks.pending(code);
    const { session, token } = new Sessions(deps.db).create({ kind: 'app', name: link.deviceName, passkeyId: null, via: c.get('via') });
    platform.desktops.record(session.id, link.deviceName);
    platform.desktopLinks.approve(link, { token, sessionId: session.id });
    deps.record(c, 'desktop.linked', { desktop: session.id, name: link.deviceName });
    const approval: DesktopLinkApproval = { deviceName: link.deviceName, sessionId: session.id };
    return c.json(approval);
  }));

  api.delete('/machines/:id', (c) => {
    const id = c.req.param('id');
    if (id === platform.hub.localMachineId) throw new UserError("This server's own machine can't be removed.");
    if (!platform.hub.remove(id)) return c.json({ error: 'No such machine' }, 404);
    deps.record(c, 'machine.removed', { machineId: id });
    return c.json({ ok: true });
  });

  /* ---------- agents ---------- */

  api.get('/agents/targets', (c) => c.json(targets(platform)));

  api.get('/agents/branches', async (c) => c.json(await branches(platform, c.req.query('machine') ?? '', c.req.query('project') ?? '')));

  api.post('/agents/launch', signed, async (c) => {
    const request = await readBody<LaunchRequest>(c);
    const result = await launch(platform, request, envelopeOf(), sessionId(c));
    deps.record(c, 'agent.launch', { machineId: request.machineId, itemId: request.itemId, workspace: request.workspace?.kind, threadId: result.threadId, warning: result.warning });
    return c.json(result);
  });

  api.get('/threads/:id', async (c) => c.json(await threadDetail(platform, c.req.param('id'))));

  for (const action of ['messages', 'approve-plan'] as const) {
    api.post(`/threads/:id/${action}`, signed, async (c) => {
      await threadCommand(platform, c.req.param('id'), envelopeOf(), sessionId(c));
      deps.record(c, action === 'messages' ? 'thread.message' : 'thread.approve-plan', { threadId: c.req.param('id') });
      return c.json({ ok: true });
    });
  }

  /* ---------- activity ---------- */

  // A desktop reads the journal in the background, so its reads never count as a visit for the away summary.
  api.get('/activity', (c) => c.json(platform.journal.page({
    category: c.req.query('category') ?? null,
    before: c.req.query('before') ?? null,
    limit: Number(c.req.query('limit') ?? 50),
    visit: !platform.desktops.isDesktop(sessionId(c)),
  })));

  api.post('/activity/read', async (c) => {
    const request = await readBody<MarkReadRequest>(c);
    const { unread, ids } = platform.journal.markRead(request);
    platform.pusher.read(ids).catch(() => {});
    return c.json({ unread });
  });

  // Read elsewhere (the desktop, a pull request opened on the phone): the lines about it are read, and the phone's
  // delivered notifications for them clear.
  api.post('/activity/read-targets', async (c) => {
    const { targets, before } = await readBody<ReadTargetsRequest>(c);
    if (!Number.isFinite(Date.parse(String(before)))) throw new UserError('Send `before` as an ISO time.');
    const { unread, ids } = platform.journal.markTargetsRead(targets, String(before));
    platform.pusher.read(ids).catch(() => {});
    return c.json({ unread });
  });

  api.get('/activity/reads', (c) => c.json(platform.journal.readsSince(c.req.query('since') ?? '')));

  api.get('/activity/digest', (c) => c.json(platform.journal.digest(c.req.query('since') ?? '', (target) => refOf(platform, target))));

  /* ---------- search, widgets, refs ---------- */

  api.get('/search', async (c) => c.json(await search(platform, c.req.query('q') ?? '')));

  api.get('/widgets', (c) => c.json(widgets(platform)));

  api.post('/refs/resolve', async (c) => c.json(resolveRefs(platform, (await readBody<ResolveRefsRequest>(c)).refs)));

  /* ---------- live activities, presence, preferences ---------- */

  api.post('/live-activities', async (c) => {
    try {
      platform.live.register(sessionId(c), await readBody<LiveActivityRegistration>(c));
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError((error as Error).message);
    }
    return c.json({ ok: true });
  });

  api.post('/live-activities/start-token', async (c) => {
    try {
      platform.live.registerStartToken(sessionId(c), (await readBody<PushToStartRegistration>(c)).token);
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError((error as Error).message);
    }
    return c.json({ ok: true });
  });

  api.delete('/live-activities/:token', (c) => (platform.live.unregister(c.req.param('token')) ? c.json({ ok: true }) : c.json({ error: 'No such activity' }, 404)));

  api.post('/presence', async (c) => {
    const id = sessionId(c);
    platform.presence.report(await readBody<Presence>(c), Date.now(), platform.desktops.isDesktop(id) ? id : null);
    return c.json({ ok: true });
  });

  api.get('/preferences', (c) => c.json(platform.preferences.get()));

  api.put('/preferences', async (c) => c.json(platform.preferences.set(await readBody<Partial<BorgDockPreferences>>(c))));
}
