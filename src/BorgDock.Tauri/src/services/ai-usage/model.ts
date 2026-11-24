import type { RailTone } from '@/components/layout/rail-blocks';
import type { AiUsageSettings } from '@/types/settings';
import type { AiAccount, AiLimit, AiUsage, AiUsageProblem } from './types';

/** Under this share left an account shows amber. */
export const LOW_UNDER = 25;
/** Under this share left an account shows red, unless Settings says otherwise. */
export const DEFAULT_WARN_UNDER = 10;
/** A label is at most this long. */
export const LABEL_LENGTH = 3;
/** The identity colours a label can take: `--color-identity-1` … `-5`. */
export const IDENTITY_COLORS = [1, 2, 3, 4, 5] as const;

/** What was last read of one account. A failed read keeps the limits read before it. */
export interface AiReading {
  limits: AiLimit[];
  credits: string | null;
  /** When the limits were read, epoch ms. */
  readAt: number;
  /** Why the newest read failed; the limits are then from `readAt`. */
  problem: AiUsageProblem | null;
}

/** What is known after a read: a failed one keeps the limits read before it and says why it failed. */
export function mergeReading(
  previous: AiReading | undefined,
  usage: Pick<AiUsage, 'limits' | 'credits' | 'problem'>,
  nowMs: number,
): AiReading {
  if (usage.problem && previous) return { ...previous, problem: usage.problem };
  return {
    limits: usage.limits,
    credits: usage.credits,
    readAt: nowMs,
    problem: usage.problem,
  };
}

export interface AccountPreference {
  label: string;
  color: number;
  hidden: boolean;
}

/** One account as the rail, the card and Settings show it. */
export interface AccountView extends AccountPreference {
  account: AiAccount;
  reading: AiReading | null;
  /** The limit the rail shows: the week, or the first limit there is. */
  headline: AiLimit | null;
  /** Share of the headline limit left, 0 to 100. Null when nothing current is known. */
  left: number | null;
  tone: RailTone;
  /** While an account-wide limit is used up (a session or the week): when the last of those resets, in seconds. */
  outUntil: number | null;
}

export function providerName(provider: string): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

/** "Claude VE": how an account is named in a sentence. */
export function accountName(view: Pick<AccountView, 'account' | 'label'>): string {
  return `${providerName(view.account.provider)} ${view.label}`;
}

export function manageUsageUrl(provider: string): string {
  return provider === 'codex'
    ? 'https://chatgpt.com/codex/settings/usage'
    : 'https://claude.ai/settings/usage';
}

export function domainOf(email: string | null): string | null {
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  return domain || null;
}

function firstLetters(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 2)
    .toUpperCase();
}

/** `ops` of `~/.claude-ops`; empty for the provider's default folder. */
function folderSuffix(folder: string): string {
  const name = folder.split(/[\\/]/).pop() ?? '';
  return name.replace(/^\.(claude|codex)-?/i, '');
}

/**
 * A label per account: the first two letters of what T3 Code calls it, else
 * of its email domain. When two accounts of one provider would share a
 * label, the later one takes its folder's suffix (`~/.claude-ops` is OP),
 * then a number.
 */
export function suggestedLabels(accounts: readonly AiAccount[]): Record<string, string> {
  const labels: Record<string, string> = {};
  const taken = new Set<string>();
  for (const account of accounts) {
    const candidates = [
      firstLetters(account.t3Name),
      firstLetters(domainOf(account.email)),
      firstLetters(folderSuffix(account.folder)),
      firstLetters(account.provider),
    ].filter(Boolean);
    const free = (label: string) => !taken.has(`${account.provider}:${label}`);
    let label = candidates.find(free);
    for (let number = 2; !label; number++) {
      const numbered = `${candidates[0]?.[0] ?? 'A'}${number}`;
      if (free(numbered)) label = numbered;
    }
    taken.add(`${account.provider}:${label}`);
    labels[account.id] = label;
  }
  return labels;
}

/** One colour per label, in the order labels first appear, so a label reads as one identity across providers. */
export function colorsByLabel(labels: readonly string[]): Record<string, number> {
  const colors: Record<string, number> = {};
  for (const label of labels) {
    if (colors[label] !== undefined) continue;
    const used = Object.keys(colors).length;
    colors[label] = IDENTITY_COLORS[used % IDENTITY_COLORS.length]!;
  }
  return colors;
}

export function sanitizeLabel(text: string): string {
  return text
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, LABEL_LENGTH)
    .toUpperCase();
}

/** What each account is called and coloured: what Settings holds, else the suggestion. */
export function accountPreferences(
  accounts: readonly AiAccount[],
  settings: AiUsageSettings | undefined,
): Record<string, AccountPreference> {
  const suggested = suggestedLabels(accounts);
  const saved = settings?.accounts ?? {};
  const labelOf = (account: AiAccount) => saved[account.id]?.label || suggested[account.id]!;
  const colors = colorsByLabel(accounts.map(labelOf));
  return Object.fromEntries(
    accounts.map((account) => {
      const label = labelOf(account);
      const preference: AccountPreference = {
        label,
        color: saved[account.id]?.color || colors[label]!,
        hidden: saved[account.id]?.hidden ?? false,
      };
      return [account.id, preference];
    }),
  );
}

export function percentLeft(limit: AiLimit): number {
  return Math.max(0, Math.min(100, Math.round(100 - limit.usedPercent)));
}

export function toneOf(left: number | null, warnUnder = DEFAULT_WARN_UNDER): RailTone {
  if (left === null) return 'normal';
  if (left < warnUnder) return 'critical';
  return left < Math.max(LOW_UNDER, warnUnder) ? 'low' : 'normal';
}

/** A limit read before its window ended says nothing about the window after it. */
function current(limit: AiLimit, nowMs: number): boolean {
  return limit.resetsAt === null || limit.resetsAt * 1000 > nowMs;
}

/** The limits of a reading that still describe the running window. */
export function currentLimits(reading: AiReading | null, nowMs: number): AiLimit[] {
  return (reading?.limits ?? []).filter((limit) => current(limit, nowMs));
}

/**
 * Where the bar would end at an even pace: the share of the window still to
 * come. A bar shorter than this runs out before the reset.
 */
export function paceTick(limit: AiLimit, nowMs: number): number | null {
  if (limit.resetsAt === null || !limit.windowSeconds) return null;
  const secondsLeft = limit.resetsAt - nowMs / 1000;
  if (secondsLeft <= 0) return null;
  return Math.max(0, Math.min(100, (secondsLeft / limit.windowSeconds) * 100));
}

/** "6d 5h", "4h 10m", "12m": how long until a limit resets. */
export function resetsIn(resetsAt: number | null, nowMs: number): string {
  if (resetsAt === null) return '';
  const minutes = Math.floor((resetsAt * 1000 - nowMs) / 60_000);
  if (minutes <= 0) return '';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes % 60 > 0 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return `${minutes}m`;
}

/** "Thu 09:00", or "14:30" when the reset is today. */
export function resetMoment(resetsAt: number, nowMs: number): string {
  const moment = new Date(resetsAt * 1000);
  const time = moment.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (moment.toDateString() === new Date(nowMs).toDateString()) return time;
  return `${moment.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/** "45,138" for a numeric balance; anything else as the provider wrote it. */
export function formatCredits(credits: string): string {
  const amount = Number(credits);
  return Number.isFinite(amount) && credits.trim() !== ''
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)
    : credits;
}

export interface AccountViewInput {
  accounts: readonly AiAccount[];
  readings: Readonly<Record<string, AiReading>>;
  settings: AiUsageSettings | undefined;
  nowMs: number;
}

function inSavedOrder(accounts: readonly AiAccount[], order: readonly string[]): AiAccount[] {
  const position = new Map(order.map((id, index) => [id, index]));
  const rank = (account: AiAccount) => position.get(account.id) ?? order.length;
  return [...accounts].sort((a, b) => rank(a) - rank(b));
}

/** Every account found, in the order Settings holds, with its label and what is left. */
export function accountViews({
  accounts,
  readings,
  settings,
  nowMs,
}: AccountViewInput): AccountView[] {
  const preferences = accountPreferences(accounts, settings);
  const warnUnder = settings?.warnUnder ?? DEFAULT_WARN_UNDER;
  return inSavedOrder(accounts, settings?.order ?? []).map((account) => {
    const reading = readings[account.id] ?? null;
    const limits = currentLimits(reading, nowMs);
    const headline = limits.find((limit) => limit.kind === 'weekly') ?? limits[0] ?? null;
    const left = headline ? percentLeft(headline) : null;
    // A model's own weekly cap leaves the account's other models usable.
    const spent = limits.filter(
      (limit) => limit.kind !== 'model' && limit.usedPercent >= 100 && limit.resetsAt !== null,
    );
    return {
      account,
      ...preferences[account.id]!,
      reading,
      headline,
      left,
      tone: toneOf(left, warnUnder),
      outUntil: spent.length > 0 ? Math.max(...spent.map((limit) => limit.resetsAt!)) : null,
    };
  });
}

/** The accounts the rail shows: least left first, unless the saved order is kept. Unread accounts go last. */
export function railAccounts(
  views: readonly AccountView[],
  settings: AiUsageSettings | undefined,
): AccountView[] {
  const shown = views.filter((view) => !view.hidden);
  if (settings?.keepOrder) return shown;
  return [...shown].sort((a, b) => (a.left ?? 101) - (b.left ?? 101));
}

/** Shown accounts that used up a session or their week, soonest back first. */
export function accountsRunOut(views: readonly AccountView[]): AccountView[] {
  return views
    .filter((view) => !view.hidden && view.outUntil !== null)
    .sort((a, b) => (a.outUntil ?? 0) - (b.outUntil ?? 0));
}

/** The shown account of the same provider with the most left, when it has any. */
export function bestAlternative(
  view: AccountView,
  views: readonly AccountView[],
): AccountView | null {
  const others = views.filter(
    (other) =>
      other.account.id !== view.account.id &&
      other.account.provider === view.account.provider &&
      !other.hidden &&
      other.outUntil === null &&
      (other.left ?? 0) > 0,
  );
  return others.sort((a, b) => (b.left ?? 0) - (a.left ?? 0))[0] ?? null;
}

/** "Claude VE · Weekly · 8% left": the folded rail's tooltip. */
export function accountSummary(view: AccountView): string {
  const name = accountName(view);
  if (!view.headline || view.left === null) {
    return `${name} · ${view.reading?.problem?.message ?? 'Not read yet'}`;
  }
  return `${name} · ${view.headline.label} · ${view.left}% left`;
}

/** Settings with one account's preference changed; the others keep what they show now. */
export function withAccountPreference(
  settings: AiUsageSettings | undefined,
  accounts: readonly AiAccount[],
  id: string,
  change: Partial<AccountPreference>,
): AiUsageSettings {
  const preferences = accountPreferences(accounts, settings);
  const current = preferences[id];
  if (!current) return settings ?? {};
  return {
    ...settings,
    accounts: { ...settings?.accounts, [id]: { ...current, ...change } },
  };
}

/** Settings that hold every found account as it is shown now: what the first-start sheet saves. */
export function withEveryAccount(
  settings: AiUsageSettings | undefined,
  accounts: readonly AiAccount[],
  preferences: Readonly<Record<string, AccountPreference>>,
): AiUsageSettings {
  return {
    ...settings,
    // Settings edited before any account was found has shown none of them.
    introduced: settings?.introduced || accounts.length > 0,
    accounts: { ...settings?.accounts, ...preferences },
    order: settings?.order?.length ? settings.order : accounts.map((account) => account.id),
  };
}

/** Accounts Settings has never seen: found after the first-start sheet was answered. */
export function unknownAccounts(
  accounts: readonly AiAccount[],
  settings: AiUsageSettings | undefined,
): AiAccount[] {
  if (!settings?.introduced) return [];
  return accounts.filter((account) => !settings.accounts?.[account.id]);
}
