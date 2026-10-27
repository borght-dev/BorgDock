import { type Relatedness, relatednessOf } from '@/services/ci-failures/hypothesis';
import type {
  CiGroupSummary,
  CiOccurrenceDetail,
  CiPrFailures,
} from '@/services/ci-failures/types';
import { factsOf } from '@/stores/ci-failures-store';
import type { CheckRun } from '@/types';

/** A failed check whose evidence isn't there (yet), with why. */
export interface EvidenceRow {
  kind: 'evidence';
  checkName: string;
  state: 'pending' | 'failed' | 'unavailable' | 'not-collected';
  reason: string | null;
}

/** A group one or more of the PR's current failed checks belong to. */
export interface GroupRow {
  kind: 'group';
  group: CiGroupSummary;
  relatedness: Relatedness;
  /** The PR's failed checks in this group. */
  checkNames: string[];
  /** The newest occurrence of this PR in the group, for its excerpt. */
  occurrence: CiOccurrenceDetail;
}

export interface RelatedView {
  failedCount: number;
  rows: Array<GroupRow | EvidenceRow>;
  /** Failed checks whose evidence was read and that match nothing confidently. */
  unmatched: string[];
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

export function isFailedCheck(run: CheckRun): boolean {
  return run.status === 'completed' && FAILED.has(run.conclusion ?? '');
}

/** The occurrence recorded for a failed check run: by job id, or by name for commit statuses. */
function occurrenceOf(
  run: CheckRun,
  occurrences: readonly CiOccurrenceDetail[],
  headSha: string | undefined,
): CiOccurrenceDetail | undefined {
  if (run.id > 0) return occurrences.find((o) => o.occurrence.jobId === run.id);
  return occurrences.find(
    (o) =>
      o.occurrence.jobId === null &&
      o.occurrence.jobName === run.name &&
      (!headSha || o.occurrence.testedSha === headSha),
  );
}

const RANK: Record<Relatedness, number> = { shared: 0, repeated: 1, single: 2 };

/**
 * What the Related failures card shows for a PR's current failed checks: a
 * row per group they share with other PRs or attempts, a row per check whose
 * evidence is missing, and the checks that match nothing.
 */
export function relatedView(
  checks: readonly CheckRun[],
  failures: CiPrFailures | null,
  options: { headSha?: string; collecting: boolean },
): RelatedView {
  const failed = checks.filter(isFailedCheck);
  const occurrences = failures?.occurrences ?? [];
  const groups = new Map((failures?.groups ?? []).map((group) => [group.id, group]));
  const groupRows = new Map<string, GroupRow>();
  const evidenceRows: EvidenceRow[] = [];
  const unmatched: string[] = [];

  for (const run of failed) {
    const detail = occurrenceOf(run, occurrences, options.headSha);
    if (!detail) {
      evidenceRows.push({
        kind: 'evidence',
        checkName: run.name,
        state: options.collecting ? 'pending' : 'not-collected',
        reason: null,
      });
      continue;
    }
    const state = detail.occurrence.evidenceState;
    if (state === 'pending' || state === 'failed' || state === 'unavailable') {
      evidenceRows.push({
        kind: 'evidence',
        checkName: run.name,
        state,
        reason: detail.occurrence.evidenceReason,
      });
      continue;
    }
    const groupIds = [
      ...new Set(
        detail.signals.filter((s) => s.tier !== 'low' && s.groupId).map((s) => s.groupId as string),
      ),
    ];
    const shown = groupIds
      .map((id) => groups.get(id))
      .filter((group): group is CiGroupSummary => !!group)
      .filter((group) => relatednessOf(factsOf(group)) !== 'single');
    if (shown.length === 0) {
      unmatched.push(run.name);
      continue;
    }
    for (const group of shown) {
      const existing = groupRows.get(group.id);
      if (existing) {
        existing.checkNames.push(run.name);
        continue;
      }
      groupRows.set(group.id, {
        kind: 'group',
        group,
        relatedness: relatednessOf(factsOf(group)),
        checkNames: [run.name],
        occurrence: detail,
      });
    }
  }

  const rows = [...groupRows.values()].sort(
    (a, b) =>
      RANK[a.relatedness] - RANK[b.relatedness] ||
      (a.group.maxTier === b.group.maxTier ? 0 : a.group.maxTier === 'high' ? -1 : 1) ||
      b.group.prNumbers.length - a.group.prNumbers.length,
  );
  return { failedCount: failed.length, rows: [...rows, ...evidenceRows], unmatched };
}
