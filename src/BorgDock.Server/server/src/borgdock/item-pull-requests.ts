import type { CheckSummary, ItemPullRequest, PullRequestState } from '../../../shared/src/api.ts';
import type { PullRequestLink } from '../ado/client.ts';

// Which pull requests belong to a work item, the desktop's rules (CLAUDE.md, Dispatch): a PR belongs to an item that
// ADO links it to or that it mentions (AB# in its title or body, the id in its branch). The one whose title or branch
// names the item is the item's own. One linked on several of my items that names none of them is shared (an epic's
// plan PR on every PBI). ADO links carry ADO's repository id, never GitHub's, and numbers collide across repositories,
// so a link counts only where the repository behind that id is known.

/** A pull request seen somewhere: GitHub's open list, a T3 thread, or a lookup on GitHub. */
export type CandidatePullRequest = {
  /** owner/repo */
  repository: string | null;
  number: number;
  url: string;
  title: string;
  branch: string | null;
  state: PullRequestState;
  isDraft: boolean;
  checks: string | null;
  author: string | null;
  updatedAt: string | null;
  /** Work items it mentions: AB# in its title or body, an id in its branch. */
  mentions: number[];
  /** A T3 thread on the item has it; the overview links those by number alone, as here. */
  onItemThread: boolean;
};

export const namesItem = (text: string, id: number) => new RegExp(`(\\b|AB#?)${id}\\b`).test(text);

export function repositoryOfUrl(url: string): string | null {
  return /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/\d+/i.exec(url)?.[1] ?? null;
}

export function checksLabel(checks: CheckSummary): string | null {
  if (!checks.total) return null;
  return checks.failed ? 'failing' : checks.pending ? 'pending' : 'passing';
}

const keyOf = (pr: { repository: string | null; number: number; url: string }) => (pr.repository ? `${pr.repository.toLowerCase()}#${pr.number}` : pr.url.toLowerCase());
const titleAndBranch = (pr: CandidatePullRequest) => `${pr.title} ${pr.branch ?? ''}`;

/**
 * One candidate per pull request. Earlier sources win the fields (pass GitHub's first); a known state beats
 * `unknown`, and what each source knows about mentions and threads adds up.
 */
export function mergeCandidates(candidates: readonly CandidatePullRequest[]): CandidatePullRequest[] {
  const merged = new Map<string, CandidatePullRequest>();
  for (const candidate of candidates) {
    const key = keyOf(candidate);
    const known = merged.get(key);
    if (!known) {
      merged.set(key, { ...candidate, mentions: [...candidate.mentions] });
      continue;
    }
    merged.set(key, {
      ...known,
      title: known.title || candidate.title,
      branch: known.branch ?? candidate.branch,
      state: known.state === 'unknown' ? candidate.state : known.state,
      checks: known.checks ?? candidate.checks,
      author: known.author ?? candidate.author,
      updatedAt: known.updatedAt ?? candidate.updatedAt,
      mentions: [...new Set([...known.mentions, ...candidate.mentions])],
      onItemThread: known.onItemThread || candidate.onItemThread,
    });
  }
  return [...merged.values()];
}

/**
 * ADO repository ids learned from this item: a link whose number matches exactly one repository's pull request that
 * names or mentions the item. Only ids not known yet; lower-cased.
 */
export function learnRepositories(itemId: number, links: readonly PullRequestLink[], candidates: readonly CandidatePullRequest[], known: ReadonlyMap<string, string>): Map<string, string> {
  const learned = new Map<string, string>();
  for (const link of links) {
    const id = link.repositoryId.toLowerCase();
    if (known.has(id) || learned.has(id)) continue;
    const repositories = new Set(candidates
      .filter((c) => c.number === link.number && c.repository && (c.mentions.includes(itemId) || namesItem(titleAndBranch(c), itemId)))
      .map((c) => c.repository!.toLowerCase()));
    if (repositories.size === 1) learned.set(id, candidates.find((c) => c.repository?.toLowerCase() === [...repositories][0])!.repository!);
  }
  return learned;
}

type Linking = { repositories: ReadonlyMap<string, string> };

function adoLinks(links: readonly PullRequestLink[], pr: CandidatePullRequest, numberAlone: boolean, { repositories }: Linking): boolean {
  return links.some((link) => {
    if (link.number !== pr.number) return false;
    const repository = repositories.get(link.repositoryId.toLowerCase());
    return repository ? repository.toLowerCase() === pr.repository?.toLowerCase() : numberAlone;
  });
}

function belongsTo(itemId: number, links: readonly PullRequestLink[], pr: CandidatePullRequest, numberAlone: boolean, linking: Linking): boolean {
  return pr.mentions.includes(itemId) || namesItem(titleAndBranch(pr), itemId) || adoLinks(links, pr, numberAlone, linking);
}

const STATE_RANK: Record<PullRequestState, number> = { open: 0, merged: 1, unknown: 2, closed: 3 };

/** Every pull request linked to the item: its own first, then the others, shared ones last; open before merged. */
export function itemPullRequests(input: {
  itemId: number;
  links: readonly PullRequestLink[];
  /** My other items and their ADO links, to tell a shared pull request. */
  myItems: readonly { id: number; links: readonly PullRequestLink[] }[];
  candidates: readonly CandidatePullRequest[];
  repositories: ReadonlyMap<string, string>;
}): ItemPullRequest[] {
  const linking = { repositories: input.repositories };
  const others = input.myItems.filter((i) => i.id !== input.itemId);
  const rows = mergeCandidates(input.candidates)
    .filter((pr) => belongsTo(input.itemId, input.links, pr, pr.onItemThread, linking))
    .map((pr): ItemPullRequest & { rank: number } => {
      const own = namesItem(titleAndBranch(pr), input.itemId);
      const linkedMine = [input.itemId, ...others.filter((i) => belongsTo(i.id, i.links, pr, false, linking)).map((i) => i.id)];
      const shared = !own && linkedMine.length > 1 && !linkedMine.some((id) => namesItem(titleAndBranch(pr), id));
      return {
        number: pr.number, url: pr.url, branch: pr.branch, state: pr.state, title: pr.title, isDraft: pr.isDraft, checks: pr.checks,
        repository: pr.repository, own, shared, author: pr.author, updatedAt: pr.updatedAt, rank: own ? 0 : shared ? 2 : 1,
      };
    });
  return rows
    .sort((a, b) => a.rank - b.rank || STATE_RANK[a.state] - STATE_RANK[b.state] || b.number - a.number)
    .map(({ rank: _rank, ...row }) => row);
}
