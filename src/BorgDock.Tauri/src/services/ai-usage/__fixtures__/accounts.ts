import type { AiUsageSettings } from '@/types/settings';
import type { AiReading } from '../model';
import type { AiAccount, AiLimit } from '../types';

/** Tuesday 24 November 2026, 10:00 UTC: the moment the tests read every fixture at. */
export const NOW = Date.UTC(2026, 10, 24, 10, 0);
const HOUR = 3600;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function account(
  provider: 'claude' | 'codex',
  folder: string,
  email: string,
  plan: string,
  t3: [name: string, instance: string] | null = null,
): AiAccount {
  return {
    id: `${provider}:${folder}`,
    provider,
    folder,
    email,
    plan,
    t3Name: t3?.[0] ?? null,
    t3Instances: t3 ? [t3[1]] : [],
  };
}

export const CLAUDE_ACME = account('claude', '~/.claude', 'ada@acme.com', 'Max 20x', [
  'Acme',
  'claudeAgent',
]);
export const CLAUDE_HOME = account('claude', '~/.claude-home', 'ada@example.com', 'Max 20x', [
  'Example',
  'claudeAgent_home',
]);
export const CLAUDE_OPS = account('claude', '~/.claude-ops', 'ops@acme.com', 'Max 20x', [
  'Ops',
  'claudeAgent_ops',
]);
export const CODEX_HOME = account('codex', '~/.codex', 'ada@example.com', 'Pro', [
  'Example',
  'codex',
]);
export const CODEX_ACME = account('codex', '~/.codex-acme', 'ada@acme.com', 'Team');

/** The five accounts of the design's mockups, in the order they are found. */
export const ACCOUNTS: AiAccount[] = [CLAUDE_ACME, CLAUDE_HOME, CLAUDE_OPS, CODEX_HOME, CODEX_ACME];

/** A limit with `left` percent left that resets `resetsInSeconds` after `nowMs`. */
export function limit(
  kind: 'weekly' | 'model' | 'session',
  label: string,
  left: number,
  resetsInSeconds: number,
  nowMs = NOW,
  windowSeconds = WEEK,
): AiLimit {
  return {
    kind,
    label,
    usedPercent: 100 - left,
    resetsAt: Math.round(nowMs / 1000) + resetsInSeconds,
    windowSeconds,
  };
}

const days = (count: number, hours = 0) => count * DAY + hours * HOUR;

/** What the mockups show left of each account, read two minutes before `nowMs`. */
export function readingsAt(nowMs: number): Record<string, AiReading> {
  const read = (limits: AiLimit[], credits: string | null = null): AiReading => ({
    limits,
    credits,
    readAt: nowMs - 2 * 60_000,
    problem: null,
  });
  const weekly = (left: number, resetsIn: number) =>
    limit('weekly', 'Weekly', left, resetsIn, nowMs);
  const fable = (left: number, resetsIn: number) => limit('model', 'Fable', left, resetsIn, nowMs);
  return {
    [CLAUDE_OPS.id]: read([weekly(8, days(1, 6)), fable(3, days(1, 6))]),
    [CLAUDE_HOME.id]: read([weekly(22, days(2, 4)), fable(35, days(2, 4))]),
    [CLAUDE_ACME.id]: read([weekly(62, days(4, 9))]),
    [CODEX_HOME.id]: read([weekly(89, days(6, 5))], '45138'),
    [CODEX_ACME.id]: read([weekly(100, days(7))]),
  };
}

/** The ops account has nothing left for almost two days. */
export function opsRunOutAt(nowMs: number): Record<string, AiReading> {
  const readings = readingsAt(nowMs);
  return {
    ...readings,
    [CLAUDE_OPS.id]: {
      ...readings[CLAUDE_OPS.id]!,
      limits: [limit('weekly', 'Weekly', 0, days(1, 23), nowMs)],
    },
  };
}

/** The home account's sign-in expired two days after its last reading. */
export function homeExpiredAt(nowMs: number): Record<string, AiReading> {
  const readings = readingsAt(nowMs);
  return {
    ...readings,
    [CLAUDE_HOME.id]: {
      ...readings[CLAUDE_HOME.id]!,
      readAt: nowMs - 2 * DAY * 1000,
      problem: {
        kind: 'expired',
        message: 'Open Claude Code with this account to refresh its sign-in.',
      },
    },
  };
}

export const READINGS = readingsAt(NOW);
export const OPS_RUN_OUT = opsRunOutAt(NOW);
export const HOME_EXPIRED = homeExpiredAt(NOW);

/** The first-start sheet was answered with every suggestion kept. */
export const INTRODUCED: AiUsageSettings = { introduced: true };
