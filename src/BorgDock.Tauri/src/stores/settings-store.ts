import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type { AppSettings } from '@/types';
import {
  SETTINGS_CHANGED_EVENT,
  SETTINGS_SOURCE_ID,
  SETTINGS_UI_CHANGED_EVENT,
} from './settings-events';

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
    theme: 'system',
    globalHotkey: 'Ctrl+Win+Shift+G',
    flyoutHotkey: 'Ctrl+Win+Shift+F',
    editorCommand: 'code',
    runAtStartup: false,
    quickReviewHotkey: '',
    startMinimizedToTray: false,
    restoreLastSelection: true,
    reduceMotion: false,
    focusLayout: 'list',
    staleAfterDays: 7,
  },
  notifications: {
    toastOnNewPR: false,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
    channels: { sound: true },
    activity: {
      categories: {},
      seenInT3: true,
      markReadOnOpen: true,
      taskbarBadge: true,
      push: { enabled: false, preset: 'home-assistant', awayMinutes: 10, hideTitles: false },
    },
  },
  agents: {
    defaultProvider: 'claude',
    defaultPostFixAction: 'commitAndNotify',
    t3Model: 'claude-fable-5',
    t3ModelInstance: 'claudeAgent',
  },
  summaries: {
    enabled: true,
    provider: 'claude',
    model: 'sonnet',
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
    linkMatchBy: 'branch',
    showWorkItemStateOnPrCard: true,
    updatePrStatusWhenWiDone: false,
  },
  sql: {
    connections: [],
    readOnlyByDefault: true,
    confirmDestructiveWithoutWhere: true,
  },
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
    } else {
      result[key] = srcVal;
    }
  }
  return result as T;
}

function reuseUnchangedValues<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return next;
  if (Array.isArray(previous) !== Array.isArray(next)) return next;
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const result = (Array.isArray(next) ? [] : {}) as Record<string, unknown>;
  const keys = Object.keys(after);
  let changed = keys.length !== Object.keys(before).length;
  for (const key of keys) {
    result[key] = reuseUnchangedValues(before[key], after[key]);
    if (!Object.is(result[key], before[key])) changed = true;
  }
  return changed ? (result as T) : previous;
}

let _saveTimer: ReturnType<typeof setTimeout> | undefined;
let loadRevision = 0;

export { SETTINGS_UI_CHANGED_EVENT };

export async function flushSettings(): Promise<void> {
  if (_saveTimer === undefined) return;
  clearTimeout(_saveTimer);
  _saveTimer = undefined;
  const state = useSettingsStore.getState();
  await state.saveSettings(state.settings);
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: defaultSettings,
  isLoading: false,
  hasLoaded: false,

  loadSettings: async () => {
    const revision = ++loadRevision;
    set({ isLoading: true });
    try {
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

      if (settings.sql?.connections) {
        for (const conn of settings.sql.connections) {
          const pw = await invoke<string | null>('get_credential', {
            service: `borgdock:sql:${conn.name}`,
          });
          if (pw) conn.password = pw;
        }
      }

      if (revision !== loadRevision) return;
      set((state) => ({
        settings: reuseUnchangedValues(state.settings, settings),
        isLoading: false,
        hasLoaded: true,
      }));
    } catch (error) {
      if (revision !== loadRevision) return;
      console.error('Failed to load settings:', error);
      // Still mark as loaded — downstream hooks need the gate to open even
      // on error so they can act on defaults rather than waiting forever.
      set({ isLoading: false, hasLoaded: true });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    clearTimeout(_saveTimer);
    _saveTimer = undefined;
    set({ settings });
    try {
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
      if (stripped.sql?.connections) {
        for (const conn of stripped.sql.connections) {
          delete conn.password;
        }
      }

      await invoke('save_settings', { settings: stripped });

      try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit(SETTINGS_CHANGED_EVENT, { source: SETTINGS_SOURCE_ID });
        await emit(SETTINGS_UI_CHANGED_EVENT, stripped.ui);
      } catch {
        // No Tauri event bridge (tests, Storybook) — nothing to sync.
      }
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
      _saveTimer = undefined;
      const current = get().settings;
      get().saveSettings(current);
    }, 500);
  },
}));
