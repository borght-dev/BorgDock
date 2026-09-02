/**
 * Team-membership matching shared by the priority scorer, the PR filters and
 * the grouping helpers. Team review requests arrive as slugs (`platform`) or
 * `org/slug`; the user's own list may be typed by hand in either form, with or
 * without a leading `@`. Everything is compared on the bare slug, lowercased.
 */

export function normalizeTeamSlug(team: string): string {
  const trimmed = team.trim().replace(/^@/, '').toLowerCase();
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/** True when any of `requestedTeams` is one of `myTeams`. */
export function isTeamRequested(
  requestedTeams: readonly string[] | undefined,
  myTeams: readonly string[],
): boolean {
  if (!requestedTeams || requestedTeams.length === 0 || myTeams.length === 0) return false;
  const mine = new Set(myTeams.map(normalizeTeamSlug));
  return requestedTeams.some((t) => mine.has(normalizeTeamSlug(t)));
}

/** The requested team slugs (normalized) that the user belongs to. */
export function matchedTeams(
  requestedTeams: readonly string[] | undefined,
  myTeams: readonly string[],
): string[] {
  if (!requestedTeams || myTeams.length === 0) return [];
  const mine = new Set(myTeams.map(normalizeTeamSlug));
  return requestedTeams.map(normalizeTeamSlug).filter((t) => mine.has(t));
}

/** Union of two team lists, de-duplicated on the normalized slug. */
export function mergeTeamLists(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...a, ...b]) {
    const key = normalizeTeamSlug(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t.trim());
  }
  return out;
}
