import { prRowKey } from '@/components/pr/pr-card-data';
import { isMyPr } from '@/services/pr-grouping';
import type { PullRequest, PullRequestWithChecks } from '@/types';

/**
 * Dependency updates: pull requests a dependency bot opened, read from their
 * title and body, and what may approve them without Quick Review. Pure.
 * Rules and frames: design/dependency-approve/mockups.html.
 */

export type DependencyBot = 'dependabot' | 'renovate';

/** How far an update jumps. `unknown` when a version could not be read. */
export type Bump = 'patch' | 'minor' | 'major' | 'unknown';

export interface PackageUpdate {
  name: string;
  /** Absent when only the target is known (a Renovate title without its table). */
  from?: string;
  to?: string;
}

export interface DependencyUpdate {
  bot: DependencyBot;
  /** One package's name, "3 updates in minor-and-patch", or the title. */
  label: string;
  packages: PackageUpdate[];
  /** Dependabot's group name, when the PR updates a group. */
  group?: string;
  bump: Bump;
}

const BOTS: readonly DependencyBot[] = ['dependabot', 'renovate'];

/** GraphQL says `dependabot`, REST `dependabot[bot]`, `gh` `app/dependabot`. */
export function dependencyBotOf(login: string): DependencyBot | null {
  const name = login
    .toLowerCase()
    .replace(/^app\//, '')
    .replace(/\[bot\]$/, '');
  return BOTS.find((bot) => bot === name) ?? null;
}

/** "4.17.21" → [4, 17, 21]; "v19" → [19]; "^1.2" → [1, 2]; a SHA or a date-less tag → null. */
function versionParts(version: string): number[] | null {
  const match = version.trim().match(/^[\^~=<>v\s]*(\d+(?:\.\d+)*)/i);
  if (!match?.[1]) return null;
  return match[1].split('.').map(Number);
}

/**
 * Major, minor or patch by the first part that differs. 0.x minors count as
 * minor: the repository's checks catch a breaking one.
 */
export function bumpOf(from: string | undefined, to: string | undefined): Bump {
  if (!from || !to) return 'unknown';
  const a = versionParts(from);
  const b = versionParts(to);
  if (!a || !b) return 'unknown';
  if ((a[0] ?? 0) !== (b[0] ?? 0)) return 'major';
  if ((a[1] ?? 0) !== (b[1] ?? 0)) return 'minor';
  return 'patch';
}

const BUMP_RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2, unknown: 3 };

function largest(bumps: readonly Bump[]): Bump {
  if (bumps.length === 0) return 'unknown';
  return bumps.reduce((a, b) => (BUMP_RANK[b] > BUMP_RANK[a] ? b : a));
}

/** "build(deps-dev): " and "chore(deps)!: " before the subject. */
const CONVENTIONAL_PREFIX = /^[\w-]+(?:\([^)]*\))?!?:\s*/;

/** Dependabot: "Bump lodash from 4.17.20 to 4.17.21 in /web". */
const DEPENDABOT_SINGLE = /^bump\s+(\S+)\s+from\s+(\S+)\s+to\s+(\S+?)(?:\s|$)/i;
/** Dependabot: "Bump the minor-and-patch group across 2 directories with 3 updates". */
const DEPENDABOT_GROUP = /^bump the (\S+) group\b/i;
/** Dependabot's body, one line per package of a group or a multi-package PR. */
const DEPENDABOT_BODY_LINE = /^\s*Updates? `([^`]+)` from (\S+?) to (\S+?)\.?\s*$/gim;

/** Renovate: "Update dependency serde to v1.0.219", "Update react monorepo to v19 (major)". */
const RENOVATE_TITLE =
  /^update\s+(?:(?:dependency|module|rust crate|crate|docker tag|package)\s+)?(\S+)(?:\s+(?:monorepo|action|digest|packages))?\s+to\s+(\S+)/i;
/** A Renovate table row: "| [lodash](…) | dependencies | patch | `4.17.20` -> `4.17.21` |". */
const RENOVATE_ROW =
  /^\|[ \t]*([^|\n]+?)[ \t]*\|[^\n]*?`([^`\n]+)`[ \t]*(?:->|→)[ \t]*`([^`\n]+)`/gm;

/** A Renovate table cell: "[lodash](https://…) ([source](…))" → "lodash". */
function cellName(cell: string): string {
  const linked = cell.match(/^\[([^\]]+)\]/);
  return (linked?.[1] ?? cell).replace(/`/g, '').trim();
}

function dependabotPackages(title: string, body: string): PackageUpdate[] {
  const listed = [...body.matchAll(DEPENDABOT_BODY_LINE)].map(([, name, from, to]) => ({
    name: name as string,
    from,
    to,
  }));
  if (listed.length > 0) return dedupe(listed);
  const single = title.match(DEPENDABOT_SINGLE);
  return single ? [{ name: single[1] as string, from: single[2], to: single[3] }] : [];
}

function renovatePackages(title: string, body: string): PackageUpdate[] {
  const rows = [...body.matchAll(RENOVATE_ROW)]
    .map(([, cell, from, to]) => ({ name: cellName(cell as string), from, to }))
    .filter((row) => row.name && !/^-+$/.test(row.name) && row.name.toLowerCase() !== 'package');
  if (rows.length > 0) return dedupe(rows);
  const single = title.match(RENOVATE_TITLE);
  return single ? [{ name: single[1] as string, to: single[2] }] : [];
}

/** One entry per package: a body that names a package twice lists it once. */
function dedupe(packages: PackageUpdate[]): PackageUpdate[] {
  const seen = new Set<string>();
  return packages.filter((p) => !seen.has(p.name) && seen.add(p.name));
}

/** The update a dependency bot's PR makes, or null for anyone else's PR. */
export function dependencyUpdateOf(pr: PullRequest): DependencyUpdate | null {
  const bot = dependencyBotOf(pr.authorLogin);
  if (!bot) return null;
  const subject = pr.title.replace(CONVENTIONAL_PREFIX, '').trim();
  const body = pr.body ?? '';
  const packages =
    bot === 'dependabot' ? dependabotPackages(subject, body) : renovatePackages(subject, body);
  const group = bot === 'dependabot' ? subject.match(DEPENDABOT_GROUP)?.[1] : undefined;
  const bump = largest(packages.map((p) => bumpOf(p.from, p.to)));
  const label =
    packages.length === 1 && !group
      ? (packages[0] as PackageUpdate).name
      : group
        ? `${packages.length || 'Several'} updates in ${group}`
        : packages.length > 1
          ? `${packages.length} updates`
          : subject;
  return { bot, label, packages, ...(group ? { group } : {}), bump };
}

/** Why a dependency PR can't be approved from its row or the sheet. */
export type ApproveBlock = 'closed' | 'mine' | 'draft' | 'conflicts' | 'approved';

export const APPROVE_BLOCK_TEXT: Record<ApproveBlock, string> = {
  closed: 'No longer open',
  mine: 'Your own pull request',
  draft: 'Still a draft',
  conflicts: 'Has conflicts: the bot rebases it',
  approved: 'You approved it already',
};

/** My approval of the PR's current head, when the read carried reviews. */
function approvedByMe(pr: PullRequest, username: string): boolean {
  const me = username.toLowerCase();
  return !!pr.latestReviews?.some(
    (review) =>
      review.authorLogin.toLowerCase() === me &&
      review.state === 'approved' &&
      (!review.commitSha || !pr.headSha || review.commitSha === pr.headSha),
  );
}

export function approveBlockOf(prw: PullRequestWithChecks, username: string): ApproveBlock | null {
  const pr = prw.pullRequest;
  if (pr.state !== 'open' || pr.mergedAt) return 'closed';
  if (isMyPr(prw, username)) return 'mine';
  if (pr.isDraft) return 'draft';
  if (pr.mergeable === false) return 'conflicts';
  if (username && approvedByMe(pr, username)) return 'approved';
  return null;
}

/** Why Safe leaves an approvable update unpicked. */
export type Caution = 'major' | 'unknown' | 'failing';

export const CAUTION_TEXT: Record<Caution, string> = {
  failing: 'Checks failing',
  major: 'Major update: read its release notes first',
  unknown: "Couldn't read the versions: check the PR",
};

export function cautionOf(prw: PullRequestWithChecks, update: DependencyUpdate): Caution | null {
  if (prw.overallStatus === 'red') return 'failing';
  if (update.bump === 'major') return 'major';
  if (update.bump === 'unknown') return 'unknown';
  return null;
}

export interface DependencyCandidate {
  key: string;
  pr: PullRequestWithChecks;
  update: DependencyUpdate;
  /** Set: listed, but can't be picked. */
  block: ApproveBlock | null;
  /** Set: can be picked, but Safe leaves it out. */
  caution: Caution | null;
}

/**
 * The open dependency PRs worth listing, by repository then number. PRs that
 * are closed, mine or approved by me already are left out: nothing to do.
 */
export function dependencyCandidates(
  prs: readonly PullRequestWithChecks[],
  username: string,
): DependencyCandidate[] {
  const out: DependencyCandidate[] = [];
  for (const pr of prs) {
    const update = dependencyUpdateOf(pr.pullRequest);
    if (!update) continue;
    const block = approveBlockOf(pr, username);
    if (block === 'closed' || block === 'mine' || block === 'approved') continue;
    out.push({
      key: prRowKey(pr.pullRequest),
      pr,
      update,
      block,
      caution: block ? null : cautionOf(pr, update),
    });
  }
  return out.sort((a, b) => {
    const repoA = `${a.pr.pullRequest.repoOwner}/${a.pr.pullRequest.repoName}`.toLowerCase();
    const repoB = `${b.pr.pullRequest.repoOwner}/${b.pr.pullRequest.repoName}`.toLowerCase();
    return repoA.localeCompare(repoB) || a.pr.pullRequest.number - b.pr.pullRequest.number;
  });
}

export const isPickable = (c: DependencyCandidate) => c.block === null;
export const isSafe = (c: DependencyCandidate) => c.block === null && c.caution === null;

/** The strip's line: "5 ready to approve · 1 major · 1 with conflicts". */
export function candidateSummary(candidates: readonly DependencyCandidate[]): string {
  const count = (test: (c: DependencyCandidate) => boolean) => candidates.filter(test).length;
  const parts: string[] = [];
  const safe = count(isSafe);
  if (safe > 0) parts.push(`${safe} ready to approve`);
  const failing = count((c) => c.caution === 'failing');
  if (failing > 0) parts.push(`${failing} failing`);
  const major = count((c) => c.caution === 'major');
  if (major > 0) parts.push(`${major} major`);
  const unknown = count((c) => c.caution === 'unknown');
  if (unknown > 0) parts.push(`${unknown} to check`);
  const conflicts = count((c) => c.block === 'conflicts');
  if (conflicts > 0) parts.push(`${conflicts} with conflicts`);
  const drafts = count((c) => c.block === 'draft');
  if (drafts > 0) parts.push(`${drafts} ${drafts === 1 ? 'draft' : 'drafts'}`);
  return parts.join(' · ');
}
