import { sentence } from '../copy';
import { entityKey } from '../sources';
import type {
  ActionTarget,
  ActivityResolution,
  DeriveContext,
  DeriveResult,
  NewActivityEntry,
} from '../types';
import { createdAfterSeed, emptyResult, makeEntry, resolveIds } from './shared';

export interface DeploymentStatusFacts {
  id: number;
  /** GitHub's status: success, failure, error, in_progress, queued, inactive, pending. */
  state: string;
  createdAt: string;
  logUrl: string | null;
  environmentUrl: string | null;
}

/** A deployment of one of my open PRs' head commit. */
export interface HeadDeploymentFacts {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  deploymentId: number;
  environment: string;
  createdAt: string;
  status: DeploymentStatusFacts | null;
}

/** Whether a terminal deployment carried one of my merged PRs. */
export interface InclusionFacts {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  deploymentId: number;
  environment: string;
  deploymentCreatedAt: string;
  status: DeploymentStatusFacts;
  included: boolean;
}

export interface DeliveryObservation {
  owner: string;
  repo: string;
  heads: HeadDeploymentFacts[];
  inclusions: InclusionFacts[];
}

export interface DeliveryBaseline {
  /** Facts already accounted for: `<statusId>` for heads, `<statusId>:#<n>` for inclusions. */
  seen: string[];
  /** `<n>:<environment>` pairs a merged PR reached. */
  reached: string[];
  /** Open failure entries per `<n>:<environment>`, resolved by a later success. */
  failed: Record<string, string[]>;
}

/** Status ids pile up; the oldest are forgotten past this many. */
const SEEN_LIMIT = 2000;
const TERMINAL = new Set(['success', 'failure', 'error']);

function pairOf(number: number, environment: string): string {
  return `${number}:${environment}`;
}

function logAction(status: DeploymentStatusFacts, fallback: string): ActionTarget {
  return { kind: 'open-url', url: status.logUrl ?? status.environmentUrl ?? fallback };
}

/**
 * Deployments of my PR heads, and my merged PRs reaching (or failing to
 * reach) the environments the repository follows. In-progress, queued and
 * inactive statuses create nothing.
 */
export function deriveDelivery(
  ctx: DeriveContext,
  baseline: DeliveryBaseline | null,
  observation: DeliveryObservation,
): DeriveResult<DeliveryBaseline> {
  const seen = new Set(baseline?.seen ?? []);
  const reached = new Set(baseline?.reached ?? []);
  const failed: Record<string, string[]> = { ...(baseline?.failed ?? {}) };
  const entries: NewActivityEntry[] = [];
  const resolutions: ActivityResolution[] = [];
  const { owner, repo } = observation;
  const counts = (createdAt: string) => !ctx.seed && createdAfterSeed(ctx, createdAt);

  for (const head of observation.heads) {
    const status = head.status;
    if (!status || !TERMINAL.has(status.state)) continue;
    const fact = String(status.id);
    if (seen.has(fact)) continue;
    seen.add(fact);
    const pair = `head:${pairOf(head.prNumber, head.environment)}`;
    const success = status.state === 'success';
    if (success && failed[pair]) {
      resolutions.push(resolveIds(ctx, failed[pair], 'deployed'));
      delete failed[pair];
    }
    if (!counts(head.createdAt)) continue;
    const nativeKey = `deployment-status:${status.id}`;
    if (!success) failed[pair] = [...(failed[pair] ?? []), nativeKey];
    entries.push(
      makeEntry(ctx, {
        nativeKey,
        entity: {
          kind: 'deployment',
          key: entityKey.deployment(owner, repo, head.deploymentId),
          title: `#${head.prNumber} → ${head.environment}`,
          url: status.environmentUrl ?? status.logUrl,
        },
        links: { prUrls: [head.prUrl] },
        category: 'deploy.pr',
        severity: success ? 'success' : 'error',
        needsYou: !success,
        sourceAt: status.createdAt,
        summary: sentence.deployedHead(head.prNumber, head.environment, status.state),
        action: logAction(status, head.prUrl),
      }),
    );
  }

  for (const inclusion of observation.inclusions) {
    if (!inclusion.included || !TERMINAL.has(inclusion.status.state)) continue;
    const pair = pairOf(inclusion.prNumber, inclusion.environment);
    const entity = {
      kind: 'pr' as const,
      key: entityKey.pr(owner, repo, inclusion.prNumber),
      title: inclusion.prTitle,
      url: inclusion.prUrl,
    };
    const links = { prUrls: [inclusion.prUrl] };
    if (inclusion.status.state === 'success') {
      if (reached.has(pair)) continue;
      reached.add(pair);
      if (failed[pair]) {
        resolutions.push(resolveIds(ctx, failed[pair], 'reached'));
        delete failed[pair];
      }
      if (!counts(inclusion.deploymentCreatedAt)) continue;
      entries.push(
        makeEntry(ctx, {
          nativeKey: `reached:${owner}/${repo}#${inclusion.prNumber}:${inclusion.environment}`,
          entity,
          links,
          category: 'deploy.reached',
          severity: 'success',
          needsYou: false,
          sourceAt: inclusion.status.createdAt,
          summary: sentence.reached(inclusion.prNumber, inclusion.environment),
          action: logAction(inclusion.status, inclusion.prUrl),
        }),
      );
      continue;
    }
    const fact = `${inclusion.status.id}:#${inclusion.prNumber}`;
    if (seen.has(fact) || reached.has(pair)) continue;
    seen.add(fact);
    if (!counts(inclusion.deploymentCreatedAt)) continue;
    const nativeKey = `deployment-status:${fact}`;
    failed[pair] = [...(failed[pair] ?? []), nativeKey];
    entries.push(
      makeEntry(ctx, {
        nativeKey,
        entity,
        links,
        category: 'deploy.failed',
        severity: 'error',
        needsYou: true,
        sourceAt: inclusion.status.createdAt,
        summary: sentence.deployFailed(inclusion.prNumber, inclusion.environment),
        action: logAction(inclusion.status, inclusion.prUrl),
      }),
    );
  }

  const result = emptyResult<DeliveryBaseline>({
    seen: [...seen].slice(-SEEN_LIMIT),
    reached: [...reached],
    failed,
  });
  if (ctx.seed) return result;
  return { ...result, entries, resolutions };
}

/** The environments a merged PR already reached, so delivery stops comparing for them. */
export function reachedEnvironments(
  baseline: DeliveryBaseline | null,
  prNumber: number,
): Set<string> {
  const prefix = `${prNumber}:`;
  return new Set(
    (baseline?.reached ?? [])
      .filter((pair) => pair.startsWith(prefix))
      .map((pair) => pair.slice(prefix.length)),
  );
}
