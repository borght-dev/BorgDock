import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { type AiReading, mergeReading } from '@/services/ai-usage/model';
import type { AiAccount, AiUsage } from '@/services/ai-usage/types';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

/** `ui-state.json` key of the last reading per account, so a restart shows numbers at once. */
export const AI_READINGS_STORE_KEY = 'aiUsageReadings';

interface AiUsageState {
  /** The AI accounts found on this machine. */
  accounts: AiAccount[];
  /** The accounts were looked for at least once. */
  looked: boolean;
  readings: Record<string, AiReading>;
  isReading: boolean;
  /** When the last read finished, epoch ms. */
  lastReadAt: number | null;
  restore: () => Promise<void>;
  findAccounts: () => Promise<AiAccount[]>;
  read: (ids: readonly string[]) => Promise<void>;
}

let reading: Promise<void> | null = null;

function isReadings(value: unknown): value is Record<string, AiReading> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).every(
      (entry) => !!entry && Array.isArray((entry as AiReading).limits) && 'readAt' in entry,
    )
  );
}

/**
 * What is left of each AI account. The main window's runtime
 * (`runtime/ai-usage-sync.ts`) finds the accounts and reads them; a failed
 * read keeps the numbers read before it.
 */
export const useAiUsageStore = create<AiUsageState>((set, get) => ({
  accounts: [],
  looked: false,
  readings: {},
  isReading: false,
  lastReadAt: null,
  restore: async () => {
    const saved = await readFromTauriStore<unknown>('ui-state.json', AI_READINGS_STORE_KEY).catch(
      () => undefined,
    );
    if (isReadings(saved)) set((state) => ({ readings: { ...saved, ...state.readings } }));
  },
  findAccounts: async () => {
    const accounts = await invoke<AiAccount[]>('ai_usage_accounts');
    set({ accounts, looked: true });
    return accounts;
  },
  read: (ids) => {
    if (reading) return reading;
    if (ids.length === 0) return Promise.resolve();
    set({ isReading: true });
    reading = invoke<AiUsage[]>('ai_usage_read', { ids: [...ids] })
      .then((usages) => {
        const now = Date.now();
        const readings = { ...get().readings };
        for (const usage of usages) {
          readings[usage.account.id] = mergeReading(readings[usage.account.id], usage, now);
        }
        const plans = new Map(usages.map((usage) => [usage.account.id, usage.account.plan]));
        set((state) => ({
          readings,
          lastReadAt: now,
          accounts: state.accounts.map((account) => ({
            ...account,
            plan: plans.get(account.id) ?? account.plan,
          })),
        }));
        void persistToTauriStore('ui-state.json', AI_READINGS_STORE_KEY, readings).catch(() => {});
      })
      .finally(() => {
        reading = null;
        set({ isReading: false });
      });
    return reading;
  },
}));
