import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === 'agent_overview_status') {
      return Promise.resolve({ healthy: false, endpoint: '127.0.0.1:4318', lastWriteAgoSeconds: null });
    }
    return Promise.resolve(undefined);
  }),
}));

const mockUpdateSettings = vi.fn();

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      settings: {
        agentOverview: {
          enabled: false,
          autoOpenOnStartup: false,
          autoArchiveAfterHours: undefined,
          otelExportIntervalMs: 2000,
        },
      },
      updateSettings: mockUpdateSettings,
    };
    return selector ? selector(state) : state;
  }),
}));

import { AgentOverviewSection } from '../AgentOverviewSection';

describe('AgentOverviewSection', () => {
  it('renders with disabled status pill', () => {
    render(<AgentOverviewSection />);
    expect(screen.getByText('Agent Overview')).toBeInTheDocument();
    expect(screen.getByText('disabled')).toBeInTheDocument();
    expect(screen.getByLabelText('Enable telemetry collection')).toBeInTheDocument();
  });

  it('clicking Enable triggers invoke and updateSettings', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<AgentOverviewSection />);
    fireEvent.click(screen.getByLabelText('Enable telemetry collection'));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'set_agent_overview_enabled',
        expect.objectContaining({ enabled: true, port: 4318 }),
      );
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          agentOverview: expect.objectContaining({ enabled: true }),
        }),
      );
    });
  });
});
