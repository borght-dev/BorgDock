import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type UpdateStatus, useUpdateStore } from '@/stores/update-store';
import type { UpdateSettings } from '@/types/settings';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  restart: vi.fn(),
  openUrl: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));

vi.mock('@/services/updates', async () => {
  const actual = await vi.importActual<typeof import('@/services/updates')>('@/services/updates');
  return {
    ...actual,
    checkForUpdate: mocks.check,
    downloadUpdate: mocks.download,
    restartToApplyUpdate: mocks.restart,
  };
});

vi.mock('@/hooks/useWhatsNew', () => ({
  openWhatsNew: vi.fn(),
}));

vi.mock('@/generated/changelog', () => ({
  RELEASES: [
    {
      version: '1.2.0',
      date: '2026-04-30',
      summary: 'test release summary',
      highlights: [],
      alsoFixed: [],
      autoOpenEligible: false,
    },
  ],
}));

import { UpdateSection } from '../UpdateSection';

const idle: UpdateStatus = {
  phase: 'idle',
  currentVersion: '1.2.0',
  version: null,
  progress: 0,
  lastCheckedAt: null,
  lastError: null,
};
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function renderSection(status: Partial<UpdateStatus> = {}, updates?: Partial<UpdateSettings>) {
  useUpdateStore.getState().setStatus({ ...idle, ...status });
  const onChange = vi.fn();
  render(
    <UpdateSection
      updates={{ autoCheckEnabled: true, autoDownload: true, ...updates }}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('UpdateSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.getState().reset();
  });

  it('renders the channel toggles and says when checks run', () => {
    renderSection();
    expect(screen.getByText('Auto-check for updates')).toBeInTheDocument();
    expect(screen.getByText('Auto-download updates')).toBeInTheDocument();
    expect(screen.getByText('Checks every hour, and when the computer wakes.')).toBeInTheDocument();
  });

  it('names the repository the releases come from and opens it', () => {
    renderSection();
    expect(screen.getByText(/borght-dev\/BorgDock/)).toBeInTheDocument();
    expect(screen.queryByText(/Gomocha-FSP/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Open releases'));
    expect(mocks.openUrl).toHaveBeenCalledWith('https://github.com/borght-dev/BorgDock/releases');
  });

  it('clicking "Check for updates" checks', () => {
    renderSection();
    fireEvent.click(screen.getByText('Check for updates'));
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it('says a check has not happened yet, and does not call the version current', () => {
    renderSection();
    expect(screen.getByTestId('update-last-checked')).toHaveTextContent('Not checked yet');
    expect(screen.queryByText(/— current/)).not.toBeInTheDocument();
  });

  it('says when the last check finished and that the version is current', () => {
    renderSection({ lastCheckedAt: minutesAgo(12) });
    expect(screen.getByTestId('update-last-checked')).toHaveTextContent('Last checked 12 min ago');
    expect(screen.getByText('v1.2.0 — current')).toBeInTheDocument();
    expect(screen.getByText("You're on the latest version")).toBeInTheDocument();
  });

  it('shows why the last check failed instead of calling the version current', () => {
    renderSection({
      lastCheckedAt: minutesAgo(3),
      lastError: 'Check failed: error sending request',
    });
    expect(screen.getByTestId('update-error')).toHaveTextContent(
      'Check failed: error sending request',
    );
    expect(screen.getByTestId('update-last-checked')).toHaveTextContent('Last checked 3 min ago');
    expect(screen.queryByText(/— current/)).not.toBeInTheDocument();
    expect(screen.queryByText("You're on the latest version")).not.toBeInTheDocument();
  });

  it('offers the download of an available update and never says "current"', () => {
    renderSection(
      { phase: 'available', version: '1.3.0', lastCheckedAt: minutesAgo(1) },
      { autoDownload: false },
    );
    expect(screen.getByText('v1.3.0 available')).toBeInTheDocument();
    expect(screen.queryByText(/— current/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download v1.3.0' }));
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it('shows the progress of a download', () => {
    renderSection({ phase: 'downloading', version: '1.3.0', progress: 42 });
    expect(screen.getByText('Downloading v1.3.0… 42%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
  });

  it('offers the restart once the update is downloaded', () => {
    renderSection({ phase: 'ready', version: '1.3.0', progress: 100 });
    expect(screen.getByText('v1.3.0 ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restart to apply' }));
    expect(mocks.restart).toHaveBeenCalledTimes(1);
  });

  it('disables the restart while the installer starts', () => {
    renderSection({ phase: 'installing', version: '1.3.0', progress: 100 });
    expect(screen.getByRole('button', { name: 'Restarting…' })).toBeDisabled();
  });

  it('renders Recent releases with the installed one marked', () => {
    renderSection();
    expect(screen.getByText('Recent releases')).toBeInTheDocument();
    expect(screen.getByText('test release summary')).toBeInTheDocument();
    expect(screen.getByText('installed')).toBeInTheDocument();
  });
});
