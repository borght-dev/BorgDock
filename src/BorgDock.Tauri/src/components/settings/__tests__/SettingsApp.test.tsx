import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    close: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
  }),
}));

const saveSettings = vi.fn().mockResolvedValue(undefined);
const updateSettings = vi.fn();
const loadSettings = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: Object.assign(
    (sel: any) => sel({ settings: defaultMockSettings(), saveSettings, hasLoaded: true }),
    {
      getState: () => ({
        updateSettings,
        loadSettings,
        settings: defaultMockSettings(),
        saveSettings,
        hasLoaded: true,
      }),
    },
  ),
}));

// Each section component depends on its slice — provide enough shape
// so they all render without throwing.
function defaultMockSettings(): any {
  return {
    setupComplete: true,
    gitHub: { authMethod: 'ghCli', personalAccessToken: undefined, pollIntervalSeconds: 60, username: '' },
    repos: [],
    ui: { sidebarEdge: 'right', sidebarMode: 'pinned', sidebarWidthPx: 800, theme: 'system', globalHotkey: '', flyoutHotkey: '', editorCommand: 'code', runAtStartup: false, quickReviewHotkey: '', startMinimizedToTray: false, restoreLastSelection: true },
    notifications: { toastOnCheckStatusChange: true, toastOnNewPR: false, toastOnReviewUpdate: true, toastOnMergeable: true, onlyMyPRs: false, playMergeSound: false, reviewNudgeEnabled: true, reviewNudgeIntervalMinutes: 60, reviewNudgeEscalation: false, deduplicationWindowSeconds: 60, channels: { tray: true, system: true, sound: true, emailDigest: false } },
    claudeCode: { defaultPostFixAction: 'commitAndNotify' },
    claudeApi: { model: 'claude-sonnet-4-6', maxTokens: 1024, prSummaryEnabled: true, diffExplanationsEnabled: true, reviewNudgePhrasingEnabled: false, commitMessageSuggestionsEnabled: false },
    claudeReview: { botUsername: '' },
    updates: { autoCheckEnabled: true, autoDownload: false },
    azureDevOps: { organization: '', project: '', authMethod: 'azCli', authAutoDetected: false, pollIntervalSeconds: 120, favoriteQueryIds: [], trackedWorkItemIds: [], workingOnWorkItemIds: [], workItemWorktreePaths: {}, recentWorkItemIds: [], linkMatchBy: 'branch', showWorkItemStateOnPrCard: true, updatePrStatusWhenWiDone: false },
    sql: { connections: [], readOnlyByDefault: true, confirmDestructiveWithoutWhere: true },
    repoPriority: {},
    agentOverview: {},
  };
}

import { SettingsApp } from '../SettingsApp';

describe('SettingsApp', () => {
  beforeEach(() => {
    localStorage.clear();
    location.hash = '';
    saveSettings.mockClear();
    updateSettings.mockClear();
  });

  it('renders rail with all four group headers', () => {
    render(<SettingsApp />);
    expect(screen.getByText('Data sources')).toBeInTheDocument();
    expect(screen.getByText('Application')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('switches active section when a rail button is clicked, persists to localStorage', () => {
    render(<SettingsApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Repositories' }));
    expect(localStorage.getItem('settings.lastSection')).toBe('repos');
  });

  it('honors location.hash on mount', () => {
    location.hash = '#section=ado';
    render(<SettingsApp />);
    const adoBtn = screen.getByRole('button', { name: 'Azure DevOps' });
    expect(adoBtn.className).toMatch(/font-semibold/);
  });

  it('shows breadcrumb of active section in title bar meta slot', () => {
    render(<SettingsApp />);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
    // Default active is github — breadcrumb and rail button both show "GitHub"
    expect(screen.getAllByText('GitHub').length).toBeGreaterThan(0);
  });

  it('clicking a search result switches section', async () => {
    render(<SettingsApp />);
    const search = screen.getByPlaceholderText('Search settings…');
    fireEvent.change(search, { target: { value: 'poll' } });
    const results = screen.getAllByText('Poll interval');
    expect(results.length).toBeGreaterThan(0);
    fireEvent.click(results[0]!.closest('button')!);
    expect(localStorage.getItem('settings.lastSection')).toBe('github');
  });

  it('search result for ADO field switches to ADO section', () => {
    render(<SettingsApp />);
    const search = screen.getByPlaceholderText('Search settings…');
    fireEvent.change(search, { target: { value: 'match by' } });
    const matchByBtn = screen.getByText('Match by').closest('button')!;
    fireEvent.click(matchByBtn);
    expect(localStorage.getItem('settings.lastSection')).toBe('ado');
  });
});
