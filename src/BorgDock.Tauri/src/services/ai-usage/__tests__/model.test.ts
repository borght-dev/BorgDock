import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS,
  CLAUDE_ACME,
  CLAUDE_HOME,
  CLAUDE_OPS,
  CODEX_ACME,
  CODEX_HOME,
  HOME_EXPIRED,
  INTRODUCED,
  limit,
  NOW,
  OPS_RUN_OUT,
  READINGS,
  readingsAt,
} from '../__fixtures__/accounts';
import {
  accountPreferences,
  accountSummary,
  accountsRunOut,
  accountViews,
  bestAlternative,
  colorsByLabel,
  formatCredits,
  mergeReading,
  paceTick,
  percentLeft,
  railAccounts,
  resetMoment,
  resetsIn,
  sanitizeLabel,
  suggestedLabels,
  toneOf,
  unknownAccounts,
  withAccountPreference,
  withEveryAccount,
} from '../model';

const views = (readings = READINGS, settings = INTRODUCED, accounts = ACCOUNTS) =>
  accountViews({ accounts, readings, settings, nowMs: NOW });
const labelsOf = (list: ReturnType<typeof views>) => list.map((view) => view.label);

describe('suggested labels', () => {
  it("takes the first two letters of T3 Code's name, else of the email domain", () => {
    const labels = suggestedLabels(ACCOUNTS);
    expect(labels[CLAUDE_ACME.id]).toBe('AC');
    expect(labels[CLAUDE_HOME.id]).toBe('EX');
    expect(labels[CODEX_HOME.id]).toBe('EX');
    expect(labels[CODEX_ACME.id]).toBe('AC');
  });

  it("gives a clashing account its folder's suffix", () => {
    const unnamed = { ...CLAUDE_OPS, t3Name: null };
    expect(suggestedLabels([CLAUDE_ACME, unnamed])[unnamed.id]).toBe('OP');
  });

  it('numbers an account that has nothing else to tell it apart', () => {
    const twin = { ...CLAUDE_ACME, id: 'claude:/srv/claude', folder: '/srv/.claude', t3Name: null };
    const labels = suggestedLabels([CLAUDE_ACME, twin]);
    expect(labels[twin.id]).toBe('CL');
    const third = { ...twin, id: 'claude:/srv/other', folder: '/srv/other/.claude' };
    expect(suggestedLabels([CLAUDE_ACME, twin, third])[third.id]).toBe('A2');
  });

  it('falls back to the provider when an account has no email and no suffix', () => {
    const bare = { ...CODEX_HOME, email: null, t3Name: null };
    expect(suggestedLabels([bare])[bare.id]).toBe('CO');
  });
});

describe('preferences', () => {
  it('gives one colour per label across providers', () => {
    expect(colorsByLabel(['AC', 'EX', 'OP', 'EX', 'AC'])).toEqual({ AC: 1, EX: 2, OP: 3 });
    const preferences = accountPreferences(ACCOUNTS, undefined);
    expect(preferences[CLAUDE_ACME.id]!.color).toBe(preferences[CODEX_ACME.id]!.color);
    expect(preferences[CLAUDE_HOME.id]!.color).toBe(preferences[CODEX_HOME.id]!.color);
  });

  it('keeps what Settings holds over the suggestion', () => {
    const settings = withAccountPreference(INTRODUCED, ACCOUNTS, CLAUDE_OPS.id, {
      label: 'OPS',
      color: 5,
      hidden: true,
    });
    expect(accountPreferences(ACCOUNTS, settings)[CLAUDE_OPS.id]).toEqual({
      label: 'OPS',
      color: 5,
      hidden: true,
    });
    expect(accountPreferences(ACCOUNTS, settings)[CLAUDE_ACME.id]!.label).toBe('AC');
  });

  it('cleans a typed label to three letters or digits, upper case', () => {
    expect(sanitizeLabel('go-1x')).toBe('GO1');
    expect(sanitizeLabel(' é ')).toBe('');
  });

  it('saves every account when the first-start sheet is answered', () => {
    const preferences = accountPreferences(ACCOUNTS, undefined);
    const saved = withEveryAccount(undefined, ACCOUNTS, preferences);
    expect(saved.introduced).toBe(true);
    expect(Object.keys(saved.accounts ?? {})).toHaveLength(ACCOUNTS.length);
    expect(saved.order).toEqual(ACCOUNTS.map((account) => account.id));
  });

  it('leaves the sheet unanswered when Settings was edited before any account was found', () => {
    expect(withEveryAccount(undefined, [], {}).introduced).toBe(false);
    expect(withEveryAccount({ introduced: true }, [], {}).introduced).toBe(true);
  });

  it('knows an account found after the sheet was answered', () => {
    const saved = withEveryAccount(
      undefined,
      [CLAUDE_ACME],
      accountPreferences([CLAUDE_ACME], undefined),
    );
    expect(unknownAccounts(ACCOUNTS, undefined)).toEqual([]);
    expect(unknownAccounts([CLAUDE_ACME, CODEX_HOME], saved)).toEqual([CODEX_HOME]);
  });
});

describe('what is left', () => {
  it('reads the share left and its tone', () => {
    expect(percentLeft(limit('weekly', 'Weekly', 8, 60))).toBe(8);
    expect(percentLeft({ ...limit('weekly', 'Weekly', 8, 60), usedPercent: 140 })).toBe(0);
    expect(toneOf(8)).toBe('critical');
    expect(toneOf(10)).toBe('low');
    expect(toneOf(24)).toBe('low');
    expect(toneOf(25)).toBe('normal');
    expect(toneOf(null)).toBe('normal');
    expect(toneOf(30, 40)).toBe('critical');
  });

  it('puts the tick at the share of the window still to come', () => {
    const halfWeek = 3.5 * 24 * 3600;
    expect(paceTick(limit('weekly', 'Weekly', 50, halfWeek), NOW)).toBeCloseTo(50);
    expect(paceTick({ ...limit('weekly', 'Weekly', 50, 60), windowSeconds: null }, NOW)).toBeNull();
    expect(paceTick(limit('weekly', 'Weekly', 50, -60), NOW)).toBeNull();
  });

  it('says how long until a reset', () => {
    const at = (seconds: number) => NOW / 1000 + seconds;
    expect(resetsIn(at(6 * 86400 + 5 * 3600 + 120), NOW)).toBe('6d 5h');
    expect(resetsIn(at(7 * 86400), NOW)).toBe('7d');
    expect(resetsIn(at(4 * 3600 + 600), NOW)).toBe('4h 10m');
    expect(resetsIn(at(720), NOW)).toBe('12m');
    expect(resetsIn(at(-5), NOW)).toBe('');
    expect(resetsIn(null, NOW)).toBe('');
  });

  it('names the moment of a reset by weekday unless it is today', () => {
    const weekday = resetMoment(NOW / 1000 + 2 * 86400, NOW);
    expect(weekday).toMatch(/^\S+ \d{2}:\d{2}/);
    expect(resetMoment(NOW / 1000 + 60, NOW)).toMatch(/^\d{2}:\d{2}/);
  });

  it('formats a numeric credit balance', () => {
    expect(formatCredits('45138')).toBe('45,138');
    expect(formatCredits('Unlimited')).toBe('Unlimited');
  });
});

describe('readings', () => {
  it('keeps the limits read before a failed read, with the reason', () => {
    const previous = READINGS[CLAUDE_HOME.id]!;
    const problem = { kind: 'expired', message: 'Sign in again.' };
    const merged = mergeReading(previous, { limits: [], credits: null, problem }, NOW);
    expect(merged.limits).toEqual(previous.limits);
    expect(merged.readAt).toBe(previous.readAt);
    expect(merged.problem).toEqual(problem);
  });

  it('takes a good read whole', () => {
    const fresh = [limit('weekly', 'Weekly', 70, 3600)];
    const merged = mergeReading(
      HOME_EXPIRED[CLAUDE_HOME.id],
      { limits: fresh, credits: '5', problem: null },
      NOW,
    );
    expect(merged).toEqual({ limits: fresh, credits: '5', readAt: NOW, problem: null });
  });

  it('forgets a limit whose window ended since it was read', () => {
    const stale = {
      ...READINGS,
      [CLAUDE_ACME.id]: {
        ...READINGS[CLAUDE_ACME.id]!,
        limits: [limit('weekly', 'Weekly', 5, -60)],
      },
    };
    const view = views(stale).find((entry) => entry.account.id === CLAUDE_ACME.id)!;
    expect(view.left).toBeNull();
    expect(view.headline).toBeNull();
    expect(accountSummary(view)).toBe('Claude AC · Not read yet');
  });
});

describe('the rail', () => {
  it('shows the account with the least left first', () => {
    expect(labelsOf(railAccounts(views(), INTRODUCED))).toEqual(['OP', 'EX', 'AC', 'EX', 'AC']);
    expect(railAccounts(views(), INTRODUCED).map((view) => view.left)).toEqual([
      8, 22, 62, 89, 100,
    ]);
  });

  it('keeps the saved order when asked to', () => {
    const settings = { ...INTRODUCED, keepOrder: true, order: [CODEX_ACME.id, CLAUDE_OPS.id] };
    expect(
      railAccounts(views(READINGS, settings), settings).map((view) => view.account.id),
    ).toEqual([CODEX_ACME.id, CLAUDE_OPS.id, CLAUDE_ACME.id, CLAUDE_HOME.id, CODEX_HOME.id]);
  });

  it('leaves out hidden accounts and puts unread ones last', () => {
    const settings = withAccountPreference(INTRODUCED, ACCOUNTS, CLAUDE_OPS.id, { hidden: true });
    const { [CODEX_HOME.id]: _unread, ...readings } = READINGS;
    const shown = railAccounts(views(readings, settings), settings);
    expect(shown.map((view) => view.account.id)).toEqual([
      CLAUDE_HOME.id,
      CLAUDE_ACME.id,
      CODEX_ACME.id,
      CODEX_HOME.id,
    ]);
  });

  it('colours an account by the warning threshold in Settings', () => {
    const tones = (warnUnder: number) =>
      Object.fromEntries(
        views(READINGS, { ...INTRODUCED, warnUnder }).map((view) => [
          view.label + view.account.provider,
          view.tone,
        ]),
      );
    expect(tones(10).OPclaude).toBe('critical');
    expect(tones(10).EXclaude).toBe('low');
    expect(tones(5).OPclaude).toBe('low');
  });

  it('summarises an account for the folded rail', () => {
    const ops = views().find((view) => view.account.id === CLAUDE_OPS.id)!;
    expect(accountSummary(ops)).toBe('Claude OP · Weekly · 8% left');
    const expired = views(HOME_EXPIRED).find((view) => view.account.id === CLAUDE_HOME.id)!;
    expect(accountSummary(expired)).toBe('Claude EX · Weekly · 22% left');
  });
});

describe('an account that ran out', () => {
  it('is named with the account of the same provider that has the most left', () => {
    const all = views(OPS_RUN_OUT);
    const out = accountsRunOut(all);
    expect(out.map((view) => view.account.id)).toEqual([CLAUDE_OPS.id]);
    expect(bestAlternative(out[0]!, all)?.account.id).toBe(CLAUDE_ACME.id);
  });

  it('has no alternative when it is the only account of its provider', () => {
    const all = views(OPS_RUN_OUT, INTRODUCED, [CLAUDE_OPS, CODEX_HOME]);
    expect(bestAlternative(accountsRunOut(all)[0]!, all)).toBeNull();
  });

  it('is out while its session is used up, though its week is not', () => {
    const now = Date.now();
    const readings = readingsAt(now);
    const ops = readings[CLAUDE_OPS.id]!;
    const sessionEnds = Math.floor(now / 1000) + 3600;
    const spentSession = {
      ...readings,
      [CLAUDE_OPS.id]: {
        ...ops,
        limits: [
          ...ops.limits,
          {
            kind: 'session',
            label: 'Session',
            usedPercent: 100,
            resetsAt: sessionEnds,
            windowSeconds: 18_000,
          },
        ],
      },
    };
    const all = accountViews({
      accounts: ACCOUNTS,
      readings: spentSession,
      settings: INTRODUCED,
      nowMs: now,
    });
    const out = accountsRunOut(all);
    expect(out.map((view) => [view.account.id, view.outUntil])).toEqual([
      [CLAUDE_OPS.id, sessionEnds],
    ]);
  });

  it('is not out while a little is left, even when it rounds to 0%', () => {
    const now = Date.now();
    const readings = readingsAt(now);
    const ops = readings[CLAUDE_OPS.id]!;
    const almost = {
      ...readings,
      [CLAUDE_OPS.id]: {
        ...ops,
        limits: ops.limits.map((limit) => ({ ...limit, usedPercent: 99.6 })),
      },
    };
    const all = accountViews({
      accounts: ACCOUNTS,
      readings: almost,
      settings: INTRODUCED,
      nowMs: now,
    });
    expect(all.find((view) => view.account.id === CLAUDE_OPS.id)?.left).toBe(0);
    expect(accountsRunOut(all)).toEqual([]);
  });

  it('is not reported while it is hidden', () => {
    const settings = withAccountPreference(INTRODUCED, ACCOUNTS, CLAUDE_OPS.id, { hidden: true });
    expect(accountsRunOut(views(OPS_RUN_OUT, settings))).toEqual([]);
  });
});
