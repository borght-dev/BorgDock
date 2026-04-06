import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AppSettings } from '@/types';

const mockEnable = vi.fn();
const mockDisable = vi.fn();
const mockIsEnabled = vi.fn();
const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: (...args: unknown[]) => mockEnable(...args),
  disable: (...args: unknown[]) => mockDisable(...args),
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

vi.mock('@tauri-apps/plugin-log', () => ({
  info: (...args: unknown[]) => mockInfo(...args),
  error: (...args: unknown[]) => mockError(...args),
}));

import { useRunAtStartup } from '../useRunAtStartup';

function makeSettings(runAtStartup: boolean): AppSettings {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
    repos: [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 800,
      theme: 'system',
      globalHotkey: '',
      editorCommand: 'code',
      runAtStartup,
      badgeStyle: 'GlassCapsule',
      indicatorStyle: 'SegmentRing',
    },
    notifications: {
      toastOnCheckStatusChange: true,
      toastOnNewPR: true,
      toastOnReviewUpdate: true,
      toastOnMergeable: true,
      onlyMyPRs: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: { model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
    claudeReview: { botUsername: '' },
    updates: { autoCheckEnabled: true, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      pollIntervalSeconds: 60,
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

describe('useRunAtStartup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables autostart when setting is true and currently disabled', async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockEnable.mockResolvedValue(undefined);

    renderHook(() => useRunAtStartup(makeSettings(true)));

    // Wait for the async effect
    await vi.waitFor(() => {
      expect(mockEnable).toHaveBeenCalled();
    });
    expect(mockDisable).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith('[autostart] enabled successfully');
  });

  it('disables autostart when setting is false and currently enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    mockDisable.mockResolvedValue(undefined);

    renderHook(() => useRunAtStartup(makeSettings(false)));

    await vi.waitFor(() => {
      expect(mockDisable).toHaveBeenCalled();
    });
    expect(mockEnable).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith('[autostart] disabled successfully');
  });

  it('does nothing when setting matches current state (both true)', async () => {
    mockIsEnabled.mockResolvedValue(true);

    renderHook(() => useRunAtStartup(makeSettings(true)));

    await vi.waitFor(() => {
      expect(mockIsEnabled).toHaveBeenCalled();
    });
    expect(mockEnable).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it('does nothing when setting matches current state (both false)', async () => {
    mockIsEnabled.mockResolvedValue(false);

    renderHook(() => useRunAtStartup(makeSettings(false)));

    await vi.waitFor(() => {
      expect(mockIsEnabled).toHaveBeenCalled();
    });
    expect(mockEnable).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it('logs the current state on check', async () => {
    mockIsEnabled.mockResolvedValue(false);

    renderHook(() => useRunAtStartup(makeSettings(false)));

    await vi.waitFor(() => {
      expect(mockInfo).toHaveBeenCalledWith('[autostart] setting=false, registry=false');
    });
  });

  it('handles errors gracefully', async () => {
    mockIsEnabled.mockRejectedValue(new Error('plugin not available'));

    renderHook(() => useRunAtStartup(makeSettings(true)));

    await vi.waitFor(() => {
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('[autostart] failed to sync'),
      );
    });
  });

  it('re-runs when runAtStartup setting changes', async () => {
    mockIsEnabled.mockResolvedValue(false);
    mockEnable.mockResolvedValue(undefined);

    const { rerender } = renderHook(({ settings }) => useRunAtStartup(settings), {
      initialProps: { settings: makeSettings(false) },
    });

    await vi.waitFor(() => {
      expect(mockIsEnabled).toHaveBeenCalledTimes(1);
    });

    rerender({ settings: makeSettings(true) });

    await vi.waitFor(() => {
      expect(mockEnable).toHaveBeenCalled();
    });
  });
});
