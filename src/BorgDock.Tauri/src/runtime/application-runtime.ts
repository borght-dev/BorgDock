import { listen } from '@tauri-apps/api/event';
import { resetClient } from '@/services/github/singleton';
import { WORKSTREAMS_ENABLED } from '@/services/workstreams/feature';
import { useInitStore } from '@/stores/initStore';
import { useSettingsStore } from '@/stores/settings-store';
import { startActivitySync } from './activity-sync';
import { startAdoSync } from './ado-sync';
import { startCiFailuresSync } from './ci-failures-sync';
import { startDispatchSync } from './dispatch-sync';
import { createGitHubSync } from './github-sync';
import { initialize } from './initialize';
import { startNotesSync } from './notes-sync';
import { startPhoneLinkSync } from './phone-link-sync';
import { followT3Sessions } from './t3-sessions';
import { startVisibilityTracking } from './visibility';
import { startWorkstreamsSync } from './workstreams-sync';

let running = false;

export function startApplicationRuntime(): () => void {
  if (running) return () => {};
  running = true;
  let stopped = false;
  let generation = 0;
  let gitHubKey = '';
  let adoKey = '';
  let gitHub: ReturnType<typeof createGitHubSync> | undefined;
  let ado: ReturnType<typeof startAdoSync> | undefined;
  let stopDispatch: (() => void) | undefined;
  let stopCiFailures: (() => void) | undefined;
  let settingsTimer: ReturnType<typeof setTimeout> | undefined;
  let unlisten: (() => void) | undefined;
  const stopVisibility = startVisibilityTracking();
  const stopSessions = followT3Sessions();
  const stopActivity = startActivitySync();
  const stopWorkstreams = WORKSTREAMS_ENABLED ? startWorkstreamsSync() : undefined;
  const stopNotes = startNotesSync();
  const stopPhoneLink = startPhoneLinkSync();
  const getSettings = () => useSettingsStore.getState().settings;
  const reconcile = (restart = false) => {
    if (stopped || !useSettingsStore.getState().hasLoaded) return;
    const settings = getSettings();
    const needsSetup =
      !settings.setupComplete ||
      settings.repos.length === 0 ||
      (settings.gitHub.authMethod === 'pat' && !settings.gitHub.personalAccessToken);
    const nextGitHub = needsSetup
      ? ''
      : JSON.stringify([
          settings.gitHub.authMethod,
          settings.gitHub.personalAccessToken,
          settings.gitHub.pollIntervalSeconds,
          settings.repos.map((repo) => [repo.owner, repo.name, repo.enabled, repo.githubAccount]),
        ]);
    if (restart || nextGitHub !== gitHubKey) {
      gitHubKey = nextGitHub;
      const current = ++generation;
      gitHub?.stop();
      gitHub = undefined;
      stopDispatch?.();
      stopDispatch = undefined;
      stopCiFailures?.();
      stopCiFailures = undefined;
      resetClient();
      if (nextGitHub) {
        const sync = createGitHubSync(getSettings);
        gitHub = sync;
        void initialize(settings, sync, () => stopped || generation !== current).then((ready) => {
          if (ready && !stopped && generation === current) {
            stopDispatch = startDispatchSync();
            stopCiFailures = startCiFailuresSync();
          }
        });
      }
    }
    const config = settings.azureDevOps;
    const configured =
      config.organization &&
      config.project &&
      (config.authMethod === 'azCli' || config.personalAccessToken);
    const nextAdo = configured
      ? JSON.stringify([
          config.organization,
          config.project,
          config.authMethod,
          config.personalAccessToken,
          config.pollIntervalSeconds,
        ])
      : '';
    if (nextAdo !== adoKey) {
      adoKey = nextAdo;
      ado?.stop();
      ado = nextAdo ? startAdoSync(getSettings) : undefined;
    }
  };
  const unsubscribe = useSettingsStore.subscribe((state, previous) => {
    clearTimeout(settingsTimer);
    if (state.hasLoaded && !previous.hasLoaded) reconcile();
    else settingsTimer = setTimeout(reconcile, 500);
  });
  const unsubscribeInit = useInitStore.subscribe((state, previous) => {
    if (state.runToken !== previous.runToken) {
      reconcile(true);
    }
  });
  const refresh = () => {
    void gitHub?.refresh().catch(() => {});
    void ado?.refresh();
  };
  document.addEventListener('borgdock-refresh', refresh);
  void listen('flyout-refresh', refresh)
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => {});
  reconcile();
  void useSettingsStore.getState().loadSettings();
  return () => {
    if (stopped) return;
    stopped = true;
    running = false;
    generation++;
    clearTimeout(settingsTimer);
    unsubscribe();
    unsubscribeInit();
    unlisten?.();
    gitHub?.stop();
    ado?.stop();
    stopDispatch?.();
    stopCiFailures?.();
    stopVisibility();
    stopSessions();
    stopActivity();
    stopWorkstreams?.();
    stopNotes();
    stopPhoneLink();
    document.removeEventListener('borgdock-refresh', refresh);
  };
}
