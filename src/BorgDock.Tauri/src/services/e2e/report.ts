/**
 * The "E2E Test Results" comment a repository's E2E workflow posts on a pull
 * request, and what it says about whether the PR broke the failing tests.
 * Pure: `load.ts` reads the comment and the changed files.
 */

export interface E2eFailedTest {
  /** The spec as the report names it, relative to the E2E test folder: `assets/calendar-dates.spec.ts`. */
  file: string;
  test: string;
  error: string;
}

export interface E2eReport {
  commentId: number;
  url: string;
  createdAt: string;
  failed: E2eFailedTest[];
  /** False when a shard never reported: the failed list may be missing tests. */
  complete: boolean;
  smokeFailed: boolean;
  /** The workflow run it reports on (`**Run:** #15274`, `actions/runs/<id>`), when it says. */
  runNumber: number | null;
  runId: number | null;
}

const HEADING = /^#{1,3}\s*E2E Test Results\s*$/im;
const FAILED_SECTION = /^#{2,4}\s*Failed Tests\s*$/im;

/**
 * A check that may have an E2E report: `Deploy & Test (staging-7) / E2E Shard
 * 4/4`, but also `E2E reproducer advisory`. Only a reason to read the report;
 * which checks it covers comes from its run (`coveredChecks`).
 */
export function isE2eCheck(name: string): boolean {
  return /\be2e\b/i.test(name);
}

function cellsOf(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));
}

function unquote(cell: string): string {
  return cell.replace(/^`+|`+$/g, '').trim();
}

/** The failed tests table under "Failed Tests", by its File / Test / Error header. */
function failedTestsOf(body: string): E2eFailedTest[] {
  const section = FAILED_SECTION.exec(body);
  if (!section) return [];
  const lines = body.slice(section.index + section[0].length).split('\n');
  const table: string[][] = [];
  for (const line of lines) {
    if (line.trim().startsWith('|')) table.push(cellsOf(line));
    else if (table.length > 0 || /^#{1,4}\s/.test(line)) break;
  }
  const header = (table[0] ?? []).map((cell) => cell.toLowerCase());
  const at = (name: string) => header.indexOf(name);
  const [file, test, error] = [at('file'), at('test'), at('error')];
  if (file < 0 || test < 0) return [];
  return table
    .slice(1)
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)))
    .map((cells) => ({
      file: unquote(cells[file] ?? ''),
      test: unquote(cells[test] ?? ''),
      error: error >= 0 ? unquote(cells[error] ?? '') : '',
    }))
    .filter((t) => t.file && t.test);
}

/** The report in a comment body, or null when the comment is something else. */
export function parseE2eReport(
  body: string,
  comment: { id: number; url: string; createdAt: string },
): E2eReport | null {
  if (!HEADING.test(body)) return null;
  const status = /\*\*E2E:\*\*\s*([^|\n]+)/i.exec(body)?.[1] ?? '';
  return {
    commentId: comment.id,
    url: comment.url,
    createdAt: comment.createdAt,
    failed: failedTestsOf(body),
    complete: !/incomplete|did not complete|timed out/i.test(status),
    smokeFailed: /\*\*Smoke:\*\*\s*Failed/i.test(body),
    runNumber: numberOf(/\*\*Run:\*\*\s*#(\d+)/i.exec(body)),
    runId: numberOf(/\/actions\/runs\/(\d+)/.exec(body)),
  };
}

function numberOf(match: RegExpExecArray | null): number | null {
  return match ? Number(match[1]) : null;
}

/** A failed job of a PR, as far as matching it to a report goes. */
export interface FailedJob {
  name: string;
  runId?: number;
  runNumber?: number;
}

/**
 * The failed checks the report speaks for: the jobs of the workflow run it
 * reports on, by run id, else by run number. Without a report, or without
 * run details on either side, every failed check that looks like E2E.
 */
export function coveredChecks(
  failedNames: readonly string[],
  failedJobs: readonly FailedJob[],
  report: E2eReport | null,
): Set<string> {
  const byName = () => new Set(failedNames.filter(isE2eCheck));
  if (!report) return byName();
  const ofRun = (job: FailedJob) =>
    report.runId && job.runId
      ? job.runId === report.runId
      : !!report.runNumber && job.runNumber === report.runNumber;
  if (!failedJobs.some((job) => job.runId || job.runNumber)) return byName();
  if (!report.runId && !report.runNumber) return byName();
  return new Set(failedJobs.filter(ofRun).map((job) => job.name));
}

/** Why one failed test is, or is not, the PR's doing. */
export type E2eTestCause =
  /** The PR changes the spec. */
  | 'changed'
  /** The test is tagged with one of the PR's work items (`@AB61142`). */
  | 'tagged'
  /** The same test fails on another open pull request too. */
  | 'shared'
  /** Neither: the PR leaves the spec alone, and nothing else is known. */
  | 'untouched';

export interface JudgedE2eTest extends E2eFailedTest {
  cause: E2eTestCause;
  /** Other open PRs whose latest report fails the same test. */
  alsoFailsOn: number[];
}

export type E2eUnclearReason =
  | 'no-report'
  | 'smoke-failed'
  | 'no-failed-tests'
  | 'incomplete'
  | 'helpers-changed';

export type E2eVerdict =
  /** At least one failed test is the PR's own. */
  | { kind: 'introduced'; tests: JudgedE2eTest[]; report: E2eReport }
  /** Every failed test is outside the PR. `shared` when each also fails on another PR. */
  | { kind: 'outside'; tests: JudgedE2eTest[]; shared: boolean; report: E2eReport }
  /** The report can't say. */
  | {
      kind: 'unclear';
      reason: E2eUnclearReason;
      tests: JudgedE2eTest[];
      report: E2eReport | null;
      /** E2E support files the PR changes, for `helpers-changed`. */
      helpers: string[];
    };

export interface E2eEvidence {
  /** Every path the PR changes. */
  changedFiles: readonly string[];
  /** The PR's work item ids (`detectWorkItemIds`). */
  workItemIds: readonly number[];
  /** The latest reports of other open PRs in the same repository, by PR number. */
  otherReports: ReadonlyMap<number, E2eReport>;
}

const TAG = /@AB#?(\d+)\b/gi;

function tagsOf(title: string): number[] {
  return [...title.matchAll(TAG)].map((match) => Number(match[1]));
}

function specChanged(file: string, changed: readonly string[]): boolean {
  const spec = file.replaceAll('\\', '/').replace(/^\.?\//, '');
  return changed.some((path) => path === spec || path.endsWith(`/${spec}`));
}

function testKey(test: E2eFailedTest): string {
  return `${test.file}\n${test.test.trim()}`;
}

/** Changed files under an `e2e/` folder that are not specs: fixtures, helpers, config. */
export function e2eHelpersOf(changed: readonly string[]): string[] {
  return changed.filter(
    (path) => /(^|\/)e2e\//i.test(path) && !/\.(spec|test)\.[cm]?[jt]sx?$/i.test(path),
  );
}

/**
 * Whether the PR broke its failing E2E tests, first rule that matches:
 * no report, a failed smoke run or a report without failed tests can't say;
 * a test whose spec the PR changes or that carries one of its work items is
 * its own; a partial report can't clear it; a PR that changes E2E helpers
 * can't be cleared by tests nobody else fails; otherwise every failure is
 * outside the PR.
 */
export function e2eVerdict(report: E2eReport | null, evidence: E2eEvidence): E2eVerdict {
  const helpers = e2eHelpersOf(evidence.changedFiles);
  const unclear = (reason: E2eUnclearReason, tests: JudgedE2eTest[] = []): E2eVerdict => ({
    kind: 'unclear',
    reason,
    tests,
    report,
    helpers,
  });
  if (!report) return unclear('no-report');
  if (report.smokeFailed) return unclear('smoke-failed');
  if (report.failed.length === 0)
    return unclear(report.complete ? 'no-failed-tests' : 'incomplete');
  const failingElsewhere = new Map<string, number[]>();
  for (const [number, other] of evidence.otherReports) {
    for (const test of other.failed) {
      const key = testKey(test);
      failingElsewhere.set(key, [...(failingElsewhere.get(key) ?? []), number]);
    }
  }
  const ids = new Set(evidence.workItemIds);
  const tests: JudgedE2eTest[] = report.failed.map((test) => {
    const alsoFailsOn = [...new Set(failingElsewhere.get(testKey(test)) ?? [])].sort(
      (a, b) => a - b,
    );
    const cause: E2eTestCause = specChanged(test.file, evidence.changedFiles)
      ? 'changed'
      : tagsOf(test.test).some((id) => ids.has(id))
        ? 'tagged'
        : alsoFailsOn.length > 0
          ? 'shared'
          : 'untouched';
    return { ...test, cause, alsoFailsOn };
  });
  if (tests.some((t) => t.cause === 'changed' || t.cause === 'tagged'))
    return { kind: 'introduced', tests, report };
  if (!report.complete) return unclear('incomplete', tests);
  const shared = tests.every((t) => t.cause === 'shared');
  if (!shared && helpers.length > 0) return unclear('helpers-changed', tests);
  return { kind: 'outside', tests, shared, report };
}

/** One line on what the verdict means for merging. */
export function e2eVerdictText(verdict: E2eVerdict): string {
  const count = (n: number) => `${n} E2E test${n === 1 ? '' : 's'}`;
  switch (verdict.kind) {
    case 'introduced': {
      const own = verdict.tests.filter((t) => t.cause === 'changed' || t.cause === 'tagged');
      return `Fails ${own.length === 1 ? 'its own E2E test' : `${count(own.length)} of its own`}`;
    }
    case 'outside':
      return verdict.shared
        ? `${count(verdict.tests.length)} failed, all also failing on other PRs`
        : `${count(verdict.tests.length)} failed, none in specs this PR touches`;
    case 'unclear':
      switch (verdict.reason) {
        case 'no-report':
          return 'E2E failed; no report for this run yet';
        case 'smoke-failed':
          return 'Smoke tests failed: the deployment may be broken';
        case 'no-failed-tests':
          return 'E2E failed, but the report lists no failed tests';
        case 'incomplete':
          return 'E2E run incomplete: not every shard reported';
        case 'helpers-changed':
          return 'E2E failed and this PR changes E2E helpers';
      }
  }
}
