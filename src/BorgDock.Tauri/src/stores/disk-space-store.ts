import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { cleanupPrompt, type HostDisks } from '@/services/disk-space';
import { launchModels, preferredModel } from '@/services/dispatch/launch';
import { t3Catalogue, t3LaunchThread, t3ShowThread } from '@/services/t3/api';
import { useDispatchStore } from './dispatch-store';
import { useSettingsStore } from './settings-store';

export interface CleanupState {
  starting?: boolean;
  threadId?: string;
  error?: string;
}

interface DiskSpaceState {
  hosts: HostDisks[];
  error: string | null;
  cleanup: Record<string, CleanupState>;
  refresh: () => Promise<void>;
  clean: (hostId: string) => Promise<void>;
}

let refreshing: Promise<void> | null = null;

export const useDiskSpaceStore = create<DiskSpaceState>((set, get) => ({
  hosts: [],
  error: null,
  cleanup: {},
  refresh: () => {
    if (refreshing) return refreshing;
    refreshing = invoke<HostDisks[]>('host_disk_space')
      .then((hosts) => {
        set({ hosts: hosts ?? [], error: null });
      })
      .catch((error: unknown) => {
        set({ hosts: [], error: String(error) });
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  },
  clean: async (hostId) => {
    if (get().cleanup[hostId]?.starting) return;
    const host = get().hosts.find((h) => h.id === hostId);
    if (!host) return;
    const update = (state: CleanupState) =>
      set((s) => ({ cleanup: { ...s.cleanup, [hostId]: state } }));
    const previous = get().cleanup[hostId];
    update({ ...previous, starting: true, error: undefined });
    let threadId = previous?.threadId;
    try {
      if (!host.t3Host)
        throw new Error(
          `Pair T3 for ${host.label} in Settings, Agents. Use the same host address as its SSH connection.`,
        );
      if (!threadId) {
        const catalogue = await t3Catalogue(host.t3Host);
        const threads = useDispatchStore
          .getState()
          .threads.filter((thread) => thread.hostId === host.t3Host?.id);
        const models = launchModels(catalogue, threads);
        const model = models.find((m) => m.id === preferredModel(models, null));
        if (!model) throw new Error(`No ready T3 models on ${host.label}. Check Settings, Agents.`);
        threadId = await t3LaunchThread(host.t3Host, {
          projectId: null,
          title: `Clean up disk space on ${host.label}`,
          modelSelection: model.selection(model.defaultEffort),
          prompt: cleanupPrompt(host),
        });
        update({ starting: true, threadId });
      }
      await t3ShowThread(
        host.t3Host,
        threadId,
        useSettingsStore.getState().settings.agents?.t3Path,
      );
      update({ threadId });
    } catch (error) {
      update({
        threadId,
        error: `${threadId ? 'Thread started. Could not open T3: ' : ''}${String(error)}`,
      });
    }
  },
}));
