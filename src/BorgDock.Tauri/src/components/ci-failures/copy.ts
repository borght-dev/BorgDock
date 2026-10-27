import type { Relatedness } from '@/services/ci-failures/hypothesis';
import type {
  CiGroupDetail,
  CiGroupSummary,
  CiOccurrenceDetail,
} from '@/services/ci-failures/types';
import type { EvidenceRow } from './related-rows';

/** "Same failure in 4 PRs and on master", "Repeated in this PR (3 attempts)". */
export function headlineOf(
  group: CiGroupSummary,
  relatedness: Relatedness,
  branch: string,
): string {
  const prs = group.prNumbers.length;
  const onBranch = group.defaultBranchRuns.length > 0;
  const same = group.maxTier === 'high' ? 'Same failure' : 'Possibly the same failure';
  if (relatedness === 'repeated') return `Repeated in this PR (${group.occurrenceCount} attempts)`;
  if (prs === 0) return `Failing on ${branch}`;
  if (prs === 1) return onBranch ? `${same} on ${branch}` : `${same} in this PR only`;
  return `${same} in ${prs} PRs${onBranch ? ` and on ${branch}` : ''}`;
}

export function confidenceOf(group: CiGroupSummary): 'High' | 'Medium' {
  return group.maxTier === 'high' ? 'High' : 'Medium';
}

export function evidenceText(row: EvidenceRow): string {
  switch (row.state) {
    case 'pending':
      return 'reading evidence…';
    case 'not-collected':
      return 'evidence collection is off';
    case 'failed':
      return `couldn't read evidence${row.reason ? ` (${row.reason})` : ''}, will retry`;
    default:
      return `evidence unavailable${row.reason ? ` (${row.reason})` : ''}`;
  }
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** The first message a group's evidence gives for this occurrence. */
export function excerptOf(detail: CiOccurrenceDetail, groupId: string): string | null {
  const signal =
    detail.signals.find((s) => s.groupId === groupId) ??
    detail.signals.find((s) => s.signal.kind !== 'summary');
  if (!signal) return null;
  const { expected, actual, message } = signal.signal;
  return expected !== null && actual !== null
    ? `${message}  Expected: ${expected}  Received: ${actual}`
    : message;
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Why a group's occurrences count as one failure, as sentences: what they
 * share and where they differ.
 */
export function matchReasons(detail: CiGroupDetail): string[] {
  const groupId = detail.summary.id;
  const signals = detail.occurrences.flatMap((o) =>
    o.signals.filter((s) => s.groupId === groupId).map((s) => s.signal),
  );
  const reasons: string[] = [];
  const tests = distinct(signals.map((s) => s.testId).filter((t): t is string => !!t));
  if (tests.length === 1) reasons.push(`Same test ${tests[0]}`);
  const codes = distinct(signals.map((s) => s.code).filter((c): c is string => !!c));
  if (codes.length === 1 && tests.length === 0) reasons.push(`Same error code ${codes[0]}`);
  const classes = distinct(signals.map((s) => s.errorClass).filter((c): c is string => !!c));
  if (classes.length === 1) reasons.push(`Same error type ${classes[0]}`);
  const pairs = distinct(
    signals
      .filter((s) => s.expected !== null && s.actual !== null)
      .map((s) => `Expected ${s.expected} / Received ${s.actual}`),
  );
  if (pairs.length === 1) reasons.push(`Same assertion, ${pairs[0]}`);
  const steps = distinct(
    detail.occurrences.map((o) => o.occurrence.failedStep).filter((s): s is string => !!s),
  );
  if (steps.length === 1) reasons.push(`Same failed step ${steps[0]}`);
  const matrix = distinct(
    detail.occurrences.map((o) => o.occurrence.matrix.join(', ')).filter(Boolean),
  );
  if (matrix.length > 1) reasons.push(`${matrix.length} matrix values`);
  const heads = distinct(
    detail.occurrences
      .filter((o) => o.occurrence.prNumber !== null)
      .map((o) => o.occurrence.testedSha),
  );
  if (heads.length > 1) reasons.push(`${heads.length} different PR heads`);
  return reasons;
}
