import type { EventCallback } from '@tauri-apps/api/event';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_CHANGED_EVENT, SETTINGS_SOURCE_ID } from '@/stores/settings-events';
import { useSettingsSync } from '../useSettingsSync';

const events = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: events.listen }));

describe('useSettingsSync', () => {
  beforeEach(() => {
    events.listen.mockReset();
    events.stop.mockReset();
    events.listen.mockResolvedValue(events.stop);
  });

  it('refreshes on another window saving, skips its own saves, and uses the latest callback', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ refresh }) => useSettingsSync(refresh), {
      initialProps: { refresh: first },
    });
    await waitFor(() => expect(events.listen).toHaveBeenCalledOnce());
    const handler = events.listen.mock.calls[0]![1] as EventCallback<{ source: string }>;
    rerender({ refresh: second });
    await act(async () => {
      handler({ event: SETTINGS_CHANGED_EVENT, id: 1, payload: { source: SETTINGS_SOURCE_ID } });
    });
    expect(second).not.toHaveBeenCalled();
    await act(async () => {
      handler({ event: SETTINGS_CHANGED_EVENT, id: 2, payload: { source: 'other-window' } });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    unmount();
    expect(events.stop).toHaveBeenCalledOnce();
    await act(async () => {
      handler({ event: SETTINGS_CHANGED_EVENT, id: 3, payload: { source: 'other-window' } });
    });
    expect(second).toHaveBeenCalledOnce();
  });

  it('cleans up a listener that finishes registering after unmount', async () => {
    let register: ((stop: () => void) => void) | undefined;
    events.listen.mockReturnValue(
      new Promise<() => void>((resolve) => {
        register = resolve;
      }),
    );
    const { unmount } = renderHook(() => useSettingsSync(vi.fn()));
    await waitFor(() => expect(events.listen).toHaveBeenCalledOnce());
    unmount();
    await act(async () => {
      register!(events.stop);
    });
    expect(events.stop).toHaveBeenCalledOnce();
  });
});
