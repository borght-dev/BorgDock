import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitStore } from '@/stores/initStore';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import App from '../App';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    listen: vi.fn(() => Promise.resolve(() => {})),
    onMoved: vi.fn(() => Promise.resolve(() => {})),
    setTitle: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
    minimize: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    unmaximize: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
  })),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ set: vi.fn(), save: vi.fn(), get: vi.fn(() => null) })),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: vi.fn(),
  disable: vi.fn(),
  isEnabled: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/hooks/useGitHubPolling', () => ({
  useGitHubPolling: vi.fn(() => ({ pollNow: vi.fn() })),
}));

vi.mock('@/hooks/useAdoPolling', () => ({
  useAdoPolling: vi.fn(),
}));

vi.mock('@/hooks/useAutoHide', () => ({
  useAutoHide: vi.fn(),
}));

vi.mock('@/hooks/useBadgeSync', () => ({
  useBadgeSync: vi.fn(),
}));

vi.mock('@/hooks/useCacheInit', () => ({
  useCacheInit: vi.fn(),
}));

vi.mock('@/hooks/useKeyboardNav', () => ({
  useKeyboardNav: vi.fn(),
}));

vi.mock('@/hooks/useQuickReviewKeyboard', () => ({
  useQuickReviewKeyboard: vi.fn(),
}));

vi.mock('@/hooks/useReviewNudges', () => ({
  useReviewNudges: vi.fn(),
}));

vi.mock('@/hooks/useRunAtStartup', () => ({
  useRunAtStartup: vi.fn(),
}));

vi.mock('@/hooks/useStateTransitions', () => ({
  useStateTransitions: vi.fn(() => ({ processTransitions: vi.fn() })),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: vi.fn(),
}));

vi.mock('@/hooks/useWorktreeMap', () => ({
  useWorktreeMap: vi.fn(),
}));

vi.mock('@/hooks/useAutoUpdate', () => ({
  useAutoUpdate: vi.fn(),
}));

vi.mock('@/hooks/useInitSequence', () => ({
  useInitSequence: vi.fn(),
}));

vi.mock('@/components/SplashScreen', () => ({
  SplashScreen: () => <div data-testid="splash-screen" />,
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar">{children}</div>
  ),
}));

vi.mock('@/components/settings/SettingsFlyout', () => ({
  SettingsFlyout: () => <div data-testid="settings-flyout" />,
}));

vi.mock('@/components/notifications/NotificationOverlay', () => ({
  NotificationOverlay: () => <div data-testid="notification-overlay" />,
}));

vi.mock('@/components/focus', () => ({
  FocusList: () => <div data-testid="focus-list" />,
  MergeToast: () => <div data-testid="merge-toast" />,
  QuickReviewOverlay: () => <div data-testid="quick-review" />,
}));

vi.mock('@/components/pr/PullRequestList', () => ({
  PullRequestList: () => <div data-testid="pr-list" />,
}));

vi.mock('@/components/work-items/WorkItemsSection', () => ({
  WorkItemsSection: () => <div data-testid="workitems-section" />,
}));

vi.mock('@/components/command-palette/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}));

vi.mock('@/components/wizard/SetupWizard', () => ({
  SetupWizard: () => <div data-testid="setup-wizard" />,
}));

const fullSettings = {
  setupComplete: true,
  gitHub: {
    authMethod: 'ghCli' as const,
    pollIntervalSeconds: 60,
    username: 'testuser',
    personalAccessToken: undefined,
  },
  repos: [
    {
      owner: 'org',
      name: 'repo',
      enabled: true,
      worktreeBasePath: '/path',
      worktreeSubfolder: '.worktrees',
    },
  ],
  ui: {
    sidebarEdge: 'right' as const,
    sidebarMode: 'pinned' as const,
    sidebarWidthPx: 800,
    theme: 'system' as const,
    globalHotkey: '',
    flyoutHotkey: '',
    editorCommand: 'code',
    runAtStartup: false,
    badgeEnabled: true,
    badgeStyle: 'GlassCapsule' as const,
    indicatorStyle: 'SegmentRing' as const,
  },
  notifications: {
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
  },
  claudeCode: { defaultPostFixAction: 'commitAndNotify' as const },
  claudeApi: { model: 'claude-sonnet-4-6', maxTokens: 1024 },
  claudeReview: { botUsername: 'claude[bot]' },
  updates: { autoCheckEnabled: true, autoDownload: true },
  azureDevOps: {
    organization: '',
    project: '',
    authMethod: 'pat' as const,
    authAutoDetected: true,
    pollIntervalSeconds: 120,
    favoriteQueryIds: [],
    trackedWorkItemIds: [],
    workingOnWorkItemIds: [],
    workItemWorktreePaths: {},
    recentWorkItemIds: [],
  },
  sql: { connections: [] },
  repoPriority: {},
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePrStore.setState({ pullRequests: [], closedPullRequests: [] });
    // Default: init complete so main UI renders
    useInitStore.setState({ isComplete: true });
  });

  it('shows splash screen when isLoading is true', () => {
    useInitStore.setState({ isComplete: false });
    useSettingsStore.setState({
      isLoading: true,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });

    render(<App />);
    expect(screen.getByTestId('splash-screen')).toBeTruthy();
  });

  it('shows splash screen when init is not complete', () => {
    useInitStore.setState({ isComplete: false });
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });

    render(<App />);
    expect(screen.getByTestId('splash-screen')).toBeTruthy();
  });

  it('shows setup wizard when setup is not complete', () => {
    useSettingsStore.setState({
      isLoading: false,
      settings: { ...fullSettings, setupComplete: false, repos: [] },
      loadSettings: vi.fn(),
    });

    render(<App />);
    expect(screen.getByTestId('setup-wizard')).toBeTruthy();
  });

  it('shows setup wizard when no repos configured', () => {
    useSettingsStore.setState({
      isLoading: false,
      settings: { ...fullSettings, repos: [] },
      loadSettings: vi.fn(),
    });

    render(<App />);
    expect(screen.getByTestId('setup-wizard')).toBeTruthy();
  });

  it('shows setup wizard when PAT auth has no token', () => {
    useSettingsStore.setState({
      isLoading: false,
      settings: {
        ...fullSettings,
        gitHub: {
          ...fullSettings.gitHub,
          authMethod: 'pat' as const,
          personalAccessToken: undefined,
        },
      },
      loadSettings: vi.fn(),
    });

    render(<App />);
    expect(screen.getByTestId('setup-wizard')).toBeTruthy();
  });

  it('renders main UI when setup is complete', () => {
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });
    useUiStore.setState({ activeSection: 'focus' });

    render(<App />);
    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('settings-flyout')).toBeTruthy();
    expect(screen.getByTestId('notification-overlay')).toBeTruthy();
    expect(screen.getByTestId('merge-toast')).toBeTruthy();
    expect(screen.getByTestId('command-palette')).toBeTruthy();
  });

  it('renders FocusList when activeSection is focus', () => {
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });
    useUiStore.setState({ activeSection: 'focus' });

    render(<App />);
    expect(screen.getByTestId('focus-list')).toBeTruthy();
  });

  it('renders PullRequestList when activeSection is prs', () => {
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });
    useUiStore.setState({ activeSection: 'prs' });

    render(<App />);
    expect(screen.getByTestId('pr-list')).toBeTruthy();
  });

  it('renders WorkItemsSection when activeSection is workitems', () => {
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });
    useUiStore.setState({ activeSection: 'workitems' });

    render(<App />);
    expect(screen.getByTestId('workitems-section')).toBeTruthy();
  });

  it('calls loadSettings on mount', () => {
    const loadSettings = vi.fn();
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings,
    });

    render(<App />);
    expect(loadSettings).toHaveBeenCalled();
  });

  it('restores persisted UI section on mount', () => {
    const restorePersistedSection = vi.fn();
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });
    useUiStore.setState({ restorePersistedSection });
    useOnboardingStore.setState({ restoreOnboardingState: vi.fn(() => Promise.resolve()) });

    render(<App />);
    expect(restorePersistedSection).toHaveBeenCalled();
  });

  it('restores onboarding state on mount', () => {
    const restoreOnboardingState = vi.fn(() => Promise.resolve());
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });
    useOnboardingStore.setState({ restoreOnboardingState });

    render(<App />);
    expect(restoreOnboardingState).toHaveBeenCalled();
  });

  it('registers global hotkey when set', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    useSettingsStore.setState({
      isLoading: false,
      settings: {
        ...fullSettings,
        ui: { ...fullSettings.ui, globalHotkey: 'Ctrl+Shift+G' },
      },
      loadSettings: vi.fn(),
    });

    await act(async () => {
      render(<App />);
    });

    expect(invoke).toHaveBeenCalledWith('register_user_hotkeys', {
      sidebarShortcut: 'Ctrl+Shift+G',
      flyoutShortcut: expect.any(String),
    });
  });

  it('positions sidebar on mount', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    useSettingsStore.setState({
      isLoading: false,
      settings: fullSettings,
      loadSettings: vi.fn(),
    });

    await act(async () => {
      render(<App />);
    });

    expect(invoke).toHaveBeenCalledWith('position_sidebar', {
      edge: 'right',
      width: 800,
    });
  });
});
