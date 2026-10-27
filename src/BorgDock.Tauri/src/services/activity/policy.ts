import type { ActivityOutboxAck } from '@/generated/commands';
import { wasMergedHere } from '@/services/merge-celebration';
import { type OsNotificationOptions, sendOsNotification } from '@/services/notification';
import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types';
import * as api from './api';
import { firstLine, summaryLine } from './copy';
import { actionLabel } from './labels';
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  type ActivityChannel,
  type ActivityEntry,
  type NewActivityEntry,
} from './types';

export interface CategoryChannels {
  popup: boolean;
  push: boolean;
}

const QUIET: CategoryChannels = { popup: false, push: false };
const POPUP: CategoryChannels = { popup: true, push: false };
const BOTH: CategoryChannels = { popup: true, push: true };

/**
 * Where each category goes when settings say nothing. Push goes to the
 * categories that need me; Vera's reports, closed PRs and roll-ups stay in
 * the journal.
 */
export const CATEGORY_DEFAULTS: Record<ActivityCategory, CategoryChannels> = {
  'agent.question': BOTH,
  'agent.plan': BOTH,
  'agent.approval': BOTH,
  'agent.turn': POPUP,
  'agent.turns-missed': QUIET,
  'agent.failed': BOTH,
  'agent.interrupted': BOTH,
  'agent.limited': BOTH,
  'agent.report': QUIET,
  'pr.review': BOTH,
  'pr.findings': BOTH,
  'pr.review-request': BOTH,
  'pr.checks-failed': BOTH,
  'pr.checks-passed': POPUP,
  'pr.ready': POPUP,
  'pr.conflict': BOTH,
  'pr.merged': POPUP,
  'pr.closed': QUIET,
  'ci.group-grew': BOTH,
  'ci.owner-stale': BOTH,
  'ci.fix-merged': BOTH,
  'ci.seen-after-fix': BOTH,
  'ci.resolved': QUIET,
  'workstream.unblocked': BOTH,
  'workstream.invalidated': BOTH,
  'workstream.reopened': BOTH,
  'workstream.conflict': BOTH,
  'workstream.proposal': BOTH,
  'workstream.ready': POPUP,
  'deploy.pr': BOTH,
  'deploy.reached': POPUP,
  'deploy.failed': BOTH,
  'ado.assigned': BOTH,
  'ado.state': BOTH,
  'ado.comment': BOTH,
  'activity.rollup': QUIET,
};

/** The channels per category: settings over the defaults. */
export function categoryChannels(
  settings: AppSettings,
): Record<ActivityCategory, CategoryChannels> {
  const chosen = settings.notifications.activity?.categories ?? {};
  return Object.fromEntries(
    ACTIVITY_CATEGORIES.map((category) => [
      category,
      { ...CATEGORY_DEFAULTS[category], ...chosen[category] },
    ]),
  ) as Record<ActivityCategory, CategoryChannels>;
}

/**
 * The outbox rows a new entry gets. A push only ever goes out for an entry
 * that needs me; the category toggles choose among those.
 */
export function channelsFor(
  entry: Pick<NewActivityEntry, 'category' | 'needsYou'>,
  settings: AppSettings = useSettingsStore.getState().settings,
): ActivityChannel[] {
  const channels = categoryChannels(settings)[entry.category];
  const push = settings.notifications.activity?.push;
  const out: ActivityChannel[] = [];
  if (channels.popup) out.push('popup');
  if (channels.push && entry.needsYou && push?.enabled) out.push('push');
  return out;
}

// ── Popups ──────────────────────────────────────────────────

/** `gh:<owner>/<repo>#<n>`, the entity key of a pull request. */
const PR_KEY = /^gh:([^/]+)\/([^#]+)#(\d+)$/;

/** More live entries than this in one drain become one summary popup. */
const LIVE_LIMIT = 4;
/** An outbox row older than this when BorgDock starts is folded into the summary. */
const STALE_AT_START_MS = 2 * 60_000;
/** While sources catch up after a start, wait for commits to stop before showing anything. */
const STARTUP_MS = 2 * 60_000;
const STARTUP_QUIET_MS = 10_000;
const LIVE_QUIET_MS = 1_500;
const startedAt = Date.now();

function popupSeverity(entry: ActivityEntry): OsNotificationOptions['severity'] {
  return entry.category === 'pr.merged' ? 'merged' : entry.severity;
}

function popupOf(entry: ActivityEntry): OsNotificationOptions {
  const action = entry.action;
  const body = firstLine(entry.detail) || entry.entity.title;
  return {
    id: `activity:${entry.id}`,
    title: entry.summary,
    body: body === entry.summary ? '' : body,
    severity: popupSeverity(entry),
    actions: [
      ...(action ? [{ label: actionLabel(action), action: 'activity-act', url: entry.id }] : []),
      { label: action ? 'Show' : 'Open Activity', action: 'activity-open', url: entry.id },
    ],
  };
}

function summaryOf(entries: readonly ActivityEntry[], away: boolean): OsNotificationOptions {
  const counts: Partial<Record<ActivityCategory, number>> = {};
  for (const entry of entries) counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  const line = summaryLine(counts, 3, away ? 'While you were away' : `${entries.length} updates`);
  const needsYou = entries.some((entry) => entry.needsYou);
  return {
    id: `activity:summary:${Date.now()}`,
    title: away ? 'While you were away' : `${entries.length} updates`,
    body: (line ?? '').replace(/^[^:]*:\s*/, ''),
    severity: needsYou ? 'warning' : 'info',
    actions: [{ label: 'Open Activity', action: 'activity-open', url: '' }],
  };
}

let draining: Promise<void> | null = null;
let drainAgain = false;
let firstDrain = true;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show what the popup outbox holds: entries still unread and open, one by
 * one while they are live; catch-up entries, rows left from before a
 * restart and bursts of more than four become one summary. Every row is
 * acknowledged, so nothing pops up twice.
 */
export async function drainPopups(
  now: number = Date.now(),
  sessionStart: number = startedAt,
): Promise<void> {
  if (draining) {
    drainAgain = true;
    return draining;
  }
  draining = (async () => {
    const items = await api.outboxTake('popup', 50);
    const acks: ActivityOutboxAck[] = [];
    const live: ActivityEntry[] = [];
    const folded: ActivityEntry[] = [];
    let away = false;
    for (const item of items) {
      const entry = item.entry;
      const ack = (outcome: ActivityOutboxAck['outcome']) =>
        acks.push({ entryId: entry.id, channel: 'popup', outcome });
      const pr = PR_KEY.exec(entry.entity.key);
      const mergedHere =
        entry.category === 'pr.merged' &&
        !!pr &&
        wasMergedHere({ repoOwner: pr[1]!, repoName: pr[2]!, number: Number(pr[3]) });
      if (entry.read !== 'unread' || entry.status !== 'open' || mergedHere) {
        ack('skipped');
        continue;
      }
      ack('sent');
      // Left from before this start, or waiting since well before the first drain.
      const created = Date.parse(item.createdAt);
      const stale = created < sessionStart || (firstDrain && now - created > STALE_AT_START_MS);
      if (entry.coverage === 'catch-up' || stale) {
        away = true;
        folded.push(entry);
      } else {
        live.push(entry);
      }
    }
    if (live.length > LIVE_LIMIT) folded.push(...live.splice(0));
    for (const entry of live) await sendOsNotification(popupOf(entry)).catch(() => {});
    if (folded.length > 0) await sendOsNotification(summaryOf(folded, away)).catch(() => {});
    if (acks.length > 0) await api.outboxAck(acks);
  })()
    .catch(() => {})
    .finally(() => {
      draining = null;
      firstDrain = false;
      if (drainAgain) {
        drainAgain = false;
        void drainPopups();
      }
    });
  return draining;
}

/**
 * Drain once commits stop coming: right after a start every source
 * catches up, and those commits should end in one summary, not several.
 */
export function scheduleDrain(): void {
  clearTimeout(timer);
  const quiet = Date.now() - startedAt < STARTUP_MS ? STARTUP_QUIET_MS : LIVE_QUIET_MS;
  timer = setTimeout(() => void drainPopups(), quiet);
}

export function cancelDrain(): void {
  clearTimeout(timer);
}
