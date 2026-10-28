import { invoke } from '@tauri-apps/api/core';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CiSheetHost } from '@/components/ci-failures/CiSheetHost';
import { LaunchGuardDialog } from '@/components/ci-failures/LaunchGuardDialog';
import { MergeToast } from '@/components/focus';
import { MainWindow } from '@/components/layout/MainWindow';
import { ViewStack } from '@/components/layout/ViewStack';
import { T3PrThreadDialog } from '@/components/pr/T3PrThreadDialog';
import { SplashScreen } from '@/components/SplashScreen';
import { ToastViewport } from '@/components/shared/Toast';
import { SetupWizard } from '@/components/wizard/SetupWizard';
import { WorkstreamSheets } from '@/components/workstreams/WorkstreamSheets';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useDiskSpace } from '@/hooks/useDiskSpace';
import { useFlyoutSync } from '@/hooks/useFlyoutSync';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useReviewNudges } from '@/hooks/useReviewNudges';
import { useRunAtStartup } from '@/hooks/useRunAtStartup';
import { useSettingsSync } from '@/hooks/useSettingsSync';
import { useTheme } from '@/hooks/useTheme';
import { useWhatsNew } from '@/hooks/useWhatsNew';
import { useWorktreeMap } from '@/hooks/useWorktreeMap';
import { createLogger } from '@/services/logger';
import { useInitStore } from '@/stores/initStore';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
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

const QuickReviewOverlay = lazy(() =>
  import('@/components/focus/QuickReviewOverlay').then((module) => ({
    default: module.QuickReviewOverlay,
  })),
);
const log = createLogger('app');

export default function App() {
  useSettingsSync();
  const reviewActive = useQuickReviewStore((s) => s.state !== 'idle');
  // Individual selectors: subscribing to the whole store re-rendered the
  // entire tree (MainWindow → PrList → every card) on any settings write.
  const settings = useSettingsStore((s) => s.settings);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const hasLoaded = useSettingsStore((s) => s.hasLoaded);
  const isInitComplete = useInitStore((s) => s.isComplete);
  const [fadingOut, setFadingOut] = useState(false);
  // Latch: once init has completed, never show the splash again
  // (guards against window hide/show resetting transient state)
  const initCompletedRef = useRef(false);
  useEffect(() => {
    if (isInitComplete) initCompletedRef.current = true;
  }, [isInitComplete]);

  // Apply theme from settings once they have loaded; before that the
  // pre-paint state from public/theme-boot.js stands.
  const settingsLoaded = useSettingsStore((s) => s.hasLoaded);
  useTheme(settings.ui.theme, {
    reduceMotion: settings.ui.reduceMotion,
    enabled: settingsLoaded,
  });

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

  // GitHub polling (only when setup complete)
  const needsSetup =
    forceWizardFromUrl ||
    !settings.setupComplete ||
    settings.repos.length === 0 ||
    (settings.gitHub.authMethod === 'pat' && !settings.gitHub.personalAccessToken);

  // Fade-out transition when init completes
  useEffect(() => {
    if (isInitComplete && !needsSetup) {
      setFadingOut(true);
      const timer = setTimeout(() => setFadingOut(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isInitComplete, needsSetup]);

  // Reveal the main window once settings have hydrated. Before `hasLoaded`
  // the store still holds defaults (`setupComplete: false`), so `needsSetup`
  // is spuriously true on every launch — acting on it here used to fire
  // `show_setup_wizard`, which shrank the main window to 520×640 and left it
  // there until the user dragged an edge (the OS min-size then snapped it
  // back). Both paths now wait for the real settings.
  //
  // - setup needed      → show_setup_wizard (show + focus, no resize)
  // - normal launch     → window_ready, unless the user opted to start in
  //                       the tray (`ui.startMinimizedToTray`), in which case
  //                       the tray click / global hotkey reveals it later.
  const startMinimizedToTray = settings.ui.startMinimizedToTray;
  useEffect(() => {
    if (!hasLoaded) return;
    if (needsSetup) {
      invoke('show_setup_wizard').catch(() => {
        // ignore
      });
      return;
    }
    if (startMinimizedToTray) {
      log.info('startMinimizedToTray set — leaving main hidden');
      return;
    }
    invoke('window_ready').catch((err) => log.warn('window_ready failed', err));
  }, [hasLoaded, needsSetup, startMinimizedToTray]);

  // Review nudge notifications
  useReviewNudges(settings);

  // Flyout + tray sync (updates tray icon, tooltip, flyout window)
  useFlyoutSync();

  // Keyboard navigation
  useKeyboardNav();

  // Quick Review keyboard shortcuts

  // Worktree branch mapping (for PR card badges)
  useWorktreeMap(settings);
  useDiskSpace(hasLoaded, true);

  // Auto-update
  useAutoUpdate(settings);

  // What's new auto-open
  useWhatsNew();

  // Run at startup sync
  useRunAtStartup(settings);

  // Restore persisted active section and onboarding state on mount
  useEffect(() => {
    useUiStore.getState().restorePersistedSection();
    void usePrStore
      .getState()
      .restoreHideFailing()
      .catch(() => {});
    useOnboardingStore.getState().restoreOnboardingState();
  }, []);

  // Register global hotkeys (main window toggle + flyout toggle)
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

  // Listen for open-settings event from tray
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen('open-settings', () => {
          void invoke('open_settings_window', {}).catch((err) =>
            console.error('open_settings_window failed', err),
          );
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
      import.meta.env.DEV || (typeof window !== 'undefined' && window.__PLAYWRIGHT__ === true);
    if (!isTest) return;
    if (new URLSearchParams(window.location.search).get('settings') === 'open') {
      void invoke('open_settings_window', {}).catch((err) =>
        console.error('open_settings_window failed', err),
      );
    }
  }, []);

  // `data-app-ready` is a Playwright wait-target. It marks the moment after
  // settings have hydrated and the app is rendering real UI (wizard, splash
  // post-hydrate, or main window) — i.e. no longer in pre-mount limbo.
  // The attribute is rendered on a `display: contents` wrapper so layout is
  // unchanged in production. `appReady` is `undefined` until `isLoading`
  // flips to false, which makes the attribute absent until then.
  const appReady = !isLoading ? 'true' : undefined;

  // Show wizard when setup is needed (skip splash)
  if (!isLoading && needsSetup) {
    return (
      <div data-app-ready={appReady} style={{ display: 'contents' }}>
        <SetupWizard />
      </div>
    );
  }

  // Show splash screen during init (but never re-show after init completed)
  if (!initCompletedRef.current && (isLoading || !isInitComplete)) {
    return (
      <div data-app-ready={appReady} style={{ display: 'contents' }}>
        <SplashScreen />
      </div>
    );
  }

  // One tree for the splash fade-out and the normal state, so the main
  // window stays mounted when the brief fade-out overlay goes away.
  return (
    <div data-app-ready={appReady} style={{ display: 'contents' }}>
      {fadingOut && (
        // style: custom animation keyframe name — no Tailwind utility for splash-fade-out
        <div
          className="pointer-events-none fixed inset-0 z-50"
          style={{
            background: 'var(--color-background)',
            animation: 'splash-fade-out 200ms ease-out forwards',
          }}
        />
      )}
      <MainWindow>
        <ViewStack />
      </MainWindow>
      <MergeToast />
      {reviewActive && (
        <Suspense fallback={null}>
          <QuickReviewOverlay />
        </Suspense>
      )}
      <ToastViewport />
      <T3PrThreadDialog />
      <WorkstreamSheets />
      <LaunchGuardDialog />
      <CiSheetHost />
    </div>
  );
}
