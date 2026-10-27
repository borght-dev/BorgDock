import {
  type ComparedCommit,
  compareCommits,
  getWorkflowRun,
  lastPassingPushRun,
  pullOfCommit,
  type WorkflowRun,
} from '@/services/github/actions';
import type { GitHubClient } from '@/services/github/client';
import { postComment, revertPullRequest } from '@/services/github/mutations';
import { getClientForRepo } from '@/services/github/singleton';
import { parseScope } from './identity';
import * as store from './store-api';
import type { CiGroupSummary, CiOccurrence } from './types';

/**
 * What the default branch says about a group: the first run it failed in,
 * the last run of the same workflow that passed before it, the pull requests
 * merged in between, and whether a later run passed again. Read from GitHub
 * on demand; never stored. Whether it passes again comes from the sync's
 * branch watch, without a request.
 */

export interface RunRef {
  runId: number;
  runNumber: number | null;
  sha: string;
  url: string | null;
}

/** A pull request merged between the last pass and the first failure. */
export interface SuspectPr {
  number: number;
  title: string;
  authorLogin: string | null;
  url: string;
}

export interface BranchStory {
  branch: string;
  firstRed: RunRef;
  /** Null when GitHub has no earlier passing run of the workflow. */
  lastGreen: RunRef | null;
  /** Commits between the last pass and the first failure, oldest first; GitHub's first page. */
  commits: ComparedCommit[];
  /** How many commits lie between them in all; more than `commits` holds when the list is cut short. */
  commitCount: number;
  /** The pull requests those commits came from, oldest first. */
  suspects: SuspectPr[];
  /** Commits between them whose pull request is unknown: direct pushes, or past the lookup limit. */
  unresolved: ComparedCommit[];
  /** The group's newest default-branch failure, for `recovered`. */
  newestRed: { runId: number; workflow: string };
  /** A run of the same workflow that passed after the group's newest failure there. */
  recovered: RunRef | null;
}

/** Commits looked up one by one when no merge names their pull request. */
const LOOKUP_LIMIT = 3;
const STORY_TTL_MS = 10 * 60 * 1000;
const SQUASH_TITLE = /\(#(\d+)\)\s*$/;
const MERGE_TITLE = /^Merge pull request #(\d+) from /;

function refOf(run: WorkflowRun): RunRef {
  return { runId: run.id, runNumber: run.runNumber, sha: run.headSha, url: run.htmlUrl };
}

/** `#12` for a squash merge's "Title (#12)" or a merge commit's "Merge pull request #12 from …". */
export function prNumberOf(title: string): number | null {
  const match = SQUASH_TITLE.exec(title) ?? MERGE_TITLE.exec(title);
  return match ? Number(match[1]) : null;
}

/** `from` and its ancestors among `bySha`, skipping `stop`. */
function ancestors(
  from: readonly string[],
  bySha: ReadonlyMap<string, ComparedCommit>,
  stop: ReadonlySet<string> = new Set(),
): Set<string> {
  const found = new Set<string>();
  const stack = [...from];
  while (stack.length > 0) {
    const commit = bySha.get(stack.pop() as string);
    if (!commit || found.has(commit.sha) || stop.has(commit.sha)) continue;
    found.add(commit.sha);
    stack.push(...commit.parents);
  }
  return found;
}

/**
 * Commits a pull request's merge commit brought in: its second parent's
 * ancestors in `commits` that its first parent (the base) did not have yet.
 * A commit pushed to the base before the merge stays its own change.
 */
function mergedIn(commits: readonly ComparedCommit[]): Set<string> {
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  const covered = new Set<string>();
  for (const merge of commits) {
    if (!MERGE_TITLE.test(merge.title)) continue;
    const onBase = ancestors(merge.parents.slice(0, 1), bySha);
    for (const sha of ancestors(merge.parents.slice(1), bySha, onBase)) {
      if (!MERGE_TITLE.test(bySha.get(sha)?.title ?? '')) covered.add(sha);
    }
  }
  return covered;
}

/** A merge commit's PR title: the first line of its message after "Merge pull request". */
function mergeTitleOf(commit: ComparedCommit): string {
  return (
    commit.message
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .find(Boolean) ?? commit.title
  );
}

/**
 * The pull requests behind `commits`, oldest first. Squash and merge commits
 * name theirs, and a merge covers the commits it brought in; up to three
 * other commits are looked up. A commit whose PR stays unknown is returned
 * as unresolved, so one named PR is never taken for the only suspect.
 */
export async function suspectsOf(
  client: GitHubClient,
  owner: string,
  repo: string,
  commits: readonly ComparedCommit[],
): Promise<{ suspects: SuspectPr[]; unresolved: ComparedCommit[] }> {
  const url = (n: number) => `https://github.com/${owner}/${repo}/pull/${n}`;
  const covered = mergedIn(commits);
  const found: (SuspectPr & { checked: boolean })[] = [];
  const rest: ComparedCommit[] = [];
  for (const commit of commits) {
    const squash = SQUASH_TITLE.exec(commit.title);
    const merge = MERGE_TITLE.exec(commit.title);
    if (squash) {
      const number = Number(squash[1]);
      const title = commit.title.replace(SQUASH_TITLE, '').trim();
      found.push({
        number,
        title,
        authorLogin: commit.authorLogin,
        url: url(number),
        checked: false,
      });
    } else if (merge) {
      const number = Number(merge[1]);
      // A merge commit is authored by whoever merged, not by the PR's author.
      found.push({
        number,
        title: mergeTitleOf(commit),
        authorLogin: null,
        url: url(number),
        checked: false,
      });
    } else if (!covered.has(commit.sha)) {
      rest.push(commit);
    }
  }
  const lookups = await Promise.all(
    rest
      .slice(0, LOOKUP_LIMIT)
      .map((c) => pullOfCommit(client, owner, repo, c.sha).catch(() => null)),
  );
  const unresolved = rest.slice(LOOKUP_LIMIT);
  lookups.forEach((pull, i) => {
    if (pull) found.push({ ...pull, url: url(pull.number), checked: true });
    else unresolved.unshift(rest[i] as ComparedCommit);
  });
  const seen = new Set<number>();
  const suspects = found.filter((pr) => !seen.has(pr.number) && seen.add(pr.number));
  const [only] = suspects;
  if (only && suspects.length === 1 && unresolved.length === 0 && !only.checked) {
    // The one suspect gets asked and maybe reverted: name its real author.
    const pull = await client
      .get<{ title: string; user?: { login?: string | null } | null }>(
        `repos/${owner}/${repo}/pulls/${only.number}`,
      )
      .catch(() => null);
    if (pull) {
      only.title = pull.title;
      only.authorLogin = pull.user?.login ?? only.authorLogin;
    }
  }
  return {
    suspects: suspects.map(({ checked: _checked, ...pr }) => pr),
    unresolved: [...unresolved].sort((a, b) => commits.indexOf(a) - commits.indexOf(b)),
  };
}

/** The one PR the failure started with, when nothing else changed between the runs. */
export function soleSuspectOf(story: BranchStory): SuspectPr | null {
  return story.suspects.length === 1 &&
    story.unresolved.length === 0 &&
    story.commits.length >= story.commitCount
    ? (story.suspects[0] ?? null)
    : null;
}

/**
 * A passing push run of the workflow the group last failed in on the default
 * branch, newer than that failure. Read from the sync's branch watch, so it
 * costs no request and can be checked as often as the UI likes.
 */
export async function recoveredRunOf(
  scope: string,
  newestRed: BranchStory['newestRed'],
): Promise<RunRef | null> {
  const rows = await store.branchWatch(scope);
  if (!Array.isArray(rows)) throw new Error('The branch watch did not answer.');
  const passed = rows.find((row) => row.workflowPath === newestRed.workflow)?.lastPassedRun;
  return passed != null && passed > newestRed.runId
    ? { runId: passed, runNumber: null, sha: '', url: null }
    : null;
}

async function readStory(
  client: GitHubClient,
  owner: string,
  repo: string,
  group: CiGroupSummary,
): Promise<BranchStory | null> {
  const detail = await store.loadGroup(group.id);
  const onBranch = detail.occurrences
    .map((o) => o.occurrence)
    .filter(
      (o): o is CiOccurrence & { runId: number } =>
        o.source === 'default_branch' && o.runId !== null,
    )
    .sort((a, b) => a.runId - b.runId);
  const first = onBranch[0];
  const newest = onBranch[onBranch.length - 1];
  if (!first || !newest) return null;
  // The branch watch keys a workflow the same way: its path, else its name.
  const newestRed = {
    runId: newest.runId,
    workflow: newest.workflowPath ?? newest.workflowName ?? 'workflow',
  };
  const recovered = await recoveredRunOf(group.scope, newestRed).catch(() => null);
  const red = await getWorkflowRun(client, owner, repo, first.runId);
  const branch = red.headBranch ?? first.headBranch ?? '';
  const workflowId = red.workflowId ?? first.workflowId;
  const base = { branch, firstRed: refOf(red), newestRed, recovered };
  if (!branch || workflowId === null) {
    return { ...base, lastGreen: null, commits: [], commitCount: 0, suspects: [], unresolved: [] };
  }
  const green = await lastPassingPushRun(
    client,
    owner,
    repo,
    workflowId,
    branch,
    red.createdAt ?? undefined,
  );
  const { commits, total } = green
    ? await compareCommits(client, owner, repo, green.headSha, red.headSha)
    : { commits: [], total: 0 };
  const { suspects, unresolved } = await suspectsOf(client, owner, repo, commits);
  return {
    ...base,
    lastGreen: green ? refOf(green) : null,
    commits,
    commitCount: total,
    suspects,
    unresolved,
  };
}

const stories = new Map<string, { key: string; at: number; story: Promise<BranchStory | null> }>();

/**
 * The default branch's story of a group, or null when the group never failed
 * there. Cached per group until the group changes or ten minutes pass, so
 * the strip and the Checks tab share one read.
 */
export function branchStoryOf(group: CiGroupSummary): Promise<BranchStory | null> {
  if (group.defaultBranchRuns.length === 0) return Promise.resolve(null);
  const key = `${group.lastObservedAt}|${group.defaultBranchRuns.join(',')}`;
  const cached = stories.get(group.id);
  if (cached && cached.key === key && Date.now() - cached.at < STORY_TTL_MS) return cached.story;
  const parts = parseScope(group.scope);
  const client = parts ? getClientForRepo(parts.owner, parts.repo) : null;
  if (!parts || !client) return Promise.resolve(null);
  const story = readStory(client, parts.owner, parts.repo, group);
  stories.set(group.id, { key, at: Date.now(), story });
  story.catch(() => stories.delete(group.id));
  return story;
}

export function __resetBranchStoriesForTests(): void {
  stories.clear();
}

/** Stories and tests: answer `branchStoryOf(group)` with `story` without reading GitHub. */
export function __seedBranchStory(group: CiGroupSummary, story: BranchStory | null): void {
  const key = `${group.lastObservedAt}|${group.defaultBranchRuns.join(',')}`;
  stories.set(group.id, { key, at: Date.now(), story: Promise.resolve(story) });
}

function runLabel(run: RunRef): string {
  return `run #${run.runNumber ?? run.runId}`;
}

/**
 * One sentence on where the failure came from: "Broke after #123 by alice:
 * Bump checkout", "Broke in one of 3 PRs merged between run #40 and #41".
 */
export function storyLine(story: BranchStory): string {
  const { branch, firstRed, lastGreen, commits, commitCount, suspects, unresolved } = story;
  if (!lastGreen) {
    return `First failed on ${branch} in ${runLabel(firstRed)}; no earlier passing run to compare with.`;
  }
  const between = `between ${runLabel(lastGreen)} (passed) and ${runLabel(firstRed)}`;
  const sole = soleSuspectOf(story);
  if (sole) {
    return `Broke after #${sole.number}${sole.authorLogin ? ` by ${sole.authorLogin}` : ''}: ${sole.title}`;
  }
  if (commits.length < commitCount) {
    // GitHub listed only the first page: what follows may hold the cause.
    return `Broke in one of ${commitCount} commits pushed ${between}`;
  }
  const [push] = unresolved;
  if (suspects.length === 0 && unresolved.length === 1 && push) {
    return `Broke after commit ${push.sha.slice(0, 7)}${push.authorLogin ? ` by ${push.authorLogin}` : ''}: ${push.title}`;
  }
  if (commits.length === 0) {
    return `${runLabel(lastGreen)} passed on the same commit as ${runLabel(firstRed)}: likely flaky`;
  }
  if (unresolved.length === 0) return `Broke in one of ${suspects.length} PRs merged ${between}`;
  return `Broke in one of ${suspects.length + unresolved.length} changes pushed ${between}`;
}

/** The comment "Ask the author" posts on the suspect PR. */
export function askAuthorMessage(input: {
  suspect: SuspectPr;
  story: BranchStory;
  failure: string;
  blockedPrs: readonly number[];
}): string {
  const { suspect, story, failure, blockedPrs } = input;
  const runLink = (run: RunRef) => (run.url ? `[${runLabel(run)}](${run.url})` : runLabel(run));
  const mention = suspect.authorLogin ? `@${suspect.authorLogin} ` : '';
  return [
    `${mention}\`${failure}\` fails on \`${story.branch}\` since this pull request merged: ${runLink(story.firstRed)} fails${story.lastGreen ? `, ${runLink(story.lastGreen)} before it passed` : ''}.`,
    blockedPrs.length > 0
      ? `It also fails in ${blockedPrs.length} open ${blockedPrs.length === 1 ? 'pull request' : 'pull requests'}: ${blockedPrs.map((n) => `#${n}`).join(', ')}.`
      : null,
    'Could you take a look?',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function clientOf(group: CiGroupSummary) {
  const parts = parseScope(group.scope);
  const client = parts ? getClientForRepo(parts.owner, parts.repo) : null;
  if (!parts || !client) throw new Error('No GitHub client for this repository.');
  return { client, owner: parts.owner, repo: parts.repo };
}

/** Posts `message` on the suspect PR. */
export async function askAuthor(
  group: CiGroupSummary,
  suspect: SuspectPr,
  message: string,
): Promise<void> {
  const { client, owner, repo } = clientOf(group);
  await postComment(client, owner, repo, suspect.number, message);
}

/** Opens a draft PR that reverts the suspect and resolves its URL. Nothing merges by itself. */
export async function openRevert(
  group: CiGroupSummary,
  suspect: SuspectPr,
  story: BranchStory,
): Promise<string> {
  const { client, owner, repo } = clientOf(group);
  const body = [
    `Reverts #${suspect.number}.`,
    `\`${group.title}\` fails on \`${story.branch}\` from ${runLabel(story.firstRed)}${story.lastGreen ? `; ${runLabel(story.lastGreen)} before it passed` : ''}.`,
  ].join('\n\n');
  const revert = await revertPullRequest(client, owner, repo, suspect.number, body);
  return revert.url;
}
