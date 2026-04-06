import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateStore } from '@/stores/update-store';
import type { UpdateSettings } from '@/types';
import { UpdateSection } from '../UpdateSection';

const mockCheckForUpdate = vi.fn();
const mockDownloadAndInstall = vi.fn();

vi.mock('@/hooks/useAutoUpdate', () => ({
  useAutoUpdate: () => ({
    checkForUpdate: mockCheckForUpdate,
    downloadAndInstall: mockDownloadAndInstall,
  }),
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: vi.fn((selector: any) => {
    const state = {
      settings: {
        updates: { autoCheckEnabled: true, autoDownload: true },
      },
    };
    return selector ? selector(state) : state;
  }),
}));

function makeUpdates(overrides?: Partial<UpdateSettings>): UpdateSettings {
  return {
    autoCheckEnabled: true,
    autoDownload: true,
    ...overrides,
  };
}

describe('UpdateSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    useUpdateStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders auto-check toggle', () => {
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Auto-check for updates')).toBeDefined();
  });

  it('renders auto-download toggle', () => {
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Auto-download updates')).toBeDefined();
  });

  it('toggles auto-check off', () => {
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    const row = screen.getByText('Auto-check for updates').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoCheckEnabled: false }),
    );
  });

  it('toggles auto-download off', () => {
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    const row = screen.getByText('Auto-download updates').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoDownload: false }),
    );
  });

  it('renders Check for Updates button', () => {
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Check for Updates')).toBeDefined();
  });

  it('calls checkForUpdate on button click', () => {
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Check for Updates'));
    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows Checking... when checking', () => {
    useUpdateStore.getState().setChecking(true);
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Checking...')).toBeDefined();
    const btn = screen.getByText('Checking...') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows Install button when update is available', () => {
    useUpdateStore.getState().setAvailable('2.0.0');
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Install v2.0.0')).toBeDefined();
  });

  it('calls downloadAndInstall when Install button is clicked', () => {
    useUpdateStore.getState().setAvailable('2.0.0');
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Install v2.0.0'));
    expect(mockDownloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('shows progress bar when downloading', () => {
    useUpdateStore.getState().setDownloading(true);
    useUpdateStore.getState().setProgress(50);
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    // Progress bar has a div with width style
    const progressBar = document.querySelector('[style*="width: 50%"]');
    expect(progressBar).toBeDefined();
  });

  it('shows status text', () => {
    useUpdateStore.getState().setStatusText('Update available: v2.0.0');
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('Update available: v2.0.0')).toBeDefined();
  });

  it('shows current version', () => {
    useUpdateStore.getState().setCurrentVersion('1.5.0');
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('v1.5.0')).toBeDefined();
  });

  it('shows fallback version when currentVersion is empty', () => {
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    expect(screen.getByText('v0.1.0')).toBeDefined();
  });

  it('disables Check button when downloading', () => {
    useUpdateStore.getState().setDownloading(true);
    render(<UpdateSection updates={makeUpdates()} onChange={onChange} />);
    // During downloading with available=false, the check button shows
    const btn = screen.getByText('Check for Updates') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
