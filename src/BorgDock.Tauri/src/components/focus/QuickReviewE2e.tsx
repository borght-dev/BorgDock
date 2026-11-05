import { openUrl } from '@tauri-apps/plugin-opener';
import { useE2eVerdict } from '@/hooks/useE2eVerdict';
import { type E2eTestCause, e2eVerdictText, type JudgedE2eTest } from '@/services/e2e/report';
import type { PullRequestWithChecks } from '@/types';

const SHOWN = 6;

function causeText(test: JudgedE2eTest): string {
  const labels: Record<E2eTestCause, string> = {
    changed: 'spec changed in this PR',
    tagged: "tagged with this PR's work item",
    shared: `also fails on ${test.alsoFailsOn.map((n) => `#${n}`).join(', ')}`,
    untouched: 'spec not touched by this PR',
  };
  return labels[test.cause];
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * What the E2E report says about a PR's failed E2E checks: whether the PR
 * broke them, test by test, with a link to the report. Nothing when no E2E
 * check failed.
 */
export function QuickReviewE2e({ pr }: { pr: PullRequestWithChecks }) {
  const read = useE2eVerdict(pr);
  if (read === null) return null;
  if (read === undefined)
    return (
      <p className="qr-e2e" role="status">
        Reading the E2E report…
      </p>
    );
  // The report is about another run than the failing checks (an advisory): nothing to say.
  if (read.covers.size === 0) return null;
  const { verdict } = read;
  const report = verdict.report;
  const helpers = verdict.kind === 'unclear' ? verdict.helpers : [];
  return (
    <div className="qr-e2e" data-verdict={verdict.kind}>
      <p className="qr-e2e__head">
        <b>{e2eVerdictText(verdict)}</b>
        {report && (
          <button
            type="button"
            className="qr-e2e__report"
            onClick={() => void openUrl(report.url).catch(() => undefined)}
          >
            Open report
          </button>
        )}
      </p>
      {verdict.tests.length > 0 && (
        <ul className="qr-e2e__tests">
          {verdict.tests.slice(0, SHOWN).map((test) => (
            <li key={`${test.file}\n${test.test}`}>
              <code title={test.file}>{fileName(test.file)}</code>
              <span className="qr-e2e__title" title={test.test}>
                {test.test}
              </span>
              <span className="qr-e2e__cause" data-cause={test.cause}>
                {causeText(test)}
              </span>
            </li>
          ))}
          {verdict.tests.length > SHOWN && (
            <li className="qr-muted">{verdict.tests.length - SHOWN} more in the report</li>
          )}
        </ul>
      )}
      {helpers.length > 0 && (
        <p className="qr-muted">Changes E2E helpers: {helpers.map(fileName).join(', ')}</p>
      )}
    </div>
  );
}
