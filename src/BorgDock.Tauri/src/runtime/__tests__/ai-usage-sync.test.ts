import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('@/stores/toast-store', () => ({ showToast: mocks.toast }));

import {
  ACCOUNTS,
  CLAUDE_ACME,
  CLAUDE_OPS,
  CODEX_HOME,
} from '@/services/ai-usage/__fixtures__/accounts';
import { accountPreferences, withEveryAccount } from '@/services/ai-usage/model';
import type { AiAccount } from '@/services/ai-usage/types';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiUsageSettings } from '@/types/settings';
import { refreshAiUsage, startAiUsageSync } from '../ai-usage-sync';

const settle = () => vi.advanceTimersByTimeAsync(0);
const answered = (accounts: AiAccount[]) =>
  withEveryAccount(undefined, accounts, accountPreferences(accounts, undefined));

function setAiUsage(aiUsage: AiUsageSettings | undefined, hasLoaded = true) {
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({ hasLoaded, settings: { ...settings, aiUsage } });
}

function readCalls(): string[][] {
  return mocks.invoke.mock.calls
    .filter(([command]) => command === 'ai_usage_read')
    .map(([, args]) => (args as { ids: string[] }).ids);
}

describe('startAiUsageSync', () => {
  let stop: () => void = () => {};
  let found: AiAccount[] = ACCOUNTS;

  beforeEach(() => {
    vi.useFakeTimers();
    found = ACCOUNTS;
    mocks.invoke.mockReset();
    mocks.toast.mockReset();
    mocks.invoke.mockImplementation((command: string) =>
      Promise.resolve(command === 'ai_usage_accounts' ? found : []),
    );
    useAiUsageStore.setState({
      accounts: [],
      looked: false,
      readings: {},
      isReading: false,
      lastReadAt: null,
    });
    setAiUsage(undefined);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('finds the accounts but reads none before the first-start sheet is answered', async () => {
    stop = startAiUsageSync();
    await settle();
    expect(useAiUsageStore.getState().accounts).toEqual(ACCOUNTS);
    expect(readCalls()).toEqual([]);
  });

  it('reads the shown accounts at start and every ten minutes', async () => {
    const settings = answered(ACCOUNTS);
    settings.accounts![CLAUDE_OPS.id]!.hidden = true;
    setAiUsage(settings);
    stop = startAiUsageSync();
    await settle();
    const shown = ACCOUNTS.filter((account) => account.id !== CLAUDE_OPS.id).map(({ id }) => id);
    expect(readCalls()).toEqual([shown]);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(readCalls()).toEqual([shown, shown]);
  });

  it('waits for settings to load', async () => {
    setAiUsage(answered(ACCOUNTS), false);
    stop = startAiUsageSync();
    await settle();
    expect(mocks.invoke).not.toHaveBeenCalled();

    useSettingsStore.setState({ hasLoaded: true });
    await settle();
    expect(readCalls()).toHaveLength(1);
  });

  it('reads again when the sheet is answered or an account is switched on', async () => {
    stop = startAiUsageSync();
    await settle();
    setAiUsage(answered(ACCOUNTS));
    await settle();
    expect(readCalls()).toEqual([ACCOUNTS.map(({ id }) => id)]);

    setAiUsage({ ...answered(ACCOUNTS), warnUnder: 20 });
    await settle();
    expect(readCalls()).toHaveLength(1);
  });

  it('labels an account found later and says so once', async () => {
    found = [CLAUDE_ACME];
    setAiUsage(answered([CLAUDE_ACME]));
    stop = startAiUsageSync();
    await settle();
    expect(mocks.toast).not.toHaveBeenCalled();

    found = [CLAUDE_ACME, CODEX_HOME];
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast.mock.calls[0]![0]).toMatchObject({
      title: 'New Codex account found',
      message: '~/.codex shows in the rail as EX.',
      actionLabel: 'Label it',
    });
    expect(useSettingsStore.getState().settings.aiUsage?.accounts?.[CODEX_HOME.id]).toMatchObject({
      label: 'EX',
      hidden: false,
    });

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('skips a refresh when the accounts were read a moment ago', async () => {
    setAiUsage(answered(ACCOUNTS));
    stop = startAiUsageSync();
    await settle();
    refreshAiUsage();
    await settle();
    expect(readCalls()).toHaveLength(1);

    refreshAiUsage(true);
    await settle();
    expect(readCalls()).toHaveLength(2);
  });
});
