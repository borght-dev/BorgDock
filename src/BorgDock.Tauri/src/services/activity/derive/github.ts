import { sentence } from '../copy';
import { entityKey, entryId, normalizeTime } from '../sources';
import type {
  ActionTarget,
  ActivityEntity,
  ActivityResolution,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from '../types';
import {
  createdAfterSeed,
  emptyResult,
  keepMissing,
  makeEntry,
  resolveCategories,
  resolveIds,
} from './shared';

export interface PrReviewFacts {
  /** GitHub's `databaseId` for the review. */
  id: number;
  author: string;
  state: 'approved' | 'changesRequested' | 'commented' | 'dismissed' | 'pending';
  submittedAt: string | null;
  /** The Claude review bot: its reviews arrive as findings, not as reviews. */
  bot: boolean;
}

export interface FailingJob {
  id: number;
  name: string;
  completedAt: string | null;
  /** The first signal CI failures read from the job's log, when it has. */
  signal: string | null;
  /** The shared CI failure group the job sits in, if any. */
  group: { scope: string; id: string; title: string; owned: boolean } | null;
}

export interface PrFacts {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  headSha: string;
  isDraft: boolean;
  mergeable: boolean | null;
  /** `isReadyToMerge`. */
  ready: boolean;
  /** Null when this read could not see reviews (the REST path). */
  reviews: PrReviewFacts[] | null;
  /** I am a requested reviewer, directly or through a team. */
  requestedMe: boolean;
  requestedAt: string | null;
  /**
   * What the poll knows of the Claude bot's review (its newest review id and
   * comment count); a change is what makes the findings worth fetching.
   */
  claudeKey: string | null;
  checks: {
    /** False when the read could not see checks. */
    known: boolean;
    overall: 'green' | 'red' | 'yellow' | 'gray';
    failing: FailingJob[];
  };
}

/** A PR that left the open list, read back by number. */
export interface VerifiedPr {
  number: number;
  title: string;
  url: string;
  author: string;
  state: 'open' | 'merged' | 'closed';
  mergedAt: string | null;
  mergedBy: string | null;
  closedAt: string | null;
}

export interface FindingItem {
  severity: 'critical' | 'suggestion' | 'praise' | 'info';
  title: string;
}

/** One Claude review on one of my PRs, fetched since the stored watermark. */
export interface PrFindings {
  number: number;
  /** The review id, or the newest comment id when the review has none. */
  key: string;
  at: string | null;
  items: FindingItem[];
}

export interface GitHubObservation {
  owner: string;
  repo: string;
  /** The login the account reading this repository resolved to. */
  login: string;
  path: 'graphql' | 'rest';
  prs: PrFacts[];
  verified: VerifiedPr[];
  findings: PrFindings[];
}

export interface PrBaseline {
  state: 'open' | 'merged' | 'closed';
  author: string;
  createdAt: string;
  headSha: string;
  /** Review id → author, as the last read that could see reviews found them. */
  reviews: Record<string, string>;
  requestedMe: boolean;
  /** The head a failure entry was made for, until it passes or a newer head replaces it. */
  failedHead: string | null;
  failingIds: number[];
  mergeable: boolean | null;
  readyHead: string | null;
  /** The Claude review state already accounted for. */
  claudeKey: string | null;
  /** When the newest fetched finding was written: the next fetch reads `since` it. */
  findingsSince: string | null;
  closedAt: string | null;
  missingSince?: string;
}

export interface GitHubBaseline {
  prs: Record<string, PrBaseline>;
}

const SEVERITY_RANK: Record<FindingItem['severity'], number> = {
  critical: 0,
  suggestion: 1,
  info: 2,
  praise: 3,
};

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function blank(pr: PrFacts): PrBaseline {
  return {
    state: 'open',
    author: pr.author,
    createdAt: pr.createdAt,
    headSha: pr.headSha,
    reviews: {},
    requestedMe: false,
    failedHead: null,
    failingIds: [],
    mergeable: null,
    readyHead: null,
    claudeKey: null,
    findingsSince: null,
    closedAt: null,
  };
}

/** `absorb` takes the Claude review as it is now as already seen. */
function baselineOf(
  pr: PrFacts,
  before: PrBaseline | null,
  path: GitHubObservation['path'],
  absorb: boolean,
): PrBaseline {
  const reviews =
    pr.reviews && path === 'graphql'
      ? Object.fromEntries(pr.reviews.map((review) => [String(review.id), review.author]))
      : (before?.reviews ?? {});
  return {
    state: 'open',
    author: pr.author,
    createdAt: pr.createdAt,
    headSha: pr.headSha,
    reviews,
    requestedMe: pr.requestedMe,
    failedHead: before?.failedHead ?? null,
    failingIds: before?.failingIds ?? [],
    mergeable: pr.mergeable ?? before?.mergeable ?? null,
    readyHead: pr.ready ? pr.headSha : null,
    claudeKey: absorb ? pr.claudeKey : (before?.claudeKey ?? null),
    findingsSince: before?.findingsSince ?? null,
    closedAt: null,
  };
}

/**
 * The PRs whose Claude review the adapter should fetch, with the time to
 * fetch since: mine, and with a review the baseline has not accounted for.
 * At most `limit` per poll; the rest wait for later polls.
 */
export function prsNeedingFindings(
  baseline: GitHubBaseline | null,
  observation: Pick<GitHubObservation, 'login' | 'prs'>,
  limit = 3,
): { number: number; since: string | null }[] {
  return observation.prs
    .filter((pr) => same(pr.author, observation.login) && pr.claudeKey)
    .flatMap((pr) => {
      const base = baseline?.prs[String(pr.number)];
      return base && base.state === 'open' && base.claudeKey !== pr.claudeKey
        ? [{ number: pr.number, since: base.findingsSince }]
        : [];
    })
    .slice(0, limit);
}

function prAction(
  observation: GitHubObservation,
  number: number,
  tab?: 'checks' | 'reviews',
): ActionTarget {
  return {
    kind: 'open-pr',
    owner: observation.owner,
    repo: observation.repo,
    number,
    ...(tab ? { tab } : {}),
  };
}

function derivePr(
  ctx: DeriveContext,
  observation: GitHubObservation,
  pr: PrFacts,
  base: PrBaseline,
  next: PrBaseline,
  out: { entries: NewActivityEntry[]; resolutions: ActivityResolution[] },
): void {
  const key = entityKey.pr(observation.owner, observation.repo, pr.number);
  const entity: ActivityEntity = { kind: 'pr', key, title: pr.title, url: pr.url };
  const links = { prUrls: [pr.url] };
  const native = (suffix: string) => `#${pr.number}:${suffix}`;
  const add = (facts: Omit<Parameters<typeof makeEntry>[1], 'entity' | 'links'>) =>
    out.entries.push(makeEntry(ctx, { ...facts, entity, links }));
  const mine = same(pr.author, observation.login);
  const { owner, repo } = observation;

  // Reviews by others on my PRs. A REST read cannot see them.
  if (mine && pr.reviews && observation.path === 'graphql') {
    for (const review of pr.reviews) {
      const id = String(review.id);
      if (base.reviews[id] || review.bot || same(review.author, observation.login)) continue;
      if (review.state === 'pending' || review.state === 'dismissed') continue;
      const earlier = Object.entries(base.reviews)
        .filter(([, author]) => same(author, review.author))
        .map(([earlierId]) => native(`review:${earlierId}`));
      if (earlier.length > 0) {
        out.resolutions.push(
          resolveIds(ctx, earlier, entryId(ctx.sourceId, native(`review:${id}`)), 'superseded'),
        );
      }
      add({
        nativeKey: native(`review:${id}`),
        category: 'pr.review',
        severity:
          review.state === 'changesRequested'
            ? 'warning'
            : review.state === 'approved'
              ? 'success'
              : 'info',
        needsYou: review.state === 'changesRequested',
        sourceAt: review.submittedAt,
        summary: sentence.review(review.author, review.state, pr.number, pr.title),
        action: prAction(observation, pr.number, 'reviews'),
      });
    }
  }

  // Review requests count on anyone's PR.
  if (pr.requestedMe && !base.requestedMe && !mine) {
    add({
      nativeKey: `review-request:${owner}/${repo}#${pr.number}:${normalizeTime(pr.requestedAt) ?? ctx.now}`,
      category: 'pr.review-request',
      severity: 'warning',
      needsYou: true,
      sourceAt: pr.requestedAt,
      summary: sentence.reviewRequest(pr.author, pr.number, pr.title),
      action: { kind: 'review-pr', owner, repo, number: pr.number },
    });
  }
  if (!pr.requestedMe && base.requestedMe) {
    out.resolutions.push(
      resolveCategories(key, ['pr.review-request'], 'reviewed or no longer requested'),
    );
  }

  if (!mine) return;

  // Checks on my PR's head.
  if (pr.checks.known) {
    const failingIds = pr.checks.failing.map((job) => job.id).sort((a, b) => a - b);
    if (pr.checks.overall === 'red' && pr.checks.failing.length > 0) {
      const nativeKey = native(`checks:${pr.headSha}:failed`);
      if (base.failedHead !== pr.headSha) {
        if (base.failedHead) {
          out.resolutions.push(
            resolveCategories(
              key,
              ['pr.checks-failed'],
              entryId(ctx.sourceId, nativeKey),
              'superseded',
            ),
          );
        }
        const groups = pr.checks.failing.map((job) => job.group);
        const shared = groups.every((group) => group !== null) ? groups : [];
        const oneGroup =
          shared.length > 0 && shared.every((group) => group?.id === shared[0]?.id)
            ? shared[0]
            : null;
        const everyOwned = shared.length > 0 && shared.every((group) => group?.owned);
        add({
          nativeKey,
          category: 'pr.checks-failed',
          severity: 'error',
          needsYou: !everyOwned,
          sourceAt: pr.checks.failing
            .map((job) => normalizeTime(job.completedAt))
            .filter((at): at is string => !!at)
            .sort()
            .at(-1),
          summary: sentence.checksFailed(
            pr.checks.failing.map((job) => job.name),
            pr.number,
            pr.title,
          ),
          detail: pr.checks.failing
            .map((job) =>
              [
                job.name,
                job.signal ? `: ${job.signal}` : '',
                job.group ? ` (shared failure: ${job.group.title})` : '',
              ].join(''),
            )
            .join('\n'),
          action: oneGroup
            ? { kind: 'open-ci-group', scope: oneGroup.scope, groupId: oneGroup.id }
            : { kind: 'fix-checks', owner, repo, number: pr.number, headSha: pr.headSha },
        });
      }
      next.failedHead = pr.headSha;
      next.failingIds = failingIds;
    } else if (pr.checks.overall === 'green' && base.failedHead) {
      const nativeKey = native(`checks:${pr.headSha}:passed`);
      out.resolutions.push(resolveCategories(key, ['pr.checks-failed'], 'checks passed'));
      add({
        nativeKey,
        category: 'pr.checks-passed',
        severity: 'success',
        needsYou: false,
        sourceAt: null,
        summary: sentence.checksPassed(pr.number, pr.title),
        action: prAction(observation, pr.number, 'checks'),
      });
      next.failedHead = null;
      next.failingIds = [];
    }
  }

  if (pr.ready && base.readyHead !== pr.headSha) {
    add({
      nativeKey: native(`ready:${pr.headSha}`),
      category: 'pr.ready',
      severity: 'success',
      needsYou: false,
      sourceAt: null,
      summary: sentence.ready(pr.number, pr.title),
      action: { kind: 'merge', owner, repo, number: pr.number, headSha: pr.headSha },
    });
  }
  if (!pr.ready && base.readyHead) {
    out.resolutions.push(resolveCategories(key, ['pr.ready'], 'no longer ready'));
  }

  if (base.mergeable === true && pr.mergeable === false) {
    add({
      nativeKey: native(`conflict:${pr.headSha}`),
      category: 'pr.conflict',
      severity: 'warning',
      needsYou: true,
      sourceAt: null,
      summary: sentence.conflict(pr.number, pr.title),
      action: prAction(observation, pr.number),
    });
  }
  if (pr.mergeable === true && base.mergeable === false) {
    out.resolutions.push(resolveCategories(key, ['pr.conflict'], 'mergeable again'));
  }
}

function deriveFindings(
  ctx: DeriveContext,
  observation: GitHubObservation,
  findings: PrFindings,
  pr: { title: string; url: string },
): NewActivityEntry {
  const items = [...findings.items].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const critical = items.filter((item) => item.severity === 'critical').length;
  return makeEntry(ctx, {
    nativeKey: `#${findings.number}:findings:${findings.key}`,
    entity: {
      kind: 'pr',
      key: entityKey.pr(observation.owner, observation.repo, findings.number),
      title: pr.title,
      url: pr.url,
    },
    links: { prUrls: [pr.url] },
    category: 'pr.findings',
    severity: critical > 0 ? 'error' : 'info',
    needsYou: critical > 0,
    sourceAt: findings.at,
    summary: sentence.findings(items.length, critical, findings.number, pr.title),
    detail: items
      .slice(0, 3)
      .map((item) => `${item.severity}: ${item.title}`)
      .join('\n'),
    action: prAction(observation, findings.number, 'reviews'),
  });
}

/**
 * One repository read fresh. A PR that left the open list counts as merged
 * or closed only once a verification read says so.
 */
export function deriveGitHub(
  ctx: DeriveContext,
  baseline: GitHubBaseline | null,
  observation: GitHubObservation,
): DeriveResult<GitHubBaseline> {
  const previous = baseline?.prs ?? {};
  const prs: Record<string, PrBaseline> = {};
  const out = { entries: [] as NewActivityEntry[], resolutions: [] as ActivityResolution[] };

  for (const pr of observation.prs) {
    const id = String(pr.number);
    const before = previous[id] ?? null;
    const fresh = !before && !ctx.seed && createdAfterSeed(ctx, pr.createdAt);
    const absorb = ctx.seed || (!before && !fresh) || !same(pr.author, observation.login);
    const next = baselineOf(pr, before, observation.path, absorb);
    prs[id] = next;
    const base = before ? { ...before, state: 'open' as const } : fresh ? blank(pr) : null;
    if (ctx.seed || !base) continue;
    derivePr(ctx, observation, pr, base, next, out);
  }

  for (const verified of observation.verified) {
    const id = String(verified.number);
    const before = previous[id];
    if (!before || prs[id]) continue;
    if (verified.state === 'open') {
      prs[id] = { ...before, missingSince: undefined };
      continue;
    }
    prs[id] = {
      ...before,
      state: verified.state,
      closedAt: normalizeTime(verified.closedAt),
      missingSince: undefined,
    };
    const changed =
      before.state !== verified.state ||
      (verified.state === 'closed' && normalizeTime(verified.closedAt) !== before.closedAt);
    if (ctx.seed || !changed || !same(verified.author, observation.login)) continue;
    const key = entityKey.pr(observation.owner, observation.repo, verified.number);
    const merged = verified.state === 'merged';
    out.resolutions.push(
      resolveCategories(
        key,
        ['pr.ready', 'pr.conflict', 'pr.checks-failed', 'pr.review-request', 'pr.review'],
        merged ? 'merged' : 'closed',
      ),
    );
    out.entries.push(
      makeEntry(ctx, {
        nativeKey: merged
          ? `#${verified.number}:merged`
          : `#${verified.number}:closed:${normalizeTime(verified.closedAt) ?? ctx.now}`,
        entity: { kind: 'pr', key, title: verified.title, url: verified.url },
        links: { prUrls: [verified.url] },
        category: merged ? 'pr.merged' : 'pr.closed',
        severity: merged ? 'success' : 'info',
        needsYou: false,
        sourceAt: merged ? verified.mergedAt : verified.closedAt,
        summary: merged
          ? sentence.merged(verified.number, verified.title, verified.mergedBy)
          : sentence.closed(verified.number, verified.title),
        action: { kind: 'open-url', url: verified.url },
      }),
    );
  }

  for (const findings of observation.findings) {
    const id = String(findings.number);
    const base = prs[id];
    const pr = observation.prs.find((candidate) => candidate.number === findings.number);
    if (!base || !pr) continue;
    prs[id] = {
      ...base,
      claudeKey: pr.claudeKey,
      findingsSince: normalizeTime(findings.at) ?? base.findingsSince,
    };
    if (ctx.seed || findings.items.length === 0 || !same(pr.author, observation.login)) continue;
    out.entries.push(deriveFindings(ctx, observation, findings, pr));
  }

  const present = new Set(Object.keys(prs));
  const result = emptyResult<GitHubBaseline>({
    prs: { ...keepMissing(ctx, previous, present, true), ...prs },
  });
  if (ctx.seed) return result;
  return { ...result, entries: out.entries, resolutions: out.resolutions };
}

/** Numbers of PRs that left the open list since the baseline and need a verification read. */
export function prsToVerify(
  baseline: GitHubBaseline | null,
  observation: Pick<GitHubObservation, 'prs'>,
): number[] {
  if (!baseline) return [];
  const open = new Set(observation.prs.map((pr) => String(pr.number)));
  return Object.entries(baseline.prs)
    .filter(([id, pr]) => pr.state === 'open' && !open.has(id))
    .map(([id]) => Number(id));
}
