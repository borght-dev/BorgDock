import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { Config } from '../config.ts';
import type { Db, Via } from '../db.ts';
import type { GithubService } from '../github/service.ts';
import type { Notifier } from '../push/notifier.ts';
import type { DispatchService } from '../service.ts';
import { UserError } from '../service.ts';
import type { Session } from '../auth/sessions.ts';

/** Per-request values every route can read. */
export type Env = {
  Variables: { session: Session | null; authKind: 'bearer' | 'cookie' | null; via: Via; ip: string | null };
};

export type Api = Hono<Env>;

/** What route modules get. Each BorgDock module registers its own routes, so modules don't edit app.ts. */
export type RouteDeps = {
  config: Config;
  db: Db;
  service: DispatchService;
  notifier: Notifier;
  github: GithubService;
  /** Writes an audit row for the calling session. */
  record: (c: Context<Env>, action: string, detail?: unknown) => void;
  /** Rejects writes that don't carry a valid device signature (see shared/src/borgdock.ts, "Signed commands"). */
  requireSignature: MiddlewareHandler<Env>;
};

/** Parses the JSON body or answers 400. */
export async function readBody<T>(c: Context<Env>): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new UserError('Send a JSON body.');
  }
}
