import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openUrl: vi.fn(), showSection: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve([])) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));
vi.mock('@/services/navigation', () => ({ showSection: mocks.showSection }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import {
  ACCOUNTS,
  INTRODUCED,
  opsRunOutAt,
  readingsAt,
} from '@/services/ai-usage/__fixtures__/accounts';
import type { AgentThread } from '@/services/dispatch/types';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiUsageSettings } from '@/types/settings';
import { AiUsageFocusCard } from '../AiUsageFocusCard';

function seed(readings = opsRunOutAt(Date.now()), aiUsage: AiUsageSettings = INTRODUCED) {
  useAiUsageStore.setState({ accounts: ACCOUNTS, looked: true, readings });
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({ hasLoaded: true, settings: { ...settings, aiUsage } });
}

const stopped = (id: string) =>
  ({
    id,
    hostId: 'local',
    open: true,
    modelInstance: 'claudeAgent_ops',
    run: {
      id: 'run:ordinal:2',
      status: 'completed',
      limitRecovery: { requestId: id, runId: 'run:ordinal:2', resetAt: '' },
    },
  }) as unknown as AgentThread;

describe('AiUsageFocusCard', () => {
  beforeEach(() => {
    mocks.openUrl.mockClear();
    mocks.showSection.mockClear();
    useDispatchStore.setState({ threads: [] });
    seed();
  });

  it('renders nothing while every account has some left', () => {
    seed(readingsAt(Date.now()));
    expect(render(<AiUsageFocusCard />).container).toBeEmptyDOMElement();
  });

  it('says when the account resets and which account still has room', () => {
    render(<AiUsageFocusCard />);
    const card = screen.getByRole('region', { name: 'Claude OP is out of usage' });
    expect(card).toHaveTextContent(/Out until \S+ \d{2}:\d{2}/);
    expect(card).toHaveTextContent('Claude AC has 62% of its week left.');
    expect(screen.queryByRole('button', { name: 'Open the threads' })).toBeNull();
  });

  it('counts the threads that stopped on the limit and opens Dispatch', () => {
    useDispatchStore.setState({ threads: [stopped('a'), stopped('b')] });
    render(<AiUsageFocusCard />);
    expect(screen.getByRole('region')).toHaveTextContent(
      '2 threads stopped on its limit. Claude AC has 62% of its week left.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the threads' }));
    expect(mocks.showSection).toHaveBeenCalledWith('dispatch');
  });

  it("opens the provider's usage page", async () => {
    render(<AiUsageFocusCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage usage' }));
    await vi.waitFor(() =>
      expect(mocks.openUrl).toHaveBeenCalledWith('https://claude.ai/settings/usage'),
    );
  });

  it('stays away before the first-start sheet is answered', () => {
    seed(opsRunOutAt(Date.now()), {});
    expect(render(<AiUsageFocusCard />).container).toBeEmptyDOMElement();
  });
});
