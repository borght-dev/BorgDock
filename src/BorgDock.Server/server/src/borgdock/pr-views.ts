import type { PrViewKey, PrViews, SavedPrView } from '../../../shared/src/borgdock.ts';
import type { Db } from '../db.ts';
import { UserError } from '../service.ts';

const KEY = 'borgdock.pr-views';
const VIEW_KEYS: readonly PrViewKey[] = ['all', 'needsYou', 'mine', 'failing', 'ready', 'stale'];
const MAX_VIEWS = 100;
const MAX_NAME = 80;
const MAX_QUERY = 2000;
const MAX_ID = 100;
const MAX_DISPLAY_BYTES = 8 * 1024;

/** Another device wrote first: the client merges with `current` and sends again over its revision. */
export class PrViewsConflict extends Error {
  readonly current: PrViews;
  constructor(current: PrViews) {
    super('Your saved views changed on another device. Merge and send them again.');
    this.current = current;
  }
}

/**
 * The saved pull request views the phone and the linked desktop share. One list, written whole and only over the
 * revision the writer last read (compare and set); the clients merge, the server never does.
 */
export class PrViewsStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  get(): PrViews {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(KEY) as { value: string } | undefined;
    if (!row) return { revision: 0, views: [], updatedAt: null };
    return JSON.parse(row.value) as PrViews;
  }

  put(baseRevision: unknown, views: unknown, at = new Date()): PrViews {
    if (!Number.isInteger(baseRevision)) throw new UserError('Send `baseRevision`: the revision you last read.');
    const valid = validViews(views);
    const current = this.get();
    if (baseRevision !== current.revision) throw new PrViewsConflict(current);
    const next: PrViews = { revision: current.revision + 1, views: valid, updatedAt: at.toISOString() };
    this.db.prepare('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(next));
    return next;
  }
}

/** The list as sent, or a 400 naming what is wrong. Display is kept as sent: each client keeps the fields it doesn't use. */
function validViews(value: unknown): SavedPrView[] {
  if (!Array.isArray(value)) throw new UserError('Send `views` as a list.');
  if (value.length > MAX_VIEWS) throw new UserError(`At most ${MAX_VIEWS} saved views.`);
  const ids = new Set<string>();
  return value.map((raw, index): SavedPrView => {
    const view = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const where = `View ${index + 1}`;
    if (typeof view.id !== 'string' || view.id === '' || view.id.length > MAX_ID) throw new UserError(`${where} needs an id.`);
    if (ids.has(view.id)) throw new UserError(`${where} has the same id as another view.`);
    ids.add(view.id);
    if (typeof view.name !== 'string' || view.name.trim() === '' || view.name.length > MAX_NAME) throw new UserError(`${where} needs a name of at most ${MAX_NAME} characters.`);
    if (!VIEW_KEYS.includes(view.filter as PrViewKey)) throw new UserError(`${where} has an unknown tab.`);
    if (typeof view.query !== 'string' || view.query.length > MAX_QUERY) throw new UserError(`${where} needs a query of at most ${MAX_QUERY} characters.`);
    const display = view.display;
    if (!display || typeof display !== 'object' || Array.isArray(display)) throw new UserError(`${where} needs a display.`);
    if (Buffer.byteLength(JSON.stringify(display)) > MAX_DISPLAY_BYTES) throw new UserError(`${where} has a display of more than 8 KB.`);
    return { id: view.id, name: view.name, filter: view.filter as PrViewKey, query: view.query, display: display as Record<string, unknown> };
  });
}
