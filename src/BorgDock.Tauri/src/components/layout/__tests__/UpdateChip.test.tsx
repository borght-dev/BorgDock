import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import { type UpdateStatus, useUpdateStore } from '@/stores/update-store';

const mocks = vi.hoisted(() => ({ download: vi.fn(), restart: vi.fn() }));

vi.mock('@/services/updates', () => ({
  downloadUpdate: mocks.download,
  restartToApplyUpdate: mocks.restart,
}));

import { UpdateChip } from '../UpdateChip';

const idle: UpdateStatus = {
  phase: 'idle',
  currentVersion: '4.16.0',
  version: null,
  progress: 0,
  lastCheckedAt: '2026-11-24T09:00:10Z',
  lastError: null,
};

function show(status: Partial<UpdateStatus>, autoDownload = true) {
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...settings, updates: { ...settings.updates, autoDownload } },
  });
  useUpdateStore.getState().setStatus({ ...idle, ...status });
  return render(<UpdateChip />);
}

describe('UpdateChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.getState().reset();
  });

  it('shows nothing while there is nothing to do', () => {
    for (const phase of ['idle', 'checking'] as const) {
      const { container, unmount } = show({ phase });
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('offers the restart once the update is downloaded', () => {
    show({ phase: 'ready', version: '4.17.0', progress: 100 });
    const button = screen.getByRole('button', { name: 'Restart to update' });
    expect(button).toHaveAttribute('data-tauri-drag-region', 'false');
    fireEvent.click(button);
    expect(mocks.restart).toHaveBeenCalledOnce();
  });

  it('cannot be clicked twice while the installer starts', () => {
    useUpdateStore.getState().setRestarting(true);
    show({ phase: 'ready', version: '4.17.0', progress: 100 });
    expect(screen.getByRole('button', { name: 'Restarting…' })).toBeDisabled();
  });

  it('shows the progress of a download and takes no click', () => {
    show({ phase: 'downloading', version: '4.17.0', progress: 42 });
    expect(screen.getByRole('status')).toHaveTextContent('Updating… 42%');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers the download when updates are not downloaded by themselves', () => {
    show({ phase: 'available', version: '4.17.0' }, false);
    fireEvent.click(screen.getByRole('button', { name: 'v4.17.0 available' }));
    expect(mocks.download).toHaveBeenCalledOnce();
  });

  it('stays out of the way when the download starts by itself', () => {
    const { container } = show({ phase: 'available', version: '4.17.0' }, true);
    expect(container).toBeEmptyDOMElement();
  });
});
