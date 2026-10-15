import {
  type AgentThread,
  type ItemOverview,
  NEEDS_YOU,
  type StateCategory,
  type SyncScope,
  type Tone,
} from './types';

/**
 * The states checked every morning, in the order they are checked. They
 * always show, even empty: an empty Testing Failed is news too.
 */
export const WALK_ORDER: readonly string[] = [
  'Code Review',
  'Development In Progress',
  'Testing Failed',
  'Needs Human',
  'New',
];

/** Any other state follows the walk: work under way first, then not started, then with QA. */
const CATEGORY_RANK: Record<StateCategory, number> = {
  InProgress: 0,
  Proposed: 1,
  Resolved: 2,
  Completed: 3,
  Removed: 4,
};

export const TONE_RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, run: 3, mute: 4 };

/** One section of the walk: the items in one ADO state. */
export interface Lane {
  state: string;
  rows: ItemOverview[];
  /** One of the states every walk checks. */
  inWalk: boolean;
}

function byTone(a: ItemOverview, b: ItemOverview): number {
  return TONE_RANK[a.verdict.tone] - TONE_RANK[b.verdict.tone];
}

/** The items per state: the walk's states in walk order, then every other state that has items. */
export function walkLanes(items: readonly ItemOverview[]): Lane[] {
  const byState = new Map<string, ItemOverview[]>();
  for (const overview of items) {
    const rows = byState.get(overview.item.state) ?? [];
    rows.push(overview);
    byState.set(overview.item.state, rows);
  }
  const walked = WALK_ORDER.map((state) => ({
    state,
    rows: (byState.get(state) ?? []).sort(byTone),
    inWalk: true,
  }));
  const rest = [...byState.entries()]
    .filter(([state]) => !WALK_ORDER.includes(state))
    .sort(
      ([a, rowsA], [b, rowsB]) =>
        CATEGORY_RANK[rowsA[0]!.item.stateCategory] - CATEGORY_RANK[rowsB[0]!.item.stateCategory] ||
        a.localeCompare(b),
    )
    .map(([state, rows]) => ({ state, rows: rows.sort(byTone), inWalk: false }));
  return [...walked, ...rest];
}

/** `1 Ready for QA · 1 CI red`: the lane's verdicts that ask something, most urgent first. */
export function laneSummary(rows: readonly ItemOverview[]): string {
  const counts = new Map<string, { tone: Tone; count: number }>();
  for (const { verdict } of rows) {
    if (verdict.tone === 'mute' || verdict.tone === 'run') continue;
    const seen = counts.get(verdict.label);
    counts.set(verdict.label, { tone: verdict.tone, count: (seen?.count ?? 0) + 1 });
  }
  const quiet = rows.filter((o) => o.verdict.tone === 'mute' || o.verdict.tone === 'run').length;
  const asks = [...counts.entries()]
    .sort(([, a], [, b]) => TONE_RANK[a.tone] - TONE_RANK[b.tone])
    .map(([label, { count }]) => `${count} ${label}`);
  if (quiet > 0 && asks.length > 0) asks.push(`${quiet} fine`);
  return asks.join(' · ');
}

/** Someone waits on your answer: a person asked in ADO first, then an agent that stopped. */
function waitRank(overview: ItemOverview): number {
  if (overview.item.state === 'Needs Human') return 0;
  return overview.threads.some((t) => t.open && NEEDS_YOU.includes(t.status)) ? 1 : 2;
}

/** The items that ask something of you now, those someone waits on first: what Focus shows. */
export function needingYou(items: readonly ItemOverview[]): ItemOverview[] {
  return items.filter((o) => o.verdict.tone === 'bad').sort((a, b) => waitRank(a) - waitRank(b));
}

/** The items whose state the evidence contradicts. */
export function outOfSync(items: readonly ItemOverview[]): ItemOverview[] {
  return items.filter((o) => o.suggestion !== null);
}

/** The items a sync of `scope` can take. */
export function syncCandidates(items: readonly ItemOverview[], scope: SyncScope): ItemOverview[] {
  switch (scope.kind) {
    case 'state':
      return items.filter((o) => o.item.state === scope.state);
    case 'all':
      return [...items];
    case 'drift':
      return outOfSync(items);
    case 'item':
      return items.filter((o) => o.item.id === scope.itemId);
  }
}

/** The open thread of an item's own agent: a sync leaves the item to it. */
export function ownAgent(overview: ItemOverview): AgentThread | undefined {
  return overview.threads.find((t) => t.open);
}

/**
 * The candidates a sync starts with ticked: every one for a fix or a single
 * item, else the ones out of sync and the ones no agent of their own is on.
 */
export function preselected(candidates: readonly ItemOverview[], scope: SyncScope): number[] {
  const all = scope.kind === 'drift' || scope.kind === 'item';
  return candidates
    .filter((o) => all || o.suggestion !== null || !ownAgent(o))
    .map((o) => o.item.id);
}

/** The state an agent is asked to move an item to: the one asked for, else the one the evidence asks. */
export function syncTarget(overview: ItemOverview, scope: SyncScope): string | null {
  if (scope.kind === 'item' && scope.itemId === overview.item.id && scope.to) return scope.to;
  return overview.suggestion?.to ?? null;
}

/** What the run is called: `Sync Code Review (4)`, `Sync all (8)`, `Move 60107 to Ready For QA`. */
export function syncLabel(scope: SyncScope, count: number): string {
  switch (scope.kind) {
    case 'state':
      return `Sync ${scope.state} (${count})`;
    case 'all':
      return `Sync all (${count})`;
    case 'drift':
      return `Fix out of sync (${count})`;
    case 'item':
      return scope.to ? `Move ${scope.itemId} to ${scope.to}` : `Sync ${scope.itemId}`;
  }
}
