import type { ActivityCategory, ActivityCategoryGroup, ActivitySourceKind } from './types';

/** One independent origin with its own generation and baseline. */
export const sourceId = {
  t3: (hostId: string) => `t3:${hostId}`,
  gh: (scope: string) => `gh:${scope}`,
  deploy: (scope: string) => `deploy:${scope}`,
  ci: (scope: string) => `ci:${scope}`,
  ado: (organization: string, project: string) =>
    `ado:${organization.toLowerCase()}/${project.toLowerCase()}`,
  workstreams: () => 'workstreams:local',
} as const;

export function sourceKindOf(id: string): ActivitySourceKind | null {
  const kind = id.slice(0, id.indexOf(':'));
  return (
    (['t3', 'gh', 'deploy', 'ci', 'ado', 'workstreams'] as const).find((k) => k === kind) ?? null
  );
}

/**
 * Entity keys, scoped so the same thread id on two hosts or the same PR
 * number in two repositories never meet. A PR leaves out the account:
 * `owner/repo#n` names one PR whichever account reads it.
 */
export const entityKey = {
  thread: (hostId: string, rawThreadId: string) => `t3:${hostId}:thread:${rawThreadId}`,
  pr: (owner: string, repo: string, number: number) =>
    `gh:${owner.toLowerCase()}/${repo.toLowerCase()}#${number}`,
  deployment: (owner: string, repo: string, deploymentId: number) =>
    `deploy:${owner.toLowerCase()}/${repo.toLowerCase()}:${deploymentId}`,
  workItem: (organization: string, project: string, id: number) =>
    `ado:${organization.toLowerCase()}/${project.toLowerCase()}:${id}`,
  ciGroup: (groupId: string) => `ci:${groupId}`,
  workstream: (documentId: string) => `workstream:${documentId}`,
} as const;

/** The same fact always gets the same id. */
export function entryId(source: string, nativeKey: string): string {
  return `${source}|${nativeKey}`;
}

/**
 * Every time the journal stores is `Date.toISOString()` form, so text order
 * is time order (`…00Z` and `…00.000Z` would not compare).
 */
export function normalizeTime(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

export const CATEGORY_GROUP: Record<ActivityCategory, ActivityCategoryGroup | null> = {
  'agent.question': 'agents',
  'agent.plan': 'agents',
  'agent.approval': 'agents',
  'agent.turn': 'agents',
  'agent.turns-missed': 'agents',
  'agent.failed': 'agents',
  'agent.interrupted': 'agents',
  'agent.limited': 'agents',
  'agent.report': 'agents',
  'pr.review': 'pull-requests',
  'pr.findings': 'pull-requests',
  'pr.review-request': 'pull-requests',
  'pr.checks-failed': 'pull-requests',
  'pr.checks-passed': 'pull-requests',
  'pr.ready': 'pull-requests',
  'pr.conflict': 'pull-requests',
  'pr.merged': 'pull-requests',
  'pr.closed': 'pull-requests',
  'ci.group-grew': 'ci',
  'ci.owner-stale': 'ci',
  'ci.fix-merged': 'ci',
  'ci.seen-after-fix': 'ci',
  'ci.resolved': 'ci',
  'workstream.unblocked': 'workstreams',
  'workstream.invalidated': 'workstreams',
  'workstream.reopened': 'workstreams',
  'workstream.conflict': 'workstreams',
  'workstream.proposal': 'workstreams',
  'workstream.ready': 'workstreams',
  'deploy.pr': 'deployments',
  'deploy.reached': 'deployments',
  'deploy.failed': 'deployments',
  'ado.assigned': 'work-items',
  'ado.state': 'work-items',
  'ado.comment': 'work-items',
  'activity.rollup': null,
};

export function categoriesOf(group: ActivityCategoryGroup): ActivityCategory[] {
  return (Object.keys(CATEGORY_GROUP) as ActivityCategory[]).filter(
    (category) => CATEGORY_GROUP[category] === group,
  );
}

/**
 * Keeps one observation in flight per source. One that arrives while
 * another runs waits; a newer one replaces a waiting one, which then
 * resolves `false` without running.
 */
export class SourceQueue {
  private readonly running = new Map<string, Promise<void>>();
  private readonly waiting = new Map<
    string,
    { task: () => Promise<void>; settle: (ran: boolean) => void; fail: (error: unknown) => void }
  >();

  run(source: string, task: () => Promise<void>): Promise<boolean> {
    if (!this.running.has(source)) return this.start(source, task).then(() => true);
    return new Promise<boolean>((settle, fail) => {
      this.waiting.get(source)?.settle(false);
      this.waiting.set(source, { task, settle, fail });
    });
  }

  /** Resolves once nothing runs or waits for `source`. */
  async idle(source: string): Promise<void> {
    while (this.running.has(source)) await this.running.get(source)!.catch(() => {});
  }

  private start(source: string, task: () => Promise<void>): Promise<void> {
    const run = task().finally(() => {
      this.running.delete(source);
      const next = this.waiting.get(source);
      if (!next) return;
      this.waiting.delete(source);
      this.start(source, next.task).then(
        () => next.settle(true),
        (error) => next.fail(error),
      );
    });
    this.running.set(source, run);
    return run;
  }
}
