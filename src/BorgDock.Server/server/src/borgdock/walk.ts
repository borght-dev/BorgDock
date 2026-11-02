import type { ItemOverview, LatestMessage, Overview, PrSummary, ThreadSummary, Tone, Walk } from '../../../shared/src/api.ts';
import type { AdoItem } from '../ado/client.ts';
import { evidenceOf, latestMessage, NEEDS_YOU, verdictOf, type ItemComment, type ItemNote, type WalkPullRequest, type WalkThread } from './verdict.ts';

// Ported from the desktop's src/services/dispatch/walk.ts: the states checked every morning, in walk order.

export const WALK_ORDER: readonly string[] = ['Code Review', 'Development In Progress', 'Testing Failed', 'Needs Human', 'New'];

const CATEGORY_RANK: Record<AdoItem['stateCategory'], number> = { InProgress: 0, Proposed: 1, Resolved: 2, Completed: 3, Removed: 4 };
export const TONE_RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, run: 3, mute: 4 };

type Row = { overview: ItemOverview; tone: Tone; label: string };

const byTone = (a: Row, b: Row) => TONE_RANK[a.tone] - TONE_RANK[b.tone];

/** The walk's states in walk order (always, even empty), then every other state that has items. */
export function walkLanes(rows: readonly Row[]): { state: string; rows: Row[] }[] {
  const byState = new Map<string, Row[]>();
  for (const row of rows) byState.set(row.overview.item.state, [...(byState.get(row.overview.item.state) ?? []), row]);
  const walked = WALK_ORDER.map((state) => ({ state, rows: (byState.get(state) ?? []).sort(byTone) }));
  const rest = [...byState.entries()]
    .filter(([state]) => !WALK_ORDER.includes(state))
    .sort(([a, rowsA], [b, rowsB]) => CATEGORY_RANK[rowsA[0].overview.item.stateCategory] - CATEGORY_RANK[rowsB[0].overview.item.stateCategory] || a.localeCompare(b))
    .map(([state, list]) => ({ state, rows: list.sort(byTone) }));
  return [...walked, ...rest];
}

/** `1 Ready to merge · 1 CI red · 2 fine`: the verdicts that ask something, most urgent first. */
export function laneSummary(rows: readonly Row[]): string {
  const counts = new Map<string, { tone: Tone; count: number }>();
  for (const { label, tone } of rows) {
    if (tone === 'mute' || tone === 'run') continue;
    counts.set(label, { tone, count: (counts.get(label)?.count ?? 0) + 1 });
  }
  const quiet = rows.filter((r) => r.tone === 'mute' || r.tone === 'run').length;
  const asks = [...counts.entries()].sort(([, a], [, b]) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).map(([label, { count }]) => `${count} ${label}`);
  if (quiet > 0 && asks.length > 0) asks.push(`${quiet} fine`);
  return asks.join(' · ');
}

export function laneTone(rows: readonly Row[]): Tone | null {
  return rows.reduce<Tone | null>((worst, r) => (worst === null || TONE_RANK[r.tone] < TONE_RANK[worst] ? r.tone : worst), null);
}

export type WalkSources = {
  items: AdoItem[];
  /** Notes and the newest comment per item, read when its ChangedDate moved. */
  facts: Map<number, { notes: ItemNote | null; lastComment: ItemComment | null }>;
  /** GitHub's open pull requests, for checks, approval and merge times. */
  pullRequests: PrSummary[];
  /** Where a thread's agent works: its branch when T3 made a worktree for it, else its project's title. */
  placeOf: (thread: ThreadSummary) => string;
  now: Date;
};

const namesItem = (text: string, id: number) => new RegExp(`(\\b|AB#?)${id}\\b`).test(text);

function pullRequestsOf(overview: ItemOverview, item: AdoItem, sources: WalkSources, myIds: Set<number>): WalkPullRequest[] {
  const byUrl = new Map<string, WalkPullRequest>();
  const t3 = overview.pullRequest;
  if (t3) byUrl.set(t3.url.toLowerCase(), { number: t3.number, state: t3.state, isDraft: t3.isDraft, checks: null, approved: false, mergedAt: null, shared: false });
  for (const pr of sources.pullRequests) {
    const linked = pr.workItemIds.includes(item.id) || namesItem(`${pr.title} ${pr.headRef}`, item.id);
    if (!linked) continue;
    const mine = pr.workItemIds.filter((id) => myIds.has(id));
    byUrl.set(pr.url.toLowerCase(), {
      number: pr.number,
      state: pr.state,
      isDraft: pr.isDraft,
      checks: pr.checks.total ? { passed: pr.checks.passed, failed: pr.checks.failed, pending: pr.checks.pending, total: pr.checks.total } : null,
      approved: pr.reviewDecision === 'approved',
      mergedAt: pr.mergedAt,
      shared: mine.length > 1 && !namesItem(pr.title, item.id),
    });
  }
  const rank = { open: 0, merged: 1, unknown: 2, closed: 3 };
  return [...byUrl.values()].sort((a, b) => rank[a.state] - rank[b.state] || b.number - a.number);
}

const toLatest = (message: ReturnType<typeof latestMessage>, fallbackAt: string): LatestMessage | null =>
  message ? { by: message.author, text: message.text, at: message.at ?? fallbackAt, source: message.source } : null;

/** Fills `ItemOverview.walk` and `Overview.walk`. The suggestion engine decides what is out of sync. */
export function applyWalk(overview: Overview, sources: WalkSources) {
  const itemsById = new Map(sources.items.map((i) => [i.id, i]));
  const myIds = new Set(sources.items.map((i) => i.id));
  const rows: Row[] = [];
  for (const entry of overview.items) {
    const ado = itemsById.get(entry.item.id);
    if (!ado) continue;
    const extra = sources.facts.get(ado.id);
    const item = {
      id: ado.id, state: ado.state, stateCategory: ado.stateCategory, states: ado.states, notes: extra?.notes ?? null, lastComment: extra?.lastComment ?? null,
      dueDate: ado.dueDate, priority: ado.priority, linkedPullRequests: ado.linkedPullRequests, changedAt: ado.changedAt,
    };
    const threads: WalkThread[] = entry.threads.map((t) => ({
      open: t.status !== 'settled', status: t.status, place: sources.placeOf(t), lastActivityAt: t.lastActivityAt, lastAgentMessage: t.lastAgentMessage,
    }));
    const pullRequests = pullRequestsOf(entry, ado, sources, myIds);
    const drift = entry.suggestion?.to ? { to: entry.suggestion.to, reason: entry.suggestion.reason, evidence: entry.suggestion.id } : null;
    const facts = { item, threads, pullRequests, now: sources.now, drift };
    const verdict = verdictOf(facts);
    entry.walk = { verdict, evidence: evidenceOf(facts), latest: toLatest(latestMessage(item, threads), ado.changedAt) };
    rows.push({ overview: entry, tone: verdict.tone, label: verdict.label });
  }
  const walk: Walk = {
    lanes: walkLanes(rows).map(({ state, rows: laneRows }) => ({
      state, itemIds: laneRows.map((r) => r.overview.item.id), tone: laneTone(laneRows), summary: laneSummary(laneRows),
    })),
    briefing: {
      needYou: rows.filter((r) => r.tone === 'bad').length,
      outOfSync: overview.items.filter((o) => o.suggestion?.to).length,
      running: overview.items.filter((o) => o.threads.some((t) => t.status === 'running')).length,
    },
  };
  overview.walk = walk;
}

/** Someone waits on your answer: a person asked in ADO first, then an agent that stopped. */
export function needingYou(items: readonly ItemOverview[]): ItemOverview[] {
  const waitRank = (o: ItemOverview) => (o.item.state === 'Needs Human' ? 0 : o.threads.some((t) => t.status !== 'settled' && NEEDS_YOU.includes(t.status)) ? 1 : 2);
  return items.filter((o) => o.walk?.verdict.tone === 'bad').sort((a, b) => waitRank(a) - waitRank(b));
}
