import { create } from 'zustand';
import type { AppSettings } from '@/types';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
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
    sidebarWidthPx: 380,
    theme: 'system',
    globalHotkey: 'Ctrl+Shift+P',
    editorCommand: 'code',
    runAtStartup: false,
    badgeStyle: 'GlassCapsule',
    indicatorStyle: 'SegmentRing',
  },
  notifications: {
    toastOnCheckStatusChange: true,
    toastOnNewPR: true,
    toastOnReviewUpdate: true,
  },
  claudeCode: {
    defaultPostFixAction: 'commitAndNotify',
  },
  claudeReview: {
    botUsername: 'claude-code',
  },
  updates: {
    autoCheckEnabled: true,
    autoDownload: false,
  },
  azureDevOps: {
    organization: '',
    project: '',
    pollIntervalSeconds: 120,
    favoriteQueryIds: [],
    trackedWorkItemIds: [],
    workingOnWorkItemIds: [],
    workItemWorktreePaths: {},
  },
};

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: defaultSettings,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const settings = await invoke<AppSettings>('load_settings');
      set({ settings, isLoading: false });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoading: false });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    set({ settings });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_settings', { settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      // Revert on failure by reloading
      await get().loadSettings();
    }
  },

  updateSettings: (partial: Partial<AppSettings>) => {
    set((state) => ({
      settings: { ...state.settings, ...partial },
    }));
  },
}));
