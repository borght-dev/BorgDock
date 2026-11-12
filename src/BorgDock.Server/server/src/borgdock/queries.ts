import type {
  Account, ActivityTarget, ResolvedRefs, SearchResults, Sources, ThreadSummary, Tone, WidgetSnapshot, WorkItemSummary,
} from '../../../shared/src/api.ts';
import { Sessions } from '../auth/sessions.ts';
import { threadSummary } from '../engine/overview.ts';
import type { Platform } from './platform.ts';
import { NEEDS_YOU } from './verdict.ts';

const NUMBER_QUERY = /^(?:AB#?|#)?(\d{1,7})$/i;
const MAX_REFS = 200;

export function adoOrg(orgUrl: string): string {
  return orgUrl.replace(/\/+$/, '').split('/').pop() ?? orgUrl;
}

/** The note and workstream reference for an activity target. */
export function refOf(platform: Platform, target: ActivityTarget): string | null {
  const { config } = platform.deps;
  switch (target.kind) {
    case 'pr': return `gh:github.com/${target.key}`;
    case 'item': return `ado:${adoOrg(config.ado.orgUrl)}#${target.id}`;
    case 'thread': {
      const fleet = platform.deps.service.fleet;
      const host = fleet?.hostFor(target.id);
      return host ? `t3:${host.config.environmentId}/${fleet!.rawId(target.id)}` : null;
    }
    default: return null;
  }
}

function summaries(platform: Platform): ThreadSummary[] {
  const { service } = platform.deps;
  const fleet = service.fleet;
  if (!fleet) return [];
  return [...fleet.threads.values()].map((t) => threadSummary(t, (id) => service.threadLink(id)));
}

export async function search(platform: Platform, query: string): Promise<SearchResults> {
  const { service, github } = platform.deps;
  const q = query.trim().slice(0, 200);
  if (!q) return { query: q, pullRequests: [], items: [], threads: [] };
  const number = NUMBER_QUERY.exec(q)?.[1];
  const needle = q.toLowerCase();

  const known = (service.overview?.items ?? []).map((o) => o.item);
  const items: WorkItemSummary[] = number
    ? known.filter((i) => String(i.id) === number)
    : known.filter((i) => i.title.toLowerCase().includes(needle));
  if (number && !items.length) {
    const found = await service.itemSummary(Number(number)).catch(() => null);
    if (found) items.push(found);
  } else if (!number && q.length >= 3) {
    const more = await service.browse(null, q).then((r) => r.items).catch(() => []);
    for (const item of more) if (!items.some((i) => i.id === item.id)) items.push(item);
  }

  const pullRequests = github.search(q);
  const threads = summaries(platform)
    .filter((t) => t.status !== 'settled' || Date.now() - Date.parse(t.lastActivityAt) < 14 * 86_400_000)
    .filter((t) => (number ? new RegExp(`\\b${number}\\b`).test(`${t.title} ${t.branch ?? ''}`) : `${t.title} ${t.branch ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, 20);
  return { query: q, pullRequests, items: items.slice(0, 30), threads };
}

function age(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

export function widgets(platform: Platform, nowMs = Date.now()): WidgetSnapshot {
  const { github, service } = platform.deps;
  const focus = github.focus;
  const prs = focus?.pullRequests ?? [];
  const top = [...prs.filter((p) => p.bucket === 'you'), ...prs.filter((p) => p.bucket === 'ready')].slice(0, 3);
  const launched = platform.live.launchedThreads();
  const ownThreads = [
    ...(service.overview?.items ?? []).flatMap((o) => o.threads.slice(0, 1)),
    ...(service.overview?.unlinkedThreads ?? []).filter((t) => launched.has(t.id)),
  ];
  return {
    generatedAt: new Date(nowMs).toISOString(),
    focus: {
      needYou: focus?.counts.you ?? 0,
      ready: focus?.counts.ready ?? 0,
      waiting: focus?.counts.wait ?? 0,
      top: top.map((p) => ({ key: p.key, number: p.number, title: p.title, segments: p.checks.segments, age: age(p.updatedAt, nowMs) })),
    },
    agents: {
      waitingOnYou: ownThreads.filter((t) => NEEDS_YOU.includes(t.status)).length,
      running: ownThreads.filter((t) => t.status === 'running').length,
    },
    master: github.masterHealth(),
  };
}

const TONE_OF_STATUS: Record<ThreadSummary['status'], Tone> = { question: 'bad', plan: 'bad', approval: 'bad', 'your-turn': 'bad', failed: 'bad', running: 'run', settled: 'mute' };

export function resolveRefs(platform: Platform, refs: unknown): ResolvedRefs {
  const { github, service, config } = platform.deps;
  const result: ResolvedRefs = {};
  const list = Array.isArray(refs) ? refs.map(String).slice(0, MAX_REFS) : [];
  const org = adoOrg(config.ado.orgUrl);
  const prs = new Map(github.pullRequests.map((p) => [p.key.toLowerCase(), p]));
  const items = new Map((service.overview?.items ?? []).map((o) => [o.item.id, o]));

  const pullRequest = (owner: string | null, repo: string, number: string): ResolvedRefs[string] => {
    // A bare `repo#12` (as notes write it) matches the open pull request of that number in any repo of that name.
    const pr = owner
      ? prs.get(`${owner}/${repo}#${number}`.toLowerCase())
      : github.pullRequests.find((p) => p.repo.toLowerCase() === repo.toLowerCase() && String(p.number) === number);
    if (pr) {
      const tone: Tone = pr.checks.failed ? 'bad' : pr.reviewDecision === 'approved' ? 'ok' : pr.checks.pending ? 'run' : 'mute';
      return { title: pr.title, state: pr.isDraft ? 'draft' : pr.state, tone, url: pr.url, live: true };
    }
    return { title: `${repo}#${number}`, state: 'unknown', tone: 'mute', url: owner ? `https://github.com/${owner}/${repo}/pull/${number}` : null, live: false };
  };

  const workItem = (itemOrg: string, id: string): ResolvedRefs[string] => {
    const entry = itemOrg.toLowerCase() === org.toLowerCase() ? items.get(Number(id)) : undefined;
    return entry
      ? { title: entry.item.title, state: entry.item.state, tone: entry.walk?.verdict.tone ?? 'mute', url: entry.item.url, live: true }
      : { title: `AB#${id}`, state: 'unknown', tone: 'mute', url: `https://dev.azure.com/${itemOrg}/_workitems/edit/${id}`, live: false };
  };

  for (const ref of list) {
    const gh = /^gh:github\.com\/([^/#\s]+)\/([^/#\s]+)#(\d+)$/i.exec(ref);
    if (gh) { result[ref] = pullRequest(gh[1], gh[2], gh[3]); continue; }
    const ado = /^ado:([^#\s]+)#(\d+)$/i.exec(ref);
    if (ado) { result[ref] = workItem(ado[1], ado[2]); continue; }
    // Short forms, as notes write them: AB#123, owner/repo#12, repo#12.
    const ab = /^AB#(\d+)$/i.exec(ref);
    if (ab) { result[ref] = workItem(org, ab[1]); continue; }
    const short = /^(?:([A-Za-z0-9_.-]+)\/)?([A-Za-z0-9_.-]+)#(\d+)$/.exec(ref);
    if (short) { result[ref] = pullRequest(short[1] ?? null, short[2], short[3]); continue; }
    const t3 = /^t3:([^/\s]+)\/(.+)$/.exec(ref);
    if (t3 && service.fleet) {
      const host = service.fleet.byEnvironment(t3[1]);
      const thread = host ? service.fleet.threads.get(service.fleet.scopedId(host, t3[2])) : undefined;
      result[ref] = thread
        ? { title: thread.title, state: thread.status, tone: TONE_OF_STATUS[thread.status], url: service.threadLink(thread.id).appLink, live: host!.source.status.ok }
        : { title: 'T3 thread', state: 'unknown', tone: 'mute', url: `t3code://threads/${encodeURIComponent(t3[1])}/${encodeURIComponent(t3[2])}`, live: false };
    }
  }
  return result;
}

export function sources(platform: Platform): Sources {
  const { github, service, config } = platform.deps;
  const ado = service.overview?.sources.ado;
  return {
    github: github.focus?.accounts ?? [],
    // The server reads ADO through this machine's `az` sign-in, as Dispatch always has.
    ado: { org: adoOrg(config.ado.orgUrl), project: config.ado.project, via: 'machine', machine: config.t3.label, ok: Boolean(ado?.ok), error: ado?.error ?? null },
    machines: platform.hub.machines(),
    desktops: platform.desktops.list().map((d) => ({ ...d, atDesk: platform.presence.atDeskFor(d.sessionId) })),
  };
}

export function account(platform: Platform, currentSessionId: string): Account | null {
  const owner = platform.owners.get();
  if (!owner) return null;
  const sessions = new Sessions(platform.deps.db).list(currentSessionId);
  const desktops = new Set(platform.desktops.list().map((d) => d.sessionId));
  return {
    owner,
    devices: sessions.map((s) => ({
      sessionId: s.id, name: s.name, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.current,
      trustedBy: platform.devices.keyOf(s.id) ? platform.hub.trustedBy(s.id) : [],
      ...(desktops.has(s.id) ? { kind: 'desktop' as const } : s.kind === 'app' ? { kind: 'phone' as const } : {}),
    })),
  };
}
