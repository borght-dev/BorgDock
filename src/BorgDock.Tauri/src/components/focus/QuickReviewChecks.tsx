import { checkCountsFor } from '@/components/pr/pr-card-data';
import { CheckBar } from '@/components/shared/primitives';
import type { useReviewReadiness } from '@/hooks/useReviewReadiness';
import type { PullRequestWithChecks } from '@/types';
import { ciNote } from './quick-review-status';

export function QuickReviewChecks({
  pr,
  readiness,
}: {
  pr: PullRequestWithChecks;
  readiness: ReturnType<typeof useReviewReadiness>;
}) {
  const { result, loading } = readiness;
  const counts = checkCountsFor(pr);
  return (
    <section className="qr-overview-section" aria-label="Checks">
      <h3>Checks</h3>
      <div className="qr-checks">
        <CheckBar ok={counts.ok} fail={counts.fail} run={counts.run} total={counts.total} />
        <span>{ciNote(pr)}</span>
      </div>
      {pr.skippedCount > 0 && <p>{pr.skippedCount} skipped checks</p>}
      {loading && <p role="status">Checking required status checks…</p>}
      {!loading && !result?.complete && (
        <p className="qr-check-unknown" title={result?.warnings.join(' · ')}>
          Required check coverage unverified.
        </p>
      )}
      {result?.complete && !result.checks.length && <p>No required status checks configured.</p>}
      {!!result?.checks.length && (
        <ul className="qr-required-checks">
          {result.checks.map((check) => (
            <li key={`${check.name}-${check.appId}`}>
              <span>{check.name}</span>
              <b data-state={check.state}>{check.state === 'success' ? 'passed' : check.state}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
