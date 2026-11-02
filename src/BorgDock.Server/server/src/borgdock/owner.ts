import type { Owner } from '../../../shared/src/api.ts';
import { now, type Db } from '../db.ts';
import { migratePlatform } from './schema.ts';

type Row = { clerk_user_id: string; name: string; email: string | null; image_url: string | null };

/** The one person this server belongs to: whoever claimed it first with a pairing code from this machine. */
export class Owners {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    migratePlatform(db);
  }

  get(): Owner | null {
    const row = this.db.prepare('SELECT clerk_user_id, name, email, image_url FROM bd_owner WHERE id = 1').get() as Row | undefined;
    return row ? { clerkUserId: row.clerk_user_id, name: row.name, email: row.email, imageUrl: row.image_url } : null;
  }

  /** False when someone claimed it first; the row's CHECK keeps it to one owner. */
  claim(owner: Owner): boolean {
    return this.db.prepare('INSERT OR IGNORE INTO bd_owner (id, clerk_user_id, name, email, image_url, claimed_at) VALUES (1, ?, ?, ?, ?, ?)')
      .run(owner.clerkUserId, owner.name, owner.email, owner.imageUrl, now()).changes > 0;
  }

  /** Keeps the name and picture current; never changes who the owner is. */
  refresh(owner: Owner) {
    this.db.prepare('UPDATE bd_owner SET name = ?, email = ?, image_url = ? WHERE id = 1 AND clerk_user_id = ?')
      .run(owner.name, owner.email, owner.imageUrl, owner.clerkUserId);
  }
}
