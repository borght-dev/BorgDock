import type { AdoClient, AdoItem } from '../ado/client.ts';
import { type Db } from '../db.ts';
import { migratePlatform } from './schema.ts';
import { newestNote, toItemComment, type ItemComment, type ItemNote } from './verdict.ts';

export type ItemExtras = { notes: ItemNote | null; lastComment: ItemComment | null };

/**
 * Developer Notes and the newest comment per item for the states walk. A comment costs one request per item, so
 * an item is read again only when its ChangedDate moved (a new comment moves it).
 */
export class ItemFacts {
  private readonly db: Db;
  private readonly ado: Pick<AdoClient, 'discussion' | 'me'>;
  private cache = new Map<number, { changedAt: string; facts: ItemExtras }>();
  private running: Promise<boolean> | null = null;

  constructor(db: Db, ado: Pick<AdoClient, 'discussion' | 'me'>) {
    this.db = db;
    this.ado = ado;
    migratePlatform(db);
    for (const row of db.prepare('SELECT item_id, changed_at, facts FROM bd_item_facts').all() as { item_id: number; changed_at: string; facts: string }[]) {
      this.cache.set(row.item_id, { changedAt: row.changed_at, facts: JSON.parse(row.facts) });
    }
  }

  get facts(): Map<number, ItemExtras> {
    return new Map([...this.cache].map(([id, entry]) => [id, entry.facts]));
  }

  /** Reads the items whose ChangedDate moved; true when anything changed. One refresh at a time. */
  refresh(items: readonly AdoItem[]): Promise<boolean> {
    this.running ??= this.read(items).finally(() => { this.running = null; });
    return this.running;
  }

  private async read(items: readonly AdoItem[]): Promise<boolean> {
    const stale = items.filter((i) => this.cache.get(i.id)?.changedAt !== i.changedAt);
    if (!stale.length) return false;
    const me = (await this.ado.me().catch(() => null))?.name ?? null;
    const save = this.db.prepare('INSERT OR REPLACE INTO bd_item_facts (item_id, changed_at, facts) VALUES (?, ?, ?)');
    let changed = false;
    for (let i = 0; i < stale.length; i += 4) {
      await Promise.all(stale.slice(i, i + 4).map(async (item) => {
        try {
          const { developerNotes, comments } = await this.ado.discussion(item.id);
          const facts: ItemExtras = { notes: newestNote(developerNotes), lastComment: comments[0] ? toItemComment(comments[0], me) : null };
          this.cache.set(item.id, { changedAt: item.changedAt, facts });
          save.run(item.id, item.changedAt, JSON.stringify(facts));
          changed = true;
        } catch {
          // The next ADO poll tries again.
        }
      }));
    }
    return changed;
  }
}
