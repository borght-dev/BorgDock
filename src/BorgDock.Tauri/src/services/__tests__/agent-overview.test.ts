import { describe, expect, it } from 'vitest';
import {
  STATE_DEFS,
  fmtSince,
  fmtSinceShort,
  groupByRepo,
  groupByRepoWorktree,
  pickDensity,
  synthLabel,
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
  task: null,
  model: null,
  tokensUsed: 0,
  tokensMax: 200_000,
  lastApiStopReason: null,
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

describe('STATE_DEFS', () => {
  it('has an entry per state', () => {
    for (const s of ['working', 'tool', 'awaiting', 'finished', 'idle', 'ended'] as const) {
      expect(STATE_DEFS[s]).toBeDefined();
    }
  });
});
