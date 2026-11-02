import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelOption } from '../../../shared/src/api.ts';
import type { ModelSelection } from './client.ts';
import type { T3Thread } from './source.ts';

// Codex fetches its model list at runtime and caches it; T3 ships Claude's in its manifest.
// Reading both means a new model shows up in Dispatch as soon as Codex or T3 knows about it.
const CODEX_CACHE = join(homedir(), '.codex', 'models_cache.json');
const RECENT_DAYS = 14;
const MAX_RECENT = 5;

const EFFORT_LABELS: Record<string, string> = {
  minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max',
  ultra: 'Ultra', ultracode: 'Ultracode', ultrathink: 'Ultrathink',
};

type Entry = ModelOption & { selection: (effort: string | null) => ModelSelection };

function codexModels(cacheFile: string): Entry[] {
  if (!existsSync(cacheFile)) return [];
  const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
  return (cache.models ?? [])
    .filter((m: any) => m.visibility === 'list')
    .sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99))
    .map((m: any): Entry => ({
      id: `codex/${m.slug}`,
      label: m.display_name ?? m.slug,
      provider: 'Codex',
      recent: false,
      efforts: (m.supported_reasoning_levels ?? []).map((l: any) => ({ id: l.effort, label: EFFORT_LABELS[l.effort] ?? l.effort })),
      defaultEffort: m.default_reasoning_level ?? null,
      selection: (effort) => ({
        instanceId: 'codex',
        model: m.slug,
        options: [...(effort ? [{ id: 'reasoningEffort', value: effort }] : []), { id: 'serviceTier', value: 'default' }],
      }),
    }));
}

function claudeModels(manifestFile: string): Entry[] {
  if (!existsSync(manifestFile)) return [];
  const provider = JSON.parse(readFileSync(manifestFile, 'utf8')).manifest?.providers?.claudeAgent;
  if (!provider) return [];
  return (provider.models ?? []).map((m: any): Entry => {
    const descriptors: any[] = provider.profiles?.[m.profile]?.capabilities?.optionDescriptors ?? [];
    const effort = descriptors.find((d) => d.id === 'effort');
    const contextWindow = descriptors.find((d) => d.id === 'contextWindow');
    const defaultWindow = contextWindow?.options?.find((o: any) => o.isDefault)?.id ?? null;
    return {
      id: `claudeAgent/${m.slug}`,
      label: m.name ?? m.slug,
      provider: 'Claude',
      recent: false,
      efforts: (effort?.options ?? []).map((o: any) => ({ id: o.id, label: o.label ?? EFFORT_LABELS[o.id] ?? o.id })),
      defaultEffort: effort?.options?.find((o: any) => o.isDefault)?.id ?? null,
      selection: (chosen) => ({
        instanceId: 'claudeAgent',
        model: m.slug,
        options: [
          ...(chosen ? [{ id: 'effort', value: chosen }] : []),
          ...(descriptors.some((d) => d.id === 'fastMode') ? [{ id: 'fastMode', value: false }] : []),
          ...(defaultWindow ? [{ id: 'contextWindow', value: defaultWindow }] : []),
        ],
      }),
    };
  });
}

export type ModelCatalogue = {
  models: ModelOption[];
  /** Model id to start with when nothing is remembered: Codex's own first pick. */
  fallbackModel: string | null;
  /** Effort you last used in T3 per model id. */
  recentEffort: Map<string, string>;
  selection: (modelId: string, effort: string | null) => ModelSelection;
};

/** Every model T3 can start, the ones you used in the last three weeks first. */
export function modelCatalogue(manifestFile: string, threads: T3Thread[], codexCache = CODEX_CACHE): ModelCatalogue {
  const entries = [...codexModels(codexCache), ...claudeModels(manifestFile)];
  const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  // Newest use wins: switching to a new model moves it to the top straight away.
  const lastUsed = new Map<string, string>();
  const recentEffort = new Map<string, string>();
  for (const t of [...threads].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!t.modelInstance) continue;
    const id = `${t.modelInstance.replace(/_.*$/, '')}/${t.model}`;
    if (t.effort) recentEffort.set(id, t.effort);
    if (t.createdAt >= cutoff) lastUsed.set(id, t.createdAt);
  }
  const recentIds = [...lastUsed].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id).filter((id) => entries.some((e) => e.id === id)).slice(0, MAX_RECENT);
  for (const e of entries) e.recent = recentIds.includes(e.id);
  const ordered = [...recentIds.map((id) => entries.find((e) => e.id === id)!), ...entries.filter((e) => !e.recent)];
  const byId = new Map(entries.map((e) => [e.id, e]));
  return {
    models: ordered.map(({ selection: _s, ...option }) => option),
    fallbackModel: entries.find((e) => e.provider === 'Codex')?.id ?? entries[0]?.id ?? null,
    recentEffort,
    selection: (modelId, effort) => {
      const entry = byId.get(modelId);
      if (!entry) throw new Error(`T3 can't start ${modelId}`);
      if (effort && !entry.efforts.some((e) => e.id === effort)) throw new Error(`${entry.label} has no ${effort} reasoning level`);
      return entry.selection(entry.efforts.length ? effort ?? entry.defaultEffort : null);
    },
  };
}

export type LiveProvider = {
  instanceId: string;
  driver: string;
  displayName?: string;
  enabled: boolean;
  installed: boolean;
  status: string;
  models: { slug: string; name?: string; isDefault?: boolean; capabilities?: { optionDescriptors?: { id: string; type: string; currentValue?: unknown; options?: { id: string; label?: string; isDefault?: boolean }[] }[] } }[];
};

export function liveModelCatalogue(providers: LiveProvider[], threads: T3Thread[]): ModelCatalogue {
  const entries: Entry[] = providers.filter((p) => p.enabled && p.installed && p.status === 'ready').flatMap((p) => p.models.map((m): Entry => {
    const descriptors = m.capabilities?.optionDescriptors ?? [];
    const effort = descriptors.find((d) => d.id === 'reasoningEffort' || d.id === 'effort');
    return {
      id: `${p.instanceId}/${m.slug}`,
      label: `${m.name ?? m.slug}${p.displayName ? ` · ${p.displayName}` : ''}`,
      provider: p.driver === 'codex' ? 'Codex' : p.driver === 'claudeAgent' ? 'Claude' : 'Other',
      recent: false,
      efforts: (effort?.options ?? []).map((o) => ({ id: o.id, label: o.label ?? o.id })),
      defaultEffort: effort?.options?.find((o) => o.isDefault)?.id ?? null,
      selection: (chosen) => ({ instanceId: p.instanceId, model: m.slug, options: descriptors.flatMap((d) => {
        if (d === effort) return chosen ? [{ id: d.id, value: chosen }] : [];
        const value = d.options?.find((o) => o.isDefault)?.id ?? (d.type === 'boolean' ? false : undefined);
        return value === undefined ? [] : [{ id: d.id, value }];
      }) }),
    };
  }));
  const recentEffort = new Map<string, string>();
  const used = new Map<string, string>();
  for (const t of [...threads].sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt))) {
    const id = `${t.modelInstance}/${t.model}`;
    if (t.effort) recentEffort.set(id, t.effort);
    if (Date.now() - Date.parse(t.lastActivityAt) < RECENT_DAYS * 86_400_000) used.set(id, t.lastActivityAt);
  }
  const recent = [...used].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id).filter((id) => entries.some((e) => e.id === id)).slice(0, MAX_RECENT);
  entries.forEach((e) => { e.recent = recent.includes(e.id); });
  const ordered = [...recent.map((id) => entries.find((e) => e.id === id)!), ...entries.filter((e) => !e.recent)];
  return {
    models: ordered.map(({ selection: _selection, ...option }) => option),
    fallbackModel: entries.find((e) => e.provider === 'Codex')?.id ?? entries[0]?.id ?? null,
    recentEffort,
    selection: (id, effort) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) throw new Error(`T3 can't start ${id}`);
      if (effort && !entry.efforts.some((e) => e.id === effort)) throw new Error(`${entry.label} has no ${effort} reasoning level`);
      return entry.selection(effort ?? entry.defaultEffort);
    },
  };
}
