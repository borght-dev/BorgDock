import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateSettings } from '@/types/settings';

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      settings: {
        updates: { autoCheckEnabled: true, autoDownload: true },
      },
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/hooks/useAutoUpdate', () => ({
  useAutoUpdate: () => ({
    checkForUpdate: mockCheckForUpdate,
    downloadAndInstall: mockDownloadAndInstall,
  }),
}));

vi.mock('@/hooks/useWhatsNew', () => ({
  openWhatsNew: vi.fn(),
}));

vi.mock('@/stores/update-store', () => ({
  useUpdateStore: () => ({
    checking: false,
    downloading: false,
    progress: 0,
    available: false,
    version: '',
    statusText: '',
    currentVersion: '1.2.0',
  }),
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

const mockCheckForUpdate = vi.fn();
const mockDownloadAndInstall = vi.fn();

function makeUpdates(overrides?: Partial<UpdateSettings>): UpdateSettings {
  return { autoCheckEnabled: true, autoDownload: true, ...overrides };
}

import { UpdateSection } from '../UpdateSection';

describe('UpdateSection', () => {
  it('renders Channel toggles', () => {
    const onChange = vi.fn();
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Auto-check for updates')).toBeInTheDocument();
    expect(screen.getByText('Auto-download updates')).toBeInTheDocument();
  });

  it('clicking "Check for updates" calls checkForUpdate', () => {
    const onChange = vi.fn();
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Check for updates'));
    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
  });

  it('renders Recent releases section with release data', () => {
    const onChange = vi.fn();
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Recent releases')).toBeInTheDocument();
    expect(screen.getByText('v1.2.0')).toBeInTheDocument();
    expect(screen.getByText('test release summary')).toBeInTheDocument();
  });
});
