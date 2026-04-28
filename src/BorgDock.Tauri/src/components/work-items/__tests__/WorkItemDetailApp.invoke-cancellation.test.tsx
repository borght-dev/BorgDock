import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---- Tauri mocks (must be before component import) ----

const mockInvoke = vi.fn();
const mockSetTitle = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockShow = vi.fn().mockResolvedValue(undefined);
const mockListen = vi.fn().mockResolvedValue(vi.fn());
const mockIsMaximized = vi.fn().mockResolvedValue(false);
const mockMinimize = vi.fn().mockResolvedValue(undefined);
const mockMaximize = vi.fn().mockResolvedValue(undefined);
const mockUnmaximize = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    listen: mockListen,
    setTitle: mockSetTitle,
    show: mockShow,
    close: mockClose,
    isMaximized: mockIsMaximized,
    minimize: mockMinimize,
    maximize: mockMaximize,
    unmaximize: mockUnmaximize,
  })),
}));

vi.mock('@/services/ado/workitems', () => ({
  getWorkItem: vi.fn(),
  getWorkItemComments: vi.fn().mockResolvedValue([]),
  getWorkItemTypeStates: vi.fn().mockResolvedValue(['New', 'Active', 'Resolved']),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  addWorkItemComment: vi.fn(),
}));

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    getStream: vi.fn(),
  })),
}));

vi.mock('@/hooks/useAdoImageAuth', () => ({
  useAdoImageAuth: vi.fn(),
}));

import { WorkItemDetailApp } from '../WorkItemDetailApp';

describe('WorkItemDetailApp invoke() cancellation', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not call setState after unmount when invoke resolves late', async () => {
    let resolveSettings: (s: unknown) => void = () => {};
    const settingsPromise = new Promise((r) => {
      resolveSettings = r;
    });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'load_settings') return settingsPromise;
      return Promise.resolve(null);
    });

    Object.defineProperty(window, 'location', {
      value: { search: '?id=42', href: 'http://localhost/?id=42' },
      writable: true,
    });

    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<WorkItemDetailApp />);

    // Unmount before the invoke() promise resolves.
    unmount();

    // Now resolve — the effect's async work should bail out via cancelled-flag.
    resolveSettings({
      setupComplete: true,
      gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
      repos: [],
      ui: {
        sidebarEdge: 'right',
        sidebarMode: 'pinned',
        sidebarWidthPx: 800,
        theme: 'dark',
        globalHotkey: '',
        flyoutHotkey: '',
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
      claudeCode: { defaultPostFixAction: 'commitAndNotify' },
      claudeApi: { model: 'claude-sonnet-4-6', maxTokens: 1024 },
      claudeReview: { botUsername: 'claude[bot]' },
      updates: { autoCheckEnabled: true, autoDownload: true },
      azureDevOps: {
        organization: 'o',
        project: 'p',
        personalAccessToken: 'pat',
        authMethod: 'pat',
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
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(consoleErrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not wrapped in act'),
    );
    consoleErrSpy.mockRestore();
  });
});
