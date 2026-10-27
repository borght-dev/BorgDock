import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { hypothesesOf } from '@/services/ci-failures/hypothesis';
import { type RerunOutcome, rerunAffected, rerunTargets } from '@/services/ci-failures/rerun';
import * as store from '@/services/ci-failures/store-api';
import type { CiGroupDetail } from '@/services/ci-failures/types';
import { showPr } from '@/services/navigation';
import { factsOf, useCiBranch } from '@/stores/ci-failures-store';
import { usePrStore } from '@/stores/pr-store';
import { parseError } from '@/utils/parse-error';

interface RerunAffectedSheetProps {
  groupId: string;
  onClose: () => void;
}

/**
 * RerunAffectedSheet — after a fix: the open PRs still red with the group's
 * failure, and what a rerun would retry. A rerun reuses each run's original
 * commit, so for a base-branch fault it says to update the branches instead
 * and offers no rerun. Nothing runs until you confirm.
 */
export function RerunAffectedSheet({ groupId, onClose }: RerunAffectedSheetProps) {
  const prs = usePrStore((s) => s.pullRequests);
  const [detail, setDetail] = useState<CiGroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<RerunOutcome[] | null>(null);
  const branch = useCiBranch(detail?.summary.scope ?? null) ?? 'the default branch';

  useEffect(() => {
    let cancelled = false;
    store
      .loadGroup(groupId)
      .then((result) => !cancelled && setDetail(result))
      .catch((err) => !cancelled && setError(parseError(err).message));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const targets = useMemo(() => (detail ? rerunTargets(detail, prs) : []), [detail, prs]);
  const baseBranch =
    detail &&
    (detail.summary.classification === 'base-branch' ||
      (!detail.summary.classification &&
        hypothesesOf(factsOf(detail.summary, branch))[0]?.kind === 'base-branch'));
  const runs = targets.reduce((sum, t) => sum + Math.max(1, t.workflowRunIds.length), 0);

  const confirm = () => {
    setRunning(true);
    void rerunAffected(targets)
      .then(setOutcomes)
      .catch((err) => setError(parseError(err).message))
      .finally(() => setRunning(false));
  };

  return (
    <div className="bd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="bd-modal bd-dp-sheet bd-dp-sheet--run"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bd-ci-rerun-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bd-dp-sheet__head">
          <h2 id="bd-ci-rerun-title">Rerun affected PRs</h2>
          <p className="bd-dp-sheet__lede">
            {baseBranch
              ? `A rerun reuses each run's original merge commit, so it never picks up a fix that landed on ${branch}. These PRs need their branch updated instead.`
              : `Reruns the failed jobs of ${runs} workflow ${runs === 1 ? 'run' : 'runs'}. GitHub retries every failed job in each run, not only the ones in this group.`}
          </p>
        </header>
        <div className="bd-dp-sheet__body">
          <section aria-label="Pull requests" className="bd-dp-sheet__pick">
            {error && <p className="bd-ci-dialog__error">{error}</p>}
            {detail && targets.length === 0 && (
              <p className="bd-dp-sheet__hint">No open PR is still red with this failure.</p>
            )}
            <div className="bd-ci-sheet__occurrences">
              {targets.map((target) => {
                const p = target.pr.pullRequest;
                const outcome = outcomes?.find((o) => o.prNumber === p.number);
                return (
                  <div
                    key={`${p.repoOwner}/${p.repoName}#${p.number}`}
                    className="bd-ci-sheet__occurrence"
                  >
                    <em>#{p.number}</em>
                    <span>
                      {p.title} · {target.checks.map((c) => c.name).join(', ')}
                      {outcome &&
                        (outcome.error ? ` · failed: ${outcome.error}` : ' · rerun requested')}
                    </span>
                    {baseBranch && (
                      <button
                        type="button"
                        className="bd-ci-link"
                        onClick={() =>
                          void showPr({ owner: p.repoOwner, repo: p.repoName, number: p.number })
                        }
                      >
                        Open
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <footer className="bd-dp-sheet__foot">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {outcomes || baseBranch ? 'Close' : 'Cancel'}
          </Button>
          {!baseBranch && !outcomes && (
            <Button
              variant="primary"
              size="sm"
              disabled={running || targets.length === 0}
              onClick={confirm}
            >
              {running
                ? 'Rerunning…'
                : `Rerun ${targets.length} ${targets.length === 1 ? 'PR' : 'PRs'}`}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
