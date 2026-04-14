import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLogger } from '@/services/logger';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { FocusList, MergeToast, QuickReviewOverlay } from '@/components/focus';
import { Sidebar } from '@/components/layout/Sidebar';
import { NotificationOverlay } from '@/components/notifications/NotificationOverlay';
import { PullRequestList } from '@/components/pr/PullRequestList';
import { SplashScreen } from '@/components/SplashScreen';
import { SettingsFlyout } from '@/components/settings/SettingsFlyout';
import { SetupWizard } from '@/components/wizard/SetupWizard';
import { WorkItemsSection } from '@/components/work-items/WorkItemsSection';
import { useAdoPolling } from '@/hooks/useAdoPolling';
import { useAutoHide } from '@/hooks/useAutoHide';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useBadgeSync } from '@/hooks/useBadgeSync';
import { useCacheInit } from '@/hooks/useCacheInit';
import { useGitHubPolling } from '@/hooks/useGitHubPolling';
import { useInitSequence } from '@/hooks/useInitSequence';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useNotificationActions } from '@/hooks/useNotificationActions';
import { useQuickReviewKeyboard } from '@/hooks/useQuickReviewKeyboard';
import { useReviewNudges } from '@/hooks/useReviewNudges';
import { useRunAtStartup } from '@/hooks/useRunAtStartup';
import { useStateTransitions } from '@/hooks/useStateTransitions';
import { useTheme } from '@/hooks/useTheme';
import { useWhatsNew } from '@/hooks/useWhatsNew';
import { useWorktreeMap } from '@/hooks/useWorktreeMap';
import { useInitStore } from '@/stores/initStore';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { RepoSettings } from '@/types';

const log = createLogger('app');

export default function App() {
  const { settings, isLoading, loadSettings } = useSettingsStore();
  const activeSection = useUiStore((s) => s.activeSection);
  const isInitComplete = useInitStore((s) => s.isComplete);
  const [fadingOut, setFadingOut] = useState(false);
  // Latch: once init has completed, never show the splash again
  // (guards against window hide/show resetting transient state)
  const initCompletedRef = useRef(false);
  if (isInitComplete) initCompletedRef.current = true;

  // Apply theme from settings
  useTheme(settings.ui.theme);

  // Load settings on mount
  useEffect(() => {
    log.info('App mounted — loading settings');
    loadSettings();
    return () => log.info('App unmounting');
  }, [loadSettings]);

  // Log transitions through the main gating conditions so the lifecycle is
  // observable without attaching a debugger.
  useEffect(() => {
    log.debug('gating state changed', {
      isLoading,
      isInitComplete,
      fadingOut,
      setupComplete: settings.setupComplete,
      repoCount: settings.repos.length,
    });
  }, [isLoading, isInitComplete, fadingOut, settings.setupComplete, settings.repos.length]);

  // Initialize SQLite cache
  useCacheInit();

  // GitHub polling (only when setup complete)
  const needsSetup =
    !settings.setupComplete ||
    settings.repos.length === 0 ||
    (settings.gitHub.authMethod === 'pat' && !settings.gitHub.personalAccessToken);

  // Run init sequence (auth, discover repos, fetch PRs, fetch checks)
  useInitSequence(settings, needsSetup || isLoading);

  // Fade-out transition when init completes
  useEffect(() => {
    if (isInitComplete && !needsSetup) {
      setFadingOut(true);
      const timer = setTimeout(() => setFadingOut(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isInitComplete, needsSetup]);

  // Stable empty array so the polling hook's deps don't change every render
  const emptyRepos = useMemo<RepoSettings[]>(() => [], []);
  const pollingSettings = useMemo(
    () => (needsSetup || !isInitComplete ? { ...settings, repos: emptyRepos } : settings),
    [needsSetup, isInitComplete, settings, emptyRepos],
  );
  const { pollNow } = useGitHubPolling(pollingSettings);

  // Listen for manual refresh requests (from Header button and keyboard shortcut)
  useEffect(() => {
    function handleRefresh() {
      pollNow();
    }
    document.addEventListener('prdock-refresh', handleRefresh);
    return () => document.removeEventListener('prdock-refresh', handleRefresh);
  }, [pollNow]);

  // Azure DevOps polling
  useAdoPolling(settings);

  // State transition detection for notifications
  const { processTransitions } = useStateTransitions(settings);
  const pullRequests = usePrStore((s) => s.pullRequests);
  useEffect(() => {
    if (pullRequests.length > 0) {
      processTransitions(pullRequests);
    }
  }, [pullRequests, processTransitions]);

  // Review nudge notifications
  useReviewNudges(settings);

  // Badge sync
  useBadgeSync();

  // Auto-hide sidebar in floating mode
  useAutoHide(settings);

  // Keyboard navigation
  useKeyboardNav();

  // Quick Review keyboard shortcuts
  useQuickReviewKeyboard();

  // OS toast notification click/button actions
  useNotificationActions();

  // Worktree branch mapping (for PR card badges)
  useWorktreeMap(settings);

  // Auto-update
  useAutoUpdate(settings);

  // What's new auto-open
  useWhatsNew();

  // Run at startup sync
  useRunAtStartup(settings);

  // Restore persisted active section and onboarding state on mount
  useEffect(() => {
    useUiStore.getState().restorePersistedSection();
    useOnboardingStore.getState().restoreOnboardingState();
  }, []);

  // Command palette: select a work item → switch to work items section and open detail
  const handlePaletteSelectWorkItem = useCallback((id: number) => {
    useUiStore.getState().setActiveSection('workitems');
    useUiStore.getState().setPendingWorkItemId(id);
  }, []);

  // Register global hotkey
  useEffect(() => {
    if (settings.ui.globalHotkey) {
      // Normalize: Tauri expects "Super" for the Windows key, not "Win"
      const shortcut = settings.ui.globalHotkey
        .replace(/\bWin\b/gi, 'Super')
        .replace(/\bMeta\b/gi, 'Super')
        .replace(/\bCmd\b/gi, 'Super');
      log.debug('registering global hotkey', { shortcut });
      invoke('register_hotkey', { shortcut })
        .then(() => log.info('global hotkey registered', { shortcut }))
        .catch((err) => log.error('register_hotkey failed', err, { shortcut }));
    }
    return () => {
      invoke('unregister_hotkey').catch((err) =>
        log.debug('unregister_hotkey failed (probably never registered)', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    };
  }, [settings.ui.globalHotkey]);

  // Position sidebar on the screen edge
  useEffect(() => {
    log.debug('positioning sidebar', {
      edge: settings.ui.sidebarEdge,
      width: settings.ui.sidebarWidthPx,
    });
    invoke('position_sidebar', {
      edge: settings.ui.sidebarEdge,
      width: settings.ui.sidebarWidthPx,
    }).catch((err) => log.error('position_sidebar failed', err));
  }, [settings.ui.sidebarEdge, settings.ui.sidebarWidthPx]);

  // Listen for open-settings event from tray
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('open-settings', () => {
          useUiStore.getState().setSettingsOpen(true);
        });
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Show wizard when setup is needed (skip splash)
  if (!isLoading && needsSetup) {
    return <SetupWizard />;
  }

  // Show splash screen during init (but never re-show after init completed)
  if (!initCompletedRef.current && (isLoading || !isInitComplete)) {
    return <SplashScreen />;
  }

  // Brief fade-out overlay after init completes
  if (fadingOut) {
    return (
      <>
        <div
          className="pointer-events-none fixed inset-0 z-50"
          style={{
            background: 'var(--color-background)',
            animation: 'splash-fade-out 200ms ease-out forwards',
          }}
        />
        <Sidebar>
          {activeSection === 'focus' && <FocusList />}
          {activeSection === 'prs' && <PullRequestList />}
          {activeSection === 'workitems' && <WorkItemsSection />}
        </Sidebar>
        <SettingsFlyout />
        <NotificationOverlay />
        <MergeToast />
        <QuickReviewOverlay />
        <CommandPalette onSelectWorkItem={handlePaletteSelectWorkItem} />
      </>
    );
  }

  return (
    <>
      <Sidebar>
        {activeSection === 'focus' && <FocusList />}
        {activeSection === 'prs' && <PullRequestList />}
        {activeSection === 'workitems' && <WorkItemsSection />}
      </Sidebar>
      <SettingsFlyout />
      <NotificationOverlay />
      <MergeToast />
      <QuickReviewOverlay />
      <CommandPalette onSelectWorkItem={handlePaletteSelectWorkItem} />
    </>
  );
}
