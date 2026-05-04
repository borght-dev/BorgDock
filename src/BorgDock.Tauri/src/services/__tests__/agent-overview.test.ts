import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_CUTOFF_MS,
  STATE_DEFS,
  contextBucket,
  fmtSince,
  fmtSinceShort,
  groupByContext,
  groupByRepo,
  groupByRepoWorktree,
  groupByWorktreeFlat,
  isArchived,
  isSeen,
  isSnoozed,
  pickDensity,
  sortByActivity,
  synthLabel,
  timeSinceTier,
  tokenPct,
} from '../agent-overview';
import type { SessionRecord } from '../agent-overview-types';

const baseRecord = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  sessionId: 'sid',
  cwd: '/x',
  repo: 'BorgDock',
  worktree: 'master',
  branch: 'master',
  label: 'BD · master #1',
  state: 'working',
  stateSinceMs: 0,
  lastEventMs: 0,
  lastUserMsg: null,
  lastAssistantMsg: null,
  task: null,
  model: null,
  tokensUsed: 0,
  tokensMax: 200_000,
  lastApiStopReason: null,
  currentTurnFiles: [],
  snoozedUntilMs: null,
  seenAtMs: null,
  ...overrides,
});

describe('synthLabel', () => {
  it('uses initials for hyphenated and CamelCase names', () => {
    expect(synthLabel('BorgDock', 'master', 1, {})).toBe('BD · master #1');
    expect(synthLabel('FSP-Horizon', 'wt2', 3, {})).toBe('FH · wt2 #3');
  });
  it('respects override map', () => {
    expect(synthLabel('BorgDock', 'master', 1, { BorgDock: 'B' })).toBe('B · master #1');
  });
});

describe('pickDensity', () => {
  it('picks roomy/standard/wall by active count', () => {
    expect(pickDensity(3)).toBe('roomy');
    expect(pickDensity(8)).toBe('standard');
    expect(pickDensity(20)).toBe('wall');
  });
  it('collapses one tier on narrow viewports', () => {
    expect(pickDensity(3, 800)).toBe('standard');
    expect(pickDensity(8, 800)).toBe('wall');
    expect(pickDensity(3, 1600)).toBe('roomy');
  });
});

describe('timeSinceTier', () => {
  it('returns normal/warn/alert by age', () => {
    expect(timeSinceTier(30_000)).toBe('normal');
    expect(timeSinceTier(3 * 60_000)).toBe('warn');
    expect(timeSinceTier(11 * 60_000)).toBe('alert');
  });
});

describe('isArchived', () => {
  const stub = (over: Partial<SessionRecord>) => baseRecord(over);
  it('archives idle/ended sessions older than 24h', () => {
    expect(isArchived(stub({ state: 'idle', lastEventMs: ARCHIVE_CUTOFF_MS + 1 }))).toBe(true);
    expect(isArchived(stub({ state: 'ended', lastEventMs: ARCHIVE_CUTOFF_MS + 1 }))).toBe(true);
    expect(isArchived(stub({ state: 'idle', lastEventMs: 60_000 }))).toBe(false);
    expect(isArchived(stub({ state: 'working', lastEventMs: ARCHIVE_CUTOFF_MS + 1 }))).toBe(false);
  });
});

describe('fmtSince', () => {
  it('formats seconds, minutes, hours', () => {
    expect(fmtSince(45_000)).toBe('45s');
    expect(fmtSince(125_000)).toBe('2m 5s');
    expect(fmtSince(3_660_000)).toBe('1h 1m');
  });
  it('short variant', () => {
    expect(fmtSinceShort(45_000)).toBe('45s');
    expect(fmtSinceShort(125_000)).toBe('2m');
    expect(fmtSinceShort(3_660_000)).toBe('1h');
  });
});

describe('tokenPct', () => {
  it('clamps to 100', () => {
    expect(tokenPct(baseRecord({ tokensUsed: 50_000, tokensMax: 200_000 }))).toBe(25);
    expect(tokenPct(baseRecord({ tokensUsed: 250_000, tokensMax: 200_000 }))).toBe(100);
  });
});

describe('groupByRepo / groupByRepoWorktree', () => {
  it('groups by repo and worktree', () => {
    const recs = [
      baseRecord({ sessionId: 'a', repo: 'X', worktree: 'master' }),
      baseRecord({ sessionId: 'b', repo: 'X', worktree: 'wt2' }),
      baseRecord({ sessionId: 'c', repo: 'Y', worktree: 'master' }),
    ];
    const r = groupByRepo(recs);
    expect(r).toHaveLength(2);
    const rw = groupByRepoWorktree(recs);
    expect(rw[0]!.worktrees).toHaveLength(2);
  });
});

describe('groupByWorktreeFlat', () => {
  it('produces one entry per (repo, worktree)', () => {
    const recs = [
      baseRecord({ sessionId: 'a', repo: 'X', worktree: 'master' }),
      baseRecord({ sessionId: 'b', repo: 'X', worktree: 'master' }),
      baseRecord({ sessionId: 'c', repo: 'X', worktree: 'wt2' }),
      baseRecord({ sessionId: 'd', repo: 'Y', worktree: 'master' }),
    ];
    const out = groupByWorktreeFlat(recs);
    expect(out).toHaveLength(3);
    expect(out[0]!.agents).toHaveLength(2);
  });
});

describe('contextBucket / groupByContext', () => {
  it('buckets by token usage', () => {
    expect(contextBucket(baseRecord({ tokensUsed: 180_000, tokensMax: 200_000 }))).toBe('high');
    expect(contextBucket(baseRecord({ tokensUsed: 140_000, tokensMax: 200_000 }))).toBe('mid');
    expect(contextBucket(baseRecord({ tokensUsed: 50_000, tokensMax: 200_000 }))).toBe('low');
  });
  it('returns buckets ordered high→mid→low and skips empty buckets', () => {
    const recs = [
      baseRecord({ sessionId: 'a', tokensUsed: 180_000 }),
      baseRecord({ sessionId: 'b', tokensUsed: 50_000 }),
    ];
    const out = groupByContext(recs);
    expect(out.map((g) => g.bucket)).toEqual(['high', 'low']);
  });
});

describe('sortByActivity', () => {
  it('sorts smaller lastEventMs (more recent) first', () => {
    const recs = [
      baseRecord({ sessionId: 'a', lastEventMs: 30_000 }),
      baseRecord({ sessionId: 'b', lastEventMs: 1_000 }),
      baseRecord({ sessionId: 'c', lastEventMs: 10_000 }),
    ];
    expect(sortByActivity(recs).map((r) => r.sessionId)).toEqual(['b', 'c', 'a']);
  });
});

describe('STATE_DEFS', () => {
  it('has an entry per state', () => {
    for (const s of ['working', 'tool', 'awaiting', 'finished', 'idle', 'ended'] as const) {
      expect(STATE_DEFS[s]).toBeDefined();
    }
  });
});

describe('isSnoozed', () => {
  it('false when snoozedUntilMs is null', () => {
    expect(isSnoozed(baseRecord({ snoozedUntilMs: null }), 1_000)).toBe(false);
  });
  it('true when snoozedUntilMs > now', () => {
    expect(isSnoozed(baseRecord({ snoozedUntilMs: 2_000 }), 1_000)).toBe(true);
  });
  it('false when expired', () => {
    expect(isSnoozed(baseRecord({ snoozedUntilMs: 500 }), 1_000)).toBe(false);
  });
});

describe('isSeen', () => {
  it('false when seenAtMs is null', () => {
    expect(isSeen(baseRecord({ seenAtMs: null }))).toBe(false);
  });
  it('true when seenAtMs is set', () => {
    expect(isSeen(baseRecord({ seenAtMs: 1_000 }))).toBe(true);
  });
});
