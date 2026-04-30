import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { FocusList, MergeToast, QuickReviewOverlay } from '@/components/focus';
import { Sidebar } from '@/components/layout/Sidebar';
import { NotificationOverlay } from '@/components/notifications/NotificationOverlay';
import { PrList } from '@/components/pr/PrList';
import { SplashScreen } from '@/components/SplashScreen';
import { SettingsFlyout } from '@/components/settings/SettingsFlyout';
import { SetupWizard } from '@/components/wizard/SetupWizard';
import { WorkItemsSection } from '@/components/work-items/WorkItemsSection';
import { useAdoPolling } from '@/hooks/useAdoPolling';
import { useAutoHide } from '@/hooks/useAutoHide';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useBadgeSync } from '@/hooks/useBadgeSync';
import { useCacheInit } from '@/hooks/useCacheInit';
import { useExternalMergeCelebration } from '@/hooks/useExternalMergeCelebration';
import { useGitHubPolling } from '@/hooks/useGitHubPolling';
import { useInitSequence } from '@/hooks/useInitSequence';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useQuickReviewKeyboard } from '@/hooks/useQuickReviewKeyboard';
import { useReviewNudges } from '@/hooks/useReviewNudges';
import { useRunAtStartup } from '@/hooks/useRunAtStartup';
import { useStateTransitions } from '@/hooks/useStateTransitions';
import { useTheme } from '@/hooks/useTheme';
import { useWhatsNew } from '@/hooks/useWhatsNew';
import { useWorktreeMap } from '@/hooks/useWorktreeMap';
import { createLogger } from '@/services/logger';
import { useInitStore } from '@/stores/initStore';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { installTestSeed } from '@/test-support/test-seed';

installTestSeed({ isDev: import.meta.env.DEV });

// Read once at module scope so the value is stable across renders
// and impossible to change after the app boots. Production bundles
// tree-shake this entirely (DEV is statically false) unless the
// Playwright harness sets __PLAYWRIGHT__ via injectCompletedSetup.
const forceWizardFromUrl = (() => {
  if (typeof window === 'undefined') return false;
  const isTest = import.meta.env.DEV || window.__PLAYWRIGHT__ === true;
  if (!isTest) return false;
  return new URLSearchParams(window.location.search).get('wizard') === 'force';
})();

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
    forceWizardFromUrl ||
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

  // Show the main window as a centered modal when setup is needed, or park it
  // off-screen (via hide_sidebar) when setup is complete. This runs on every
  // needsSetup change so the window is correctly positioned on first launch and
  // after the wizard finishes.
  useEffect(() => {
    void (async () => {
      try {
        if (needsSetup) {
          await invoke('show_setup_wizard');
        } else {
          // When setup completes (or on subsequent launches with setup done),
          // park the main window off-screen by invoking hide_sidebar.
          await invoke('hide_sidebar');
        }
      } catch {
        // ignore
      }
    })();
  }, [needsSetup]);

  // Defer polling until init completes — otherwise the first cycle runs
  // before repos/auth are ready and idles for a full interval (~60s).
  const pollingEnabled = !needsSetup && isInitComplete;
  const { pollNow } = useGitHubPolling(settings, pollingEnabled);
  useExternalMergeCelebration();

  // Listen for manual refresh requests (from Header button and keyboard shortcut)
  useEffect(() => {
    function handleRefresh() {
      pollNow();
    }
    document.addEventListener('borgdock-refresh', handleRefresh);
    return () => document.removeEventListener('borgdock-refresh', handleRefresh);
  }, [pollNow]);

  // Listen for refresh requests emitted from the flyout window.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('flyout-refresh', () => {
          pollNow();
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

  // Flyout + tray sync (updates tray icon, tooltip, flyout window)
  useBadgeSync();

  // Auto-hide sidebar in floating mode
  useAutoHide(settings);

  // Keyboard navigation
  useKeyboardNav();

  // Quick Review keyboard shortcuts
  useQuickReviewKeyboard();

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

  // Register global hotkeys (sidebar toggle + flyout toggle)
  useEffect(() => {
    if (settings.ui.globalHotkey) {
      // Normalize: Tauri expects "Super" for the Windows key, not "Win"
      const normalize = (s: string) =>
        s
          .replace(/\bWin\b/gi, 'Super')
          .replace(/\bMeta\b/gi, 'Super')
          .replace(/\bCmd\b/gi, 'Super');
      const sidebarShortcut = normalize(settings.ui.globalHotkey);
      const flyoutShortcut = normalize(settings.ui.flyoutHotkey);
      log.debug('registering user hotkeys', { sidebarShortcut, flyoutShortcut });
      invoke('register_user_hotkeys', { sidebarShortcut, flyoutShortcut })
        .then(() => log.info('user hotkeys registered', { sidebarShortcut, flyoutShortcut }))
        .catch((err) =>
          log.error('register_user_hotkeys failed', err, { sidebarShortcut, flyoutShortcut }),
        );
    }
    return () => {
      invoke('unregister_hotkey').catch((err) =>
        log.debug('unregister_hotkey failed (probably never registered)', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    };
  }, [settings.ui.globalHotkey, settings.ui.flyoutHotkey]);

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

  // Listen for open-focus event from the flyout
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('open-focus', () => {
          useUiStore.getState().setActiveSection('focus');
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

  // Dev/test-only deep-link: ?settings=open opens the settings flyout
  // on mount so visual.spec.ts can capture it without simulating a click.
  useEffect(() => {
    const isTest =
      import.meta.env.DEV ||
      (typeof window !== 'undefined' && window.__PLAYWRIGHT__ === true);
    if (!isTest) return;
    if (new URLSearchParams(window.location.search).get('settings') === 'open') {
      useUiStore.getState().setSettingsOpen(true);
    }
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
        {/* style: custom animation keyframe name — no Tailwind utility for splash-fade-out */}
        <div
          className="pointer-events-none fixed inset-0 z-50"
          style={{
            background: 'var(--color-background)',
            animation: 'splash-fade-out 200ms ease-out forwards',
          }}
        />
        <Sidebar>
          {activeSection === 'focus' && <FocusList />}
          {activeSection === 'prs' && <PrList />}
          {activeSection === 'workitems' && <WorkItemsSection />}
        </Sidebar>
        <SettingsFlyout />
        <NotificationOverlay />
        <MergeToast />
        <QuickReviewOverlay />
      </>
    );
  }

  return (
    <>
      <Sidebar>
        {activeSection === 'focus' && <FocusList />}
        {activeSection === 'prs' && <PrList />}
        {activeSection === 'workitems' && <WorkItemsSection />}
      </Sidebar>
      <SettingsFlyout />
      <NotificationOverlay />
      <MergeToast />
      <QuickReviewOverlay />
    </>
  );
}
