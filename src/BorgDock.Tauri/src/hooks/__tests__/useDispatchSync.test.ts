import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeThread } from '@/services/dispatch/__tests__/fixtures';
import { syncItems } from '@/services/dispatch/sync';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useDispatchSync } from '../useDispatchSync';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('@/hooks/useFlyoutSync', () => ({ bringMainWindowForward: vi.fn() }));
vi.mock('@/services/dispatch/actions', () => ({
  runItemAction: vi.fn(),
  showDispatchItem: vi.fn(),
}));
vi.mock('@/services/dispatch/host-memory', () => ({
  recallHosts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/dispatch/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/dispatch/sync')>()),
  syncAll: vi.fn(),
  syncHost: vi.fn(),
  syncItems: vi.fn(),
  followHostList: vi.fn(),
}));

describe('Dispatch settings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('refreshes ADO when a Dispatch batch finishes, once per transition', async () => {
    useDispatchStore.setState({
      items: [],
      projects: [],
      overview: null,
      threads: [makeThread({ id: 'batch', status: 'running' })],
      runs: [
        {
          threadId: 'batch',
          kind: 'sync',
          states: [],
          itemIds: [1, 2],
          slot: 'W7',
          startedAt: '2026-10-19T10:00:00Z',
        },
      ],
      restorePersisted: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => {
      renderHook(() => useDispatchSync());
    });
    vi.mocked(syncItems).mockClear();
    act(() =>
      useDispatchStore.setState({ threads: [makeThread({ id: 'batch', status: 'your-turn' })] }),
    );
    expect(syncItems).toHaveBeenCalledWith(true);
    vi.mocked(syncItems).mockClear();
    act(() =>
      useDispatchStore.setState({
        threads: [makeThread({ id: 'batch', status: 'your-turn', lastAgentMessage: 'Done' })],
      }),
    );
    expect(syncItems).not.toHaveBeenCalled();
    act(() =>
      useDispatchStore.setState({
        threads: [
          makeThread({ id: 'batch', status: 'your-turn', lastActivityAt: '2026-10-19T10:10:00Z' }),
        ],
      }),
    );
    expect(syncItems).toHaveBeenCalledWith(true);
  });

  it('filters existing slots immediately when the pattern changes or is cleared', async () => {
    useDispatchStore.setState({
      items: [],
      threads: [],
      overview: null,
      projects: ['W1', 'M1'].map((title) => ({
        id: title,
        hostId: 'local',
        hostLabel: 'This machine',
        available: true,
        title,
        workspaceRoot: `/work/${title}`,
      })),
      restorePersisted: vi.fn().mockResolvedValue(undefined),
    });
    const settings = useSettingsStore.getState().settings;
    const agents = {
      defaultProvider: 'claude' as const,
      defaultPostFixAction: 'none' as const,
      t3Model: 'default',
      t3ModelInstance: 'claudeAgent',
      t3SlotPattern: '^W',
    };
    useSettingsStore.setState({ settings: { ...settings, agents } });
    await act(async () => {
      renderHook(() => useDispatchSync());
    });
    const slots = () => useDispatchStore.getState().overview?.slots.map((slot) => slot.name);
    expect(slots()).toEqual(['W1']);
    act(() =>
      useSettingsStore.getState().updateSettings({ agents: { ...agents, t3SlotPattern: '^M' } }),
    );
    expect(slots()).toEqual(['M1']);
    act(() =>
      useSettingsStore
        .getState()
        .updateSettings({ agents: { ...agents, t3SlotPattern: undefined } }),
    );
    expect(slots()).toEqual(['M1', 'W1']);
  });
});
