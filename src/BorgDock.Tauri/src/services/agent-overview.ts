import type { SessionRecord, SessionState, StateDef } from './agent-overview-types';

export const STATE_DEFS: Record<SessionState, StateDef> = {
  awaiting: {
    label: 'Awaiting input',
    short: 'Awaiting',
    tone: 'warning',
    dotTone: 'yellow',
    pulse: true,
    priority: 0,
    description: 'Waiting for you',
  },
  finished: {
    label: 'Just finished',
    short: 'Finished',
    tone: 'success',
    dotTone: 'green',
    pulse: false,
    priority: 1,
    description: 'Fresh output',
  },
  working: {
    label: 'Working',
    short: 'Working',
    tone: 'neutral',
    dotTone: 'violet',
    pulse: false,
    priority: 2,
    description: 'Producing tokens',
  },
  tool: {
    label: 'Tool running',
    short: 'Tool',
    tone: 'neutral',
    dotTone: 'violet',
    pulse: false,
    priority: 3,
    description: 'Long-running tool',
  },
  idle: {
    label: 'Idle',
    short: 'Idle',
    tone: 'draft',
    dotTone: 'gray',
    pulse: false,
    priority: 4,
    description: 'No recent activity',
  },
  ended: {
    label: 'Ended',
    short: 'Ended',
    tone: 'draft',
    dotTone: 'gray',
    pulse: false,
    priority: 5,
    description: 'Session ended',
  },
};

export function fmtSince(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtSinceShort(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export function tokenPct(r: SessionRecord): number {
  if (r.tokensMax <= 0) return 0;
  return Math.min(100, Math.round((r.tokensUsed / r.tokensMax) * 100));
}

export function pickDensity(activeCount: number): 'roomy' | 'standard' | 'wall' {
  if (activeCount <= 6) return 'roomy';
  if (activeCount <= 12) return 'standard';
  return 'wall';
}

export function synthLabel(
  repo: string,
  worktree: string,
  index: number,
  overrides: Record<string, string>,
): string {
  const short = overrides[repo] ?? defaultShortRepo(repo);
  return `${short} · ${worktree} #${index}`;
}

function defaultShortRepo(repo: string): string {
  const parts = repo.split(/[-_ ]/);
  if (parts.length > 1) {
    return parts
      .map((p) => (p[0] ?? '').toUpperCase())
      .join('')
      .slice(0, 4) || '?';
  }
  // CamelCase initials fallback
  const caps = repo.match(/[A-Z]/g) ?? [];
  if (caps.length >= 2) return caps.join('').slice(0, 4);
  return repo.slice(0, 2).toUpperCase();
}

export function groupByRepo(
  records: SessionRecord[],
): Array<{ repo: string; agents: SessionRecord[] }> {
  const map = new Map<string, SessionRecord[]>();
  for (const r of records) {
    const list = map.get(r.repo) ?? [];
    list.push(r);
    map.set(r.repo, list);
  }
  return [...map.entries()].map(([repo, agents]) => ({ repo, agents }));
}

export function groupByRepoWorktree(records: SessionRecord[]) {
  const repos = groupByRepo(records);
  return repos.map(({ repo, agents }) => {
    const wts = new Map<string, SessionRecord[]>();
    for (const a of agents) {
      const list = wts.get(a.worktree) ?? [];
      list.push(a);
      wts.set(a.worktree, list);
    }
    return {
      repo,
      worktrees: [...wts.entries()].map(([worktree, list]) => ({
        worktree,
        branch: list[0]?.branch ?? '',
        agents: list,
      })),
    };
  });
}

export function awaitingCount(records: SessionRecord[]): number {
  return records.filter((r) => r.state === 'awaiting').length;
}
