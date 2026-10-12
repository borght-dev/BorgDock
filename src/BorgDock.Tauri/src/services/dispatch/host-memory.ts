import { useDispatchStore } from '@/stores/dispatch-store';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';
import type { AgentProject, AgentThread } from './types';

const STORE_FILE = 'dispatch-hosts.json';
const MEMORY_KEY = 'lastKnown';

/** What is kept of a remote host between sessions: its projects and the threads still open. */
interface HostMemory {
  threads: AgentThread[];
  projects: AgentProject[];
}

type Memory = Record<string, HostMemory>;

let memory: Promise<Memory> | null = null;

function loadMemory(): Promise<Memory> {
  memory ??= readFromTauriStore<Memory>(STORE_FILE, MEMORY_KEY)
    .then((stored) => stored ?? {})
    .catch(() => ({}));
  return memory;
}

function write(known: Memory): Promise<void> {
  return persistToTauriStore(STORE_FILE, MEMORY_KEY, known).catch(() => {});
}

/**
 * Write down what a remote host holds now. If it cannot be reached after a
 * restart, the work its agents were doing still shows, marked offline, and
 * nobody starts a second agent on an item that already has one.
 */
export async function rememberHost(hostId: string): Promise<void> {
  const known = await loadMemory();
  const { threads, projects } = useDispatchStore.getState();
  const now: HostMemory = {
    threads: threads.filter((thread) => thread.hostId === hostId && thread.open),
    projects: projects.filter((project) => project.hostId === hostId),
  };
  if (JSON.stringify(known[hostId]) === JSON.stringify(now)) return;
  known[hostId] = now;
  await write(known);
}

/** Drop what is remembered of the hosts that are no longer followed. */
export async function forgetHostsExcept(hostIds: readonly string[]): Promise<void> {
  const known = await loadMemory();
  const gone = Object.keys(known).filter((hostId) => !hostIds.includes(hostId));
  if (gone.length === 0) return;
  for (const hostId of gone) delete known[hostId];
  await write(known);
}

/** Put back what was last known of the hosts that have not answered yet, as offline. */
export async function recallHosts(hostIds: readonly string[]): Promise<void> {
  const known = await loadMemory();
  const offline = <T extends { available: boolean }>(entry: T): T => ({
    ...entry,
    available: false,
  });
  for (const hostId of hostIds) {
    const last = known[hostId];
    const store = useDispatchStore.getState();
    if (!last || store.hosts.some((host) => host.id === hostId && host.ok)) continue;
    store.setHostSnapshot(hostId, last.threads.map(offline), last.projects.map(offline));
  }
}

/** Read the stored memory again on next use (tests). */
export function resetHostMemory(): void {
  memory = null;
}
