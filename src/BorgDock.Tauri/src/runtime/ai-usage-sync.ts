import { openAccountSettings } from '@/services/ai-usage/actions';
import { accountPreferences, providerName, unknownAccounts } from '@/services/ai-usage/model';
import type { AiAccount } from '@/services/ai-usage/types';
import { createLogger } from '@/services/logger';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast } from '@/stores/toast-store';

const log = createLogger('ai-usage-sync');

/** Claude answers 429 when its usage is read often, so the accounts are read this rarely. */
const READ_EVERY_MS = 10 * 60_000;
/** Opening the card reads again only when the last read is older than this. */
const FRESH_FOR_MS = 60_000;

/**
 * The accounts to read. Nothing is read before the first-start sheet is
 * answered, and never an account the rail does not show.
 */
function shownAccountIds(): string[] {
  const { accounts } = useAiUsageStore.getState();
  const settings = useSettingsStore.getState().settings.aiUsage;
  if (!settings?.introduced) return [];
  const preferences = accountPreferences(accounts, settings);
  return accounts.filter((account) => !preferences[account.id]?.hidden).map(({ id }) => id);
}

function readShownAccounts(): Promise<void> {
  return useAiUsageStore.getState().read(shownAccountIds());
}

/** Reads the shown accounts now, unless they were read a moment ago. */
export function refreshAiUsage(force = false): void {
  const { lastReadAt } = useAiUsageStore.getState();
  if (!force && lastReadAt !== null && Date.now() - lastReadAt < FRESH_FOR_MS) return;
  void readShownAccounts().catch((error) => log.warn('usage read failed', { error }));
}

/** An account that appeared after the sheet was answered gets its suggested label, and a toast to change it. */
function announceNewAccounts(accounts: readonly AiAccount[]): void {
  const store = useSettingsStore.getState();
  const settings = store.settings.aiUsage;
  const found = unknownAccounts(accounts, settings);
  if (found.length === 0) return;
  const preferences = accountPreferences(accounts, settings);
  store.updateSettings({
    aiUsage: {
      ...settings,
      accounts: {
        ...settings?.accounts,
        ...Object.fromEntries(found.map(({ id }) => [id, preferences[id]!])),
      },
    },
  });
  for (const account of found) {
    showToast({
      title: `New ${providerName(account.provider)} account found`,
      message: `${account.folder} shows in the rail as ${preferences[account.id]!.label}.`,
      actionLabel: 'Label it',
      onAction: openAccountSettings,
    });
  }
}

/**
 * AI account usage, main window only: finds the Claude and Codex accounts on
 * this machine and reads what is left of the ones the rail shows, at start,
 * every ten minutes, and when the set of shown accounts changes.
 */
export function startAiUsageSync(): () => void {
  let stopped = false;
  let shown = '';

  const cycle = async () => {
    if (stopped || !useSettingsStore.getState().hasLoaded) return;
    const accounts = await useAiUsageStore.getState().findAccounts();
    if (stopped) return;
    announceNewAccounts(accounts);
    shown = JSON.stringify(shownAccountIds());
    await readShownAccounts();
  };
  const run = () => void cycle().catch((error) => log.warn('usage cycle failed', { error }));

  const unsubscribe = useSettingsStore.subscribe((state, previous) => {
    if (state.hasLoaded && !previous.hasLoaded) {
      run();
      return;
    }
    if (state.settings.aiUsage === previous.settings.aiUsage) return;
    const next = JSON.stringify(shownAccountIds());
    if (next === shown) return;
    shown = next;
    refreshAiUsage(true);
  });

  void useAiUsageStore.getState().restore();
  run();
  const timer = setInterval(run, READ_EVERY_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    unsubscribe();
  };
}
