import { create } from 'zustand';
import type { AppSettings } from '@/types';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  /** True after loadSettings has successfully completed at least once.
   *  Consumers that must not act on default settings (e.g. the badge
   *  visibility hook) should gate on this rather than `!isLoading`. */
  hasLoaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => void;
}

const defaultSettings: AppSettings = {
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
    flyoutHotkey: 'Ctrl+Win+Shift+F',
    editorCommand: 'code',
    runAtStartup: false,
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
    authMethod: 'azCli',
    authAutoDetected: false,
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
};

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...(target as Record<string, unknown>) };
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = result[key];
    if (
      srcVal &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Partial<Record<string, unknown>>,
      );
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }
  return result as T;
}

let _saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: defaultSettings,
  isLoading: false,
  hasLoaded: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const settings = await invoke<AppSettings>('load_settings');

      // Hydrate credentials from OS keychain
      const ghPat = await invoke<string | null>('get_credential', { service: 'borgdock:github' });
      if (ghPat) settings.gitHub.personalAccessToken = ghPat;

      const adoPat = await invoke<string | null>('get_credential', {
        service: 'borgdock:azure_devops',
      });
      if (adoPat) {
        settings.azureDevOps.personalAccessToken = adoPat;
        // Migration: existing users with a stored PAT but no prior
        // auto-detect run — pin to PAT mode and mark as detected so
        // AdoSection's first-mount hook doesn't clobber their choice.
        if (!settings.azureDevOps.authAutoDetected) {
          settings.azureDevOps.authMethod = 'pat';
          settings.azureDevOps.authAutoDetected = true;
        }
      }

      const claudeKey = await invoke<string | null>('get_credential', {
        service: 'borgdock:claude_api',
      });
      if (claudeKey) settings.claudeApi.apiKey = claudeKey;

      if (settings.sql?.connections) {
        for (const conn of settings.sql.connections) {
          const pw = await invoke<string | null>('get_credential', {
            service: `borgdock:sql:${conn.name}`,
          });
          if (pw) conn.password = pw;
        }
      }

      set({ settings, isLoading: false, hasLoaded: true });
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Still mark as loaded — downstream hooks need the gate to open even
      // on error so they can act on defaults rather than waiting forever.
      set({ isLoading: false, hasLoaded: true });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    set({ settings });
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // Store credentials in OS keychain before saving
      if (settings.gitHub.personalAccessToken) {
        await invoke('set_credential', {
          service: 'borgdock:github',
          secret: settings.gitHub.personalAccessToken,
        });
      }
      if (settings.azureDevOps.personalAccessToken) {
        await invoke('set_credential', {
          service: 'borgdock:azure_devops',
          secret: settings.azureDevOps.personalAccessToken,
        });
      }
      if (settings.claudeApi.apiKey) {
        await invoke('set_credential', {
          service: 'borgdock:claude_api',
          secret: settings.claudeApi.apiKey,
        });
      }
      if (settings.sql?.connections) {
        for (const conn of settings.sql.connections) {
          if (conn.password) {
            await invoke('set_credential', {
              service: `borgdock:sql:${conn.name}`,
              secret: conn.password,
            });
          }
        }
      }

      // Strip credentials from the settings object before persisting to disk
      const stripped = JSON.parse(JSON.stringify(settings)) as AppSettings;
      delete stripped.gitHub.personalAccessToken;
      delete stripped.azureDevOps.personalAccessToken;
      delete stripped.claudeApi.apiKey;
      if (stripped.sql?.connections) {
        for (const conn of stripped.sql.connections) {
          delete conn.password;
        }
      }

      await invoke('save_settings', { settings: stripped });
    } catch (error) {
      console.error('Failed to save settings:', error);
      // Revert on failure by reloading
      try {
        await get().loadSettings();
      } catch (revertError) {
        console.error('Failed to revert settings after save failure:', revertError);
      }
    }
  },

  updateSettings: (partial: Partial<AppSettings>) => {
    set((state) => ({
      settings: deepMerge(state.settings, partial),
    }));
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const current = get().settings;
      get().saveSettings(current);
    }, 500);
  },
}));
