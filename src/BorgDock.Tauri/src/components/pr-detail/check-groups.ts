import { isFailedRun, planRerun } from '@/services/github/check-runs';
import type { CheckRun } from '@/types';

/**
 * Grouping of a PR's check runs into suites for the detail view's Checks tab
 * (plans/ui-overhaul-workbench.md, phase 3, after the iteration-2 mockup's
 * `groupedChecks()`). Pure functions, so ordering and naming are tested
 * without rendering.
 */

/** A check run's state as the grouped list shows it. Cancelled runs count as skipped. */
export type GroupedCheckState = 'failed' | 'running' | 'passed' | 'skipped';

const STATE_ORDER: Record<GroupedCheckState, number> = {
  failed: 0,
  running: 1,
  passed: 2,
  skipped: 3,
};

export function checkStateOf(run: CheckRun): GroupedCheckState {
  if (run.status === 'in_progress' || run.status === 'queued') return 'running';
  switch (run.conclusion) {
    case 'success':
      return 'passed';
    case 'failure':
    case 'timed_out':
    case 'action_required':
    case 'startup_failure':
      return 'failed';
    case 'cancelled':
    case 'skipped':
    case 'neutral':
    case 'stale':
      return 'skipped';
    default:
      return 'running';
  }
}

/** Name of the group the checks without a suite of their own share. */
export const OTHER_CHECKS = 'Other checks';

/**
 * A suite name from a check run's own name: the workflow in
 * "Workflow / job", else the prefix before the first parenthesis or colon
 * ("test (ubuntu, 20)" and "lint: biome" give "test" and "lint"). `null`
 * when the name has none of those. The fallback for runs whose check suite
 * has no workflow name (see `suiteNamesOf`).
 */
export function suiteNameOf(run: CheckRun): string | null {
  const name = run.name.trim();
  const slash = name.indexOf(' / ');
  if (slash > 0) return name.slice(0, slash).trim();
  const cut = name.search(/[(:]/);
  if (cut > 0) {
    const prefix = name.slice(0, cut).trim();
    if (prefix) return prefix;
  }
  return null;
}

/**
 * The suite name of every run. Runs of one check suite share a name: the
 * suite's GitHub Actions workflow when the fetch found it (Actions names a
 * check run by its job alone, so this is what groups "build" and "test"
 * under "CI"), else the prefix all its runs share. Runs without a suite, or
 * whose suite has neither, fall back to their own prefix. `null`: no suite.
 */
function suiteNamesOf(checks: CheckRun[]): Map<CheckRun, string | null> {
  const bySuite = new Map<number, CheckRun[]>();
  for (const run of checks) {
    if (run.checkSuiteId > 0) {
      const runs = bySuite.get(run.checkSuiteId);
      if (runs) runs.push(run);
      else bySuite.set(run.checkSuiteId, [run]);
    }
  }
  const suiteName = new Map<number, string | null>();
  for (const [id, runs] of bySuite) {
    const workflow = runs.find((r) => r.workflowName)?.workflowName ?? null;
    if (workflow) {
      suiteName.set(id, workflow);
      continue;
    }
    const prefixes = new Set(runs.map(suiteNameOf));
    const [only] = prefixes;
    suiteName.set(id, prefixes.size === 1 && only ? only : null);
  }
  const names = new Map<CheckRun, string | null>();
  for (const run of checks) {
    names.set(
      run,
      (run.checkSuiteId > 0 ? suiteName.get(run.checkSuiteId) : null) ?? suiteNameOf(run),
    );
  }
  return names;
}

export interface CheckGroupCounts {
  failed: number;
  running: number;
  passed: number;
  skipped: number;
  total: number;
}

export interface CheckGroup {
  name: string;
  /** Worst state of the runs: failed, then running, then passed, then skipped. */
  state: GroupedCheckState;
  /** Failed → running → passed → skipped, then by name. */
  runs: CheckRun[];
  counts: CheckGroupCounts;
  /** Rerun can target its failed runs (an Actions workflow run or a check suite). */
  canRerun: boolean;
}

function byStateThenName(a: CheckRun, b: CheckRun): number {
  return (
    STATE_ORDER[checkStateOf(a)] - STATE_ORDER[checkStateOf(b)] ||
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
}

function countsOf(runs: CheckRun[]): CheckGroupCounts {
  const counts: CheckGroupCounts = { failed: 0, running: 0, passed: 0, skipped: 0, total: 0 };
  for (const run of runs) {
    counts[checkStateOf(run)]++;
    counts.total++;
  }
  return counts;
}

function groupStateOf(counts: CheckGroupCounts): GroupedCheckState {
  if (counts.failed > 0) return 'failed';
  if (counts.running > 0) return 'running';
  if (counts.passed > 0) return 'passed';
  return 'skipped';
}

/**
 * Groups check runs by suite (`suiteNamesOf`); runs of equally named suites
 * share a group (one workflow run on push and one on pull_request). Failing
 * suites come first, then running, then passing, then skipped ones; each by
 * name within its state. Runs that name no suite each form their own group,
 * unless there are several: then they share one "Other checks" group, so 30
 * one-off checks do not become 30 one-row suites.
 */
export function groupChecks(checks: CheckRun[]): CheckGroup[] {
  const suiteNames = suiteNamesOf(checks);
  const named = new Map<string, CheckRun[]>();
  const loose: CheckRun[] = [];
  for (const run of checks) {
    const suite = suiteNames.get(run) ?? null;
    if (suite === null) {
      loose.push(run);
      continue;
    }
    const runs = named.get(suite);
    if (runs) runs.push(run);
    else named.set(suite, [run]);
  }

  const entries: [string, CheckRun[]][] = [...named.entries()];
  if (loose.length === 1) {
    const only = loose[0]!;
    const existing = named.get(only.name.trim());
    if (existing) existing.push(only);
    else entries.push([only.name.trim(), loose]);
  } else if (loose.length > 1) {
    entries.push([OTHER_CHECKS, loose]);
  }

  const groups = entries.map(([name, runs]): CheckGroup => {
    const sorted = [...runs].sort(byStateThenName);
    const counts = countsOf(sorted);
    const plan = planRerun(sorted.filter(isFailedRun));
    return {
      name,
      state: groupStateOf(counts),
      runs: sorted,
      counts,
      canRerun: plan.workflowRunIds.length + plan.checkSuiteIds.length > 0,
    };
  });

  return groups.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/** Suites that start open: the failing ones. */
export function isOpenByDefault(group: CheckGroup): boolean {
  return group.state === 'failed';
}

/** "42s", "3m 05s", "1h 02m"; empty when the run has not finished. */
export function durationOf(run: CheckRun): string {
  if (!run.startedAt || !run.completedAt) return '';
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** The summary's count: "2 failing", "3 of 5", "4 passed", "2 skipped". */
export function groupSummary(group: CheckGroup): string {
  const { counts } = group;
  if (counts.failed > 0) return `${counts.failed} failing`;
  if (counts.running > 0) return `${counts.total - counts.running} of ${counts.total}`;
  if (counts.passed > 0) return `${counts.passed} passed`;
  return `${counts.skipped} skipped`;
}
