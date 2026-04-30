import type { SessionRecord } from '@/services/agent-overview-types';

/**
 * Stub returning an empty list. Task 22 replaces this with the real
 * implementation that subscribes to the Rust delta channel via Tauri events.
 */
export function useAgentSessions(): SessionRecord[] {
  return [];
}
