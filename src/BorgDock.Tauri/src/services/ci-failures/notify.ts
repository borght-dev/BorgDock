import { sendOsNotification } from '@/services/notification';
import { useSettingsStore } from '@/stores/settings-store';
import type { NotificationSettings } from '@/types';
import { type CiFailureEvent, onCiFailureEvent } from './events';
import { parseScope } from './identity';
import { ciFailureSettings } from './settings';

/** Which notification toggle gates an event; events without one only feed the digest. */
const TOGGLE: Partial<Record<CiFailureEvent['kind'], keyof NotificationSettings>> = {
  'group-grew': 'ciFailureGroupGrows',
  'owner-stale': 'ciFailureOwnerStale',
  'fix-merged': 'ciFailureFixMerged',
  'seen-after-fix': 'ciFailureFixMerged',
};

function message(event: CiFailureEvent, threshold: number): { title: string; body: string } {
  switch (event.kind) {
    case 'group-grew':
      return {
        title: `Same CI failure in ${Math.max(threshold, event.prNumbers.length)} PRs`,
        body: `${event.title} has no owner yet. Investigate it once instead of fixing each PR.`,
      };
    case 'owner-stale':
      return {
        title: 'A CI investigation went quiet',
        body: `${event.title}: check in with its owner or release it.`,
      };
    case 'fix-merged':
      return {
        title: 'A CI fix merged',
        body: `${event.title}: rerun or update the PRs that are still red.`,
      };
    default:
      return {
        title: 'A fixed CI failure is back',
        body: `${event.title} failed again after its fix merged.`,
      };
  }
}

/**
 * Sends the OS notification for an event when its toggle is on. The PR it
 * names first is the one the notification opens.
 */
export function notifyCiFailure(event: CiFailureEvent): void {
  const settings = useSettingsStore.getState().settings;
  const toggle = TOGGLE[event.kind];
  if (!toggle || settings.notifications[toggle] === false) return;
  const parts = parseScope(event.scope);
  const { title, body } = message(event, ciFailureSettings(settings).notifyThreshold);
  void sendOsNotification({
    id: event.id,
    title,
    body,
    severity: event.kind === 'fix-merged' ? 'success' : 'warning',
    ...(parts && event.prNumbers[0] !== undefined
      ? { prOwner: parts.owner, prRepo: parts.repo, prNumber: event.prNumbers[0] }
      : {}),
  }).catch(() => {});
}

/** Wires events to notifications for this window. */
export function followCiNotifications(): () => void {
  return onCiFailureEvent(notifyCiFailure);
}
