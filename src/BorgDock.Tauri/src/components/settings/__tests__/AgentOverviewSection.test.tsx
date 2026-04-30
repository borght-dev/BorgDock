import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { AgentOverviewSection } from '../AgentOverviewSection';

describe('AgentOverviewSection', () => {
  it('renders enable toggle', () => {
    render(<AgentOverviewSection />);
    expect(screen.getByText(/Agent Overview/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Enable telemetry collection/i)).toBeInTheDocument();
  });

  it('clicking enable invokes the backend command', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<AgentOverviewSection />);
    fireEvent.click(screen.getByLabelText(/Enable telemetry collection/i));
    expect(invoke).toHaveBeenCalledWith('set_agent_overview_enabled', expect.objectContaining({ enabled: true }));
  });
});
