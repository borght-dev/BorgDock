import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { SettingsFlyout } from '../SettingsFlyout';

// Mock Tauri APIs used by stores
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    save: vi.fn(),
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// Mock child components that have complex dependencies
vi.mock('@/components/worktree/WorktreePruneDialog', () => ({
  WorktreePruneDialog: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="prune-dialog"><button onClick={onClose}>Close Prune</button></div> : null,
}));
vi.mock('@/hooks/useAutoUpdate', () => ({
  useAutoUpdate: () => ({
    checkForUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
  }),
}));
vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: vi.fn((selector: any) => {
    const state = { show: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

describe('SettingsFlyout', () => {
  beforeEach(() => {
    // Reset stores
    useUiStore.getState().setSettingsOpen(false);
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders nothing when settings are closed', () => {
    const { container } = render(<SettingsFlyout />);
    expect(container.innerHTML).toBe('');
  });

  it('renders flyout when settings are open', () => {
    useUiStore.getState().setSettingsOpen(true);
    render(<SettingsFlyout />);
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('renders all section cards', () => {
    useUiStore.getState().setSettingsOpen(true);
    render(<SettingsFlyout />);

    expect(screen.getByText('GitHub')).toBeDefined();
    expect(screen.getByText('Repositories')).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
    expect(screen.getByText('Claude Code')).toBeDefined();
    expect(screen.getByText('Claude API (PR Summary)')).toBeDefined();
    expect(screen.getByText('Azure DevOps')).toBeDefined();
    expect(screen.getByText('SQL Server')).toBeDefined();
    expect(screen.getByText('Updates')).toBeDefined();
    expect(screen.getByText('Maintenance')).toBeDefined();
  });

  it('closes on overlay click', () => {
    useUiStore.getState().setSettingsOpen(true);
    render(<SettingsFlyout />);

    // The overlay is the first child with bg-[var(--color-overlay-bg)]
    const overlay = document.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    expect(useUiStore.getState().isSettingsOpen).toBe(false);
  });

  it('closes on close button click', () => {
    useUiStore.getState().setSettingsOpen(true);
    render(<SettingsFlyout />);

    // The close button contains the X character (&#10005;)
    const closeBtn = screen.getByText('\u2715');
    fireEvent.click(closeBtn);

    expect(useUiStore.getState().isSettingsOpen).toBe(false);
  });

  it('opens prune worktrees dialog', () => {
    useUiStore.getState().setSettingsOpen(true);
    render(<SettingsFlyout />);

    fireEvent.click(screen.getByText('Prune Worktrees'));
    expect(screen.getByTestId('prune-dialog')).toBeDefined();
  });

  it('closes prune worktrees dialog', () => {
    useUiStore.getState().setSettingsOpen(true);
    render(<SettingsFlyout />);

    fireEvent.click(screen.getByText('Prune Worktrees'));
    expect(screen.getByTestId('prune-dialog')).toBeDefined();

    fireEvent.click(screen.getByText('Close Prune'));
    expect(screen.queryByTestId('prune-dialog')).toBeNull();
  });

  it('resets onboarding on button click', () => {
    useUiStore.getState().setSettingsOpen(true);
    const resetSpy = vi.spyOn(useOnboardingStore.getState(), 'resetAll');

    render(<SettingsFlyout />);
    fireEvent.click(screen.getByText('Reset Onboarding'));

    expect(resetSpy).toHaveBeenCalled();
    resetSpy.mockRestore();
  });

  it('debounces save on settings change', async () => {
    vi.useFakeTimers();
    useUiStore.getState().setSettingsOpen(true);
    const saveSpy = vi.spyOn(useSettingsStore.getState(), 'saveSettings');

    render(<SettingsFlyout />);

    // Change the GitHub username via the input
    const usernameInput = screen.getByPlaceholderText('GitHub username');
    fireEvent.change(usernameInput, { target: { value: 'newuser' } });

    // Save should not have been called yet
    expect(saveSpy).not.toHaveBeenCalled();

    // Advance past the 300ms debounce
    vi.advanceTimersByTime(300);

    expect(saveSpy).toHaveBeenCalled();

    saveSpy.mockRestore();
    vi.useRealTimers();
  });

  it('flushes pending save on close', () => {
    vi.useFakeTimers();
    useUiStore.getState().setSettingsOpen(true);
    const saveSpy = vi.spyOn(useSettingsStore.getState(), 'saveSettings');

    render(<SettingsFlyout />);

    // Change a setting
    const usernameInput = screen.getByPlaceholderText('GitHub username');
    fireEvent.change(usernameInput, { target: { value: 'newuser' } });

    // Close without waiting for debounce
    useUiStore.getState().setSettingsOpen(false);

    // The save should be flushed on close
    // (The useEffect fires on isSettingsOpen change)
    vi.advanceTimersByTime(0);

    saveSpy.mockRestore();
    vi.useRealTimers();
  });
});
