import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { EnvironmentStatus, SourceStatus } from '../../../shared/src/api.ts';
import type { Config, T3Environment } from '../config.ts';
import type { Db } from '../db.ts';
import { T3Client, type T3Transport } from './client.ts';
import { liveModelCatalogue, type LiveProvider, type ModelCatalogue } from './models.ts';
import { T3Source, type T3Project, type T3Thread } from './source.ts';

export type T3Host = {
  config: T3Environment;
  client: T3Transport;
  /** How the server reaches it: its own T3, a configured remote host, or a connector that dialled in. */
  kind: 'local' | 'ssh' | 'connector';
  source: T3Source;
  prefix: string;
  providers: LiveProvider[];
  modelsAt: number;
};

export class T3Fleet extends EventEmitter {
  readonly hosts: T3Host[];
  private timers = new Map<T3Host, NodeJS.Timeout>();
  private inFlight = new Map<T3Host, Promise<void>>();
  private started = false;
  private readonly db: Db;

  constructor(config: Config, db: Db) {
    super();
    this.db = db;
    const environments = [config.t3, ...config.t3Environments];
    if (new Set(environments.map((e) => e.environmentId)).size !== environments.length) throw new Error('T3 environment IDs must be unique');
    this.hosts = environments.map((environment, index) => {
      const client = new T3Client({ ...environment, dataDir: config.dataDir, sessionFile: environment.sessionFile ?? (index ? join(config.dataDir, `t3-session-${environment.environmentId}.json`) : undefined) });
      return this.host(environment, client, index ? 'ssh' : 'local');
    });
  }

  private host(environment: T3Environment, client: T3Transport, kind: T3Host['kind']): T3Host {
    const prefix = kind === 'local' ? '' : `${environment.environmentId}:`;
    const source = new T3Source({ client, db: this.db, stateDb: environment.stateDb, cacheKey: environment.environmentId, messagePrefix: prefix });
    source.on('change', () => this.emit('change'));
    return { config: environment, client, kind, source, prefix, providers: [], modelsAt: 0 };
  }

  /** A connector's machine joins the fleet; its last snapshot shows (unavailable) until it answers. */
  attach(environment: T3Environment, client: T3Transport): T3Host {
    const existing = this.hosts.find((h) => h.config.environmentId === environment.environmentId);
    if (existing) {
      if (existing.kind !== 'connector') throw new Error(`${environment.environmentId} is already a configured T3 host`);
      existing.client = client;
      existing.config = { ...existing.config, label: environment.label };
      existing.source.useClient(client);
      if (this.started) this.pollHost(existing, true);
      return existing;
    }
    const host = this.host(environment, client, 'connector');
    this.hosts.push(host);
    if (this.started) this.schedule(host);
    this.emit('change');
    return host;
  }

  byEnvironment(environmentId: string): T3Host | undefined {
    return this.hosts.find((h) => h.config.environmentId === environmentId);
  }

  get threads(): Map<string, T3Thread> {
    return new Map(this.hosts.flatMap((host) => [...host.source.threads.values()].map((t): [string, T3Thread] => {
      const id = `${host.prefix}${t.id}`;
      return [id, { ...t, id, projectId: `${host.prefix}${t.projectId}`, environmentId: host.config.environmentId, environmentLabel: host.config.label, available: host.source.status.ok }];
    })));
  }

  get projects(): Map<string, T3Project> {
    return new Map(this.hosts.flatMap((host) => [...host.source.projects.values()].map((p): [string, T3Project] => {
      const id = `${host.prefix}${p.id}`;
      return [id, { ...p, id, environmentId: host.config.environmentId, environmentLabel: host.config.label, available: host.source.status.ok }];
    })));
  }

  get environments(): EnvironmentStatus[] {
    return this.hosts.map((h) => ({ ...h.source.status, environmentId: h.config.environmentId, label: h.config.label }));
  }

  get status(): SourceStatus {
    const statuses = this.environments;
    const failed = statuses.filter((s) => !s.ok);
    return { ok: !failed.length, at: statuses.map((s) => s.at).filter((s): s is string => Boolean(s)).sort()[0] ?? null, error: failed.map((s) => `${s.label} offline`).join(', ') || null };
  }

  hostFor(id: string): T3Host {
    return this.hosts.find((h) => h.prefix && id.startsWith(h.prefix)) ?? this.hosts[0];
  }

  scopedId(host: T3Host, rawId: string): string { return `${host.prefix}${rawId}`; }

  rawId(id: string): string { return id.slice(this.hostFor(id).prefix.length); }

  catalogue(host: T3Host): ModelCatalogue { return liveModelCatalogue(host.providers, [...host.source.threads.values()]); }

  start() {
    this.started = true;
    for (const host of this.hosts) this.schedule(host);
  }

  private schedule(host: T3Host) {
    this.pollHost(host);
    this.timers.set(host, setInterval(() => this.pollHost(host), host.config.pollSeconds * 1000));
  }

  stop() { this.timers.forEach(clearInterval); for (const host of this.hosts) { host.source.stop(); host.client.close(); } }

  async poll(force = false) { await Promise.all(this.hosts.map((host) => this.pollHost(host, force))); }

  private async pollHost(host: T3Host, force = false) {
    const current = this.inFlight.get(host);
    if (current) {
      await current;
      if (!force) return;
    }
    const poll = this.readHost(host, force);
    this.inFlight.set(host, poll);
    try { await poll; } finally { if (this.inFlight.get(host) === poll) this.inFlight.delete(host); }
  }

  private async readHost(host: T3Host, force: boolean) {
    if (force || Date.now() - host.modelsAt >= 60_000) try {
      const config = await host.client.rpc<{ environment: { environmentId: string }; providers: LiveProvider[] }>('server.getConfig', {});
      if (config.environment.environmentId !== host.config.environmentId) throw new Error('T3 environment identity changed; update its connection');
      host.providers = config.providers;
      host.modelsAt = Date.now();
      this.emit('change');
    } catch (error) {
      host.source.status = { ...host.source.status, ok: false, error: (error as Error).message };
      this.emit('change');
      return;
    }
    await host.source.poll(force);
  }
}
