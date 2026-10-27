import { useSettingsStore } from '@/stores/settings-store';
import type { AppSettings } from '@/types';
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  type ActivityChannel,
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
