import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo } from 'react';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { Sidebar } from '@/components/layout/Sidebar';
import { NotificationOverlay } from '@/components/notifications/NotificationOverlay';
import { PullRequestList } from '@/components/pr/PullRequestList';
import { SettingsFlyout } from '@/components/settings/SettingsFlyout';
import { SetupWizard } from '@/components/wizard/SetupWizard';
import { WorkItemsSection } from '@/components/work-items/WorkItemsSection';
import { useAdoPolling } from '@/hooks/useAdoPolling';
import { useAutoHide } from '@/hooks/useAutoHide';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useBadgeSync } from '@/hooks/useBadgeSync';
import { useCacheInit } from '@/hooks/useCacheInit';
import { useGitHubPolling } from '@/hooks/useGitHubPolling';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useRunAtStartup } from '@/hooks/useRunAtStartup';
import { useStateTransitions } from '@/hooks/useStateTransitions';
import { useTheme } from '@/hooks/useTheme';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { RepoSettings } from '@/types';

export default function App() {
  const { settings, isLoading, loadSettings } = useSettingsStore();
  const activeSection = useUiStore((s) => s.activeSection);

  // Apply theme from settings
  useTheme(settings.ui.theme);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Initialize SQLite cache
  useCacheInit();

  // GitHub polling (only when setup complete)
  const needsSetup =
    !settings.setupComplete ||
    settings.repos.length === 0 ||
    (settings.gitHub.authMethod === 'pat' && !settings.gitHub.personalAccessToken);

  // Stable empty array so the polling hook's deps don't change every render
  const emptyRepos = useMemo<RepoSettings[]>(() => [], []);
  const pollingSettings = useMemo(
    () => (needsSetup ? { ...settings, repos: emptyRepos } : settings),
    [needsSetup, settings, emptyRepos],
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

  // Badge sync
  useBadgeSync();

  // Auto-hide sidebar in floating mode
  useAutoHide(settings);

  // Keyboard navigation
  useKeyboardNav();

  // Auto-update
  useAutoUpdate(settings);

  // Run at startup sync
  useRunAtStartup(settings);

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
      invoke('register_hotkey', { shortcut }).catch((err) =>
        console.error('Failed to register hotkey:', err),
      );
    }
    return () => {
      invoke('unregister_hotkey').catch(() => {});
    };
  }, [settings.ui.globalHotkey]);

  // Position sidebar on the screen edge
  useEffect(() => {
    invoke('position_sidebar', {
      edge: settings.ui.sidebarEdge,
      width: settings.ui.sidebarWidthPx,
    }).catch((err) => console.error('Failed to position sidebar:', err));
  }, [settings.ui.sidebarEdge, settings.ui.sidebarWidthPx]);

  // Listen for open-settings event from tray
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('open-settings', () => {
          useUiStore.getState().setSettingsOpen(true);
        });
      } catch {
        // ignore
      }
    })();
    return () => unlisten?.();
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-background)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  // Show wizard when setup is needed
  if (needsSetup) {
    return <SetupWizard />;
  }

  return (
    <>
      <Sidebar>
        {activeSection === 'prs' && <PullRequestList />}
        {activeSection === 'workitems' && <WorkItemsSection />}
      </Sidebar>
      <SettingsFlyout />
      <NotificationOverlay />
      <CommandPalette onSelectWorkItem={handlePaletteSelectWorkItem} />
    </>
  );
}
