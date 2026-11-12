import type { PrRepositoryPreferences } from '../../../shared/src/api.ts';
import { now, type Db } from '../db.ts';

const DESKTOP_KEY = 'github.repositories.desktop';
const PREFERENCES_KEY = 'github.repositories.preferences';
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const MAX_REPOSITORIES = 200;

export type RepositoryPreferences = Required<PrRepositoryPreferences>;

export const DEFAULT_REPOSITORY_PREFERENCES: RepositoryPreferences = { includeInvolving: true, includeTeamRequests: true };

/** The list the linked desktop watches, and which desktop sent it when. */
export type DesktopRepositories = { repositories: string[]; desktopName: string; sessionId: string; updatedAt: string };

/** Valid owner/repo names, each once: GitHub ignores case, so the first spelling wins. */
export function cleanRepositories(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const seen = new Map<string, string>();
  for (const name of names) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (REPOSITORY.test(trimmed) && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()].slice(0, MAX_REPOSITORIES);
}

/** What the server searches: the desktop's repositories, then the ones in its own config. */
export function watchedRepositories(desktop: readonly string[], configured: readonly string[]): string[] {
  return cleanRepositories([...desktop, ...configured]);
}

/**
 * The searches for pull requests that involve you, in any repository. GitHub's `involves` is author, assignee,
 * mentions and commenter only: a review request (yours or your team's) never matches it, and neither does a review
 * without a comment. `user-review-requested` leaves out the requests made to your teams.
 */
export function involvementSearches(preferences: RepositoryPreferences): string[] {
  if (!preferences.includeInvolving) return [];
  return [
    'is:open is:pr involves:@me archived:false',
    `is:open is:pr ${preferences.includeTeamRequests ? 'review-requested' : 'user-review-requested'}:@me archived:false`,
    'is:open is:pr reviewed-by:@me archived:false',
  ];
}

export const repositorySearch = (name: string) => `is:open is:pr archived:false repo:${name}`;

/** The desktop's list and the search preferences, in the preferences table. Read once, then kept in memory. */
export class RepositorySettings {
  private readonly db: Db;
  private desktopList: DesktopRepositories | null;
  private stored: RepositoryPreferences;

  constructor(db: Db) {
    this.db = db;
    this.desktopList = this.read<DesktopRepositories>(DESKTOP_KEY);
    this.stored = { ...DEFAULT_REPOSITORY_PREFERENCES, ...this.read<Partial<RepositoryPreferences>>(PREFERENCES_KEY) };
  }

  desktop(): DesktopRepositories | null {
    return this.desktopList;
  }

  /** Stores what a desktop sent; true when the list itself changed. */
  setDesktop(repositories: string[], desktop: { sessionId: string; name: string }): boolean {
    const changed = JSON.stringify(this.desktopList?.repositories ?? []) !== JSON.stringify(repositories);
    this.desktopList = { repositories, desktopName: desktop.name, sessionId: desktop.sessionId, updatedAt: now() };
    this.write(DESKTOP_KEY, this.desktopList);
    return changed;
  }

  preferences(): RepositoryPreferences {
    return this.stored;
  }

  /** Keeps only booleans; anything else stays as it was. */
  setPreferences(input: PrRepositoryPreferences): RepositoryPreferences {
    this.stored = {
      includeInvolving: typeof input.includeInvolving === 'boolean' ? input.includeInvolving : this.stored.includeInvolving,
      includeTeamRequests: typeof input.includeTeamRequests === 'boolean' ? input.includeTeamRequests : this.stored.includeTeamRequests,
    };
    this.write(PREFERENCES_KEY, this.stored);
    return this.stored;
  }

  private read<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  private write(key: string, value: unknown) {
    this.db.prepare('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }
}
