// .storybook/mocks/control.ts
//
// Singleton control surface used by the Tauri mocks and by story decorators.
// Lives on window so dynamic-imported mocks and the React tree can both reach it.

import type { Release } from '../../src/types/whats-new';

export interface InvokeRecord {
  command: string;
  args?: unknown;
}

export type ChannelListener = (event: { payload: unknown }) => void;

export type PluginStoreBehavior = 'normal' | 'pending' | 'reject';

export type InvokeResponse = unknown | ((args: unknown) => unknown);

export interface MonitorState {
  size: { width: number; height: number };
  scaleFactor: number;
}

export interface WindowSizeState {
  width: number;
  height: number;
  scaleFactor: number;
  // Phase 4 additions — outer-position state for getCurrentWindow().outerPosition / setPosition.
  x: number;
  y: number;
}

export interface StorybookTauriControl {
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, InvokeResponse>;

  // Phase 2 additions
  windowState: { isMaximized: boolean };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  // Phase 3 additions
  windowSize: WindowSizeState;
  monitorState: MonitorState | null;

  // Phase 4 additions
  clipboardWrites: string[];

  reset(): void;
  emit(channel: string, payload: unknown): void;
}

declare global {
  interface Window {
    __borgdock_storybook_tauri?: StorybookTauriControl;
  }
}

const DEFAULT_WINDOW_SIZE: WindowSizeState = {
  width: 480,
  height: 600,
  scaleFactor: 1,
  x: 100,
  y: 100,
};

function createControl(): StorybookTauriControl {
  const ctrl: StorybookTauriControl = {
    channels: new Map(),
    invocations: [],
    invokeResponses: {},

    windowState: { isMaximized: false },
    pluginStore: new Map(),
    pluginStoreBehavior: 'normal',
    appVersion: null,
    releasesOverride: null,

    windowSize: { ...DEFAULT_WINDOW_SIZE },
    monitorState: null,

    clipboardWrites: [],

    reset() {
      ctrl.channels.clear();
      ctrl.invocations.length = 0;
      for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];
      ctrl.windowState.isMaximized = false;
      ctrl.pluginStore.clear();
      ctrl.pluginStoreBehavior = 'normal';
      ctrl.appVersion = null;
      ctrl.releasesOverride = null;
      ctrl.windowSize.width = DEFAULT_WINDOW_SIZE.width;
      ctrl.windowSize.height = DEFAULT_WINDOW_SIZE.height;
      ctrl.windowSize.scaleFactor = DEFAULT_WINDOW_SIZE.scaleFactor;
      ctrl.windowSize.x = DEFAULT_WINDOW_SIZE.x;
      ctrl.windowSize.y = DEFAULT_WINDOW_SIZE.y;
      ctrl.monitorState = null;
      ctrl.clipboardWrites.length = 0;
    },
    emit(channel, payload) {
      const set = ctrl.channels.get(channel);
      if (!set) return;
      for (const cb of set) cb({ payload });
    },
  };
  return ctrl;
}

export function getControl(): StorybookTauriControl {
  if (typeof window === 'undefined') {
    throw new Error('storybook tauri mock used outside browser');
  }
  if (!window.__borgdock_storybook_tauri) {
    window.__borgdock_storybook_tauri = createControl();
  }
  return window.__borgdock_storybook_tauri;
}
