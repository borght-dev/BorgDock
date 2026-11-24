import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  persist: vi.fn(() => Promise.resolve()),
  restore: vi.fn(() => Promise.resolve(undefined as unknown)),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: mocks.persist,
  readFromTauriStore: mocks.restore,
}));

import {
  CLAUDE_ACME,
  CODEX_HOME,
  limit,
  READINGS,
} from '@/services/ai-usage/__fixtures__/accounts';
import { AI_READINGS_STORE_KEY, useAiUsageStore } from '../ai-usage-store';

const usage = (account: typeof CLAUDE_ACME, left: number) => ({
  account,
  limits: [limit('weekly', 'Weekly', left, 3600)],
  credits: null,
  problem: null,
});

describe('ai-usage-store', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.persist.mockClear();
    mocks.restore.mockReset();
    mocks.restore.mockResolvedValue(undefined);
    useAiUsageStore.setState({
      accounts: [],
      looked: false,
      readings: {},
      isReading: false,
      lastReadAt: null,
    });
  });

  it('finds the accounts on this machine', async () => {
    mocks.invoke.mockResolvedValue([CLAUDE_ACME, CODEX_HOME]);
    await useAiUsageStore.getState().findAccounts();
    expect(mocks.invoke).toHaveBeenCalledWith('ai_usage_accounts');
    expect(useAiUsageStore.getState().accounts).toEqual([CLAUDE_ACME, CODEX_HOME]);
    expect(useAiUsageStore.getState().looked).toBe(true);
  });

  it('reads the accounts asked for, keeps the readings and saves them', async () => {
    useAiUsageStore.setState({ accounts: [CLAUDE_ACME, CODEX_HOME] });
    mocks.invoke.mockResolvedValue([
      usage(CLAUDE_ACME, 62),
      usage({ ...CODEX_HOME, plan: 'Plus' }, 89),
    ]);
    await useAiUsageStore.getState().read([CLAUDE_ACME.id, CODEX_HOME.id]);

    expect(mocks.invoke).toHaveBeenCalledWith('ai_usage_read', {
      ids: [CLAUDE_ACME.id, CODEX_HOME.id],
    });
    const state = useAiUsageStore.getState();
    expect(state.readings[CLAUDE_ACME.id]!.limits[0]!.usedPercent).toBe(38);
    expect(state.lastReadAt).not.toBeNull();
    expect(state.isReading).toBe(false);
    expect(state.accounts[1]!.plan).toBe('Plus');
    expect(mocks.persist).toHaveBeenCalledWith(
      'ui-state.json',
      AI_READINGS_STORE_KEY,
      state.readings,
    );
  });

  it('keeps the numbers read before when a read fails', async () => {
    useAiUsageStore.setState({ accounts: [CLAUDE_ACME], readings: READINGS });
    const problem = { kind: 'expired', message: 'Sign in again.' };
    mocks.invoke.mockResolvedValue([{ account: CLAUDE_ACME, limits: [], credits: null, problem }]);
    await useAiUsageStore.getState().read([CLAUDE_ACME.id]);

    const reading = useAiUsageStore.getState().readings[CLAUDE_ACME.id]!;
    expect(reading.limits).toEqual(READINGS[CLAUDE_ACME.id]!.limits);
    expect(reading.problem).toEqual(problem);
  });

  it('reads nothing when no account is asked for, and once while a read runs', async () => {
    await useAiUsageStore.getState().read([]);
    expect(mocks.invoke).not.toHaveBeenCalled();

    let finish: (value: unknown[]) => void = () => {};
    mocks.invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const first = useAiUsageStore.getState().read([CLAUDE_ACME.id]);
    const second = useAiUsageStore.getState().read([CLAUDE_ACME.id]);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(useAiUsageStore.getState().isReading).toBe(true);
    finish([]);
    await Promise.all([first, second]);
    expect(useAiUsageStore.getState().isReading).toBe(false);
  });

  it('shows the readings saved before a restart', async () => {
    mocks.restore.mockResolvedValue(READINGS);
    await useAiUsageStore.getState().restore();
    expect(useAiUsageStore.getState().readings).toEqual(READINGS);

    mocks.restore.mockResolvedValue({ broken: 'shape' });
    useAiUsageStore.setState({ readings: {} });
    await useAiUsageStore.getState().restore();
    expect(useAiUsageStore.getState().readings).toEqual({});
  });
});
