import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';
import { SetupWizard } from '../SetupWizard';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ set: vi.fn(), save: vi.fn(), get: vi.fn() })),
}));

describe('SetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: {
        setupComplete: false,
        gitHub: {
          authMethod: 'ghCli',
          pollIntervalSeconds: 60,
          username: '',
        },
        repos: [],
        ui: {
          sidebarEdge: 'right',
          sidebarMode: 'pinned',
          sidebarWidthPx: 800,
          theme: 'system',
          globalHotkey: 'Ctrl+Win+Shift+G',
          flyoutHotkey: 'Ctrl+Win+Shift+F',
          editorCommand: 'code',
          runAtStartup: false,
          badgeEnabled: true,
          badgeStyle: 'GlassCapsule',
          indicatorStyle: 'SegmentRing',
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
          organization: '',
          project: '',
          authMethod: 'pat' as const,
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
      },
      saveSettings: vi.fn(),
    });
  });

  it('renders the wizard on the Auth step initially', () => {
    render(<SetupWizard />);
    expect(screen.getByText('Connect to GitHub')).toBeTruthy();
  });

  it('renders step indicators', () => {
    const { container } = render(<SetupWizard />);
    // There should be step indicator dots
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBeGreaterThanOrEqual(2);
  });

  it('has a disabled Next button initially (no auth validated)', () => {
    render(<SetupWizard />);
    const nextBtn = screen.getByText('Next');
    expect(nextBtn).toBeTruthy();
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Next when PAT method has a token entered', () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByText('Access Token'));
    const input = screen.getByPlaceholderText('ghp_...');
    fireEvent.change(input, { target: { value: 'ghp_test123' } });

    const nextBtn = screen.getByText('Next');
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('navigates to Repos step when Next is clicked', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });

    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Select Repositories')).toBeTruthy();
    });
  });

  it('shows Back button on Repos step', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeTruthy();
    });
  });

  it('navigates back to Auth step when Back is clicked', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Connect to GitHub')).toBeTruthy();
  });

  it('shows Finish button on the final step', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Finish')).toBeTruthy();
    });
  });

  it('calls discover_repos when moving to Repos step', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { owner: 'test', name: 'repo', localPath: '/path', isSelected: false },
    ]);

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('discover_repos');
    });
  });

  it('handles discover_repos failure gracefully', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('discovery failed'));

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Select Repositories')).toBeTruthy();
    });
  });

  it('validates auth when Verify Connection is clicked', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce('testuser');

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Verify Connection'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('check_github_auth', {
        method: 'ghCli',
        pat: undefined,
      });
      expect(screen.getByText('Authenticated as testuser')).toBeTruthy();
    });
  });

  it('shows auth failure when check_github_auth fails', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('auth failed'));

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Verify Connection'));

    await waitFor(() => {
      expect(screen.getByText('Authentication failed')).toBeTruthy();
    });
  });

  it('saves settings on Finish when repos are selected', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { owner: 'test', name: 'repo', localPath: '/path/repo', isSelected: true },
    ]);

    render(<SetupWizard />);

    // Go to Repos step with PAT auth
    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Finish')).toBeTruthy();
    });

    // Click Finish
    fireEvent.click(screen.getByText('Finish'));

    const { saveSettings } = useSettingsStore.getState();
    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalled();
    });
  });

  it('disables Finish when no repos are selected', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      const finishBtn = screen.getByText('Finish');
      expect((finishBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('validates PAT auth with correct method', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce('testuser');

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_mytoken' },
    });
    fireEvent.click(screen.getByText('Verify Connection'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('check_github_auth', {
        method: 'pat',
        pat: 'ghp_mytoken',
      });
    });
  });

  it('enables Next when ghCli auth is validated', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce('testuser');

    render(<SetupWizard />);

    // Default is ghCli, so just click verify
    fireEvent.click(screen.getByText('Verify Connection'));

    await waitFor(() => {
      expect(screen.getByText('Authenticated as testuser')).toBeTruthy();
    });

    const nextBtn = screen.getByText('Next');
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not show Back button on first step', () => {
    render(<SetupWizard />);
    expect(screen.queryByText('Back')).toBeNull();
  });

  it('displays discovered repos on Repos step', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { owner: 'myorg', name: 'myrepo', localPath: '/home/dev/myrepo', isSelected: false },
    ]);

    render(<SetupWizard />);

    fireEvent.click(screen.getByText('Access Token'));
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test' },
    });
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('myorg/myrepo')).toBeTruthy();
    });
  });
});
