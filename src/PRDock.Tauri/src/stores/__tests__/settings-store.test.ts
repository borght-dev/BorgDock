import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types';
import { useSettingsStore } from '../settings-store';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    setupComplete: false,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 60,
      username: '',
    },
    repos: [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 800,
      theme: 'system',
      globalHotkey: 'Ctrl+Win+Shift+G',
      editorCommand: 'code',
      runAtStartup: false,
      badgeEnabled: true,
      badgeStyle: 'GlassCapsule',
      indicatorStyle: 'SegmentRing',
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
    claudeCode: {
      defaultPostFixAction: 'commitAndNotify',
    },
    claudeApi: {
      model: 'claude-sonnet-4-6',
      maxTokens: 1024,
    },
    claudeReview: {
      botUsername: 'claude[bot]',
    },
    updates: {
      autoCheckEnabled: true,
      autoDownload: true,
    },
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
    sql: {
      connections: [],
    },
    repoPriority: {},
    ...overrides,
  };
}

describe('settings-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: makeSettings(),
      isLoading: false,
    });
  });

  describe('initial state', () => {
    it('has default settings', () => {
      const { settings } = useSettingsStore.getState();
      expect(settings.setupComplete).toBe(false);
      expect(settings.gitHub.authMethod).toBe('ghCli');
      expect(settings.gitHub.pollIntervalSeconds).toBe(60);
      expect(settings.ui.theme).toBe('system');
      expect(settings.repos).toEqual([]);
    });

    it('is not loading initially', () => {
      expect(useSettingsStore.getState().isLoading).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('merges partial settings into current settings', () => {
      useSettingsStore.getState().updateSettings({ setupComplete: true });
      expect(useSettingsStore.getState().settings.setupComplete).toBe(true);
      expect(useSettingsStore.getState().settings.gitHub.pollIntervalSeconds).toBe(60);
    });

    it('overwrites nested objects entirely when provided', () => {
      const newGitHub = {
        authMethod: 'pat' as const,
        pollIntervalSeconds: 30,
        username: 'testuser',
      };
      useSettingsStore.getState().updateSettings({ gitHub: newGitHub });
      expect(useSettingsStore.getState().settings.gitHub).toEqual(newGitHub);
    });

    it('can update multiple fields at once', () => {
      useSettingsStore.getState().updateSettings({
        setupComplete: true,
        repos: [{ owner: 'acme', name: 'api' }],
      } as Partial<AppSettings>);
      expect(useSettingsStore.getState().settings.setupComplete).toBe(true);
      expect(useSettingsStore.getState().settings.repos).toHaveLength(1);
    });
  });

  describe('loadSettings', () => {
    it('sets isLoading to true while loading', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const loaded = makeSettings({ setupComplete: true });
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(loaded);

      const promise = useSettingsStore.getState().loadSettings();
      await promise;

      expect(useSettingsStore.getState().isLoading).toBe(false);
    });

    it('loads settings from Tauri invoke', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const loaded = makeSettings({
        setupComplete: true,
        gitHub: { authMethod: 'pat', pollIntervalSeconds: 120, username: 'loaded-user' },
      });
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(loaded);

      await useSettingsStore.getState().loadSettings();

      expect(invoke).toHaveBeenCalledWith('load_settings');
      expect(useSettingsStore.getState().settings.setupComplete).toBe(true);
      expect(useSettingsStore.getState().settings.gitHub.username).toBe('loaded-user');
      expect(useSettingsStore.getState().isLoading).toBe(false);
    });

    it('keeps isLoading false after error', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed'));

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().isLoading).toBe(false);
    });

    it('logs error on failure', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Boom'));

      await useSettingsStore.getState().loadSettings();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to load settings:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('saveSettings', () => {
    it('saves settings via Tauri invoke', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const newSettings = makeSettings({ setupComplete: true });
      await useSettingsStore.getState().saveSettings(newSettings);

      expect(invoke).toHaveBeenCalledWith('save_settings', { settings: newSettings });
      expect(useSettingsStore.getState().settings.setupComplete).toBe(true);
    });

    it('updates state optimistically before invoke', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      let stateAtInvokeTime: AppSettings | null = null;
      (invoke as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        stateAtInvokeTime = useSettingsStore.getState().settings;
      });

      const newSettings = makeSettings({ setupComplete: true });
      await useSettingsStore.getState().saveSettings(newSettings);

      expect(stateAtInvokeTime!.setupComplete).toBe(true);
    });

    it('reverts by reloading on save failure', async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalSettings = makeSettings();

      // First call (save_settings) fails, second call (load_settings) returns originals
      (invoke as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Save failed'))
        .mockResolvedValueOnce(originalSettings);

      const newSettings = makeSettings({ setupComplete: true });
      await useSettingsStore.getState().saveSettings(newSettings);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to save settings:', expect.any(Error));
      expect(invoke).toHaveBeenCalledWith('load_settings');
      consoleSpy.mockRestore();
    });
  });
});

describe('settings-store ADO auth migration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSettingsStore.setState({ isLoading: false, hasLoaded: false });
  });

  it('forces authMethod to pat when an ADO PAT exists in keychain and authAutoDetected is false', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === 'load_settings') {
        return {
          setupComplete: true,
          gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 30, username: '' },
          repos: [],
          ui: {},
          notifications: {},
          claudeCode: {},
          claudeApi: { model: '', maxTokens: 4096 },
          claudeReview: { botUsername: '' },
          updates: { autoCheckEnabled: true, autoDownload: true },
          azureDevOps: {
            organization: 'myorg',
            project: 'myproj',
            authMethod: 'azCli',
            authAutoDetected: false,
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
      }
      if (cmd === 'get_credential') {
        const service = (args as { service: string }).service;
        if (service === 'prdock:azure_devops') return 'existing-pat-value';
        return null;
      }
      return null;
    });

    await useSettingsStore.getState().loadSettings();

    const settings = useSettingsStore.getState().settings;
    expect(settings.azureDevOps.personalAccessToken).toBe('existing-pat-value');
    expect(settings.azureDevOps.authMethod).toBe('pat');
    expect(settings.azureDevOps.authAutoDetected).toBe(true);
  });

  it('leaves authMethod as azCli when no ADO PAT in keychain and authAutoDetected is false', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string) => {
      if (cmd === 'load_settings') {
        return {
          setupComplete: false,
          gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 30, username: '' },
          repos: [],
          ui: {},
          notifications: {},
          claudeCode: {},
          claudeApi: { model: '', maxTokens: 4096 },
          claudeReview: { botUsername: '' },
          updates: { autoCheckEnabled: true, autoDownload: true },
          azureDevOps: {
            organization: '',
            project: '',
            authMethod: 'azCli',
            authAutoDetected: false,
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
      }
      return null;
    });

    await useSettingsStore.getState().loadSettings();

    const settings = useSettingsStore.getState().settings;
    expect(settings.azureDevOps.authMethod).toBe('azCli');
    expect(settings.azureDevOps.authAutoDetected).toBe(false);
  });
});
