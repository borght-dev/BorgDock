import type { AgentProvider, InteractiveProvider } from '@/types/settings';

export function agentName(provider: AgentProvider): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

/** A place that only runs terminal agents uses Claude Code when T3 is the provider. */
export function terminalAgent(provider: InteractiveProvider): AgentProvider {
  return provider === 't3' ? 'claude' : provider;
}

export function fixLabel(provider: InteractiveProvider): string {
  return provider === 't3' ? 'Start thread in T3' : `Fix with ${agentName(provider)}`;
}

export function monitorLabel(provider: InteractiveProvider): string {
  return provider === 't3' ? 'Monitor in T3' : `Monitor with ${agentName(provider)}`;
}
