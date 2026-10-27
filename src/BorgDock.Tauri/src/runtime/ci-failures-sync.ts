import { listen } from '@tauri-apps/api/event';
import { bringMainWindowForward } from '@/hooks/useFlyoutSync';
import { ingestCiGroups } from '@/services/activity/adapters/ci';
import {
  OPEN_CI_SHEET_EVENT,
  SHOW_CI_GROUP_EVENT,
  type ShowGroupRequest,
  showGroupPrs,
} from '@/services/ci-failures/actions';
import { CiEventTracker } from '@/services/ci-failures/events';
import { trackFixes } from '@/services/ci-failures/fixes';
import { followCiNotifications } from '@/services/ci-failures/notify';
import { ownerStatusOf } from '@/services/ci-failures/ownership';
import { ciFailureSettings } from '@/services/ci-failures/settings';
import * as store from '@/services/ci-failures/store-api';
import { CiFailureSync, repoContextsOf } from '@/services/ci-failures/sync';
import { discoverTrackingIssues } from '@/services/ci-failures/tracking';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import {
  CI_FAILURES_CHANGED_EVENT,
  type CiFailuresChange,
  followCiFailures,
  isSharedGroup,
  scopeOfRepo,
  useCiFailuresStore,
} from '@/stores/ci-failures-store';
import { type CiSheet, useCiSheetStore } from '@/stores/ci-investigate-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useT3SessionStore } from '@/stores/t3-session-store';

const log = createLogger('ci-failures-runtime');

/** Failed push runs on the default branch are listed this often; a 304 costs nothing. */
const DEFAULT_BRANCH_MS = 5 * 60_000;
const RETENTION_MS = 6 * 60 * 60_000;
/** Fix PRs and tracking issues are checked this often. */
const FOLLOW_UP_MS = 10 * 60_000;
/** Owner status changes without a store write (a thread settles); check this often. */
const OWNER_CHECK_MS = 5 * 60_000;
/** Let the first poll and the UI settle before the first default-branch read and cleanup. */
const FIRST_RUN_DELAY_MS = 30_000;

function settings() {
  return useSettingsStore.getState().settings;
}

function enabledScopes(): string[] {
  return settings()
    .repos.filter((repo) => repo.enabled)
    .map(scopeOfRepo);
}

async function listenAll(
  handlers: Array<[string, (payload: unknown) => void]>,
): Promise<() => void> {
  const stops = await Promise.all(
    handlers.map(([name, handler]) => listen(name, (event) => handler(event.payload))),
  );
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * Related CI failures for the main window: records failed checks from every
 * accepted poll, reads their evidence within the budget, watches the default
 * branch, links fixes and tracking issues, prunes history, keeps the
 * window's group list current and turns group changes into notifications.
 * Started once GitHub sync is ready; a settings change that restarts GitHub
 * sync restarts this too.
 */
export function startCiFailuresSync(): () => void {
  const sync = new CiFailureSync(
    () => repoContextsOf(settings().repos, getClientForRepo),
    () => ciFailureSettings(settings()),
    () => settings().gitHub.username,
  );
  // Collection is advisory: a failed pass is logged and the next poll tries again.
  const attempt = (step: string, work: Promise<unknown>) =>
    void work.catch((error) => log.warn(`${step} failed`, { error: String(error) }));
  attempt('resume', sync.resume());
  if (usePrStore.getState().lastPollTime)
    attempt('observe', sync.observe(usePrStore.getState().pullRequests));
  const unsubscribePolls = usePrStore.subscribe((state, previous) => {
    if (state.lastPollTime && state.lastPollTime !== previous.lastPollTime) {
      attempt('observe', sync.observe(state.pullRequests));
    }
  });
  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    const now = ciFailureSettings(state.settings);
    const before = ciFailureSettings(previous.settings);
    if (now.enabled && !before.enabled) attempt('resume', sync.resume());
    if (now.includeDefaultBranch && !before.includeDefaultBranch)
      attempt('default branch watch', sync.observeDefaultBranches());
  });

  const tracker = new CiEventTracker();
  const ownerStale = (group: Parameters<typeof isSharedGroup>[0]) =>
    !!group.claim &&
    ownerStatusOf(group.claim, {
      threads: useDispatchStore.getState().threads,
      sessions: useT3SessionStore.getState().sessions,
      now: new Date(),
    }).stale;
  const checkEvents = () => {
    const { groups, revision, loaded } = useCiFailuresStore.getState();
    const threshold = ciFailureSettings(settings()).notifyThreshold;
    tracker.update(groups, { threshold, ownerStale, now: new Date() });
    if (loaded) ingestCiGroups(groups, revision, enabledScopes(), { threshold, ownerStale });
  };
  const unsubscribeGroups = useCiFailuresStore.subscribe((state, previous) => {
    if (state.groups !== previous.groups) checkEvents();
  });
  const stopNotifications = followCiNotifications();

  const followUp = async () => {
    if (!ciFailureSettings(settings()).enabled) return;
    const groups = useCiFailuresStore.getState().groups;
    await trackFixes(
      groups,
      usePrStore.getState().pullRequests,
      useDispatchStore.getState().threads,
      getClientForRepo,
    ).catch((error) => log.debug('fix tracking failed', { error: String(error) }));
    for (const scope of new Set(groups.filter(isSharedGroup).map((g) => g.scope))) {
      const context = repoContextsOf(settings().repos, getClientForRepo).find(
        (c) => c.scope === scope,
      );
      if (!context) continue;
      await store
        .loadScope([scope])
        .then((snapshot) => discoverTrackingIssues(context.client, scope, snapshot))
        .catch((error) =>
          log.debug('tracking issue discovery failed', { scope, error: String(error) }),
        );
    }
  };

  const branches = () => void sync.observeDefaultBranches();
  const prune = () => void sync.retention(enabledScopes());
  const first = setTimeout(() => {
    branches();
    prune();
    void followUp();
  }, FIRST_RUN_DELAY_MS);
  const timers = [
    setInterval(branches, DEFAULT_BRANCH_MS),
    setInterval(prune, RETENTION_MS),
    setInterval(() => void followUp(), FOLLOW_UP_MS),
    setInterval(checkEvents, OWNER_CHECK_MS),
  ];
  const stopFollowing = followCiFailures(enabledScopes);

  let stopListening: (() => void) | undefined;
  let stopped = false;
  void listenAll([
    [CI_FAILURES_CHANGED_EVENT, (payload) => sync.forget((payload as CiFailuresChange).scopes)],
    [
      SHOW_CI_GROUP_EVENT,
      (payload) =>
        void bringMainWindowForward().then(() => showGroupPrs(payload as ShowGroupRequest)),
    ],
    [
      OPEN_CI_SHEET_EVENT,
      (payload) =>
        void bringMainWindowForward().then(() =>
          useCiSheetStore.getState().open(payload as CiSheet),
        ),
    ],
  ])
    .then((stop) => {
      if (stopped) stop();
      else stopListening = stop;
    })
    .catch(() => {});

  return () => {
    stopped = true;
    sync.stop();
    clearTimeout(first);
    for (const timer of timers) clearInterval(timer);
    unsubscribePolls();
    unsubscribeSettings();
    unsubscribeGroups();
    stopNotifications();
    stopFollowing();
    stopListening?.();
  };
}
