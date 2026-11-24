import type {
  ActivityCommit_Deserialize,
  ActivityEntryInput_Deserialize,
  ActivitySourceRequest,
} from '@/generated/commands';

/**
 * The Rust journal's commit contract, in memory, for runtime tests: one
 * generation per source, revisions that only go up, insert-or-ignore.
 */
export class FakeJournal {
  sources = new Map<
    string,
    {
      generation: number;
      revision: number | null;
      baseline: string | null;
      seededAt: string | null;
      configKey: string;
    }
  >();
  entries = new Map<string, ActivityEntryInput_Deserialize & { read: string; status: string }>();
  outbox: { entryId: string; channel: string }[] = [];
  commits: ActivityCommit_Deserialize[] = [];
  /** Source id → its kind, for every source ever opened. */
  kinds = new Map<string, string>();
  retired = new Set<string>();
  failNext = false;

  listSources() {
    return Promise.resolve(
      [...this.sources].map(([sourceId, state]) => ({
        sourceId,
        kind: this.kinds.get(sourceId) ?? '',
        label: sourceId,
        configKey: state.configKey,
        generation: state.generation,
        revision: state.revision,
        baseline: state.baseline,
        seededAt: state.seededAt,
        committedAt: null,
        retiredAt: this.retired.has(sourceId) ? '2026-10-27T10:00:00.000Z' : null,
      })),
    );
  }

  /** Retiring ends what the source left needing me, as the Rust journal does. */
  retireSource(sourceId: string) {
    const changed = this.sources.has(sourceId) && !this.retired.has(sourceId);
    this.retired.add(sourceId);
    for (const entry of this.entries.values()) {
      if (entry.sourceId === sourceId && entry.status === 'open' && entry.needsYou) {
        entry.status = 'resolved';
        entry.read = 'read';
      }
    }
    return Promise.resolve(changed);
  }

  openSource(request: ActivitySourceRequest) {
    const existing = this.sources.get(request.sourceId);
    let state = existing;
    if (!existing) {
      state = {
        generation: 1,
        revision: null,
        baseline: null,
        seededAt: null,
        configKey: request.configKey,
      };
    } else if (existing.configKey !== request.configKey || request.reset) {
      state = {
        generation: existing.generation + 1,
        revision: null,
        baseline: null,
        seededAt: null,
        configKey: request.configKey,
      };
    }
    this.sources.set(request.sourceId, state!);
    this.kinds.set(request.sourceId, request.kind);
    this.retired.delete(request.sourceId);
    return Promise.resolve({
      sourceId: request.sourceId,
      kind: request.kind,
      label: request.label,
      configKey: state!.configKey,
      generation: state!.generation,
      revision: state!.revision,
      baseline: state!.baseline,
      seededAt: state!.seededAt,
      committedAt: null,
      retiredAt: null,
    });
  }

  commit(request: ActivityCommit_Deserialize) {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('Activity store: disk full'));
    }
    this.commits.push(request);
    const source = this.sources.get(request.sourceId);
    const reject = (reason: string) =>
      Promise.resolve({
        accepted: false,
        reason,
        inserted: [],
        revision: 0,
        capacity: 'ok' as const,
      });
    if (!source) return reject('unknown source');
    if (source.generation !== request.generation) return reject('stale generation');
    if (source.revision !== null && request.revision <= source.revision)
      return reject('stale revision');
    for (const resolution of request.resolutions) {
      for (const entry of this.entries.values()) {
        const named = resolution.ids.includes(entry.id);
        const byEntity =
          resolution.entityKey === entry.entityKey &&
          resolution.categories.includes(entry.category);
        if ((named || byEntity) && entry.status === 'open') {
          entry.status = resolution.status;
          entry.read = 'read';
        }
      }
    }
    const inserted: string[] = [];
    if (!request.seed) {
      for (const entry of request.entries) {
        if (this.entries.has(entry.id)) continue;
        this.entries.set(entry.id, { ...entry, read: 'unread' });
        inserted.push(entry.id);
      }
    }
    for (const mark of request.seen) {
      for (const entry of this.entries.values()) {
        if (
          entry.entityKey === mark.entityKey &&
          (entry.sourceAt ?? entry.observedAt) <= mark.before
        ) {
          entry.read = 'read';
        }
      }
    }
    for (const row of request.outbox) {
      if (inserted.includes(row.entryId) && this.entries.get(row.entryId)?.read === 'unread') {
        this.outbox.push(row);
      }
    }
    source.revision = request.revision;
    source.baseline = request.baseline;
    source.seededAt ??= new Date().toISOString();
    return Promise.resolve({
      accepted: true,
      reason: null,
      inserted,
      revision: 1,
      capacity: 'ok' as const,
    });
  }

  categories(): string[] {
    return [...this.entries.values()].map((entry) => entry.category);
  }
}
